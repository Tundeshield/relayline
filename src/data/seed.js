// Demo workspace seed: "Northstar Property Group". Everything is generated through
// the same services the app uses, so campaigns, messages, inbox, analytics and the
// activity log stay consistent with one another.
import { seededRng, uid, DAY, HOUR, demoPasswordHash } from '../lib/util';
import { find, upd } from './store';
import { createContact, ensureTag, createList, addToList, addNote } from '../services/contacts';
import { setConsent, addSuppression } from '../services/consent';
import { saveCampaign, executeCampaign, blankCampaign } from '../services/campaigns';
import { receiveMessage, sendReply } from '../services/messaging';
import { startExecution } from '../services/automation/engine';
import { createOrganisation, wipeOrgData } from '../services/org';
import { logActivity, notify } from '../services/core';

export const DEMO_EMAIL = 'demo@relayline.app';
export const DEMO_PASSWORD = 'demo1234';

const A = [
  ['Maria', 'Gonzalez'], ['James', 'Carter'], ['Aisha', 'Bello'], ['Daniel', 'Kim'], ['Emily', 'Nguyen'], ['Robert', 'Fischer'], ['Sofia', 'Rossi'],
  ['Kevin', "O'Brien"], ['Hannah', 'Lindqvist'], ['Marcus', 'Thompson'], ['Grace', 'Okafor'], ['Luis', 'Ramirez'], ['Chloe', 'Bennett'], ['Omar', 'Haddad'],
];
const B = [
  ['Natalie', 'Brooks'], ['Ethan', 'Walsh'], ['Priyanka', 'Rao'], ['Tyler', 'Jenkins'], ['Mei', 'Chen'], ['Samuel', 'Adeyemi'], ['Olivia', 'Park'],
  ['Brandon', 'Hughes'], ['Isabella', 'Moreno'], ['Andre', 'Dubois'], ['Rachel', 'Goldberg'], ['Victor', 'Petrov'],
];
const OWNERS = [['Catherine', 'Wells', 'Wells Holdings LLC'], ['Harold', 'Simmons', 'Simmons Family Trust'], ['Diane', 'Foster', 'Foster Realty Partners'], ['Raj', 'Mehta', 'Mehta Capital'], ['Laura', 'Chambers', 'Chambers & Co.'], ['Theo', 'Nakamura', 'Pacific Crest Investments']];
const MAINT = [['Carlos', 'Diaz', 'Maintenance Lead'], ['Jamal', 'Washington', 'HVAC Technician'], ['Megan', 'Doyle', 'Building Engineer'], ['Tony', 'Russo', 'Groundskeeper'], ['Erin', 'McCoy', 'Facilities Coordinator']];
const PROSPECTS = [['Jordan', 'Ellis'], ['Ava', 'Sullivan'], ['Nikhil', 'Iyer']];

const dateStr = (ts) => new Date(ts).toISOString().slice(0, 10);

