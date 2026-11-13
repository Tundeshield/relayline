// Contacts, tags, lists and segments.
import { uid, fullName, DAY } from '../lib/util';
import { find, upd } from '../data/store';
import { logActivity } from './core';
import { getConsent, refreshContactStatus, setConsent } from './consent';
import { emit } from './automation/engine';
import { CONTACT_FIELDS } from '../lib/constants';

const CUSTOM_KEYS = CONTACT_FIELDS.filter((f) => f.custom).map((f) => f.key);

export function fieldValue(contact, key) {
  if (CUSTOM_KEYS.includes(key) || !(key in contact)) return contact.custom_fields?.[key] ?? '';
  return contact[key] ?? '';
}

export function createContact(draft, ctx, data, { silent = false, consents = {} } = {}) {
  const contact = {
    id: uid('ct'), organisation_id: ctx.orgId,
    first_name: data.first_name?.trim() || '', last_name: data.last_name?.trim() || '',
    email: data.email?.trim().toLowerCase() || '', phone: data.phone || '',
    company: data.company || '', job_title: data.job_title || '',
    custom_fields: data.custom_fields || {}, tag_ids: data.tag_ids || [],
    preferred_channel: data.preferred_channel || '', status: 'active', source: data.source || 'Manual',
    created_at: data.created_at || ctx.now, updated_at: data.created_at || ctx.now,
  };
  draft.contacts.push(contact);
  Object.entries(consents).forEach(([ch, c]) => c && c.status && c.status !== 'none' && setConsent(draft, { ...ctx, system: ctx.system }, contact.id, ch, c));
  if (!silent) {
    logActivity(draft, ctx, { event_type: 'contact.created', entity_type: 'contact', entity_id: contact.id, contact_id: contact.id, summary: `Contact ${fullName(contact)} created`, details: { source: contact.source } });
    emit(draft, ctx, { type: 'contact.created', contactId: contact.id });
  }
  return contact;
}

export function updateContact(draft, ctx, id, patch) {
  const before = find(draft.contacts, id);
  if (!before) return null;
  const next = { ...patch, updated_at: ctx.now };
  if (patch.custom_fields) next.custom_fields = { ...before.custom_fields, ...patch.custom_fields };
  const after = upd(draft.contacts, id, next);
  const changed = [];
  ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'preferred_channel'].forEach((k) => k in patch && before[k] !== after[k] && changed.push(k));
  Object.keys(patch.custom_fields || {}).forEach((k) => (before.custom_fields?.[k] || '') !== (after.custom_fields?.[k] || '') && changed.push(k));
  if (changed.length) {
    logActivity(draft, ctx, {
      event_type: 'contact.updated', entity_type: 'contact', entity_id: id, contact_id: id, system: ctx.system,
      summary: `${fullName(after)} updated: ${changed.join(', ')}`,
      details: { changes: changed.map((k) => ({ field: k, from: fieldValue(before, k), to: fieldValue(after, k) })) },
    });
    changed.forEach((field) => emit(draft, ctx, { type: 'contact.updated', contactId: id, field }));
  }
  refreshContactStatus(draft, id);
  return after;
}

export function deleteContacts(draft, ctx, ids) {
  const set = new Set(ids);
  const names = draft.contacts.filter((c) => set.has(c.id)).map(fullName);
  draft.contacts = draft.contacts.filter((c) => !set.has(c.id));
  draft.listMemberships = draft.listMemberships.filter((m) => !set.has(m.contact_id));
  draft.consents = draft.consents.filter((c) => !set.has(c.contact_id));
  draft.notes = draft.notes.filter((n) => !set.has(n.contact_id));
  logActivity(draft, ctx, { event_type: 'contact.deleted', entity_type: 'contact', entity_id: ids.length === 1 ? ids[0] : null, summary: ids.length === 1 ? `Contact ${names[0]} deleted` : `${ids.length} contacts deleted`, details: { names: names.slice(0, 20) } });
}

