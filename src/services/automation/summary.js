// Plain-language description of any workflow (manual or AI-generated — same schema).
import { describeTrigger } from './engine';
import { CHANNEL_LABEL, CONTACT_FIELDS } from '../../lib/constants';

const name = (state, coll, id) => (state?.[coll] || []).find((x) => x.id === id)?.name;
const dur = (c) => `${c.amount} ${Number(c.amount) === 1 ? String(c.unit).replace(/s$/, '') : c.unit}`;

export function conditionText(n, state) {
  const c = n.config || {};
  switch (n.type) {
    case 'consent': return `the contact can receive ${c.purpose === 'marketing' ? 'marketing ' : ''}${CHANNEL_LABEL[c.channel] || '…'} messages`;
    case 'channel': return `the contact has ${c.channel === 'email' ? 'an email address' : 'a phone number'}`;
    case 'tag': return `the contact is tagged “${name(state, 'tags', c.tagId) || '…'}”`;
    case 'list': return `the contact is in “${name(state, 'lists', c.listId) || '…'}”`;
    case 'attribute': { const f = CONTACT_FIELDS.find((x) => x.key === c.field)?.label || c.field || 'a field'; return c.op === 'is_set' ? `${f} is filled in` : c.op === 'is_not_set' ? `${f} is empty` : `${f} ${c.op === 'contains' ? 'contains' : 'is'} “${c.value || ''}”`; }
    case 'alt_channel': return 'another channel is available and permitted';
    case 'delivery_status': return `the message was ${c.status}`;
    case 'responded': return 'the contact has replied';
    case 'datetime': return c.window === 'weekend' ? 'it is the weekend' : c.window === 'weekday' ? 'it is a weekday' : 'it is within business hours';
    default: return 'a condition is met';
  }
}

export function actionText(n, state) {
  const c = n.config || {};
  const tpl = c.templateId && name(state, 'templates', c.templateId);
  const what = tpl ? ` (“${tpl}”)` : c.subject ? ` (“${c.subject}”)` : '';
  switch (n.type) {
    case 'send_email': return `send an email${c.reuse_original ? ' with the same content as the original message' : what}`;
    case 'send_sms': return `send an SMS${c.reuse_original ? ' with the same content as the original message' : what}`;
    case 'send_whatsapp': return `send a WhatsApp message${what}`;
    case 'send_alternative': return 'resend the message on another permitted channel';
    case 'add_tag': return `tag them “${name(state, 'tags', c.tagId) || String(c.tagId || '').replace(/^new:/, '') || '…'}”`;
    case 'remove_tag': return `remove the tag “${name(state, 'tags', c.tagId) || '…'}”`;
    case 'add_to_list': return `add them to “${name(state, 'lists', c.listId) || '…'}”`;
    case 'remove_from_list': return `remove them from “${name(state, 'lists', c.listId) || '…'}”`;
    case 'update_field': return `set ${CONTACT_FIELDS.find((f) => f.key === c.field)?.label || c.field} to “${c.value}”`;
    case 'add_note': return 'record a note on their profile';
    case 'assign_conversation': return `assign their conversation to ${(state?.users || []).find((u) => u.id === c.userId)?.name || 'a teammate'}`;
    case 'notify': return 'notify your team';
    default: return 'do something';
  }
}

function stepsText(steps, state, depth = 0) {
  const out = [];
  let pendingWait = null;
  steps.forEach((n) => {
    if (n.kind === 'delay') { pendingWait = dur(n.config || {}); return; }
    const lead = pendingWait ? `${pendingWait} later, ` : '';
    pendingWait = null;
    if (n.kind === 'end') { out.push(`${lead}stop.`); return; }
    if (n.kind === 'action') { out.push(`${lead}${actionText(n, state)}.`); return; }
    if (n.kind === 'condition') {
      const yes = stepsText(n.yes || [], state, depth + 1);
      const no = stepsText(n.no || [], state, depth + 1);
      const isNeg = (n.yes || []).length === 1 && n.yes[0].kind === 'end';
      if (isNeg) out.push(`${lead}if ${conditionText(n, state).replace('the contact has replied', 'they still haven’t replied').replace(/ is “(.+)”$/, ' is not yet “$1”')}: ${no.join(' ') || 'do nothing.'}`);
      else out.push(`${lead}if ${conditionText(n, state)}: ${yes.join(' ') || 'do nothing.'}${no.length ? ` Otherwise: ${no.join(' ')}` : ''}`);
    }
  });
  if (pendingWait) out.push(`then wait ${pendingWait}.`);
  return out.map((s) => s[0].toUpperCase() + s.slice(1));
}

export function summarizeWorkflow(wf, state) {
  if (!wf?.trigger?.type) return ['Choose what should start this automation.'];
  const t = describeTrigger(wf.trigger, state);
  const first = { 'contact.created': 'When a new contact is added:', 'message.failed': `When ${wf.trigger.config?.channel ? { email: 'an email', sms: 'an SMS', whatsapp: 'a WhatsApp message' }[wf.trigger.config.channel] : 'a message'} fails:`, 'contact.added_to_list': `When someone is added to “${(state?.lists || []).find((l) => l.id === wf.trigger.config?.listId)?.name || '…'}”:`, 'reply.received': 'When someone replies:' }[wf.trigger.type] || (/^\d/.test(t) ? `${t}:` : `When: ${t}`).replace(/before (Appointment date|Renewal date|Lease end date)/, (m, f) => `before each contact’s ${f.toLowerCase()}`);
  const body = stepsText(wf.steps || [], state);
  if (!body.length) return [first, 'No steps yet.'];
  return [first, ...body, 'Messages are only sent to contacts who are reachable on that channel and have the required consent.'];
}