export function seedWorkspace(draft, { orgId, users }) {
  const now = Date.now();
  const rng = seededRng(20261113);
  const R = () => rng();
  const ctx = (at, userId = users.owner) => ({ orgId, userId, now: at, depth: 0, historical: true, noAutomations: true });
  const base = ctx(now - 210 * DAY);

  // ---------- Tags ----------
  const T = {};
  ['Resident', 'Owner', 'Maintenance', 'VIP', 'Lease Renewal Due', 'New Contact', 'Pet Owner', 'Parking Permit', 'Prospect'].forEach((n) => (T[n] = ensureTag(draft, base, n).id));

  // ---------- Contacts ----------
  let phoneN = 100;
  const phone = () => `+1312555${String(phoneN++).padStart(4, '0').slice(-4)}`;
  const mail = (f, l, dom = 'example.com') => `${f}.${l}`.toLowerCase().replace(/[^a-z.]/g, '') + '@' + dom;
  const people = [];
  const add = (spec) => people.push(spec);
  A.forEach(([f, l], i) => add({ f, l, group: 'A', unit: `A-${100 + Math.floor(i / 4) * 100 + (i % 4) + 1}`, tags: ['Resident'] }));
  B.forEach(([f, l], i) => add({ f, l, group: 'B', unit: `B-${100 + Math.floor(i / 4) * 100 + (i % 4) + 1}`, tags: ['Resident'] }));
  OWNERS.forEach(([f, l, co]) => add({ f, l, group: 'O', company: co, tags: ['Owner'] }));
  MAINT.forEach(([f, l, jt]) => add({ f, l, group: 'M', job: jt, company: 'Northstar Property Group', tags: ['Maintenance'] }));
  PROSPECTS.forEach(([f, l]) => add({ f, l, group: 'P', tags: ['Prospect'] }));

  // Deliberate data gaps & states for realism
  const noEmail = new Set(['Tyler Jenkins', 'Luis Ramirez', 'Tony Russo', 'Victor Petrov']);
  const noPhone = new Set(['Hannah Lindqvist', 'Harold Simmons', 'Rachel Goldberg', 'Ava Sullivan']);
  const recent = new Set(['Omar Haddad', 'Chloe Bennett', 'Victor Petrov', 'Nikhil Iyer']);
  const contacts = {};
  people.forEach((p, i) => {
    const name = `${p.f} ${p.l}`;
    const created = recent.has(name) ? now - (2 + i % 5) * DAY - 3 * HOUR : now - (95 + Math.floor(R() * 110)) * DAY;
    const tags = [...p.tags];
    if (p.group === 'A' || p.group === 'B') {
      if (R() < 0.3) tags.push('Pet Owner');
      if (R() < 0.45) tags.push('Parking Permit');
    }
    if (['Catherine Wells', 'Raj Mehta', 'Maria Gonzalez'].includes(name)) tags.push('VIP');
    if (recent.has(name)) tags.push('New Contact');
    const lease = p.group === 'A' || p.group === 'B' ? dateStr(now + (12 + Math.floor(R() * 220)) * DAY) : '';
    const renewalSoon = ['Daniel Kim', 'Natalie Brooks', 'Mei Chen', 'Kevin O\'Brien'].includes(name);
    if (renewalSoon) tags.push('Lease Renewal Due');
    const custom = {};
    if (p.unit) { custom.building = p.group === 'A' ? 'Building A' : 'Building B'; custom.unit = p.unit; custom.lease_end = renewalSoon ? dateStr(now + (14 + i % 6) * DAY) : lease; }
    if (renewalSoon) { custom.renewal_date = custom.lease_end; custom.renewal_status = 'Pending'; }
    if (name === 'Emily Nguyen' || name === 'Andre Dubois') custom.appointment_at = dateStr(now + 2 * DAY);
    const c = createContact(draft, ctx(created), {
      first_name: p.f, last_name: p.l,
      email: noEmail.has(name) ? '' : mail(p.f, p.l, p.group === 'O' ? 'example.org' : p.group === 'M' ? 'northstarpg.example' : 'example.com'),
      phone: noPhone.has(name) ? '' : phone(),
      company: p.company || '', job_title: p.job || (p.group === 'O' ? 'Owner' : ''),
      custom_fields: custom, tag_ids: tags.map((t) => T[t]),
      preferred_channel: R() < 0.4 ? 'sms' : R() < 0.7 ? 'email' : '', source: i < 26 ? 'CSV import' : 'Manual', created_at: created,
    }, { silent: true });
    contacts[name] = c;
    const cctx = { ...ctx(created + HOUR), system: true };
    // Consent: never implied by having an address.
    if (c.email) {
      const r = R();
      const st = r < 0.72 ? 'granted' : r < 0.86 ? 'none' : r < 0.93 ? 'pending' : 'revoked';
      if (st !== 'none') setConsent(draft, cctx, c.id, 'email', { status: st, purpose: R() < 0.55 ? 'all' : 'operational', source: p.group === 'O' ? 'Owner agreement' : 'Lease application form' });
    }
    if (c.phone) {
      const r = R();
      const st = p.group === 'M' ? 'granted' : r < 0.64 ? 'granted' : r < 0.82 ? 'none' : r < 0.9 ? 'pending' : 'revoked';
      if (st !== 'none') setConsent(draft, cctx, c.id, 'sms', { status: st, purpose: R() < 0.3 ? 'all' : 'operational', source: st === 'granted' ? 'Resident portal' : 'Lease application form' });
      const w = R();
      if (w < 0.42 || p.group === 'M') setConsent(draft, cctx, c.id, 'whatsapp', { status: 'granted', purpose: 'operational', source: 'WhatsApp opt-in prompt' });
      else if (w > 0.92) setConsent(draft, cctx, c.id, 'whatsapp', { status: 'revoked', source: 'WhatsApp “Stop” reply' });
    }
  });
  // Explicit states used in the story
  const C = (n) => contacts[n];
  setConsent(draft, { ...ctx(now - 120 * DAY), system: true }, C('Maria Gonzalez').id, 'sms', { status: 'granted', purpose: 'all', source: 'Resident portal' });
  setConsent(draft, { ...ctx(now - 120 * DAY), system: true }, C('Maria Gonzalez').id, 'email', { status: 'granted', purpose: 'all', source: 'Lease application form' });
  setConsent(draft, { ...ctx(now - 60 * DAY), system: true }, C('Olivia Park').id, 'whatsapp', { status: 'granted', purpose: 'all', source: 'WhatsApp opt-in prompt' });
  addSuppression(draft, { ...ctx(now - 70 * DAY), system: true }, C('Brandon Hughes'), 'Requested no further contact', 'Phone call (recorded)');
  addSuppression(draft, { ...ctx(now - 33 * DAY), system: true }, C('Jordan Ellis'), 'Hard bounce + spam complaint (simulated)', 'Email feedback loop');
  upd(draft.contacts, C('Ava Sullivan').id, { status: 'archived' });

  // ---------- Lists & segments ----------
  const L = {};
  const listCtx = ctx(now - 200 * DAY);
  L.A = createList(draft, listCtx, { name: 'Building A Residents', description: 'Residents of 1420 Lakeview Ave (Building A).' }).id;
  L.B = createList(draft, listCtx, { name: 'Building B Residents', description: 'Residents of 1436 Lakeview Ave (Building B).' }).id;
  L.M = createList(draft, listCtx, { name: 'Maintenance Team', description: 'In-house maintenance and facilities staff.' }).id;
  L.O = createList(draft, listCtx, { name: 'Property Owners', description: 'Owners and investors in managed properties.' }).id;
  L.ALL = createList(draft, listCtx, { name: 'All Residents', description: 'Every current resident across both buildings.' }).id;
  people.forEach((p) => {
    const id = contacts[`${p.f} ${p.l}`].id;
    const at = { ...listCtx, now: contacts[`${p.f} ${p.l}`].created_at };
    if (p.group === 'A') { addToList(draft, at, L.A, [id], { silent: true }); addToList(draft, at, L.ALL, [id], { silent: true }); }
    if (p.group === 'B') { addToList(draft, at, L.B, [id], { silent: true }); addToList(draft, at, L.ALL, [id], { silent: true }); }
    if (p.group === 'M') addToList(draft, at, L.M, [id], { silent: true });
    if (p.group === 'O') addToList(draft, at, L.O, [id], { silent: true });
  });
  L.SMS = createList(draft, listCtx, { name: 'Residents opted in to SMS', type: 'segment', description: 'Residents with an active SMS opt-in.', rules: { match: 'all', rules: [{ field: 'tag', op: 'has', value: T.Resident }, { field: 'consent', op: 'granted', value: 'sms' }] } }).id;
  createList(draft, listCtx, { name: 'Residents with email', type: 'segment', description: 'Residents who have an email address on file.', rules: { match: 'all', rules: [{ field: 'tag', op: 'has', value: T.Resident }, { field: 'channel', op: 'is', value: 'email' }] } });
  createList(draft, listCtx, { name: 'Not contacted in 30 days', type: 'segment', description: 'Contacts who have not received a campaign in the last 30 days.', rules: { match: 'all', rules: [{ field: 'no_campaign_days', op: 'days', value: 30 }, { field: 'status', op: 'is', value: 'active' }] } });
  createList(draft, listCtx, { name: 'Renewals or VIPs', type: 'segment', description: 'Lease renewals due, or VIP contacts.', rules: { match: 'any', rules: [{ field: 'tag', op: 'has', value: T['Lease Renewal Due'] }, { field: 'tag', op: 'has', value: T.VIP }] } });

  // ---------- Templates ----------
  const tpl = (name, channel, category, content, subject = '') => {
    const t = { id: uid('tpl'), organisation_id: orgId, name, channel, category, subject, content, created_by: users.owner, created_at: now - 180 * DAY, updated_at: now - 180 * DAY };
    draft.templates.push(t); return t.id;
  };
  const TPL = {};
  TPL.welcomeEmail = tpl('Welcome to the community', 'email', 'Welcome', `Hi {{first_name}},\n\nWelcome to {{organisation_name}}! We're glad to have you in unit {{unit}}.\n\n**A few things to get you started:**\n- Submit maintenance requests through the resident portal\n- The package room is open 7 AM – 10 PM\n- Office hours are Monday–Friday, 9 AM – 5 PM\n\nReply to this email any time if you have questions.\n\nThe {{organisation_name}} team`, 'Welcome to {{organisation_name}}, {{first_name}}');
  TPL.welcomeSms = tpl('Welcome text', 'sms', 'Welcome', `Hi {{first_name}}, welcome to {{organisation_name}}! Save this number for building updates. Reply STOP to opt out.`);
  TPL.waterEmail = tpl('Water shut-off notice', 'email', 'Maintenance', `Hi {{first_name}},\n\nWe will be carrying out scheduled water maintenance at {{building}} tomorrow between 10:00 AM and 2:00 PM. We apologise for any inconvenience.\n\nPlease store some water in advance if you need it during this window.\n\nThank you for your patience.`, 'Scheduled water maintenance — {{building}}');
  TPL.maintSms = tpl('Maintenance alert (short)', 'sms', 'Maintenance', `{{organisation_name}}: Scheduled maintenance at {{building}} tomorrow 10AM–2PM. Water will be off. Questions? Reply here. Reply STOP to opt out.`);
  TPL.rentSms = tpl('Rent due reminder', 'sms', 'Reminder', `Hi {{first_name}}, a friendly reminder that rent for unit {{unit}} is due on the 1st. Pay anytime in the resident portal. Reply STOP to opt out.`);
  TPL.apptSms = tpl('Appointment reminder', 'sms', 'Appointment', `Hi {{first_name}}, reminder: your maintenance appointment for unit {{unit}} is tomorrow. Reply YES to confirm or call the office to reschedule.`);
  TPL.renewalEmail = tpl('Lease renewal reminder', 'email', 'Reminder', `Hi {{first_name}},\n\nYour lease for unit {{unit}} is coming up for renewal. We'd love to have you stay.\n\nPlease review your renewal options in the resident portal, or reply to this email to talk with our leasing team.\n\nThank you,\n{{organisation_name}} Leasing`, 'Your lease renewal for unit {{unit}}');
  TPL.emergencySms = tpl('Emergency alert', 'sms', 'Emergency', `URGENT from {{organisation_name}}: [Describe the situation]. Please follow instructions from building staff. We will send updates here.`);
  TPL.newsletter = tpl('Monthly community newsletter', 'email', 'Marketing', `# This month at {{organisation_name}}\n\nHi {{first_name}},\n\n**Community BBQ** — Saturday at noon in the courtyard. Bring the family!\n\n**Gym upgrade** — New equipment arrives next week.\n\n**Refer a friend** — Earn a $250 credit when a friend signs a lease.\n\nSee you around,\nThe {{organisation_name}} team`, 'This month at {{organisation_name}}');
  TPL.followWa = tpl('Follow-up check-in', 'whatsapp', 'Follow-up', `Hi {{first_name}}, just following up on our last message from {{organisation_name}}. Is there anything we can help with? Reply here any time.`);
  TPL.packageWa = tpl('Package arrival', 'whatsapp', 'Announcement', `Hi {{first_name}}, a package has arrived for unit {{unit}}. You can collect it from the package room (7 AM – 10 PM).`);
  TPL.holidayEmail = tpl('Holiday office hours', 'email', 'Announcement', `Hi {{first_name}},\n\nOur leasing office will have reduced hours over the holidays:\n\n- Dec 24: 9 AM – 12 PM\n- Dec 25–26: Closed\n- Dec 31: 9 AM – 2 PM\n\nFor emergency maintenance, call the 24/7 line as usual.\n\nHappy holidays from {{organisation_name}}!`, 'Holiday office hours at {{organisation_name}}');
  TPL.reviewEmail = tpl('Owner quarterly report', 'email', 'Announcement', `Hi {{first_name}},\n\nYour quarterly owner report for {{company}} is ready in the owner portal. Occupancy held at 96% and all scheduled maintenance was completed on time.\n\nReply to schedule a review call.\n\n{{organisation_name}} Asset Management`, 'Quarterly owner report is ready');

  // ---------- Campaigns (historical, executed through the real pipeline) ----------
  const tplOf = (id) => find(draft.templates, id);
  const camp = (spec, daysAgo, by = users.owner) => {
    const at = now - daysAgo * DAY;
    const b = blankCampaign();
    const c = saveCampaign(draft, ctx(at - 2 * HOUR, by), { ...b, ...spec, content: { ...b.content, ...spec.content }, fallback: { ...b.fallback, ...(spec.fallback || {}) }, status: 'draft', schedule: { type: 'now', at: '', timezone: 'America/Chicago' } });
    executeCampaign(draft, ctx(at, by), c.id, { historicalAt: at });
    return c.id;
  };
  const maintCamp = camp({ name: 'Maintenance Team Shift Update', category: 'operational', audience: { type: 'list', ids: [L.M] }, channels: ['sms'], content: { sms: { body: 'Hi {{first_name}}, starting Monday the on-call rotation moves to a 2-week cycle. Check the shared calendar for your shifts.' } } }, 76, users.admin);
  camp({ name: 'Rent Reminder — September', category: 'reminder', audience: { type: 'list', ids: [L.ALL] }, channels: ['sms'], content: { sms: { body: tplOf(TPL.rentSms).content } } }, 72, users.manager);
  camp({ name: 'Hallway Painting — Building A', category: 'operational', audience: { type: 'list', ids: [L.A] }, channels: ['email', 'sms'], delivery_mode: 'fallback', fallback: { primary: 'email', secondary: 'sms', condition: 'failed', delay_minutes: 30, unavailable: 'use_fallback' }, content: { email: { subject: 'Hallway painting on floors 2–4 next week', body: 'Hi {{first_name}},\n\nOur painters will refresh the hallways on floors 2–4 of Building A next Monday to Wednesday, 8 AM – 4 PM. Low-VOC paint is used, but you may notice a light odour.\n\nThank you!' }, sms: { body: '{{organisation_name}}: Hallway painting in Building A, floors 2–4, Mon–Wed 8AM–4PM next week. Reply STOP to opt out.' } } }, 34, users.admin);
  camp({ name: 'Owner Quarterly Report — Q3', category: 'announcement', audience: { type: 'list', ids: [L.O] }, channels: ['email'], content: { email: { subject: tplOf(TPL.reviewEmail).subject, body: tplOf(TPL.reviewEmail).content } } }, 58);
  const rentCamp = camp({ name: 'Rent Reminder — October', category: 'reminder', audience: { type: 'list', ids: [L.ALL] }, channels: ['sms'], content: { sms: { body: tplOf(TPL.rentSms).content } } }, 43, users.manager);
  const elevCamp = camp({ name: 'Elevator Modernization Update', category: 'operational', audience: { type: 'list', ids: [L.B] }, channels: ['whatsapp', 'email'], delivery_mode: 'all', content: { whatsapp: { body: 'Hi {{first_name}}, the Building B elevator upgrade starts Monday. One car will stay in service at all times. Thanks for your patience!', template_name: 'building_update_v2' }, email: { subject: 'Building B elevator modernization starts Monday', body: 'Hi {{first_name}},\n\nThe elevator modernization in Building B begins Monday and runs for about three weeks. **One elevator will remain in service at all times.**\n\nIf you need help moving heavy items during this period, reply and our team will arrange assistance.\n\n{{organisation_name}}' } } }, 29);
  camp({ name: 'Monthly Community Newsletter', category: 'marketing', audience: { type: 'list', ids: [L.ALL] }, channels: ['email'], content: { email: { subject: tplOf(TPL.newsletter).subject, body: tplOf(TPL.newsletter).content } } }, 19, users.manager);
  camp({ name: 'Rent Reminder — November', category: 'reminder', audience: { type: 'list', ids: [L.ALL] }, channels: ['sms'], content: { sms: { body: tplOf(TPL.rentSms).content } } }, 13, users.manager);
  const fireCamp = camp({ name: 'Fire Alarm Testing Notice', category: 'operational', audience: { type: 'list', ids: [L.B] }, channels: ['sms', 'email'], delivery_mode: 'fallback', request_ack: true, fallback: { primary: 'sms', secondary: 'email', condition: 'failed', delay_minutes: 10, unavailable: 'use_fallback' }, content: { sms: { body: '{{organisation_name}}: Fire alarm testing in Building B on Thursday 9AM–12PM. Alarms will sound briefly. Reply YES to confirm you got this.' }, email: { subject: 'Fire alarm testing — Thursday 9 AM to 12 PM', body: 'Hi {{first_name}},\n\nWe will test the fire alarm system in Building B on Thursday between 9 AM and 12 PM. Alarms will sound briefly several times.\n\nNo action is needed. Reply YES to confirm you received this notice.' } } }, 11, users.admin);
  const waterCamp = camp({ name: 'Scheduled Water Maintenance', description: 'Building A main valve replacement.', category: 'operational', audience: { type: 'list', ids: [L.A] }, channels: ['email', 'sms'], delivery_mode: 'all', content: { email: { subject: tplOf(TPL.waterEmail).subject, body: tplOf(TPL.waterEmail).content }, sms: { body: 'Hi {{first_name}}, we will be carrying out scheduled water maintenance at Building A tomorrow between 10:00 AM and 2:00 PM. We apologise for any inconvenience.' } } }, 5);

  // Scheduled, draft, cancelled
  const b = blankCampaign();
  saveCampaign(draft, ctx(now - 1 * DAY), { ...b, name: 'Holiday Office Hours', category: 'announcement', audience: { type: 'list', ids: [L.ALL] }, channels: ['email'], content: { ...b.content, email: { subject: tplOf(TPL.holidayEmail).subject, body: tplOf(TPL.holidayEmail).content } }, status: 'scheduled', schedule: { type: 'later', at: '', timezone: 'America/Chicago' }, schedule_at: now + 5 * DAY + 3 * HOUR });
  saveCampaign(draft, ctx(now - 2 * DAY, users.manager), { ...b, name: 'Parking Lot Resurfacing', description: 'Waiting on contractor dates.', category: 'operational', audience: { type: 'list', ids: [L.ALL] }, channels: ['sms', 'email'], delivery_mode: 'fallback', fallback: { ...b.fallback, primary: 'sms', secondary: 'email' }, content: { ...b.content, sms: { body: '{{organisation_name}}: The parking lot will be resurfaced on [DATE]. Please move vehicles by 7 AM.' } }, status: 'draft' });
  const poolId = saveCampaign(draft, ctx(now - 40 * DAY, users.admin), { ...b, name: 'Pool Closure Notice', category: 'announcement', audience: { type: 'list', ids: [L.ALL] }, channels: ['email'], content: { ...b.content, email: { subject: 'Pool closed for the season', body: 'Hi {{first_name}}, the pool closes for the season this Sunday.' } }, status: 'scheduled', schedule_at: now - 35 * DAY }).id;
  upd(draft.campaigns, poolId, { status: 'cancelled', cancelled_at: now - 37 * DAY });
  logActivity(draft, ctx(now - 37 * DAY, users.admin), { event_type: 'campaign.cancelled', entity_type: 'campaign', entity_id: poolId, summary: 'Campaign "Pool Closure Notice" cancelled' });

  // ---------- Conversations (replies through the real inbound pipeline) ----------
  const delivered = (campId, name, ch) => draft.messages.find((m) => m.campaign_id === campId && m.contact_id === C(name)?.id && (!ch || m.channel === ch) && (m.status === 'delivered' || m.status === 'read'));
  const reply = (campId, name, text, hoursAfter, ch) => {
    const m = delivered(campId, name, ch) || draft.messages.find((x) => x.campaign_id === campId && x.contact_id === C(name)?.id && x.status !== 'skipped');
    if (!m) return null;
    const at = (m.delivered_at || m.sent_at || m.created_at) + hoursAfter * HOUR;
    return receiveMessage(draft, ctx(at), { contactId: C(name).id, channel: m.channel, content: text, inReplyTo: m.id, at })?.conversation;
  };
  const agent = (conv, text, hoursAfter, userId = users.owner) => {
    if (!conv) return;
    const at = find(draft.conversations, conv.id).last_message_at + hoursAfter * HOUR;
    try { sendReply(draft, ctx(at, userId), conv.id, text); } catch { /* opted out */ }
  };
  const close = (conv, assignee) => conv && upd(draft.conversations, conv.id, { status: 'closed', unread: false, assigned_to: assignee || null });
  const assign = (conv, userId, unread = true) => conv && upd(draft.conversations, conv.id, { assigned_to: userId, unread });

  // Water maintenance (most recent — open, unread)
  const smsWaterTarget = ['Maria Gonzalez', 'James Carter', 'Aisha Bello', 'Daniel Kim', 'Emily Nguyen', 'Robert Fischer', 'Sofia Rossi', 'Marcus Thompson', 'Grace Okafor'].find((n) => delivered(waterCamp, n, 'sms'));
  const w1 = reply(waterCamp, 'Maria Gonzalez', 'Thanks. Will the water be restored by 3 PM?', 1.2, 'sms') || reply(waterCamp, smsWaterTarget, 'Thanks. Will the water be restored by 3 PM?', 1.2, 'sms');
  const w2 = reply(waterCamp, 'Sofia Rossi', 'Is the laundry room affected too? I was planning to do laundry tomorrow morning.', 2.5, 'email');
  assign(w2, users.manager);
  agent(w2, 'Hi Sofia — yes, the laundry room is on the same line, so machines will be unavailable from 10 AM to 2 PM. Building B laundry will be open if you need it.', 0.6, users.manager);
  upd(draft.conversations, w2?.id, { unread: false });
  const w3 = reply(waterCamp, 'Kevin O\'Brien', 'Got it, thanks for the notice.', 3, 'email');
  close(w3, users.owner);
  const w4 = reply(waterCamp, 'Grace Okafor', 'STOP', 0.4, 'sms');
  close(w4);

  // Fire alarm (acknowledgements + question)
  const f1 = reply(fireCamp, 'Natalie Brooks', 'YES', 0.5);
  close(f1);
  const f2 = reply(fireCamp, 'Mei Chen', 'Yes. Will someone need to enter my unit to test the smoke detector?', 1.4);
  assign(f2, users.admin, false);
  agent(f2, 'Hi Mei, no entry is needed for this test — it only covers the common-area alarms. In-unit detectors are checked separately in spring.', 0.8, users.admin);
  const f3 = reply(fireCamp, 'Samuel Adeyemi', 'Confirmed', 2);

  // Elevator WhatsApp
  const e1 = reply(elevCamp, 'Olivia Park', 'Thanks! I have a sofa delivery on Wednesday — can the freight elevator be reserved?', 2, 'whatsapp');
  assign(e1, users.owner);
  agent(e1, 'Hi Olivia, absolutely. I have reserved the service elevator for you on Wednesday 1–3 PM. Let the front desk know when the movers arrive.', 1);
  agent(e1, 'Also, please ask the movers to use the side entrance on Pine St.', 0.1);
  close(e1, users.owner);
  const e2 = reply(elevCamp, 'Andre Dubois', 'How long will the work take in total?', 5, 'whatsapp');
  const e3 = reply(elevCamp, 'Ethan Walsh', 'My mother uses a wheelchair and lives with me. Is the working elevator guaranteed?', 3, 'email');
  assign(e3, users.manager);

  // Rent reminder
  const r1 = reply(rentCamp, 'Daniel Kim', 'Already paid through the portal, thanks!', 4);
  close(r1, users.manager);
  const r2 = reply(rentCamp, 'Natalie Brooks', 'Can I get a few extra days this month? My paycheck comes on the 3rd.', 6);
  assign(r2, users.manager, false);
  agent(r2, 'Hi Natalie — no problem. A grace period through the 5th has been noted on your account; no late fee will apply.', 2, users.manager);
  close(r2, users.manager);
  const r3 = reply(rentCamp, 'Emily Nguyen', 'Is there a way to set up autopay?', 2);
  agent(r3, 'Yes! In the resident portal, go to Payments → Autopay. It takes about two minutes.', 1.5, users.manager);
  close(r3, users.manager);

  // Owners & maintenance
  const o1 = reply(draft.campaigns.find((c) => c.name.startsWith('Owner Quarterly')).id, 'Catherine Wells', 'Thanks. Can we schedule a call next week to go over the Q3 capex plan?', 20);
  assign(o1, users.owner, false);
  agent(o1, 'Hi Catherine, happy to. Does Tuesday at 2 PM CT work? I will send a calendar invite.', 3);
  const m1 = reply(maintCamp, 'Carlos Diaz', 'Got it. I will update the team calendar today.', 1);
  close(m1, users.admin);

  // Inbound conversations not tied to a campaign
  const inbound = (name, ch, text, daysAgo, opts = {}) => {
    const at = now - daysAgo * DAY;
    const cv = receiveMessage(draft, ctx(at), { contactId: C(name).id, channel: ch, content: text, at })?.conversation;
    if (opts.assign) assign(cv, opts.assign, opts.unread ?? true);
    return cv;
  };
  const i1 = inbound('Omar Haddad', 'sms', 'Hi, my kitchen sink is leaking under the cabinet. Can someone come take a look?', 0.15, { assign: users.member });
  draft.conversationMessages.push({ id: uid('cm'), organisation_id: orgId, conversation_id: i1.id, direction: 'note', content: 'Created work order #4471 — Marcus to visit tomorrow AM.', channel: 'sms', user_id: users.member, created_at: now - 0.1 * DAY });
  inbound('Chloe Bennett', 'email', 'Hello! Is there a spare key for the package room? Mine does not seem to work.', 1.2);
  const i3 = inbound('Nikhil Iyer', 'email', "Hi, I'm interested in a 2-bedroom unit starting in January. Are there any available, and can I schedule a tour?", 2.3, { assign: users.admin, unread: false });
  agent(i3, 'Hi Nikhil, thanks for reaching out! We have two 2-bedroom units opening in January. Would Saturday at 11 AM work for a tour?', 0.5, users.admin);
  inbound('Isabella Moreno', 'whatsapp', 'Good morning, the hallway light on floor 3 has been flickering for two days.', 0.6);
  const i5 = inbound('Raj Mehta', 'email', 'Please send me the updated insurance certificate for the Lakeview properties.', 8, { assign: users.owner, unread: false });
  agent(i5, 'Hi Raj, attached is the updated certificate (placeholder — attachments are simulated in this demo).', 1);
  close(i5, users.owner);
  inbound('Jamal Washington', 'sms', 'Rooftop unit 2 is throwing a pressure fault again. Ordering the part today.', 0.9, { assign: users.admin, unread: false });

  // ---------- Automations ----------
  const node = (kind, type, config = {}, extra = {}) => ({ id: uid('n'), kind, type, config, ...extra });
  const auto = (spec, daysAgo) => {
    const a = { id: uid('aut'), organisation_id: orgId, run_count: 0, last_run_at: null, created_by: users.owner, created_at: now - daysAgo * DAY, updated_at: now - daysAgo * DAY, activated_at: spec.status === 'active' ? now - (daysAgo - 1) * DAY : null, ...spec };
    draft.automations.push(a);
    logActivity(draft, ctx(a.created_at), { event_type: 'automation.created', entity_type: 'automation', entity_id: a.id, summary: `Automation “${a.name}” created` });
    if (a.status === 'active') logActivity(draft, ctx(a.activated_at), { event_type: 'automation.activated', entity_type: 'automation', entity_id: a.id, summary: `Automation “${a.name}” activated` });
    return a;
  };
  const welcome = auto({ name: 'New Resident Welcome', description: 'Welcome new Building A residents by email when consent allows.', status: 'active', workflow: { trigger: { type: 'contact.added_to_list', config: { listId: L.A } }, steps: [
    node('condition', 'consent', { channel: 'email', purpose: 'operational' }, { yes: [node('action', 'send_email', { templateId: TPL.welcomeEmail, purpose: 'operational' }), node('action', 'add_tag', { tagId: T['New Contact'] })], no: [node('action', 'add_note', { text: 'Welcome email skipped — no email consent. Follow up in person.' })] }),
  ] } }, 150);
  const failed = auto({ name: 'Failed Message Follow-up', description: 'When a message fails, retry on another consented channel.', status: 'active', workflow: { trigger: { type: 'message.failed', config: {} }, steps: [
    node('condition', 'alt_channel', {}, { yes: [node('action', 'send_alternative', {}), node('action', 'add_note', { text: 'Fallback sent after a failed message.' })], no: [node('action', 'add_note', { text: 'Message failed and no consented alternative channel exists.' }), node('action', 'notify', { message: 'No fallback channel for {{first_name}} {{last_name}} — please follow up manually.' })] }),
  ] } }, 120);
  auto({ name: 'Unanswered Communication', description: 'Follow up by WhatsApp when a delivered message gets no reply within 48 hours.', status: 'paused', paused_reason: null, workflow: { trigger: { type: 'message.delivered', config: { channel: 'whatsapp' } }, steps: [
    node('delay', 'delay', { amount: 48, unit: 'hours' }),
    node('condition', 'responded', {}, { yes: [node('end', 'end')], no: [node('action', 'send_whatsapp', { templateId: TPL.followWa, purpose: 'operational' })] }),
  ] } }, 90);
  const renewal = auto({ name: 'Lease Renewal Reminder', description: '14 days before renewal: email, wait a week, then text if still pending.', status: 'active', workflow: { trigger: { type: 'time.before_date', config: { field: 'renewal_date', days: 14 } }, steps: [
    node('action', 'send_email', { templateId: TPL.renewalEmail, purpose: 'operational' }),
    node('delay', 'delay', { amount: 7, unit: 'days' }),
    node('condition', 'attribute', { field: 'renewal_status', op: 'equals', value: 'Renewed' }, { yes: [node('end', 'end')], no: [
      node('condition', 'consent', { channel: 'sms', purpose: 'operational' }, { yes: [node('action', 'send_sms', { body: 'Hi {{first_name}}, a quick reminder that your lease renewal for unit {{unit}} is still open. Reply here or visit the portal. Reply STOP to opt out.', purpose: 'operational' })], no: [node('action', 'notify', { message: 'Renewal for {{first_name}} {{last_name}} still pending and no SMS consent — call them.' })] }),
    ] }),
  ] } }, 60);
  auto({ name: 'Appointment Reminder', description: 'Text the day before a maintenance appointment and record confirmations.', status: 'draft', workflow: { trigger: { type: 'time.before_date', config: { field: 'appointment_at', days: 1 } }, steps: [
    node('action', 'send_sms', { templateId: TPL.apptSms, purpose: 'operational' }),
    node('delay', 'delay', { amount: 4, unit: 'hours' }),
    node('condition', 'responded', {}, { yes: [node('action', 'update_field', { field: 'appointment_confirmed', value: 'Yes' })], no: [node('action', 'notify', { message: '{{first_name}} {{last_name}} has not confirmed tomorrow’s appointment.' })] }),
  ] } }, 20);

  const vipAuto = auto({ name: 'VIP Concierge Follow-up', description: 'Tag VIPs after they reply so the concierge team follows up.', status: 'active', workflow: { trigger: { type: 'reply.received', config: {} }, steps: [
    node('condition', 'tag', { tagId: T.VIP }, { yes: [node('action', 'add_tag', { tagId: 'tag_concierge_deleted' }), node('action', 'notify', { message: 'VIP {{first_name}} {{last_name}} replied — please follow up.' })], no: [] }),
  ] } }, 45);

  // Historical executions run through the engine
  const hctx = (at) => ({ orgId, userId: null, now: at, depth: 1, historical: true, noAutomations: true, system: true });
  ['Omar Haddad', 'Chloe Bennett', 'Luis Ramirez'].forEach((n) => startExecution(draft, hctx(C(n).created_at + 60000), welcome.id, C(n).id, { type: 'contact.added_to_list', contactId: C(n).id, listId: L.A }));
  draft.messages.filter((m) => m.organisation_id === orgId && m.status === 'failed' && m.campaign_id && m.role !== 'fallback' && find(draft.campaigns, m.campaign_id)?.delivery_mode !== 'fallback').slice(0, 7)
    .forEach((m) => startExecution(draft, hctx(m.failed_at + 120000), failed.id, m.contact_id, { type: 'message.failed', contactId: m.contact_id, messageId: m.id, channel: m.channel }));
  ['Natalie Brooks', 'Daniel Kim'].forEach((n) => startExecution(draft, hctx(now - 9 * DAY), renewal.id, C(n).id, { type: 'schedule', contactId: C(n).id, key: `renewal_date:${C(n).custom_fields.renewal_date}-early` }));

  ['Maria Gonzalez', 'Catherine Wells'].forEach((n, i) => startExecution(draft, hctx(now - (9 - i * 4) * DAY), vipAuto.id, C(n).id, { type: 'reply.received', contactId: C(n).id, channel: 'email' }));
  upd(draft.automations, vipAuto.id, { status: 'paused', paused_reason: 'Selected tag no longer exists.' });
  logActivity(draft, ctx(now - 5 * DAY), { event_type: 'automation.paused', entity_type: 'automation', entity_id: vipAuto.id, summary: 'Automation “VIP Concierge Follow-up” paused automatically after an error', system: true });
  notify(draft, ctx(now - 5 * DAY), { type: 'automation_error', message: 'Automation “VIP Concierge Follow-up” was paused after an error: Selected tag no longer exists.', link: `/app/automations/${vipAuto.id}/history`, tone: 'warn' });

  // ---------- Notes, activity & notifications ----------
  addNote(draft, ctx(now - 30 * DAY), C('Maria Gonzalez').id, 'Prefers text for urgent updates. Works night shifts — avoid calls before noon.');
  addNote(draft, ctx(now - 12 * DAY, users.manager), C('Ethan Walsh').id, 'Mother uses a wheelchair — prioritise elevator updates and accessibility notices.');
  addNote(draft, ctx(now - 50 * DAY, users.admin), C('Catherine Wells').id, 'Owns 6 units in Building A. Quarterly review calls with Alex.');
  logActivity(draft, ctx(now - 160 * DAY, users.admin), { event_type: 'contact.imported', entity_type: 'import', entity_id: null, summary: '26 contacts imported from residents_lakeview.csv (2 skipped as duplicates)', details: { created: 26, skipped: 2 } });
  logActivity(draft, ctx(now - 140 * DAY), { event_type: 'settings.changed', entity_type: 'organisation', entity_id: orgId, summary: 'Consent rules updated: SMS operational messages require opt-in' });
  logActivity(draft, ctx(now - 6 * DAY), { event_type: 'team.invited', entity_type: 'invitation', entity_id: null, summary: 'sam.ortiz@northstarpg.example invited as Manager (simulated — no email sent)' });
  draft.invitations.push({ id: uid('inv'), organisation_id: orgId, email: 'sam.ortiz@northstarpg.example', role: 'manager', status: 'pending', invited_by: users.owner, created_at: now - 6 * DAY });
  notify(draft, ctx(now - 1 * DAY), { type: 'team', message: 'Priya Shah accepted your invitation and joined the workspace.', link: '/app/team', tone: 'success' });
  notify(draft, ctx(now - 160 * DAY), { type: 'import', message: 'Contact import completed — 26 created, 2 skipped.', link: '/app/contacts', tone: 'success' });
  // Mark older notifications read; keep the recent ones unread.
  draft.notifications.forEach((n, i) => { if (n.organisation_id === orgId && n.created_at < now - 2 * DAY) draft.notifications[i] = { ...n, read_at: n.created_at + HOUR }; });
}

