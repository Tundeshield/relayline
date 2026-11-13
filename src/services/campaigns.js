// Campaign planning, execution and statistics. All sending goes through the messaging service.
import { uid, renderTemplate, smsInfo, fullName, plural } from '../lib/util';
import { find, upd } from '../data/store';
import { logActivity, notify, orgOf } from './core';
import { eligibility, REASON_LABEL } from './consent';
import { listMembers } from './contacts';
import { sendMessage } from './messaging';
import { emit } from './automation/engine';
import { categoryPurpose, CHANNEL_LABEL, USAGE_RATES } from '../lib/constants';

export function blankCampaign() {
  return {
    name: '', description: '', category: 'operational',
    audience: { type: 'all', ids: [] }, channels: [], delivery_mode: 'all',
    fallback: { primary: '', secondary: '', condition: 'failed', delay_minutes: 5, unavailable: 'use_fallback' },
    content: { email: { subject: '', body: '' }, sms: { body: '' }, whatsapp: { body: '', template_name: '' } },
    request_ack: false, schedule: { type: 'now', at: '', timezone: '' },
  };
}

export function resolveAudience(state, campaign, contacts, lists) {
  const a = campaign.audience || { type: 'all' };
  const active = contacts.filter((c) => c.status !== 'archived');
  if (a.type === 'all') return active;
  if (a.type === 'contacts') { const s = new Set(a.ids); return active.filter((c) => s.has(c.id)); }
  const ids = new Set();
  (a.ids || []).forEach((lid) => listMembers(state, lists.find((l) => l.id === lid), active).forEach((c) => ids.add(c.id)));
  return active.filter((c) => ids.has(c.id));
}

export function audienceLabel(campaign, lists) {
  const a = campaign.audience || {};
  if (a.type === 'all') return 'All contacts';
  if (a.type === 'contacts') return `${plural(a.ids.length, 'selected contact')}`;
  const names = (a.ids || []).map((id) => lists.find((l) => l.id === id)?.name).filter(Boolean);
  return names.length ? names.join(', ') : 'No audience';
}

export const contentFor = (campaign, channel) => campaign.content?.[channel] || {};

// Work out who will receive what, on which channel, and who is excluded and why.
export function planCampaign(state, campaign, { contacts, lists, org }) {
  const recipients = resolveAudience(state, campaign, contacts, lists);
  const purpose = categoryPurpose(campaign.category);
  const channels = campaign.channels || [];
  const perChannel = {};
  channels.forEach((ch) => (perChannel[ch] = { eligible: 0, ineligible: 0, reasons: {} }));
  const sends = [];
  const excluded = [];
  recipients.forEach((contact) => {
    const el = {};
    channels.forEach((ch) => {
      el[ch] = eligibility(state, contact, ch, purpose, org);
      const pc = perChannel[ch];
      if (el[ch].ok) pc.eligible++;
      else { pc.ineligible++; pc.reasons[el[ch].reason] = (pc.reasons[el[ch].reason] || 0) + 1; }
    });
    if (campaign.delivery_mode === 'fallback' && channels.length > 1) {
      const { primary, secondary, unavailable } = campaign.fallback;
      if (el[primary]?.ok) sends.push({ contact, channel: primary, role: 'primary' });
      else if (unavailable === 'use_fallback' && el[secondary]?.ok) sends.push({ contact, channel: secondary, role: 'fallback_unavailable' });
      else excluded.push({ contact, channel: primary, reason: el[primary]?.reason || 'no_consent' });
    } else {
      channels.forEach((ch) => (el[ch].ok ? sends.push({ contact, channel: ch, role: 'all' }) : excluded.push({ contact, channel: ch, reason: el[ch].reason })));
    }
  });
  const reached = new Set(sends.map((s) => s.contact.id));
  const unreachable = recipients.filter((c) => !reached.has(c.id));
  return { recipients, perChannel, sends, excluded, unreachable, purpose };
}

export function estimateUsage(plan, campaign, org) {
  const out = { email: 0, sms: 0, smsSegments: 0, whatsapp: 0, cost: 0 };
  plan.sends.forEach(({ contact, channel }) => {
    if (channel === 'sms') {
      const seg = smsInfo(renderTemplate(contentFor(campaign, 'sms').body, contact, org)).segments || 1;
      out.sms++; out.smsSegments += seg;
    } else out[channel]++;
  });
  // Possible fallback sends are not counted until they happen.
  out.cost = out.email * USAGE_RATES.email + out.smsSegments * USAGE_RATES.sms + out.whatsapp * USAGE_RATES.whatsapp;
  return out;
}

