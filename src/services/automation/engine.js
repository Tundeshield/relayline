// Automation engine: evaluates triggers, conditions and actions independently of
// any messaging provider. Sending is delegated to the messaging service.
import { uid, fullName, renderTemplate, HOUR, DAY } from '../../lib/util';
import { find, upd } from '../../data/store';
import { logActivity, notify, orgOf } from '../core';
import { eligibility, getConsent, REASON_LABEL } from '../consent';
import { addTag, removeTag, addToList, removeFromList, updateContact, addNote, fieldValue, matchesRule } from '../contacts';
import { sendMessage } from '../messaging';
import { catalogItem, TRIGGERS } from './catalog';
import { CHANNEL_LABEL, CONTACT_FIELDS } from '../../lib/constants';

const DEMO_DELAY_MS = 8000; // every wait is compressed to this in demo mode
const MAX_DEPTH = 3;

export function describeTrigger(trigger, state) {
  const t = TRIGGERS.find((x) => x.type === trigger?.type);
  if (!t) return 'No trigger';
  const c = trigger.config || {};
  const name = (coll, id) => find(state?.[coll] || [], id)?.name;
  switch (trigger.type) {
    case 'contact.added_to_list': return `Contact added to ${name('lists', c.listId) || 'a list'}`;
    case 'contact.tagged': return `Contact tagged “${name('tags', c.tagId) || '…'}”`;
    case 'contact.updated': return c.field ? `${CONTACT_FIELDS.find((f) => f.key === c.field)?.label || c.field} updated` : 'Any contact attribute updated';
    case 'message.delivered': case 'message.failed': return `${c.channel ? CHANNEL_LABEL[c.channel] + ' message' : 'Message'} ${trigger.type.split('.')[1]}`;
    case 'reply.received': return `${c.channel ? CHANNEL_LABEL[c.channel] + ' reply' : 'Reply'} received${c.keyword ? ` containing “${c.keyword}”` : ''}`;
    case 'no_response': return `No response ${c.hours || '?'}h after delivery`;
    case 'time.specific': return `On ${c.at ? new Date(c.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '…'}`;
    case 'time.before_date': return `${c.days ?? '?'} day${Number(c.days) === 1 ? '' : 's'} before ${CONTACT_FIELDS.find((f) => f.key === c.field)?.label || 'date'}`;
    case 'time.after_date': return `${c.days ?? '?'} day${Number(c.days) === 1 ? '' : 's'} after ${CONTACT_FIELDS.find((f) => f.key === c.field)?.label || 'date'}`;
    case 'time.recurring': return `Every ${c.every || '…'}`;
    case 'campaign.failure_threshold': return `Campaign failure rate ≥ ${c.percent ?? '?'}%`;
    case 'campaign.completed': return c.campaignId ? `“${name('campaigns', c.campaignId)}” completed` : 'Any campaign completed';
    default: return t.label;
  }
}

function triggerMatches(automation, event) {
  const t = automation.workflow?.trigger;
  if (!t || t.type !== event.type) return false;
  const c = t.config || {};
  switch (event.type) {
    case 'contact.added_to_list': return c.listId === event.listId;
    case 'contact.tagged': return c.tagId === event.tagId;
    case 'contact.updated': return !c.field || c.field === event.field;
    case 'message.delivered': case 'message.failed': return (!c.channel || c.channel === event.channel) && event.automationId !== automation.id;
    case 'reply.received': return (!c.channel || c.channel === event.channel) && (!c.keyword || (event.content || '').toLowerCase().includes(c.keyword.toLowerCase()));
    case 'campaign.completed': return !c.campaignId || c.campaignId === event.campaignId;
    case 'campaign.failure_threshold': return event.failPct >= Number(c.percent || 0) && event.failPct > 0;
    default: return true;
  }
}

// Called by every service that produces a domain event.
export function emit(draft, ctx, event) {
  if ((ctx.depth || 0) >= MAX_DEPTH || ctx.noAutomations) return;
  draft.automations
    .filter((a) => a.organisation_id === ctx.orgId && a.status === 'active' && triggerMatches(a, event))
    .forEach((a) => {
      if (event.contactId === undefined && a.workflow.trigger.type.startsWith('contact')) return;
      startExecution(draft, { ...ctx, depth: (ctx.depth || 0) + 1, system: true }, a.id, event.contactId || null, event);
    });
}