export function ensureTag(draft, ctx, name) {
  const n = name.trim();
  let t = draft.tags.find((x) => x.organisation_id === ctx.orgId && x.name.toLowerCase() === n.toLowerCase());
  if (!t) { t = { id: uid('tag'), organisation_id: ctx.orgId, name: n, created_at: ctx.now }; draft.tags.push(t); }
  return t;
}

export function addTag(draft, ctx, contactId, tagId) {
  const c = find(draft.contacts, contactId);
  if (!c || c.tag_ids.includes(tagId)) return false;
  upd(draft.contacts, contactId, { tag_ids: [...c.tag_ids, tagId], updated_at: ctx.now });
  const tag = find(draft.tags, tagId);
  logActivity(draft, ctx, { event_type: 'contact.tagged', entity_type: 'contact', entity_id: contactId, contact_id: contactId, summary: `Tag "${tag?.name}" added to ${fullName(c)}`, details: { tag: tag?.name }, system: ctx.system });
  emit(draft, ctx, { type: 'contact.tagged', contactId, tagId });
  return true;
}
export function removeTag(draft, ctx, contactId, tagId) {
  const c = find(draft.contacts, contactId);
  if (!c || !c.tag_ids.includes(tagId)) return false;
  upd(draft.contacts, contactId, { tag_ids: c.tag_ids.filter((t) => t !== tagId), updated_at: ctx.now });
  const tag = find(draft.tags, tagId);
  logActivity(draft, ctx, { event_type: 'contact.untagged', entity_type: 'contact', entity_id: contactId, contact_id: contactId, summary: `Tag "${tag?.name}" removed from ${fullName(c)}`, details: { tag: tag?.name }, system: ctx.system });
  return true;
}

export function createList(draft, ctx, { name, description = '', type = 'static', rules = null }) {
  const list = { id: uid('lst'), organisation_id: ctx.orgId, name: name.trim(), description, type, rules, created_at: ctx.now, created_by: ctx.userId };
  draft.lists.push(list);
  logActivity(draft, ctx, { event_type: type === 'segment' ? 'segment.created' : 'list.created', entity_type: 'list', entity_id: list.id, summary: `${type === 'segment' ? 'Segment' : 'List'} "${list.name}" created` });
  return list;
}

export function addToList(draft, ctx, listId, contactIds, { silent = false } = {}) {
  const list = find(draft.lists, listId);
  if (!list || list.type !== 'static') return 0;
  const existing = new Set(draft.listMemberships.filter((m) => m.list_id === listId).map((m) => m.contact_id));
  const added = contactIds.filter((id) => !existing.has(id));
  added.forEach((cid) => draft.listMemberships.push({ id: uid('lm'), organisation_id: ctx.orgId, list_id: listId, contact_id: cid, added_at: ctx.now }));
  if (added.length && !silent) {
    logActivity(draft, ctx, { event_type: 'list.members_added', entity_type: 'list', entity_id: listId, contact_id: added.length === 1 ? added[0] : null, summary: `${added.length === 1 ? fullName(find(draft.contacts, added[0])) : added.length + ' contacts'} added to "${list.name}"`, details: { count: added.length }, system: ctx.system });
    added.forEach((cid) => emit(draft, ctx, { type: 'contact.added_to_list', contactId: cid, listId }));
  }
  return added.length;
}
export function removeFromList(draft, ctx, listId, contactIds) {
  const set = new Set(contactIds);
  const before = draft.listMemberships.length;
  draft.listMemberships = draft.listMemberships.filter((m) => !(m.list_id === listId && set.has(m.contact_id)));
  const n = before - draft.listMemberships.length;
  const list = find(draft.lists, listId);
  if (n) logActivity(draft, ctx, { event_type: 'list.members_removed', entity_type: 'list', entity_id: listId, contact_id: n === 1 ? contactIds[0] : null, summary: `${n === 1 ? fullName(find(draft.contacts, contactIds[0])) : n + ' contacts'} removed from "${list?.name}"`, system: ctx.system });
  return n;
}

export function addNote(draft, ctx, contactId, body) {
  const note = { id: uid('note'), organisation_id: ctx.orgId, contact_id: contactId, body: body.trim(), user_id: ctx.userId, created_at: ctx.now };
  draft.notes.push(note);
  return note;
}

