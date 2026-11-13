// Demo AI: turns plain-language instructions into real workflow definitions (the same
// schema the visual builder and automation engine use), and edits existing workflows.
import { uid } from '../../lib/util';
import { validateWorkflow, walkSteps } from '../automation/catalog';
import { parseDuration, toHours, hoursToDuration, humanDuration, channelIn, sentences, ordinal, DURATION_RE_G, toNum } from './nlp';

const node = (kind, type, config = {}, extra = {}) => ({ id: uid('n'), kind, type, config, ...(kind === 'condition' ? { yes: [], no: [] } : {}), ...extra });
const SEND = { email: 'send_email', sms: 'send_sms', whatsapp: 'send_whatsapp' };
const CH_OF = { send_email: 'email', send_sms: 'sms', send_whatsapp: 'whatsapp' };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchList(phrase, lists) {
  const p = norm(phrase).replace(/\b(the|list|group|segment)\b/g, '').trim();
  if (!p) return null;
  return lists.find((l) => norm(l.name) === p) || lists.find((l) => norm(l.name).includes(p)) || lists.find((l) => p.includes(norm(l.name))) || null;
}

// ---------- Message content library for generated send steps ----------
function content(purpose, ch, ctx) {
  const org = '{{organisation_name}}';
  const L = {
    welcome: { subject: `Welcome to ${org}, {{first_name}}`, email: `Hi {{first_name}},\n\nWelcome to ${org}! We’re glad to have you.\n\nIf you need anything at all, just reply to this email and our team will help.\n\nThe ${org} team`, short: `Hi {{first_name}}, welcome to ${org}! Reply here any time if you need anything.` },
    welcome_manager: { subject: `Welcome home, {{first_name}}`, email: `Hi {{first_name}},\n\nWelcome to ${org}! We’re delighted to have you.\n\nYour property manager is **[property manager name]**. You can reach them at **[phone number]** or **[email address]**.\n\nIf you need anything as you settle in, just reply to this email.\n\nThe ${org} team`, short: `Hi {{first_name}}, welcome to ${org}! Your property manager is [property manager name] — reach them at [phone number].` },
    assistance: { subject: 'Is there anything we can help with?', email: `Hi {{first_name}},\n\nIt’s been a few days since you joined ${org}, so we wanted to check in. Do you need any assistance?\n\nJust reply to this email and we’ll be happy to help.\n\nThe ${org} team`, short: `Hi {{first_name}}, just checking in from ${org} — do you need any help? Reply here.` },
    settled: { subject: 'Have you settled in?', email: `Hi {{first_name}},\n\nWe hope you’re settling in well! Is everything working as it should in your home?\n\nIf anything needs attention, just reply to this email and we’ll take care of it.\n\nThe ${org} team`, short: `Hi {{first_name}}, have you settled in OK? Reply here if anything needs attention.` },
    appt: { subject: 'Reminder: your appointment', email: `Hi {{first_name}},\n\nThis is a reminder about your upcoming appointment.\n\nPlease reply YES to confirm, or let us know if you need to reschedule.\n\nThe ${org} team`, short: `Hi {{first_name}}, reminder: your appointment with ${org} is coming up. Reply YES to confirm or call us to reschedule.` },
    appt2: { subject: 'Please confirm your appointment', email: `Hi {{first_name}},\n\nWe haven’t heard back yet — please reply YES to confirm your upcoming appointment, or let us know if you need to reschedule.\n\nThe ${org} team`, short: `Hi {{first_name}}, we haven’t had your confirmation yet. Please reply YES to confirm your appointment or call us to reschedule.` },
    renewal: { subject: 'Your membership is up for renewal', email: `Hi {{first_name}},\n\nYour membership with ${org} is due for renewal soon. Renewing keeps your benefits uninterrupted.\n\nReply to this email if you have any questions.\n\nThe ${org} team`, short: `Hi {{first_name}}, your ${org} membership is due for renewal soon. Reply here with any questions.` },
    renewal2: { subject: 'Reminder: your renewal is still open', email: `Hi {{first_name}},\n\nA quick reminder that your renewal is still open. Reply to this email if we can help.\n\nThe ${org} team`, short: `Hi {{first_name}}, a reminder that your ${org} renewal is still open. Reply here if we can help. Reply STOP to opt out.` },
    followup: { subject: 'Following up', email: `Hi {{first_name}},\n\nJust following up on our last message. Is there anything we can help with?\n\nThe ${org} team`, short: `Hi {{first_name}}, just following up on our last message from ${org}. Reply here with any questions.` },
    reminder: { subject: 'A friendly reminder', email: `Hi {{first_name}},\n\nThis is a friendly reminder from ${org}.\n\n[Add the details of the reminder here.]\n\nThe ${org} team`, short: `Hi {{first_name}}, a friendly reminder from ${org}: [add the details here].` },
    generic: { subject: `An update from ${org}`, email: `Hi {{first_name}},\n\n[Write your message here.]\n\nThe ${org} team`, short: `Hi {{first_name}}, [write your message here].` },
  };
  const x = L[purpose] || L.generic;
  if (ch === 'email') return { subject: x.subject, body: x.email };
  let body = x.short;
  if (ch === 'sms' && !/STOP/.test(body)) body += ' Reply STOP to opt out.';
  return { body };
}
function sendNode(ch, purpose, ctx, extra = {}) {
  const c = content(purpose, ch, ctx);
  return node('action', SEND[ch], { ...c, purpose: 'operational', ...extra });
}