export function eventLabel(event, state) {
  const contact = event.contactId ? find(state.contacts, event.contactId) : null;
  const who = contact ? ` for ${fullName(contact)}` : '';
  switch (event.type) {
    case 'test': return `Manual test run${who}`;
    case 'schedule': return `Scheduled trigger fired${who}`;
    default: return `${TRIGGERS.find((t) => t.type === event.type)?.label || event.type}${who}`;
  }
}

// ---------- Path helpers for nested branches ----------
function nodeAt(steps, path) {
  let arr = steps; let node = null;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (typeof p === 'number') { node = arr?.[p]; if (!node) return null; }
    else arr = node?.[p];
  }
  return node;
}
function nextPath(steps, path) {
  if (!path) return null;
  const p = [...path];
  p[p.length - 1] += 1;
  if (nodeAt(steps, p)) return p;
  if (p.length > 1) return nextPath(steps, p.slice(0, -2));
  return null;
}

// ---------- Execution ----------
export function startExecution(draft, ctx, automationId, contactId, event, opts = {}) {
  const a = find(draft.automations, automationId);
  const exec = {
    id: uid('exe'), organisation_id: ctx.orgId, automation_id: automationId, contact_id: contactId,
    status: 'running', test: !!opts.test, trigger_event: { ...event, label: eventLabel(event, draft) },
    log: [], message_ids: [], previews: [], started_at: ctx.now, completed_at: null, cursor: [0], resume_at: null, options: opts,
  };
  exec.log.push({ at: ctx.now, kind: 'trigger', label: exec.trigger_event.label, result: 'ok' });
  draft.executions.push(exec);
  if (!opts.test) upd(draft.automations, automationId, { run_count: (a.run_count || 0) + 1, last_run_at: ctx.now });
  runFrom(draft, ctx, exec.id);
  return find(draft.executions, exec.id);
}

export function resumeExecution(draft, ctx, execId) {
  const exec = find(draft.executions, execId);
  if (!exec || exec.status !== 'waiting') return;
  upd(draft.executions, execId, { status: 'running', resume_at: null });
  runFrom(draft, ctx, execId);
}

