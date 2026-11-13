// Cross-cutting domain helpers that operate on a store draft.
import { uid } from '../lib/util';
import { find } from '../data/store';

export function ctxOf(draft, over = {}) {
  return { orgId: draft.session?.orgId, userId: draft.session?.userId ?? null, now: Date.now(), depth: 0, ...over };
}
export const orgOf = (draft, ctx) => find(draft.organisations, ctx.orgId);
export const orgRecords = (draft, coll, ctx) => draft[coll].filter((r) => r.organisation_id === ctx.orgId);

export function logActivity(draft, ctx, { event_type, entity_type, entity_id, summary, details = {}, contact_id = null, system = false }) {
  const rec = {
    id: uid('act'), organisation_id: ctx.orgId, user_id: system ? null : ctx.userId,
    event_type, entity_type, entity_id, summary, details, contact_id, created_at: ctx.now,
  };
  draft.activity.push(rec);
  return rec;
}

// Notifications fan out to every active member of the organisation.
export function notify(draft, ctx, { type, message, link, tone = 'info' }) {
  const members = draft.memberships.filter((m) => m.organisation_id === ctx.orgId && m.status === 'active');
  members.forEach((m) => {
    const org = find(draft.organisations, ctx.orgId);
    const prefs = org?.settings?.notifications || {};
    if (prefs[type] === false) return;
    draft.notifications.push({ id: uid('ntf'), organisation_id: ctx.orgId, user_id: m.user_id, type, message, link, tone, read_at: null, created_at: ctx.now });
  });
}
