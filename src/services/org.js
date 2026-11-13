// Organisations, membership, invitations and workspace-level operations.
import { uid } from '../lib/util';
import { find, upd, ORG_COLLECTIONS } from '../data/store';
import { logActivity, notify } from './core';
import { DEFAULT_PERMISSIONS, ROLE_LABEL } from '../lib/constants';
import { DEFAULT_CONSENT_RULES } from './consent';

export function defaultSettings(country = 'United States') {
  return {
    currency: 'USD', language: 'English (US)', address: '', logo: null, date_format: 'MM/DD/YYYY',
    channels: {
      email: { status: 'demo', from_name: '', from_email: '', reply_to: '' },
      sms: { status: 'demo', sender_id: '', country },
      whatsapp: { status: 'not_connected', business_name: '', phone: '' },
    },
    communication: { default_mode: 'all', fallback_primary: 'sms', fallback_secondary: 'email', fallback_delay: 5, quiet_hours: true, quiet_start: '21:00', quiet_end: '08:00' },
    notifications: { reply: true, campaign_completed: true, campaign_failed: true, automation_error: true, import: true, team: true, automation: true },
    consent: { ...DEFAULT_CONSENT_RULES },
    permissions: JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)),
    session_timeout: '7d',
  };
}

export function createOrganisation(draft, { userId, name, industry = 'Other', website = '', country = 'United States', timezone = 'America/New_York', size = '', goals = [], channels = [], now = Date.now(), is_demo = false }) {
  const org = {
    id: uid('org'), name: name.trim(), industry, website, country, timezone, size, goals, plan: 'growth', is_demo,
    settings: defaultSettings(country), onboarding: { channels, completed: false }, created_at: now,
  };
  ['email', 'sms', 'whatsapp'].forEach((ch) => (org.settings.channels[ch].status = channels.includes(ch) ? 'demo' : 'not_connected'));
  draft.organisations.push(org);
  draft.memberships.push({ id: uid('mem'), organisation_id: org.id, user_id: userId, role: 'owner', status: 'active', joined_at: now });
  return org;
}

export function wipeOrgData(draft, orgId, { keepMembers = true } = {}) {
  ORG_COLLECTIONS.forEach((c) => {
    if (keepMembers && (c === 'memberships')) return;
    draft[c] = draft[c].filter((r) => r.organisation_id !== orgId);
  });
}

export function inviteMember(draft, ctx, { email, role }) {
  const e = email.trim().toLowerCase();
  const existingUser = draft.users.find((u) => u.email === e);
  if (existingUser && draft.memberships.some((m) => m.organisation_id === ctx.orgId && m.user_id === existingUser.id && m.status === 'active')) throw new Error('This person is already a member of the workspace.');
  if (draft.invitations.some((i) => i.organisation_id === ctx.orgId && i.email === e && i.status === 'pending')) throw new Error('An invitation is already pending for this email.');
  const inv = { id: uid('inv'), organisation_id: ctx.orgId, email: e, role, status: 'pending', invited_by: ctx.userId, created_at: ctx.now };
  draft.invitations.push(inv);
  logActivity(draft, ctx, { event_type: 'team.invited', entity_type: 'invitation', entity_id: inv.id, summary: `${e} invited as ${ROLE_LABEL[role]} (simulated — no email sent)` });
  return inv;
}

// Simulates the invitee accepting. Creates a demo user account for them.
export function acceptInvitation(draft, ctx, invId) {
  const inv = find(draft.invitations, invId);
  let user = draft.users.find((u) => u.email === inv.email);
  if (!user) {
    const name = inv.email.split('@')[0].split(/[._-]/).map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' ');
    user = { id: uid('usr'), name, email: inv.email, password_hash: null, job_title: '', created_at: ctx.now };
    draft.users.push(user);
  }
  draft.memberships.push({ id: uid('mem'), organisation_id: ctx.orgId, user_id: user.id, role: inv.role, status: 'active', joined_at: ctx.now });
  upd(draft.invitations, invId, { status: 'accepted', accepted_at: ctx.now });
  logActivity(draft, { ...ctx, system: true }, { event_type: 'team.joined', entity_type: 'user', entity_id: user.id, summary: `${user.name} accepted the invitation and joined as ${ROLE_LABEL[inv.role]}` });
  notify(draft, ctx, { type: 'team', message: `${user.name} accepted your invitation and joined the workspace.`, link: '/app/team', tone: 'success' });
}

export function can(org, role, perm) {
  if (role === 'owner') return true;
  const perms = org?.settings?.permissions || DEFAULT_PERMISSIONS;
  return (perms[role] || []).includes(perm);
}