function runFrom(draft, ctx, execId) {
  let exec = find(draft.executions, execId);
  const automation = find(draft.automations, exec.automation_id);
  const steps = automation.workflow.steps || [];
  const log = [...exec.log];
  const virtual = exec.test ? { contact: exec.virtual || (exec.contact_id ? { ...find(draft.contacts, exec.contact_id) } : null) } : null;
  let path = exec.cursor && nodeAt(steps, exec.cursor) ? exec.cursor : null;
  let guard = 0;
  let status = 'completed';
  let error = null;
  const now = ctx.now;
  const c = { ...ctx, now, automation, exec: { ...exec, message_ids: [...(exec.message_ids || [])], previews: [...(exec.previews || [])] }, virtual };

  while (path && guard++ < 60) {
    const node = nodeAt(steps, path);
    const item = catalogItem(node.kind, node.type);
    try {
      if (node.kind === 'condition') {
        const { pass, detail } = evaluateCondition(draft, c, node);
        log.push({ at: c.now, kind: 'condition', nodeId: node.id, label: item?.label || node.type, result: pass ? 'yes' : 'no', detail });
        const branch = pass ? 'yes' : 'no';
        path = (node[branch] || []).length ? [...path, branch, 0] : nextPath(steps, path);
        continue;
      }
      if (node.kind === 'delay') {
        const ms = { minutes: 60000, hours: HOUR, days: DAY }[node.config.unit] * Number(node.config.amount || 0);
        const human = `${node.config.amount} ${node.config.unit}`;
        if (exec.test) {
          log.push({ at: c.now, kind: 'delay', nodeId: node.id, label: `Wait ${human}`, result: 'skipped', detail: 'Skipped in test run — evaluation continues as if the wait has passed.' });
          c.now += ms; path = nextPath(steps, path); continue;
        }
        if (ctx.historical) {
          c.now += ms;
          log.push({ at: c.now, kind: 'delay', nodeId: node.id, label: `Waited ${human}`, result: 'ok' });
          path = nextPath(steps, path); continue;
        }
        log.push({ at: c.now, kind: 'delay', nodeId: node.id, label: `Waiting ${human}`, result: 'waiting', detail: `Demo mode compresses waits to ${DEMO_DELAY_MS / 1000} seconds.` });
        upd(draft.executions, execId, { log, status: 'waiting', cursor: nextPath(steps, path), resume_at: c.now + DEMO_DELAY_MS, message_ids: c.exec.message_ids, previews: c.exec.previews });
        if (!nextPath(steps, path)) upd(draft.executions, execId, { status: 'completed', completed_at: c.now, resume_at: null });
        return;
      }
      if (node.kind === 'end') {
        log.push({ at: c.now, kind: 'end', nodeId: node.id, label: 'End workflow', result: 'ok' });
        path = null; break;
      }
      const r = runAction(draft, c, node);
      log.push({ at: c.now, kind: 'action', nodeId: node.id, label: item?.label || node.type, ...r });
      path = nextPath(steps, path);
    } catch (e) {
      error = e.message;
      log.push({ at: c.now, kind: node.kind, nodeId: node.id, label: item?.label || node.type, result: 'error', detail: e.message });
      status = 'failed';
      break;
    }
  }
  exec = find(draft.executions, execId);
  upd(draft.executions, execId, { log, status, error, completed_at: c.now, cursor: null, resume_at: null, virtual: virtual?.contact || null, message_ids: c.exec.message_ids, previews: c.exec.previews });
  if (!exec.test) {
    logActivity(draft, { ...ctx, now: c.now, system: true }, { event_type: 'automation.executed', entity_type: 'automation', entity_id: automation.id, contact_id: exec.contact_id, summary: `Automation “${automation.name}” ${status === 'failed' ? 'failed' : 'ran'}${exec.contact_id ? ' for ' + fullName(find(draft.contacts, exec.contact_id)) : ''}`, details: { execution_id: execId, status } });
    if (status === 'failed' && !ctx.historical) {
      upd(draft.automations, automation.id, { status: 'paused', paused_reason: error });
      notify(draft, { ...ctx, system: true }, { type: 'automation_error', message: `Automation “${automation.name}” was paused after an error: ${error}`, link: `/app/automations/${automation.id}/history`, tone: 'warn' });
      logActivity(draft, { ...ctx, system: true }, { event_type: 'automation.paused', entity_type: 'automation', entity_id: automation.id, summary: `Automation “${automation.name}” paused automatically after an error` });
    }
  }
}

const contactFor = (draft, c) => (c.virtual ? c.virtual.contact : c.exec.contact_id ? find(draft.contacts, c.exec.contact_id) : null);

function evaluateCondition(draft, c, node) {
  const contact = contactFor(draft, c);
  const cfg = node.config || {};
  const ev = c.exec.trigger_event || {};
  const needContact = !['delivery_status', 'datetime'].includes(node.type);
  if (needContact && !contact) return { pass: false, detail: 'No contact in context — condition evaluates to No.' };
  const org = orgOf(draft, c);
  switch (node.type) {
    case 'attribute': {
      const pass = matchesRule(draft, contact, { field: cfg.field, op: cfg.op, value: cfg.value });
      return { pass, detail: `${cfg.field} = “${fieldValue(contact, cfg.field) || '(empty)'}”` };
    }
    case 'tag': { const t = find(draft.tags, cfg.tagId); const pass = contact.tag_ids.includes(cfg.tagId); return { pass, detail: `${pass ? 'Has' : 'Does not have'} tag “${t?.name}”` }; }
    case 'list': { const l = find(draft.lists, cfg.listId); const pass = matchesRule(draft, contact, { field: 'list', op: 'in', value: cfg.listId }); return { pass, detail: `${pass ? 'In' : 'Not in'} “${l?.name}”` }; }
    case 'channel': { const pass = cfg.channel === 'email' ? !!contact.email : !!contact.phone; return { pass, detail: `${CHANNEL_LABEL[cfg.channel]} ${pass ? 'available' : 'not available'}` }; }
    case 'consent': {
      const el = eligibility(draft, contact, cfg.channel, cfg.purpose || 'operational', org);
      return { pass: el.ok, detail: el.ok ? `Eligible for ${cfg.purpose || 'operational'} ${CHANNEL_LABEL[cfg.channel]}` : `${CHANNEL_LABEL[cfg.channel]}: ${REASON_LABEL[el.reason]}` };
    }
    case 'alt_channel': {
      const failed = ev.channel;
      const alt = ['email', 'sms', 'whatsapp'].filter((ch) => ch !== failed).find((ch) => eligibility(draft, contact, ch, 'operational', org).ok);
      return { pass: !!alt, detail: alt ? `${CHANNEL_LABEL[alt]} is available and consented` : 'No consented alternative channel' };
    }
    case 'delivery_status': {
      const m = ev.messageId ? find(draft.messages, ev.messageId) : null;
      const st = m?.status === 'read' ? 'delivered' : m?.status || ev.status;
      return { pass: st === cfg.status, detail: `Message status is ${st || 'unknown'}` };
    }
    case 'responded': {
      if (c.exec.test && c.exec.options?.assumeResponded !== undefined) return { pass: !!c.exec.options.assumeResponded, detail: `Test assumption: contact ${c.exec.options.assumeResponded ? 'has' : 'has not'} responded` };
      const since = c.exec.started_at;
      const convIds = new Set(draft.conversations.filter((x) => x.contact_id === contact.id).map((x) => x.id));
      const pass = draft.conversationMessages.some((m) => convIds.has(m.conversation_id) && m.direction === 'in' && m.created_at >= since);
      return { pass, detail: pass ? 'Inbound reply found since workflow started' : 'No inbound reply since workflow started' };
    }
    case 'datetime': {
      const d = new Date(c.now); const day = d.getDay(); const h = d.getHours();
      const pass = cfg.window === 'weekend' ? day === 0 || day === 6 : cfg.window === 'weekday' ? day > 0 && day < 6 : day > 0 && day < 6 && h >= 9 && h < 17;
      return { pass, detail: d.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }) };
    }
    default: return { pass: false, detail: 'Unknown condition' };
  }
}