export function saveCampaign(draft, ctx, data, id) {
  const now = ctx.now;
  if (id) {
    const before = find(draft.campaigns, id);
    upd(draft.campaigns, id, { ...data, updated_at: now });
    if (before.status !== data.status && data.status === 'scheduled')
      logActivity(draft, ctx, { event_type: 'campaign.scheduled', entity_type: 'campaign', entity_id: id, summary: `Campaign "${data.name}" scheduled` });
    return find(draft.campaigns, id);
  }
  const c = { id: uid('cmp'), organisation_id: ctx.orgId, ...data, created_by: ctx.userId, created_at: now, updated_at: now, sent_at: null, completed_at: null };
  draft.campaigns.push(c);
  logActivity(draft, ctx, { event_type: 'campaign.created', entity_type: 'campaign', entity_id: c.id, summary: `Campaign "${c.name}" created as ${c.status}` });
  if (c.status === 'scheduled') logActivity(draft, ctx, { event_type: 'campaign.scheduled', entity_type: 'campaign', entity_id: c.id, summary: `Campaign "${c.name}" scheduled`, details: { schedule_at: c.schedule_at } });
  return c;
}

// Execute: snapshot the plan, create message records and hand them to the provider.
// `historicalAt` resolves everything instantly in the past (used by the demo seed).
export function executeCampaign(draft, ctx, campaignId, { historicalAt } = {}) {
  const campaign = find(draft.campaigns, campaignId);
  const org = orgOf(draft, ctx);
  const contacts = draft.contacts.filter((c) => c.organisation_id === ctx.orgId);
  const lists = draft.lists.filter((l) => l.organisation_id === ctx.orgId);
  const plan = planCampaign(draft, campaign, { contacts, lists, org });
  const startAt = historicalAt || ctx.now;
  const mk = (contact, channel, role, i, extra = {}) => {
    const c = contentFor(campaign, channel);
    return sendMessage(draft, ctx, {
      contactId: contact.id, channel, role, campaignId,
      subject: channel === 'email' ? renderTemplate(c.subject, contact, org) : '',
      content: renderTemplate(c.body, contact, org),
      sendAt: historicalAt ? undefined : startAt + 400 + i * 140,
      resolveAt: historicalAt ? startAt + i * 1500 : undefined, ...extra,
    });
  };
  plan.sends.forEach((s, i) => mk(s.contact, s.channel, s.role, i));
  plan.excluded.forEach(({ contact, channel, reason }) => {
    draft.messages.push({ id: uid('msg'), organisation_id: ctx.orgId, campaign_id: campaignId, contact_id: contact.id, channel, role: 'excluded', status: 'skipped', failure_reason: REASON_LABEL[reason], skip_reason: reason, subject: '', content: '', created_at: startAt, simulated: true, sim: { done: true } });
  });
  upd(draft.campaigns, campaignId, { status: 'processing', sent_at: startAt, recipient_count: plan.recipients.length, updated_at: startAt });
  logActivity(draft, { ...ctx, now: startAt }, {
    event_type: 'campaign.sent', entity_type: 'campaign', entity_id: campaignId,
    summary: `Campaign "${campaign.name}" started — ${plural(plan.sends.length, 'simulated message')} queued, ${plan.excluded.length} not sent`,
    details: { channels: campaign.channels, recipients: plan.recipients.length }, system: !!historicalAt && false,
  });
  if (historicalAt) {
    // Historical fallbacks + completion, resolved immediately
    if (campaign.delivery_mode === 'fallback') {
      draft.messages.filter((m) => m.campaign_id === campaignId && m.role === 'primary' && (m.status === 'failed' || (campaign.fallback.condition === 'not_delivered' && m.status === 'sent'))).forEach((m, i) => {
        const contact = find(draft.contacts, m.contact_id);
        if (!eligibility(draft, contact, campaign.fallback.secondary, plan.purpose, org).ok) return;
        const fb = mk(contact, campaign.fallback.secondary, 'fallback', i, { parentId: m.id, resolveAt: (m.failed_at || m.sent_at) + campaign.fallback.delay_minutes * 60000 });
        upd(draft.messages, m.id, { fallback_message_id: fb.id });
      });
    }
    completeCampaign(draft, { ...ctx, now: startAt + 30 * 60000 }, campaignId, { silent: true });
  }
  return plan;
}

export function triggerFallback(draft, ctx, message) {
  const campaign = find(draft.campaigns, message.campaign_id);
  if (!campaign || campaign.delivery_mode !== 'fallback' || message.role !== 'primary' || message.fallback_message_id) return null;
  const org = orgOf(draft, ctx);
  const contact = find(draft.contacts, message.contact_id);
  const ch = campaign.fallback.secondary;
  const el = eligibility(draft, contact, ch, categoryPurpose(campaign.category), org);
  if (!el.ok) { upd(draft.messages, message.id, { fallback_message_id: 'none', fallback_note: `Fallback to ${CHANNEL_LABEL[ch]} not possible: ${REASON_LABEL[el.reason]}` }); return null; }
  const c = contentFor(campaign, ch);
  // Demo mode compresses the configured fallback delay (1 minute → 1 second, max 12s).
  const delay = Math.min(12000, Math.max(1500, (campaign.fallback.delay_minutes || 0) * 1000));
  const fb = sendMessage(draft, ctx, { contactId: contact.id, channel: ch, role: 'fallback', campaignId: campaign.id, parentId: message.id, subject: ch === 'email' ? renderTemplate(c.subject, contact, org) : '', content: renderTemplate(c.body, contact, org), sendAt: ctx.now + delay });
  upd(draft.messages, message.id, { fallback_message_id: fb.id });
  return fb;
}

