import { useSyncExternalStore, useMemo } from 'react';
import { localAdapter } from './adapters/localAdapter';

// Every organisation-owned collection. Records carry organisation_id.
export const ORG_COLLECTIONS = [
  'contacts', 'consents', 'tags', 'lists', 'listMemberships', 'campaigns', 'messages', 'conversations',
  'conversationMessages', 'templates', 'automations', 'executions', 'notifications', 'activity',
  'suppressions', 'notes', 'invitations', 'memberships', 'simQueue',
];
export const GLOBAL_COLLECTIONS = ['organisations', 'users'];
export const SCHEMA_VERSION = 3;

export function emptyState() {
  const s = { version: SCHEMA_VERSION, session: null, prefs: { textSize: 'default' } };
  [...ORG_COLLECTIONS, ...GLOBAL_COLLECTIONS].forEach((c) => (s[c] = []));
  return s;
}

const adapter = localAdapter;
let state = null;
const listeners = new Set();

export function initStore(bootstrap) {
  const loaded = adapter.load();
  state = loaded && loaded.version === SCHEMA_VERSION ? loaded : bootstrap(emptyState());
  if (!loaded || loaded.version !== SCHEMA_VERSION) adapter.save(state);
}
export const getState = () => state;
export const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
function commit(next) { state = next; adapter.save(state); listeners.forEach((l) => l()); }

// Transaction: shallow-copies every collection so services can push/replace
// records on a draft, then commits once. Records are replaced, never mutated.
export function tx(fn) {
  const draft = { ...state };
  [...ORG_COLLECTIONS, ...GLOBAL_COLLECTIONS].forEach((c) => (draft[c] = [...(state[c] || [])]));
  const result = fn(draft);
  commit(draft);
  return result;
}
export function replaceState(next) { commit(next); }

// Draft helpers
export const find = (arr, id) => arr.find((r) => r.id === id);
export function upd(arr, id, patch) {
  const i = arr.findIndex((r) => r.id === id);
  if (i < 0) return null;
  arr[i] = { ...arr[i], ...(typeof patch === 'function' ? patch(arr[i]) : patch) };
  return arr[i];
}
export function del(draft, coll, pred) {
  draft[coll] = draft[coll].filter((r) => !pred(r));
}

// ---------- React bindings ----------
export const useStoreState = () => useSyncExternalStore(subscribe, getState);

// Org-scoped view of the store. Recomputed only when state changes.
export function scopeState(s) {
  const orgId = s.session?.orgId;
  const out = { orgId, org: s.organisations.find((o) => o.id === orgId) || null, user: s.users.find((u) => u.id === s.session?.userId) || null };
  ORG_COLLECTIONS.forEach((c) => (out[c] = orgId ? s[c].filter((r) => r.organisation_id === orgId) : []));
  out.membership = out.memberships.find((m) => m.user_id === out.user?.id) || null;
  out.role = out.membership?.role || 'member';
  out.members = out.memberships.filter((m) => m.status === 'active').map((m) => ({ ...m, user: s.users.find((u) => u.id === m.user_id) }));
  out.myNotifications = out.notifications.filter((n) => n.user_id === out.user?.id);
  return out;
}
export function useOrg() {
  const s = useStoreState();
  return useMemo(() => scopeState(s), [s]);
}