function messageContent(draft, cfg, channel, c) {
  if (cfg.reuse_original) {
    const orig = c?.exec?.trigger_event?.messageId ? find(draft.messages, c.exec.trigger_event.messageId) : null;
    if (orig?.content) return { subject: orig.subject || cfg.subject || 'Update from {{organisation_name}}', body: orig.content };
    if (c?.exec?.test) return { subject: cfg.subject || 'Update', body: '[The original message will be reused here]' };
  }
  const tpl = cfg.templateId ? find(draft.templates, cfg.templateId) : null;
  return { subject: cfg.subject || tpl?.subject || '', body: cfg.body || tpl?.content || '' };
}

function runAction(draft, c, node) {
  const cfg = node.config || {};
  const contact = contactFor(draft, c);
  const org = orgOf(draft, c);
  const test = c.exec.test;
  const item = catalogItem('action', node.type);
  const need = () => { if (!contact) throw new Error('This action needs a contact, but the trigger has none.'); };
  const send = (channel, content) => {
    need();
    const el = eligibility(draft, contact, channel, cfg.purpose || 'operational', org);
    if (!el.ok) return { result: 'skipped', detail: `${CHANNEL_LABEL[channel]} not sent — ${REASON_LABEL[el.reason]}` };
    const subject = renderTemplate(content.subject, contact, org);
    const body = renderTemplate(content.body, contact, org);
    if (!body) throw new Error(`${item.label}: message content is empty.`);
    if (test) { c.exec.previews.push({ channel, subject, body, to: channel === 'email' ? contact.email : contact.phone }); return { result: 'ok', detail: `Would send ${CHANNEL_LABEL[channel]} (test run — nothing queued)`, preview: { channel, subject, body } }; }
    const m = sendMessage(draft, c, { contactId: contact.id, channel, subject, content: body, automationId: c.automation.id, executionId: c.exec.id, role: 'automation', resolveAt: c.historical ? c.now : undefined });
    c.exec.message_ids.push(m.id);
    return { result: 'ok', detail: `Simulated ${CHANNEL_LABEL[channel]} queued to ${channel === 'email' ? contact.email : contact.phone}`, messageId: m.id };
  };
  const vPatch = (patch) => { if (test && c.virtual?.contact) c.virtual.contact = { ...c.virtual.contact, ...patch }; };

  switch (node.type) {
    case 'send_email': return send('email', messageContent(draft, cfg, 'email', c));
    case 'send_sms': return send('sms', messageContent(draft, cfg, 'sms', c));
    case 'send_whatsapp': return send('whatsapp', messageContent(draft, cfg, 'whatsapp', c));
    case 'send_alternative': {
      need();
      const orig = c.exec.trigger_event.messageId ? find(draft.messages, c.exec.trigger_event.messageId) : null;
      const failed = orig?.channel || c.exec.trigger_event.channel;
      const order = [contact.preferred_channel, 'email', 'sms', 'whatsapp'].filter((ch, i, a) => ch && ch !== failed && a.indexOf(ch) === i);
      const alt = order.find((ch) => eligibility(draft, contact, ch, 'operational', org).ok);
      if (!alt) return { result: 'skipped', detail: 'No eligible alternative channel — fallback not sent and logged.' };
      const body = cfg.body || orig?.content || '';
      const r = send(alt, { subject: orig?.subject || 'Update from ' + (org?.name || 'us'), body });
      if (!test && orig && r.messageId) upd(draft.messages, orig.id, { fallback_message_id: r.messageId });
      return { ...r, detail: `${r.detail} (fallback from ${CHANNEL_LABEL[failed] || 'original channel'})` };
    }
    case 'add_tag': case 'remove_tag': {
      need(); const tag = find(draft.tags, cfg.tagId); if (!tag) throw new Error('Selected tag no longer exists.');
      const has = contact.tag_ids.includes(tag.id);
      if (test) { vPatch({ tag_ids: node.type === 'add_tag' ? [...new Set([...contact.tag_ids, tag.id])] : contact.tag_ids.filter((t) => t !== tag.id) }); return { result: 'ok', detail: `Would ${node.type === 'add_tag' ? 'add' : 'remove'} tag “${tag.name}”` }; }
      if (node.type === 'add_tag') { if (has) return { result: 'ok', detail: `Already tagged “${tag.name}”` }; addTag(draft, c, contact.id, tag.id); }
      else { if (!has) return { result: 'ok', detail: `Did not have tag “${tag.name}”` }; removeTag(draft, c, contact.id, tag.id); }
      return { result: 'ok', detail: `${node.type === 'add_tag' ? 'Added' : 'Removed'} tag “${tag.name}”` };
    }
    case 'add_to_list': case 'remove_from_list': {
      need(); const list = find(draft.lists, cfg.listId); if (!list) throw new Error('Selected list no longer exists.');
      if (test) return { result: 'ok', detail: `Would ${node.type === 'add_to_list' ? 'add to' : 'remove from'} “${list.name}”` };
      const n = node.type === 'add_to_list' ? addToList(draft, c, list.id, [contact.id]) : removeFromList(draft, c, list.id, [contact.id]);
      return { result: 'ok', detail: n ? `${node.type === 'add_to_list' ? 'Added to' : 'Removed from'} “${list.name}”` : `No change — membership already up to date` };
    }
    case 'update_field': {
      need();
      const isCustom = CONTACT_FIELDS.find((f) => f.key === cfg.field)?.custom || !(cfg.field in contact);
      const patch = isCustom ? { custom_fields: { [cfg.field]: cfg.value } } : { [cfg.field]: cfg.value };
      if (test) { vPatch(isCustom ? { custom_fields: { ...contact.custom_fields, [cfg.field]: cfg.value } } : patch); return { result: 'ok', detail: `Would set ${cfg.field} to “${cfg.value}”` }; }
      updateContact(draft, c, contact.id, patch);
      return { result: 'ok', detail: `Set ${cfg.field} to “${cfg.value}”` };
    }
    case 'add_note': {
      need(); const text = renderTemplate(cfg.text, contact, org);
      if (test) return { result: 'ok', detail: `Would log note: “${text}”` };
      addNote(draft, { ...c, userId: null }, contact.id, `[Automation: ${c.automation.name}] ${text}`);
      return { result: 'ok', detail: `Logged note “${text}”` };
    }
    case 'assign_conversation': {
      need();
      const conv = draft.conversations.filter((x) => x.contact_id === contact.id).sort((a, b) => b.last_message_at - a.last_message_at)[0];
      const user = find(draft.users, cfg.userId);
      if (!conv) return { result: 'skipped', detail: 'Contact has no conversation to assign' };
      if (test) return { result: 'ok', detail: `Would assign conversation to ${user?.name}` };
      upd(draft.conversations, conv.id, { assigned_to: cfg.userId });
      return { result: 'ok', detail: `Conversation assigned to ${user?.name}` };
    }
    case 'notify': {
      const text = renderTemplate(cfg.message, contact, org);
      if (test) return { result: 'ok', detail: `Would notify the team: “${text}”` };
      if (!c.historical) notify(draft, { ...c, system: true }, { type: 'automation', message: `${c.automation.name}: ${text}`, link: contact ? `/app/contacts/${contact.id}` : `/app/automations/${c.automation.id}`, tone: 'info' });
      return { result: 'ok', detail: `Team notified: “${text}”` };
    }
    default: throw new Error(`Unknown action “${node.type}”`);
  }
}