export function bootstrap(state) {
  const now = Date.now();
  const d = state;
  const mkUser = (name, email, job, pw) => { const u = { id: uid('usr'), name, email, job_title: job, password_hash: pw ? demoPasswordHash(pw) : null, created_at: now - 220 * DAY }; d.users.push(u); return u; };
  const owner = mkUser('Alex Morgan', DEMO_EMAIL, 'Director of Resident Experience', DEMO_PASSWORD);
  const admin = mkUser('Jordan Lee', 'jordan.lee@northstarpg.example', 'Operations Manager');
  const manager = mkUser('Priya Shah', 'priya.shah@northstarpg.example', 'Leasing Manager');
  const member = mkUser('Marcus Bell', 'marcus.bell@northstarpg.example', 'Maintenance Coordinator');
  const org = createOrganisation(d, { userId: owner.id, name: 'Northstar Property Group', industry: 'Property management', website: 'https://northstarpg.example', country: 'United States', timezone: 'America/Chicago', size: '51–200', goals: ['Operational announcements', 'Customer updates', 'Appointment reminders'], channels: ['email', 'sms', 'whatsapp'], now: now - 220 * DAY, is_demo: true });
  org.onboarding.completed = true;
  org.settings.address = '1420 Lakeview Ave, Chicago, IL 60614';
  org.settings.channels.email = { status: 'demo', from_name: 'Northstar Property Group', from_email: 'updates@northstarpg.example', reply_to: 'office@northstarpg.example' };
  org.settings.channels.sms = { status: 'demo', sender_id: '+1 (312) 555-0199', country: 'United States' };
  org.settings.channels.whatsapp = { status: 'demo', business_name: 'Northstar Property Group', phone: '+1 (312) 555-0199' };
  [[admin, 'admin'], [manager, 'manager'], [member, 'member']].forEach(([u, role], i) => d.memberships.push({ id: uid('mem'), organisation_id: org.id, user_id: u.id, role, status: 'active', joined_at: now - (200 - i * 60) * DAY }));
  d.session = null;
  seedWorkspace(d, { orgId: org.id, users: { owner: owner.id, admin: admin.id, manager: manager.id, member: member.id } });
  return d;
}

// Reset a demo workspace back to its seeded state, keeping its members.
export function resetDemoWorkspace(draft, orgId) {
  wipeOrgData(draft, orgId, { keepMembers: true });
  const members = draft.memberships.filter((m) => m.organisation_id === orgId && m.status === 'active');
  const byRole = (r) => members.find((m) => m.role === r)?.user_id;
  const owner = byRole('owner');
  seedWorkspace(draft, { orgId, users: { owner, admin: byRole('admin') || owner, manager: byRole('manager') || owner, member: byRole('member') || owner } });
}
