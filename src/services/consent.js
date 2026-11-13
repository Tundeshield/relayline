// Consent & eligibility. Having an address is never treated as permission to send.
import { uid } from '../lib/util';
import { find, upd } from '../data/store';
import { logActivity } from './core';
import { CHANNEL_LABEL } from '../lib/constants';

export const DEFAULT_CONSENT_RULES = {
  operationalEmailRequiresOptIn: false, // operational email allowed unless the contact opted out
  operationalSmsRequiresOptIn: true,
  whatsappRequiresOptIn: true, // always enforced; shown for clarity
  marketingRequiresExplicit: true, // always enforced
  jurisdictionNote: 'United States (TCPA / CAN-SPAM) — review with counsel',
  stopKeywords: ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
  startKeywords: ['START', 'UNSTOP', 'YES'],
  unsubscribeScope: 'channel', // 'channel' | 'global'
};

export const rulesFor = (org) => ({ ...DEFAULT_CONSENT_RULES, ...(org?.settings?.consent || {}) });

export function getConsent(state, contactId, channel) {
  return state.consents.find((c) => c.contact_id === contactId && c.channel === channel) || null;
}

export function isSuppressed(state, contact) {
  return state.suppressions.some((s) => s.organisation_id === contact.organisation_id && (
    s.contact_id === contact.id ||
    (s.type === 'email' && contact.email && s.value === contact.email.toLowerCase()) ||
    (s.type === 'phone' && contact.phone && s.value === contact.phone)
  ));
}

export const REASON_LABEL = {
  missing_email: 'No email address',
  missing_phone: 'No phone number',
  suppressed: 'On suppression list',
  opted_out: 'Opted out of this channel',
  no_consent: 'No opt-in recorded',
  no_marketing_consent: 'No marketing consent',
  archived: 'Contact archived',
};

// Returns { ok, reason } for sending `purpose` content to a contact over a channel.
export function eligibility(state, contact, channel, purpose, org) {
  const rules = rulesFor(org);
  if (contact.status === 'archived') return { ok: false, reason: 'archived' };
  if (channel === 'email' && !contact.email) return { ok: false, reason: 'missing_email' };
  if ((channel === 'sms' || channel === 'whatsapp') && !contact.phone) return { ok: false, reason: 'missing_phone' };
  if (isSuppressed(state, contact)) return { ok: false, reason: 'suppressed' };
  const c = getConsent(state, contact.id, channel);
  const status = c?.status || 'none';
  if (status === 'revoked') return { ok: false, reason: 'opted_out' };
  if (purpose === 'marketing') {
    if (status !== 'granted' || !(c.purpose === 'marketing' || c.purpose === 'all')) return { ok: false, reason: 'no_marketing_consent' };
    return { ok: true };
  }
  const needsOptIn = channel === 'whatsapp' || (channel === 'sms' && rules.operationalSmsRequiresOptIn) || (channel === 'email' && rules.operationalEmailRequiresOptIn);
  if (needsOptIn && status !== 'granted') return { ok: false, reason: 'no_consent' };
  return { ok: true };
}

export const availableChannels = (contact) => ({ email: !!contact.email, sms: !!contact.phone, whatsapp: !!contact.phone });

export function setConsent(draft, ctx, contactId, channel, { status, purpose, source, note }) {
  const existing = draft.consents.find((c) => c.contact_id === contactId && c.channel === channel);
  const now = ctx.now;
  const patch = {
    status,
    purpose: purpose || existing?.purpose || 'operational',
    source: source || existing?.source || 'Staff entry',
    consented_at: status === 'granted' ? now : existing?.consented_at || null,
    revoked_at: status === 'revoked' ? now : null,
    revoke_source: status === 'revoked' ? source : null,
    updated_at: now,
  };
  if (existing) upd(draft.consents, existing.id, patch);
  else draft.consents.push({ id: uid('cns'), organisation_id: ctx.orgId, contact_id: contactId, channel, ...patch });
  const contact = find(draft.contacts, contactId);
  logActivity(draft, ctx, {
    event_type: status === 'revoked' ? 'consent.revoked' : 'consent.updated', entity_type: 'contact', entity_id: contactId, contact_id: contactId,
    summary: `${CHANNEL_LABEL[channel]} consent ${status === 'granted' ? 'granted' : status === 'revoked' ? 'revoked' : 'set to ' + status} for ${contact ? [contact.first_name, contact.last_name].join(' ') : 'contact'}`,
    details: { channel, status, purpose: patch.purpose, source: patch.source, note }, system: ctx.system,
  });
  refreshContactStatus(draft, contactId);
}

export function addSuppression(draft, ctx, contact, reason, source = 'Staff entry') {
  if (isSuppressed(draft, contact)) return;
  draft.suppressions.push({ id: uid('sup'), organisation_id: ctx.orgId, type: 'contact', value: contact.email || contact.phone || contact.id, contact_id: contact.id, reason, source, created_at: ctx.now });
  logActivity(draft, ctx, { event_type: 'suppression.added', entity_type: 'contact', entity_id: contact.id, contact_id: contact.id, summary: `${contact.first_name} ${contact.last_name} added to the suppression list`, details: { reason, source }, system: ctx.system });
  refreshContactStatus(draft, contact.id);
}
export function removeSuppression(draft, ctx, supId) {
  const s = find(draft.suppressions, supId);
  if (!s) return;
  draft.suppressions = draft.suppressions.filter((x) => x.id !== supId);
  logActivity(draft, ctx, { event_type: 'suppression.removed', entity_type: 'contact', entity_id: s.contact_id, contact_id: s.contact_id, summary: `Removed ${s.value} from the suppression list`, details: {} });
  if (s.contact_id) refreshContactStatus(draft, s.contact_id);
}

// Contact status: unsubscribed when globally suppressed or opted out everywhere they could be reached.
export function refreshContactStatus(draft, contactId) {
  const c = find(draft.contacts, contactId);
  if (!c || c.status === 'archived') return;
  const sup = isSuppressed(draft, c);
  const reachable = ['email', 'sms', 'whatsapp'].filter((ch) => (ch === 'email' ? c.email : c.phone));
  const allRevoked = reachable.length > 0 && reachable.every((ch) => getConsent(draft, c.id, ch)?.status === 'revoked');
  upd(draft.contacts, contactId, { status: sup || allRevoked ? 'unsubscribed' : 'active' });
}