// ---------- Scheduler for time-based triggers, waits and no-response checks ----------
const parseDate = (v) => { const t = v ? new Date(v + (String(v).length <= 10 ? 'T09:00:00' : '')).getTime() : NaN; return isNaN(t) ? null : t; };

export function runScheduled(draft, ctx) {
  let changed = false;
  draft.executions.filter((e) => e.organisation_id === ctx.orgId && e.status === 'waiting' && e.resume_at <= ctx.now).forEach((e) => { resumeExecution(draft, ctx, e.id); changed = true; });
  draft.automations.filter((a) => a.organisation_id === ctx.orgId && a.status === 'active').forEach((a) => {
    const t = a.workflow.trigger; const c = t.config || {};
    const since = a.activated_at || a.created_at;
    const contacts = () => {
      const all = draft.contacts.filter((x) => x.organisation_id === ctx.orgId && x.status !== 'archived');
      return c.listId ? all.filter((x) => matchesRule(draft, x, { field: 'list', op: 'in', value: c.listId })) : all;
    };
    const ran = (contactId, key) => draft.executions.some((e) => e.automation_id === a.id && !e.test && e.contact_id === contactId && e.trigger_event?.key === key);
    if (t.type === 'time.specific') {
      const at = parseDate(c.at);
      if (at && ctx.now >= at && !a.runtime?.fired) {
        upd(draft.automations, a.id, { runtime: { ...a.runtime, fired: ctx.now } });
        contacts().forEach((x) => startExecution(draft, { ...ctx, system: true }, a.id, x.id, { type: 'schedule', contactId: x.id }));
        changed = true;
      }
    } else if (t.type === 'time.recurring') {
      const next = a.runtime?.next_run_at || since + { day: DAY, week: 7 * DAY, month: 30 * DAY }[c.every || 'week'];
      if (ctx.now >= next) {
        upd(draft.automations, a.id, { runtime: { ...a.runtime, next_run_at: ctx.now + { day: DAY, week: 7 * DAY, month: 30 * DAY }[c.every || 'week'] } });
        contacts().forEach((x) => startExecution(draft, { ...ctx, system: true }, a.id, x.id, { type: 'schedule', contactId: x.id }));
        changed = true;
      } else if (!a.runtime?.next_run_at) upd(draft.automations, a.id, { runtime: { ...a.runtime, next_run_at: next } });
    } else if (t.type === 'time.before_date' || t.type === 'time.after_date') {
      contacts().forEach((x) => {
        const d = parseDate(x.custom_fields?.[c.field]);
        if (!d) return;
        const target = d + (t.type === 'time.before_date' ? -1 : 1) * Number(c.days || 0) * DAY;
        const key = `${c.field}:${x.custom_fields[c.field]}`;
        if (ctx.now >= target && target >= since - DAY && ctx.now < target + 2 * DAY && !ran(x.id, key)) {
          startExecution(draft, { ...ctx, system: true }, a.id, x.id, { type: 'schedule', contactId: x.id, key });
          changed = true;
        }
      });
    } else if (t.type === 'no_response') {
      const win = Number(c.hours || 48) * HOUR;
      draft.messages.filter((m) => m.organisation_id === ctx.orgId && (m.status === 'delivered' || m.status === 'read') && m.delivered_at >= since && !m.replied_at && m.delivered_at + win <= ctx.now && (!c.channel || m.channel === c.channel) && m.automation_id !== a.id)
        .forEach((m) => { if (!ran(m.contact_id, m.id)) { startExecution(draft, { ...ctx, system: true }, a.id, m.contact_id, { type: 'no_response', contactId: m.contact_id, messageId: m.id, channel: m.channel, key: m.id }); changed = true; } });
    }
  });
  return changed;
}

export { getConsent };