// ---------- Segments ----------
export const SEGMENT_FIELDS = [
  { key: 'tag', label: 'Tag', ops: ['has', 'not_has'], value: 'tag' },
  { key: 'list', label: 'List membership', ops: ['in', 'not_in'], value: 'list' },
  { key: 'channel', label: 'Channel available', ops: ['is', 'is_not'], value: 'channel' },
  { key: 'consent', label: 'Consent', ops: ['granted', 'not_granted', 'revoked'], value: 'channel' },
  { key: 'status', label: 'Contact status', ops: ['is', 'is_not'], value: 'status' },
  { key: 'no_campaign_days', label: 'No campaign received in', ops: ['days'], value: 'number' },
  { key: 'created_within', label: 'Created within', ops: ['days'], value: 'number' },
  ...CONTACT_FIELDS.filter((f) => !f.type).map((f) => ({ key: f.key, label: f.label, ops: ['equals', 'not_equals', 'contains', 'is_set', 'is_not_set'], value: 'text' })),
];
export const OP_LABEL = { has: 'has', not_has: 'does not have', in: 'is in', not_in: 'is not in', is: 'is', is_not: 'is not', granted: 'is opted in for', not_granted: 'is not opted in for', revoked: 'has opted out of', days: '', equals: 'equals', not_equals: 'does not equal', contains: 'contains', is_set: 'is set', is_not_set: 'is empty' };

export function staticMemberIds(state, listId) {
  return state.listMemberships.filter((m) => m.list_id === listId).map((m) => m.contact_id);
}

export function matchesRule(state, contact, rule, now = Date.now()) {
  const { field, op, value } = rule;
  switch (field) {
    case 'tag': { const has = contact.tag_ids.includes(value); return op === 'has' ? has : !has; }
    case 'list': {
      const list = find(state.lists, value);
      const inList = list ? (list.type === 'segment' ? (list.id !== rule._self && evaluateSegment(state, contact, list, now)) : state.listMemberships.some((m) => m.list_id === value && m.contact_id === contact.id)) : false;
      return op === 'in' ? inList : !inList;
    }
    case 'channel': { const has = value === 'email' ? !!contact.email : !!contact.phone; return op === 'is' ? has : !has; }
    case 'consent': {
      const s = getConsent(state, contact.id, value)?.status || 'none';
      return op === 'granted' ? s === 'granted' : op === 'revoked' ? s === 'revoked' : s !== 'granted';
    }
    case 'status': return op === 'is' ? contact.status === value : contact.status !== value;
    case 'no_campaign_days': {
      const since = now - Number(value || 0) * DAY;
      return !state.messages.some((m) => m.contact_id === contact.id && m.campaign_id && (m.attempted_at || m.created_at) >= since && m.status !== 'skipped');
    }
    case 'created_within': return contact.created_at >= now - Number(value || 0) * DAY;
    default: {
      const v = String(fieldValue(contact, field) || '').toLowerCase();
      const t = String(value || '').toLowerCase();
      if (op === 'equals') return v === t;
      if (op === 'not_equals') return v !== t;
      if (op === 'contains') return v.includes(t);
      if (op === 'is_set') return v !== '';
      if (op === 'is_not_set') return v === '';
      return false;
    }
  }
}
export function evaluateSegment(state, contact, segment, now) {
  const rules = (segment.rules?.rules || []).map((r) => ({ ...r, _self: segment.id }));
  if (!rules.length) return false;
  return segment.rules.match === 'any' ? rules.some((r) => matchesRule(state, contact, r, now)) : rules.every((r) => matchesRule(state, contact, r, now));
}
export function listMembers(state, list, contacts) {
  if (!list) return [];
  if (list.type === 'segment') return contacts.filter((c) => evaluateSegment(state, c, list));
  const ids = new Set(staticMemberIds(state, list.id));
  return contacts.filter((c) => ids.has(c.id));
}
export function contactLists(state, contact, lists) {
  return lists.filter((l) => (l.type === 'segment' ? evaluateSegment(state, contact, l) : state.listMemberships.some((m) => m.list_id === l.id && m.contact_id === contact.id)));
}
