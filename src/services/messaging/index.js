// Messaging service — the provider-independent interface the app uses.
//   sendMessage()       queue a message through the active provider
//   scheduleMessage()   queue a message for a future time
//   getMessageStatus()  read the current status of a message
//   receiveMessage()    ingest an inbound message (reply, keyword, etc.)
// Real providers (e.g. an email API, an SMS carrier, WhatsApp Cloud API) can
// implement the same `send` contract as mockProvider and be swapped in here.
import { uid, fullName } from '../../lib/util';
import { find, upd } from '../../data/store';
import { mockProvider } from './mockProvider';
import { logActivity, notify, orgOf } from '../core';
import { rulesFor, setConsent, getConsent, isSuppressed, addSuppression } from '../consent';
import { emit } from '../automation/engine';
import { CHANNEL_LABEL } from '../../lib/constants';

export const activeProvider = mockProvider;

export function sendMessage(draft, ctx, p) {
  const message = {
    id: uid('msg'), organisation_id: ctx.orgId, simulated: true,
    campaign_id: p.campaignId || null, automation_id: p.automationId || null, execution_id: p.executionId || null,
    conversation_id: p.conversationId || null, parent_message_id: p.parentId || null,
    contact_id: p.contactId, channel: p.channel, subject: p.subject || '', content: p.content, role: p.role || 'primary',
    status: 'queued', created_at: ctx.now, send_at: p.sendAt || ctx.now, attempted_at: null, sent_at: null,
    delivered_at: null, read_at: null, failed_at: null, failure_reason: null, replied_at: null, acknowledged_at: null, clicked_at: null,
  };
  Object.assign(message, activeProvider.send(message));
  // Seed / backfill mode: resolve the whole lifecycle immediately at a historical time.
  if (p.resolveAt || ctx.historical) resolveInstantly(message, p.resolveAt || ctx.now);
  draft.messages.push(message);
  return message;
}

export const scheduleMessage = (draft, ctx, p, at) => sendMessage(draft, ctx, { ...p, sendAt: at });
export const getMessageStatus = (state, id) => find(state.messages, id)?.status || null;

function resolveInstantly(m, at) {
  m.send_at = at; m.attempted_at = at; m.sent_at = at + m.sim.sent_after;
  if (m.sim.outcome === 'delivered') { m.status = 'delivered'; m.delivered_at = at + m.sim.final_after * 20; if (m.sim.read_after) { m.status = 'read'; m.read_at = at + m.sim.read_after * 300; } }
  else if (m.sim.outcome === 'failed') { m.status = 'failed'; m.failed_at = at + m.sim.final_after * 10; m.failure_reason = m.sim.failure_reason; }
  else m.status = 'sent';
  m.sim = { ...m.sim, done: true };
}

// Advance a live message's simulated lifecycle. Returns the list of events produced.
export function advanceMessage(draft, ctx, m) {
  const now = ctx.now;
  const events = [];
  if (m.status === 'queued' && now >= m.send_at) {
    upd(draft.messages, m.id, { status: 'sent', attempted_at: m.send_at, sent_at: now });
    events.push('sent');
  }
  const cur = find(draft.messages, m.id);
  if (cur.status === 'sent' && cur.sim.outcome !== 'pending' && now >= cur.send_at + cur.sim.final_after) {
    if (cur.sim.outcome === 'delivered') { upd(draft.messages, m.id, { status: 'delivered', delivered_at: now }); events.push('delivered'); }
    else { upd(draft.messages, m.id, { status: 'failed', failed_at: now, failure_reason: cur.sim.failure_reason }); events.push('failed'); }
  }
  const c2 = find(draft.messages, m.id);
  if (c2.status === 'delivered' && c2.sim.read_after && !c2.read_at && now >= c2.send_at + c2.sim.read_after) {
    upd(draft.messages, m.id, { status: 'read', read_at: now }); events.push('read');
  }
  const c3 = find(draft.messages, m.id);
  const final = ['delivered', 'read', 'failed'].includes(c3.status) || (c3.status === 'sent' && c3.sim.outcome === 'pending');
  if (final && !c3.sim.done) upd(draft.messages, m.id, { sim: { ...c3.sim, done: true } });
  return events;
}

// ---------- Inbound ----------
export function findOrCreateConversation(draft, ctx, contactId, channel, { seedMessage } = {}) {
  let conv = draft.conversations.filter((c) => c.organisation_id === ctx.orgId && c.contact_id === contactId && c.channel === channel)
    .sort((a, b) => b.last_message_at - a.last_message_at)[0];
  if (!conv) {
    conv = { id: uid('cv'), organisation_id: ctx.orgId, contact_id: contactId, channel, status: 'open', assigned_to: null, unread: false, last_message_at: ctx.now, created_at: ctx.now };
    draft.conversations.push(conv);
    if (seedMessage) {
      draft.conversationMessages.push({ id: uid('cm'), organisation_id: ctx.orgId, conversation_id: conv.id, direction: 'out', content: seedMessage.content, subject: seedMessage.subject, channel, message_id: seedMessage.id, campaign_id: seedMessage.campaign_id, user_id: null, created_at: seedMessage.sent_at || seedMessage.created_at });
    }
  }
  return conv;
}