export function campaignStats(messages) {
  const s = { recipients: 0, attempted: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, skipped: 0, replied: 0, acknowledged: 0, clicked: 0, fallbacks: 0, byChannel: {} };
  const contacts = new Set();
  messages.forEach((m) => {
    contacts.add(m.contact_id);
    const b = (s.byChannel[m.channel] ||= { attempted: 0, delivered: 0, read: 0, failed: 0, pending: 0, skipped: 0, replied: 0 });
    if (m.status === 'skipped') { s.skipped++; b.skipped++; return; }
    s.attempted++; b.attempted++;
    if (m.role === 'fallback') s.fallbacks++;
    if (m.status === 'delivered' || m.status === 'read') { s.delivered++; b.delivered++; }
    if (m.status === 'read') { s.read++; b.read++; }
    if (m.status === 'failed') { s.failed++; b.failed++; }
    if (m.status === 'queued' || m.status === 'sent') { s.pending++; b.pending++; }
    if (m.replied_at) { s.replied++; b.replied++; }
    if (m.acknowledged_at) s.acknowledged++;
    if (m.clicked_at) s.clicked++;
  });
  s.recipients = contacts.size;
  return s;
}

export function isCampaignSettled(draft, campaignId) {
  return draft.messages.filter((m) => m.campaign_id === campaignId).every((m) => m.sim?.done && (!m.fallback_message_id || m.fallback_message_id === 'none' || find(draft.messages, m.fallback_message_id)?.sim?.done));
}

export function completeCampaign(draft, ctx, campaignId, { silent = false } = {}) {
  const campaign = find(draft.campaigns, campaignId);
  const msgs = draft.messages.filter((m) => m.campaign_id === campaignId);
  const st = campaignStats(msgs);
  const status = st.failed > 0 ? 'partially_failed' : 'completed';
  upd(draft.campaigns, campaignId, { status, completed_at: ctx.now });
  const sys = { ...ctx, system: true };
  logActivity(draft, sys, { event_type: 'campaign.completed', entity_type: 'campaign', entity_id: campaignId, summary: `Campaign "${campaign.name}" ${status === 'completed' ? 'completed' : 'completed with failures'} — ${st.delivered}/${st.attempted} delivered`, details: { ...st, byChannel: undefined } });
  if (st.failed) logActivity(draft, sys, { event_type: 'message.failed', entity_type: 'campaign', entity_id: campaignId, summary: `${plural(st.failed, 'message')} failed in "${campaign.name}"`, details: { failed: st.failed } });
  if (!silent) {
    notify(draft, sys, { type: status === 'completed' ? 'campaign_completed' : 'campaign_failed', message: status === 'completed' ? `“${campaign.name}” completed — ${st.delivered} of ${st.attempted} simulated messages delivered.` : `“${campaign.name}” partially failed — ${st.failed} of ${st.attempted} simulated messages failed.`, link: `/app/campaigns/${campaignId}`, tone: status === 'completed' ? 'success' : 'warn' });
    emit(draft, sys, { type: 'campaign.completed', campaignId });
    const failPct = st.attempted ? (st.failed / st.attempted) * 100 : 0;
    emit(draft, sys, { type: 'campaign.failure_threshold', campaignId, failPct });
  }
}

export function cancelCampaign(draft, ctx, campaignId) {
  const c = find(draft.campaigns, campaignId);
  draft.messages.filter((m) => m.campaign_id === campaignId && m.status === 'queued').forEach((m) => upd(draft.messages, m.id, { status: 'cancelled', sim: { ...m.sim, done: true } }));
  upd(draft.campaigns, campaignId, { status: 'cancelled', cancelled_at: ctx.now });
  logActivity(draft, ctx, { event_type: 'campaign.cancelled', entity_type: 'campaign', entity_id: campaignId, summary: `Campaign "${c.name}" cancelled` });
}

export function duplicateCampaign(draft, ctx, campaignId) {
  const c = find(draft.campaigns, campaignId);
  const { id, sent_at, completed_at, cancelled_at, recipient_count, created_at, updated_at, ...rest } = c;
  return saveCampaign(draft, ctx, { ...rest, name: `${c.name} (copy)`, status: 'draft', schedule: { type: 'now', at: '', timezone: c.schedule?.timezone || '' }, schedule_at: null });
}

export const recipientRows = (state, campaignId) => state.messages.filter((m) => m.campaign_id === campaignId).map((m) => ({ ...m, contact: find(state.contacts, m.contact_id) }));
export const contactName = (state, id) => fullName(find(state.contacts, id));