// ---------- Trigger detection ----------
function detectTrigger(text, ctx, answers) {
  const t = text.toLowerCase();
  let m;
  if (answers.trigger) return answers.trigger;
  if ((m = t.match(/(?:added|add(?:ed)? them|joins?|put) (?:in)?to (?:the |our )?(.+?)(?:\s+(?:list|group))?(?=[,.]|\s+(?:send|they|we|then)|$)/))) {
    const list = answers.listId ? ctx.lists.find((l) => l.id === answers.listId) : matchList(m[1], ctx.lists);
    if (!list) return { clarify: { key: 'listId', question: `Which group should start this automation? I couldn’t find “${m[1].trim()}”.`, options: ctx.lists.filter((l) => l.type === 'static').map((l) => ({ label: l.name, value: l.id })) } };
    return { type: 'contact.added_to_list', config: { listId: list.id }, label: `Added to ${list.name}` };
  }
  if ((m = t.match(/(?:tagged|gets? (?:the )?tag|receives? (?:the )?tag|tag (?:is )?added)\s*["“]?([\w -]+?)["”]?(?=[,.]|\s+send|$)/))) {
    const tag = ctx.tags.find((x) => norm(x.name) === norm(m[1]));
    return { type: 'contact.tagged', config: { tagId: tag ? tag.id : `new:${m[1].trim()}` }, label: `Tagged ${m[1].trim()}` };
  }
  if ((m = t.match(/\b(sms|text|texts|email|emails|whatsapp|message|messages)\s+(?:message\s+)?(?:fails|failed|bounces|bounced|(?:is|are|was)n?'?t? (?:not )?delivered|can't be delivered|doesn't go through)/))) {
    const ch = channelIn(m[1]);
    return { type: 'message.failed', config: ch ? { channel: ch } : {}, label: `${ch ? ch.toUpperCase() : 'Message'} failure`, failedChannel: ch };
  }
  if (/\b(?:message|sms|email|whatsapp)s? (?:is |are |gets? )?delivered\b/.test(t)) return { type: 'message.delivered', config: channelIn(t.match(/(message|sms|email|whatsapp)s? (?:is |are |gets? )?delivered/)[1]) ? { channel: channelIn(t.match(/(message|sms|email|whatsapp)s? (?:is |are |gets? )?delivered/)[1]) } : {}, label: 'Delivery' };
  if ((m = t.match(/\bbefore (?:their |the |each |an? )?(appointments?|visits?|bookings?|membership|renewal|subscription|lease)/))) {
    const what = m[1];
    const field = /appoint|visit|booking/.test(what) ? 'appointment_at' : /lease/.test(what) ? 'lease_end' : 'renewal_date';
    const pre = t.slice(0, m.index);
    const durs = [...pre.matchAll(DURATION_RE_G)];
    let d = durs.length ? parseDuration(durs[durs.length - 1][0]) : null;
    if (!d && answers.offset) d = parseDuration(answers.offset);
    if (!d) return { clarify: { key: 'offset', question: `How long before the ${field === 'appointment_at' ? 'appointment' : field === 'lease_end' ? 'lease end' : 'renewal date'} should the first message go out?`, options: (field === 'appointment_at' ? ['24 hours', '48 hours', '3 days'] : ['7 days', '14 days', '30 days']).map((x) => ({ label: x, value: x })) } };
    const hours = toHours(d);
    const days = Math.max(1, Math.round(hours / 24));
    return { type: 'time.before_date', config: { field, days }, hours, label: field === 'appointment_at' ? 'Appointment reminders' : 'Renewal reminders', note: hours % 24 ? `Date-based starts run in whole days, so this will start ${days} day${days > 1 ? 's' : ''} before.` : null, consumed: durs.length ? durs[durs.length - 1][0] : null };
  }
  if ((m = t.match(/\bafter (?:their |the )?(lease ends|appointment|renewal date)/))) {
    const d = parseDuration(t.slice(0, m.index).match(DURATION_RE_G)?.slice(-1)[0] || '1 day');
    return { type: 'time.after_date', config: { field: /lease/.test(m[1]) ? 'lease_end' : /appoint/.test(m[1]) ? 'appointment_at' : 'renewal_date', days: Math.max(1, Math.round(toHours(d) / 24)) }, label: 'Follow-up after a date' };
  }
  if ((m = t.match(/\bevery (day|week|month)|\b(daily|weekly|monthly)\b/))) {
    const every = m[1] || { daily: 'day', weekly: 'week', monthly: 'month' }[m[2]];
    return { type: 'time.recurring', config: { every }, label: `Every ${every}` };
  }
  if (/\b(?:new contact|add (?:a |any )?(?:new )?contact|contact is (?:created|added)|someone (?:signs up|joins)|new (?:customer|member|resident|lead|client)s?\b)/.test(t)) return { type: 'contact.created', config: {}, label: 'New contact' };
  if (/\b(?:replies|responds|texts back|answers)\b/.test(t) && /\b(?:when|whenever|if)\b/.test(t) && !/haven'?t|hasn'?t|doesn'?t|don'?t|not/.test(t.split(/[.,]/)[0])) {
    const kw = t.match(/\b(?:with|saying)\s+["“]?(\w+)["”]?/);
    return { type: 'reply.received', config: { ...(channelIn(t) ? { channel: channelIn(t) } : {}), ...(kw ? { keyword: kw[1].toUpperCase() } : {}) }, label: 'Reply received' };
  }
  if ((m = t.match(/(?:doesn'?t|don'?t|haven'?t|hasn'?t|no) (?:respond|reply|replied|responded|response)\w* (?:within|after|in) /))) {
    const d = parseDuration(t.slice(m.index)) || { amount: 48, unit: 'hours' };
    return { type: 'no_response', config: { hours: toHours(d) }, label: 'No response follow-up', consumed: humanDuration(d) };
  }
  if (/\bclicks?\b/.test(t)) return { type: 'link.clicked', config: {}, label: 'Link clicked' };
  if (/campaign (?:is )?(?:completed|finishes|ends|is done)/.test(t)) return { type: 'campaign.completed', config: {}, label: 'Campaign follow-up' };
  return { clarify: { key: 'trigger', question: 'What should start this automation?', options: [
    { label: 'When a new contact is added', value: { type: 'contact.created', config: {}, label: 'New contact' } },
    { label: 'When a message fails', value: { type: 'message.failed', config: {}, label: 'Message failure' } },
    { label: 'When someone replies', value: { type: 'reply.received', config: {}, label: 'Reply received' } },
    { label: 'Before an appointment date', value: { type: 'time.before_date', config: { field: 'appointment_at', days: 1 }, hours: 24, label: 'Appointment reminders' } },
  ] } };
}

// ---------- Step parsing ----------
function purposeOf(s, trigger, sendCount) {
  const t = s.toLowerCase();
  if (/same message|original message|same content/.test(t)) return 'reuse';
  if (/welcome/.test(t)) return /manager|contact details|who to contact/.test(t) ? 'welcome_manager' : 'welcome';
  if (/settled/.test(t)) return 'settled';
  if (/assist|help|need anything/.test(t)) return 'assistance';
  if (trigger.config?.field === 'appointment_at' || /appointment/.test(t)) return sendCount ? 'appt2' : 'appt';
  if (trigger.config?.field === 'renewal_date' || /renew|membership|expire/.test(t)) return sendCount ? 'renewal2' : 'renewal';
  if (/follow.?up|another|again|check in/.test(t)) return 'followup';
  if (/remind/.test(t)) return 'reminder';
  return sendCount ? 'followup' : 'generic';
}

export function generateAutomation({ text, ctx, answers = {} }) {
  const clean = String(text || '').trim();
  if (clean.length < 6) return { status: 'clarify', key: 'text', question: 'What would you like to automate? Describe what should happen and when.' };
  const trig = detectTrigger(clean, ctx, answers);
  if (trig.clarify) return { status: 'clarify', ...trig.clarify };
  const notes = [];
  if (trig.note) notes.push(trig.note);
  const steps = [];
  let cursor = steps;
  let lastCh = null;
  let sends = 0;
  const failureCtx = trig.type === 'message.failed';

  sentences(clean).forEach((s, si) => {
    const low = s.toLowerCase();
    // 1. Delays (durations attached to "before" belong to the trigger unless they're a second checkpoint)
    for (const m of low.matchAll(DURATION_RE_G)) {
      const after = low.slice(m.index + m[0].length, m.index + m[0].length + 14);
      const before = low.slice(Math.max(0, m.index - 10), m.index);
      const d = parseDuration(m[0]);
      if (trig.consumed && si === 0 && m[0] === trig.consumed) continue;
      if (/^\s*(before|prior)/.test(after)) {
        if (trig.hours && si > 0 && toHours(d) < trig.hours) cursor.push(node('delay', 'delay', hoursToDuration(trig.hours - toHours(d))));
        continue;
      }
      if (/(within|in)\s*$/.test(before) && trig.type === 'no_response') continue;
      if (/wait|later|after|pause|hold/.test(before + after) || /^\s*(later|after)/.test(after)) cursor.push(node('delay', 'delay', d));
    }
    if (/\b(a|one) week later\b|\bafter a week\b/.test(low) && !cursor.some((n) => n.kind === 'delay')) cursor.push(node('delay', 'delay', { amount: 7, unit: 'days' }));
    // 2. Negative checks — "if they haven't confirmed / replied / renewed"
    const neg = low.match(/\bif (?:they|the contact|the customer|customers|members?|residents?|people|he|she)?\s*(?:still\s+)?(?:haven'?t|have not|hasn'?t|has not|don'?t|do not|didn'?t|did not|doesn'?t|does not)\s+(?:yet\s+)?(confirm|respond|repl|renew|pay|answer)|\bif (?:there(?:'s| is) )?no (?:response|reply|confirmation)/);
    if (neg) {
      const what = neg[1] || 'respond';
      const cond = /renew/.test(what) ? node('condition', 'attribute', { field: 'renewal_status', op: 'equals', value: 'Renewed' }) : node('condition', 'responded', {});
      cond.yes = [node('end', 'end')];
      cursor.push(cond);
      cursor = cond.no;
      if (/renew/.test(what)) notes.push('“Renewed” is checked using the contact’s Renewal status field — make sure it’s updated when someone renews.');
    }
    // 3. Actions in order of appearance
    const ops = [];
    const sendRe = /\b(send|email|text|message|remind|ask|follow up|try sending|resend|reach out|contact them|notify them)\b/g;
    let sm; let seenSend = false;
    while ((sm = sendRe.exec(low))) {
      if (seenSend) break;
      if (/notify them/.test(sm[0]) === false && /\b(notify|alert)\b/.test(low.slice(Math.max(0, sm.index - 6), sm.index))) continue;
      seenSend = true;
      const tail = low.slice(sm.index);
      const consentClause = tail.search(/\b(?:only )?if\b.*?(?:consent|permission|opted in|agreed)/);
      const scope = consentClause > 0 ? tail.slice(0, consentClause) : tail;
      let ch = channelIn(scope) || (sm[1] === 'email' ? 'email' : sm[1] === 'text' ? 'sms' : null) || lastCh || (purposeOf(s, trig, sends).startsWith('appt') ? 'sms' : 'email');
      if (failureCtx && ch === trig.failedChannel) ch = trig.failedChannel === 'email' ? 'sms' : 'email';
      ops.push({ at: sm.index, kind: 'send', ch, purpose: purposeOf(s, trig, sends) });
    }
    let m;
    if ((m = low.match(/\btag (?:them|the contact|it)?\s*(?:as|with)?\s*["“]([^"”]+)["”]|\badd (?:the |a )?["“]?([\w -]+?)["”]? tag/))) {
      const nm = (m[1] || m[2]).trim();
      const tag = ctx.tags.find((x) => norm(x.name) === norm(nm));
      ops.push({ at: m.index, kind: 'raw', node: node('action', 'add_tag', { tagId: tag ? tag.id : `new:${nm.replace(/\b\w/g, (c) => c.toUpperCase())}` }) });
    }
    if ((m = low.match(/\badd (?:them|the contact|it) to (?:the )?(.+?)(?:\s+(?:list|group))?(?=[,.]|$| and)/))) {
      const list = matchList(m[1], ctx.lists.filter((l) => l.type === 'static'));
      if (list) ops.push({ at: m.index, kind: 'raw', node: node('action', 'add_to_list', { listId: list.id }) });
      else notes.push(`I couldn’t find a group called “${m[1]}”, so that step was left out.`);
    }
    if ((m = low.match(/\bassign (?:it|them|the conversation)? ?to (\w+)/))) {
      const u = ctx.users.find((x) => x.name.toLowerCase().startsWith(m[1]));
      if (u) ops.push({ at: m.index, kind: 'raw', node: node('action', 'assign_conversation', { userId: u.id }) });
    }
    if ((m = low.match(/\b(notify|alert|let me know|tell me|record)\b/))) {
      const rec = /record/.test(m[1]);
      if (rec) ops.push({ at: m.index, kind: 'raw', node: node('action', 'add_note', { text: 'Message failed and could not be resent on another channel.' }) });
      if (!rec || /notify|alert|let me know/.test(low)) ops.push({ at: m.index + 1, kind: 'raw', node: node('action', 'notify', { message: failureCtx ? 'A message to {{first_name}} {{last_name}} failed and could not be resent.' : 'Automation update for {{first_name}} {{last_name}}.' }) });
    }
    if (/\b(stop|end) (?:the )?(?:workflow|automation)\b/.test(low)) ops.push({ at: low.length, kind: 'raw', node: node('end', 'end') });
    ops.sort((a, b) => a.at - b.at);
    const built = ops.map((op) => {
      if (op.kind === 'raw') return op.node;
      lastCh = op.ch; sends++;
      if (op.purpose === 'reuse') return node('action', SEND[op.ch], { reuse_original: true, purpose: 'operational', ...(op.ch === 'email' ? { subject: 'Update from {{organisation_name}}' } : {}) });
      return sendNode(op.ch, op.purpose, ctx);
    });
    // 4. Consent check wraps this sentence's sends: "only if they have consented to SMS"
    const cons = low.match(/\b(?:but )?(?:only )?if (?:the contact |they |he |she )?(?:has |have )?(?:given (?:us )?permission|consented|opted in|agreed)(?: to (?:receive |get )?(?:\w+ )?(sms|texts?|emails?|whatsapp))?/) || low.match(/\b(?:only )?if .*?(?:permission|consent).*?\b(sms|texts?|emails?|whatsapp)\b/);
    if (cons && built.some((n) => CH_OF[n.type])) {
      const ch = channelIn(cons[1] || '') || CH_OF[built.find((n) => CH_OF[n.type]).type];
      const cond = node('condition', 'consent', { channel: ch, purpose: 'operational' });
      cond.yes = built;
      cond.no = failureCtx
        ? [node('action', 'add_note', { text: `Message failed and was not resent — no ${ch === 'email' ? 'email' : ch.toUpperCase()} consent.` }), node('action', 'notify', { message: 'A message to {{first_name}} {{last_name}} failed and could not be resent by ' + (ch === 'email' ? 'email' : ch.toUpperCase()) + '.' })]
        : [node('action', 'add_note', { text: `Skipped — no ${ch === 'email' ? 'email' : ch.toUpperCase()} consent.` })];
      cursor.push(cond);
    } else cursor.push(...built);
  });

  if (!steps.length) return { status: 'clarify', key: 'more', question: 'Got the trigger. What should happen next? For example: “send a welcome email, wait 3 days, then send a follow-up”.' };
  const wf = { trigger: { type: trig.type, config: trig.config }, steps };
  const warnings = [];
  walkSteps(steps, (n) => { if (/\[[^\]]+\]/.test(`${n.config?.subject || ''} ${n.config?.body || ''}`)) warnings.push(`Fill in the [bracketed] details in the “${{ send_email: 'Send email', send_sms: 'Send SMS', send_whatsapp: 'Send WhatsApp' }[n.type] || 'message'}” step.`); });
  if (trig.type === 'time.before_date') notes.push(`Uses each contact’s ${{ appointment_at: 'Appointment date', renewal_date: 'Renewal date', lease_end: 'Lease end date' }[trig.config.field]} field — contacts without it won’t be included.`);
  walkSteps(steps, (n) => { if (n.type === 'responded') notes.push('“Replied” means any inbound message from the contact after the automation started — replying YES counts as confirming.'); });
  const name = { 'contact.created': 'New contact welcome', 'contact.added_to_list': `${ctx.lists.find((l) => l.id === trig.config.listId)?.name || 'Group'} onboarding`, 'message.failed': `${trig.failedChannel ? trig.failedChannel.toUpperCase() : 'Message'} failure fallback`, 'time.before_date': trig.label, 'no_response': 'No-response follow-up', 'reply.received': 'Reply handling', 'time.recurring': trig.label, 'contact.tagged': `${trig.label} follow-up` }[trig.type] || 'New automation';
  return { status: 'ok', name, workflow: wf, notes: [...new Set(notes)], warnings: [...new Set(warnings)], validation: validateWorkflow(wf) };
}

// ---------- Modification ----------
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function flat(steps, out = [], parent = null) { steps.forEach((n, i) => { out.push({ n, arr: steps, i, parent }); if (n.kind === 'condition') { flat(n.yes || [], out, n); flat(n.no || [], out, n); } }); return out; }
const label = (n) => ({ send_email: 'email', send_sms: 'SMS', send_whatsapp: 'WhatsApp message', delay: 'wait' }[n.type] || n.type.replace(/_/g, ' '));

export function modifyAutomation({ workflow, text, ctx, name }) {
  const wf = clone(workflow);
  const low = text.toLowerCase().trim();
  const changes = [];
  let newName = name;
  let m;
  const durs = [...low.matchAll(DURATION_RE_G)].map((x) => parseDuration(x[0]));

  // Change a timing: "from 24 hours to 48 hours", "change the wait to 2 days"
  if (/\b(change|make|move|set|update|increase|decrease|shorten|extend)\b/.test(low) && durs.length && !/\b(add|insert)\b/.test(low)) {
    const target = durs.length >= 2 ? durs[1] : durs[0];
    const from = durs.length >= 2 ? durs[0] : null;
    const tr = wf.trigger;
    const isTrig = /first|reminder|before/.test(low) && (tr.type === 'time.before_date' || tr.type === 'time.after_date') && (!from || Math.round(toHours(from) / 24) === Number(tr.config.days) || toHours(from) === Number(tr.config.days) * 24);
    if (isTrig) {
      const days = Math.max(1, Math.round(toHours(target) / 24));
      changes.push(`Start ${days} day${days > 1 ? 's' : ''} before the date (was ${tr.config.days}).`);
      tr.config.days = days;
    } else if (tr.type === 'no_response' && /respon|reply/.test(low) && !flat(wf.steps).some((x) => x.n.kind === 'delay')) {
      changes.push(`Wait ${toHours(target)} hours for a reply (was ${tr.config.hours}).`); tr.config.hours = toHours(target);
    } else {
      const delays = flat(wf.steps).filter((x) => x.n.kind === 'delay');
      const ord = ordinal((low.match(/\b(first|second|third|last|final)\b/) || [])[1]);
      const hit = from ? delays.find((x) => toHours(x.n.config) === toHours(from)) : ord != null ? delays.at(ord) : delays[0];
      if (hit) { changes.push(`Change the wait from ${humanDuration(hit.n.config)} to ${humanDuration(target)}.`); hit.n.config = { ...target }; }
    }
  }
  // Remove a step: "remove the second email", "delete the wait"
  if ((m = low.match(/\b(remove|delete|drop|get rid of|take out)\b(?: the)?\s*(first|second|third|last|final)?\s*(email|sms|text|whatsapp|message|reminder|wait|delay|follow.?up|note|notification|tag)/))) {
    const kind = m[3];
    const all = flat(wf.steps).filter(({ n }) => (kind === 'email' ? n.type === 'send_email' : /sms|text/.test(kind) ? n.type === 'send_sms' : kind === 'whatsapp' ? n.type === 'send_whatsapp' : /wait|delay/.test(kind) ? n.kind === 'delay' : kind === 'note' ? n.type === 'add_note' : kind === 'notification' ? n.type === 'notify' : kind === 'tag' ? n.type === 'add_tag' : !!CH_OF[n.type]));
    const ord = ordinal(m[2]);
    const pick = ord != null ? all.at(ord) : /follow.?up/.test(kind) ? all.at(-1) : all.length === 1 ? all[0] : null;
    if (pick) {
      pick.arr.splice(pick.arr.indexOf(pick.n), 1);
      const dangling = pick.n.kind !== 'delay' && pick.arr.length && pick.arr[pick.arr.length - 1].kind === 'delay';
      if (dangling) pick.arr.pop();
      changes.push(`Remove the ${m[2] ? m[2] + ' ' : ''}${label(pick.n)} step${dangling ? ' (and the wait before it)' : ''}.`);
    }
    else if (all.length > 1) return { status: 'clarify', question: `There are ${all.length} ${kind} steps. Which one should I remove — first, second or last?` };
  }
  // Add a follow-up if no response
  if (/\badd\b/.test(low) && /follow.?up|reminder|another/.test(low) && /(respond|reply|confirm|answer)/.test(low)) {
    const ch = channelIn(low) || 'sms';
    const d = durs[0] || { amount: 2, unit: 'days' };
    const cond = node('condition', 'responded', {}); cond.yes = [node('end', 'end')]; cond.no = [sendNode(ch, 'followup', ctx)];
    wf.steps.push(node('delay', 'delay', d), cond);
    changes.push(`Add: wait ${humanDuration(d)}, and if they haven’t replied, send a ${ch === 'email' ? 'follow-up email' : ch === 'sms' ? 'follow-up SMS' : 'WhatsApp follow-up'}.`);
  } else if (/\badd\b/.test(low) && /(email|sms|text|whatsapp|message)/.test(low) && !/tag/.test(low)) {
    const ch = channelIn(low) || 'email';
    const d = durs[0];
    if (d) wf.steps.push(node('delay', 'delay', d));
    wf.steps.push(sendNode(ch, /follow/.test(low) ? 'followup' : 'generic', ctx));
    changes.push(`Add ${d ? `a ${humanDuration(d)} wait and ` : ''}a ${ch === 'email' ? 'new email' : ch === 'sms' ? 'new SMS' : 'WhatsApp message'} at the end.`);
  }
  // Restrict audience: "only send this to contacts in Building A"
  if ((m = low.match(/\bonly (?:send (?:this |it )?to |for |run for |include )?(?:contacts |people |residents |members )?(?:in|from|on) (?:the )?(.+?)(?:\s+(?:list|group))?(?:[.,]|$)/)) && !/weekday|weekend/.test(m[1])) {
    const list = matchList(m[1], ctx.lists);
    const cond = list ? node('condition', 'list', { listId: list.id }) : node('condition', 'attribute', { field: /building/.test(m[1]) ? 'building' : 'unit', op: 'equals', value: m[1].replace(/\b\w/g, (c) => c.toUpperCase()) });
    cond.yes = wf.steps; cond.no = [];
    wf.steps = [cond];
    changes.push(list ? `Only continue for contacts in “${list.name}”.` : `Only continue for contacts whose ${cond.config.field} is “${cond.config.value}”.`);
  }
  // Weekends
  if (/weekend/.test(low) && /(pause|skip|don'?t|not|avoid|no)/.test(low) || /only (on )?weekdays/.test(low)) {
    const cond = node('condition', 'datetime', { window: 'weekday' }); cond.yes = wf.steps; cond.no = [node('action', 'add_note', { text: 'Skipped — automation paused at weekends.' })];
    wf.steps = [cond];
    changes.push('Only run on weekdays — weekend runs are skipped and noted.');
  }
  // Switch channel: "send by SMS instead of email", "use whatsapp instead"
  if ((m = low.match(/\b(?:use|send (?:it |this |them )?(?:by|via|as)|switch to|change (?:the )?(?:\w+ )?to)\s+(sms|text|email|whatsapp)\b(?:.*?instead of (sms|text|email|whatsapp))?/)) && /instead|switch|change/.test(low) && !durs.length) {
    const to = channelIn(m[1]); const from = m[2] ? channelIn(m[2]) : null;
    flat(wf.steps).forEach(({ n }) => {
      if (CH_OF[n.type] && CH_OF[n.type] !== to && (!from || CH_OF[n.type] === from)) {
        const old = CH_OF[n.type];
        const tpl = n.config.templateId ? ctx.templates.find((t) => t.id === n.config.templateId) : null;
        let body = n.config.body || tpl?.content || '';
        body = body.replace(/\*\*|_/g, '').replace(/\n{2,}/g, ' ').replace(/^Hi (\{\{first_name\}\}),\s*/, 'Hi $1, ').replace(/\s*The \{\{organisation_name\}\} team\s*$/, '');
        if (to === 'sms' && !/STOP/.test(body)) body += ' Reply STOP to opt out.';
        n.type = SEND[to]; n.config = { body, purpose: n.config.purpose || 'operational', ...(to === 'email' ? { subject: n.config.subject || 'Update from {{organisation_name}}' } : {}) };
        changes.push(`Send the ${old === 'sms' ? 'SMS' : old} step as ${to === 'sms' ? 'SMS' : to === 'email' ? 'email' : 'WhatsApp'} instead.`);
      }
    });
    flat(wf.steps).forEach(({ n }) => { if (n.type === 'consent' && from && n.config.channel === from) n.config.channel = to; });
  }
  // Add tag / notification
  if ((m = low.match(/\badd (?:a |the )?tag ["“]?([\w -]+?)["”]?(?:[.,]|$)/))) {
    const tag = ctx.tags.find((x) => norm(x.name) === norm(m[1]));
    wf.steps.push(node('action', 'add_tag', { tagId: tag ? tag.id : `new:${m[1].trim()}` })); changes.push(`Tag contacts “${m[1].trim()}” at the end.`);
  }
  if (/\b(notify me|alert me|let me know|notify the team)\b/.test(low)) { wf.steps.push(node('action', 'notify', { message: 'Automation finished for {{first_name}} {{last_name}}.' })); changes.push('Notify your team at the end.'); }
  if ((m = text.match(/\b(?:rename|call) (?:it|this|the automation)? ?(?:to )?["“]([^"”]+)["”]/i))) { newName = m[1]; changes.push(`Rename to “${m[1]}”.`); }

  if (!changes.length) return { status: 'unsupported', message: 'I couldn’t work out how to apply that change. Try something like: “change the wait to 2 days”, “remove the second email”, “add an SMS follow-up if they don’t reply”, “only send to contacts in Building A” or “don’t run at weekends”.' };
  return { status: 'ok', workflow: wf, name: newName, changes, validation: validateWorkflow(wf) };
}

// ---------- Failure explanation ----------
export function explainFailures({ automation, executions, state }) {
  const live = executions.filter((e) => !e.test).sort((a, b) => b.started_at - a.started_at);
  const failed = live.filter((e) => e.status === 'failed');
  const skippedSteps = live.flatMap((e) => e.log.filter((l) => l.result === 'skipped').map((l) => ({ ...l, exec: e })));
  const out = [];
  if (!live.length) return { text: `“${automation.name}” hasn’t run yet, so there’s nothing to diagnose. Run a test from the builder to check the path it would take.`, items: [] };
  if (failed.length) {
    const byErr = {};
    failed.forEach((e) => (byErr[e.error] = (byErr[e.error] || 0) + 1));
    Object.entries(byErr).forEach(([err, n]) => {
      let fix = 'Open the workflow and check the highlighted step.';
      if (/no longer exists/.test(err)) fix = 'A tag, group or template it uses was deleted. Pick a new one in that step.';
      else if (/content is empty/.test(err)) fix = 'A message step has no text. Write a message or choose a template.';
      else if (/needs a contact/.test(err)) fix = 'This trigger doesn’t involve a specific contact (e.g. a campaign finishing), so contact steps can’t run. Use a notification instead, or change the trigger.';
      out.push(`${n} run${n > 1 ? 's' : ''} failed with: “${err}”. ${fix}`);
    });
  }
  if (skippedSteps.length) {
    const reasons = {};
    skippedSteps.forEach((s) => (reasons[s.detail] = (reasons[s.detail] || 0) + 1));
    out.push(`${skippedSteps.length} message step${skippedSteps.length > 1 ? 's were' : ' was'} skipped (not an error): ${Object.entries(reasons).slice(0, 3).map(([r, n]) => `${r} (${n})`).join('; ')}. This is consent and contact data working as intended.`);
  }
  const autoMsgs = (state.messages || []).filter((m) => m.automation_id === automation.id);
  const msgFailed = autoMsgs.filter((m) => m.status === 'failed');
  if (msgFailed.length) out.push(`${msgFailed.length} of ${autoMsgs.length} messages it sent failed to deliver (simulated): ${[...new Set(msgFailed.map((m) => m.failure_reason))].slice(0, 2).join('; ')}. The automation itself ran correctly — the recipients’ details may need updating.`);
  if (automation.paused_reason) out.unshift(`It was paused automatically after an error: “${automation.paused_reason}”. Fix the step, then activate it again.`);
  if (!out.length) out.push(`All ${live.length} runs completed without errors. Nothing failed.`);
  return { text: out.join('\n\n'), items: failed.slice(0, 5).map((e) => ({ label: `Run ${new Date(e.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`, sub: e.error, to: `/app/automations/executions/${e.id}` })) };
}
export { toNum };