export function receiveMessage(draft, ctx, { contactId, channel, content, inReplyTo = null, at }) {
  const now = at || ctx.now;
  const c = { ...ctx, now };
  const contact = find(draft.contacts, contactId);
  if (!contact) return null;
  const related = inReplyTo ? find(draft.messages, inReplyTo) : draft.messages.filter((m) => m.contact_id === contactId && m.channel === channel && m.status !== 'skipped').sort((a, b) => b.created_at - a.created_at)[0];
  const conv = findOrCreateConversation(draft, c, contactId, channel, { seedMessage: related });
  const cm = { id: uid('cm'), organisation_id: ctx.orgId, conversation_id: conv.id, direction: 'in', content, channel, user_id: null, created_at: now, simulated: true };
  draft.conversationMessages.push(cm);
  upd(draft.conversations, conv.id, { last_message_at: now, unread: true, status: 'open' });
  if (related && !related.replied_at) upd(draft.messages, related.id, { replied_at: now });

  const org = orgOf(draft, c);
  const rules = rulesFor(org);
  const word = content.trim().toUpperCase().replace(/[^A-Z]/g, '');
  const sys = { ...c, system: true };
  let keyword = null;
  if (channel === 'sms' && rules.stopKeywords.includes(word)) {
    keyword = 'stop';
    setConsent(draft, sys, contactId, 'sms', { status: 'revoked', source: `SMS keyword "${word}"` });
    if (rules.unsubscribeScope === 'global') addSuppression(draft, sys, contact, 'Replied STOP', 'SMS keyword');
    autoReply(draft, sys, conv, `You have been unsubscribed from ${org?.name || 'our'} text messages and will receive no further SMS. Reply START to resubscribe.`);
  } else if (channel === 'sms' && ['START', 'UNSTOP'].includes(word)) {
    keyword = 'start';
    setConsent(draft, sys, contactId, 'sms', { status: 'granted', purpose: getConsent(draft, contactId, 'sms')?.purpose || 'operational', source: `SMS keyword "${word}"` });
    autoReply(draft, sys, conv, `You're resubscribed to ${org?.name || 'our'} text messages. Reply STOP to opt out at any time.`);
  } else if (related?.campaign_id && ['YES', 'Y', 'CONFIRM', 'OK', 'CONFIRMED'].includes(word)) {
    const camp = find(draft.campaigns, related.campaign_id);
    if (camp?.request_ack) { keyword = 'ack'; upd(draft.messages, related.id, { acknowledged_at: now }); }
  }

  logActivity(draft, sys, { event_type: 'reply.received', entity_type: 'conversation', entity_id: conv.id, contact_id: contactId, summary: `${CHANNEL_LABEL[channel]} reply from ${fullName(contact)}${keyword === 'stop' ? ' (opt-out keyword)' : keyword === 'ack' ? ' (acknowledged)' : ''}`, details: { preview: content.slice(0, 140), keyword } });
  notify(draft, sys, { type: 'reply', message: `New ${CHANNEL_LABEL[channel]} reply from ${fullName(contact)}: “${content.slice(0, 60)}${content.length > 60 ? '…' : ''}”`, link: `/app/inbox/${conv.id}`, tone: 'info' });
  emit(draft, sys, { type: 'reply.received', contactId, channel, messageId: related?.id, conversationId: conv.id, content });
  return { conversation: find(draft.conversations, conv.id), message: cm };
}

function autoReply(draft, ctx, conv, content) {
  const msg = sendMessage(draft, ctx, { contactId: conv.contact_id, channel: conv.channel, content, conversationId: conv.id, role: 'system' });
  draft.conversationMessages.push({ id: uid('cm'), organisation_id: ctx.orgId, conversation_id: conv.id, direction: 'out', content, channel: conv.channel, message_id: msg.id, user_id: null, auto: true, created_at: ctx.now + 1 });
}

// Can an agent reply on this channel right now?
export function replyEligibility(state, contact, channel) {
  if (channel === 'email' && !contact.email) return { ok: false, reason: 'Contact has no email address.' };
  if (channel !== 'email' && !contact.phone) return { ok: false, reason: 'Contact has no phone number.' };
  if (isSuppressed(state, contact)) return { ok: false, reason: 'Contact is on the suppression list.' };
  if (getConsent(state, contact.id, channel)?.status === 'revoked') return { ok: false, reason: `Contact has opted out of ${CHANNEL_LABEL[channel]}.` };
  return { ok: true };
}

export function sendReply(draft, ctx, conversationId, content) {
  const conv = find(draft.conversations, conversationId);
  const contact = find(draft.contacts, conv.contact_id);
  const e = replyEligibility(draft, contact, conv.channel);
  if (!e.ok) throw new Error(e.reason);
  const msg = sendMessage(draft, ctx, { contactId: contact.id, channel: conv.channel, content, conversationId, role: 'reply', subject: conv.channel === 'email' ? 'Re: your message' : '' });
  draft.conversationMessages.push({ id: uid('cm'), organisation_id: ctx.orgId, conversation_id: conversationId, direction: 'out', content, channel: conv.channel, message_id: msg.id, user_id: ctx.userId, created_at: ctx.now });
  upd(draft.conversations, conversationId, { last_message_at: ctx.now, unread: false });
  logActivity(draft, ctx, { event_type: 'reply.sent', entity_type: 'conversation', entity_id: conversationId, contact_id: contact.id, summary: `Simulated ${CHANNEL_LABEL[conv.channel]} reply sent to ${fullName(contact)}` });
  return msg;
}

export function simulateUnsubscribe(draft, ctx, contactId, source = 'Email unsubscribe link (simulated)') {
  const contact = find(draft.contacts, contactId);
  const rules = rulesFor(orgOf(draft, ctx));
  setConsent(draft, ctx, contactId, 'email', { status: 'revoked', source });
  if (rules.unsubscribeScope === 'global') addSuppression(draft, ctx, contact, 'Unsubscribed via email link', source);
}

export function simulateClick(draft, ctx, messageId) {
  const m = find(draft.messages, messageId);
  if (!m || m.clicked_at) return;
  upd(draft.messages, messageId, { clicked_at: ctx.now });
  emit(draft, { ...ctx, system: true }, { type: 'link.clicked', contactId: m.contact_id, messageId, channel: m.channel });
}
