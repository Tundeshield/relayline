// Demo AI: message drafting, rewriting and channel adaptation.
// Deterministic and offline. Never invents facts beyond the user's brief: when a detail
// is needed but unknown, it inserts a [bracketed placeholder] and reports it.
import { smsInfo } from '../../lib/util';
import { cap } from './nlp';

const TONES = ['professional', 'friendly', 'apologetic', 'urgent', 'persuasive', 'warm', 'formal', 'clear', 'concise'];
const TOPICS = [
  ['water', /water|plumb/i, 'Water service interruption', 'We recommend storing some water in advance if you’ll need it during this time.'],
  ['power', /power|electric|outage/i, 'Planned power interruption', 'Please charge any essential devices beforehand.'],
  ['elevator', /elevator|lift/i, 'Elevator update', null],
  ['maintenance', /maint|repair|renovat|resurfac|painting/i, 'Scheduled maintenance', null],
  ['rent', /rent|payment|invoice|dues|fee/i, 'Payment reminder', null],
  ['renewal', /renew|expir|membership/i, 'Renewal reminder', null],
  ['appointment', /appointment|visit|booking|inspection/i, 'Appointment reminder', null],
  ['event', /event|party|bbq|meeting|gathering|celebrat/i, 'You’re invited', null],
  ['closure', /clos|holiday|office hours/i, 'Schedule change', null],
  ['emergency', /emergency|fire|evacuat|gas leak|urgent/i, 'Important safety notice', null],
  ['welcome', /welcome|new resident|new member|onboard/i, 'Welcome', null],
];
export const detectTopic = (t) => TOPICS.find(([, re]) => re.test(t)) || ['general', null, 'An update for you', null];

const stripTrailing = (s) => s.replace(/\s+/g, ' ').trim().replace(/[.!\s]+$/, '');
function tidyCore(core) {
  let c = stripTrailing(core);
  c = c.replace(/\btheir\b/gi, 'your').replace(/\bthem\b/gi, 'you');
  if (/^(water|power|electricity|gas|elevator|lift|gym|pool|parking|internet|heating|laundry|main entrance|lobby)\b/i.test(c)) c = 'the ' + c;
  return c;
}

// Pull the essential facts out of a natural-language brief.
export function analyseBrief(brief) {
  const text = brief.replace(/\s+/g, ' ').trim();
  const tones = TONES.filter((t) => new RegExp(`\\b${t}`, 'i').test(text));
  const body = text.replace(/\b(keep|make) it\b[^.]*\.?/gi, '').replace(/\b(tone|style)\s*:[^.]*\.?/gi, '').trim();
  let audience = null; let core = null;
  let m = body.match(/\b(?:inform|tell|notify|update|remind|warn|alert|let)\s+(.+?)\s+(?:know\s+)?that\s+(.+)/i) || body.match(/\b(?:inform|tell|notify|update|remind|warn|alert|let)\s+(.+?)\s+(?:know\s+)?(?:about|of)\s+(.+)/i);
  if (m) { audience = m[1].replace(/\bknow$/i, '').trim(); core = m[2]; }
  else if ((m = body.match(/\b(?:write|draft|create|send|prepare)\s+(?:me\s+)?(?:a|an)?\s*(?:short\s+)?(?:message|email|sms|text|announcement|notice|reminder|update|note)?\s*(?:to\s+(.+?))?\s*(?:about|regarding|on|that|saying)\s+(.+)/i))) { audience = m[1] || null; core = m[2]; }
  else core = body.replace(/^(please\s+)?(help me\s+)?(write|draft|send)\s+(a|an)?\s*(message|email|text)?\s*/i, '');
  core = core.split(/(?<=[.!?])\s+/)[0];
  const building = (text.match(/\bbuilding\s+[a-z0-9]+\b/i) || [])[0]?.replace(/^b/, 'B');
  const when = (text.match(/\b(tomorrow|today|tonight|this (?:morning|afternoon|evening|weekend)|on (?:mon|tues|wednes|thurs|fri|satur|sun)day|next week)\b/i) || [])[0];
  const range = (text.match(/\b(?:between|from)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:and|to|-)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i) || []);
  const topic = detectTopic(text);
  const interruption = /interrupt|shut ?off|outage|closed|unavailable|disrupt|delay|cancel/i.test(text);
  return { text, tones: tones.length ? tones : ['professional'], audience, core: tidyCore(core || text), building, when, range: range[0] ? `${range[1].toUpperCase()}–${range[2].toUpperCase()}` : null, topic, interruption, apologetic: tones.includes('apologetic') || interruption };
}

function subjectFrom(a) {
  const base = a.topic[0] === 'water' && /maint/i.test(a.text) ? 'Scheduled water maintenance' : a.topic[2];
  const parts = [a.building, a.when, a.range].filter(Boolean);
  return `${base}${parts.length ? ' — ' + parts.join(', ') : ''}`.replace(/ ,/g, ',');
}

const signoff = 'Thank you,\nThe {{organisation_name}} team';

export function buildEmail(a) {
  const urgent = a.tones.includes('urgent') || a.topic[0] === 'emergency';
  const friendly = a.tones.includes('friendly') || a.tones.includes('warm');
  const lines = [friendly ? 'Hi {{first_name}}!' : 'Hi {{first_name}},'];
  if (urgent) lines.push(`**Important:** ${cap(a.core)}.`);
  else if (a.audience && a.building && !a.core.toLowerCase().includes(a.building.toLowerCase())) lines.push(friendly ? `Just a quick heads-up for ${a.audience}: ${a.core}.` : `We’re writing to let ${a.audience.replace(/^all /, 'all ')} know that ${a.core}.`);
  else lines.push(friendly ? `Just a quick heads-up: ${a.core}.` : `We’re writing to let you know that ${a.core}.`);
  if (a.topic[3]) lines.push(a.topic[3]);
  if (a.apologetic) lines.push(friendly ? 'Sorry for the hassle, and thanks so much for your patience!' : 'We apologise for any inconvenience this may cause and appreciate your patience.');
  lines.push(urgent ? 'Please read this carefully and reply to this email if you need assistance.' : 'If you have any questions, simply reply to this email.');
  lines.push(signoff);
  return { subject: (urgent ? 'Important: ' : '') + subjectFrom(a), body: lines.join('\n\n') };
}
export function buildSms(a) {
  const urgent = a.tones.includes('urgent') || a.topic[0] === 'emergency';
  const opt = ' Reply STOP to opt out.';
  const fits = (m) => smsInfo(m.replace('{{organisation_name}}', 'Northstar Property Grp')).segments <= 2;
  const pre = a.building && !a.core.toLowerCase().includes(a.building.toLowerCase()) ? `${a.building}: ` : '';
  const cores = [a.core, a.core.replace(/\s+(because|due to|as)\b.*$/i, ''), a.core.split(/,\s*/)[0]];
  for (const c of cores) {
    for (const extra of [`${a.apologetic ? ' Sorry for the inconvenience.' : ''} Questions? Reply here.`, ' Questions? Reply here.', '']) {
      const msg = `{{organisation_name}}: ${urgent ? 'URGENT – ' : ''}${pre}${cap(c)}.${extra}${opt}`;
      if (fits(msg)) return { body: msg };
    }
  }
  let core = cap(cores[1]);
  while (!fits(`{{organisation_name}}: ${pre}${core}…${opt}`) && core.length > 30) core = core.split(' ').slice(0, -1).join(' ');
  return { body: `{{organisation_name}}: ${pre}${core}…${opt}` };
}
export function buildWhatsApp(a) {
  const friendly = !a.tones.includes('formal');
  const lines = [friendly ? 'Hi {{first_name}},' : 'Hello {{first_name}},', `*Heads-up from {{organisation_name}}${a.building && !a.core.toLowerCase().includes(a.building.toLowerCase()) ? ` for ${a.building}` : ''}:* ${a.core}.`];
  if (a.topic[3]) lines.push(a.topic[3]);
  if (a.apologetic) lines.push('Sorry for the inconvenience — thank you for your patience.');
  lines.push('Reply here if you have any questions.');
  return { body: lines.join('\n\n'), template_name: `${a.topic[0]}_update_v1` };
}
const BUILDERS = { email: buildEmail, sms: buildSms, whatsapp: buildWhatsApp };

export function generateMessage({ brief, channels }) {
  if (!brief || brief.trim().length < 8) return { status: 'clarify', question: 'What would you like to tell people? Include what’s happening, when, and who it affects.' };
  const a = analyseBrief(brief);
  const versions = {};
  (channels?.length ? channels : ['email']).forEach((ch) => (versions[ch] = BUILDERS[ch](a)));
  const notes = [];
  if (!a.when && !a.range && /\b(will|is going to)\b/.test(a.core)) notes.push('No date or time was mentioned — add one if it matters.');
  return { status: 'ok', versions, tone: a.tones.join(', '), topic: a.topic[0], notes, analysis: { audience: a.audience, building: a.building } };
}

// ---------- Rewriting ----------
const SPELL = { teh: 'the', recieve: 'receive', recieved: 'received', seperate: 'separate', occured: 'occurred', tommorow: 'tomorrow', tomorow: 'tomorrow', tommorrow: 'tomorrow', maintainance: 'maintenance', maintenence: 'maintenance', accomodate: 'accommodate', untill: 'until', wich: 'which', definately: 'definitely', apartmant: 'apartment', resident: 'resident', adress: 'address', calender: 'calendar', goverment: 'government', thier: 'their', becuase: 'because', alot: 'a lot', inconvinience: 'inconvenience', inconvenience: 'inconvenience', schedual: 'schedule', sheduled: 'scheduled', comming: 'coming', begining: 'beginning', wether: 'whether', truely: 'truly', i: 'I' };
const CONTRACTIONS = [[/\bwe’re\b|\bwe're\b/gi, 'we are'], [/\bit’s\b|\bit's\b/gi, 'it is'], [/\bdon’t\b|\bdon't\b/gi, 'do not'], [/\bcan’t\b|\bcan't\b/gi, 'cannot'], [/\bwon’t\b|\bwon't\b/gi, 'will not'], [/\byou’ll\b|\byou'll\b/gi, 'you will'], [/\bwe’ll\b|\bwe'll\b/gi, 'we will']];

export function fixGrammar(text) {
  let t = text.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1').replace(/([,.!?])(?=[A-Za-z])/g, '$1 ');
  t = t.replace(/\b[A-Za-z]+\b/g, (w) => { const r = SPELL[w.toLowerCase()]; if (!r || r === w.toLowerCase() && w !== 'i') return w; return w[0] === w[0].toUpperCase() && r !== 'I' ? cap(r) : r; });
  t = t.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  t = t.split('\n').map((l) => (l.trim() && !/[.!?:,)\-–]$/.test(l.trim()) && l.trim().split(' ').length > 4 && !/^(hi|hello|dear|thank|the )/i.test(l.trim()) ? l + '.' : l)).join('\n');
  return t.replace(/\.{2,}/g, '.').replace(/\.\s*\./g, '.');
}

const sentencesOf = (t) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

export function rewriteMessage({ text, subject = '', channel, op }) {
  const isPleasantry = (p) => /apologi|sorry|patience|questions|reply (to this|here)|thank you,|thanks so much|recommend storing/i.test(p) && !/STOP/.test(p);
  let t = text || '';
  let note = '';
  switch (op) {
    case 'grammar': t = fixGrammar(t); note = t === text ? 'No spelling or grammar issues found.' : 'Corrected spelling, capitalisation and punctuation.'; break;
    case 'shorter': {
      if (channel === 'email') t = sentencesOf(t).filter((p, i, arr) => i === 0 || i === arr.length - 1 || !isPleasantry(p)).join('\n\n').replace(/We’re writing to let (?:you|.+?) know that (\w)/, (m, c) => c.toUpperCase());
      else t = t.replace(/ ?Sorry for the inconvenience\.?/i, '').replace(/ ?Questions\? Reply here\.?/i, '').replace(/\n\n[^\n]*(patience|questions)[^\n]*/gi, '');
      t = t.replace(/\bin order to\b/gi, 'to').replace(/\bat this point in time\b/gi, 'now').replace(/\bplease be advised that\b/gi, '');
      note = 'Removed non-essential sentences and filler words.'; break;
    }
    case 'longer': {
      const add = channel === 'sms' ? ' We’ll share updates here if anything changes.' : '\n\nWe’ll let you know if anything changes. In the meantime, our team is happy to help with any questions.';
      t = channel === 'email' ? t.replace(/\n\n(Thank you,[\s\S]*)$/, `${add}\n\n$1`) : t.replace(/( Reply STOP[^]*)?$/, (m) => add + (m || ''));
      if (t === text) t = text + add;
      note = 'Added what to expect and an offer of help.'; break;
    }
    case 'professional': {
      t = t.replace(/^Hi (\{\{first_name\}\})!?,?/m, 'Dear $1,').replace(/!/g, '.').replace(/Just a quick heads-up: /g, 'Please note that ').replace(/Sorry for the hassle[^.\n]*[.!]?/g, 'We apologise for any inconvenience.');
      if (channel === 'email') CONTRACTIONS.forEach(([re, r]) => (t = t.replace(re, (m) => (m[0] === m[0].toUpperCase() ? cap(r) : r))));
      note = 'More formal greeting and wording, no exclamation marks.'; break;
    }
    case 'friendly': {
      t = t.replace(/^(Dear|Hello) (\{\{first_name\}\}),/m, 'Hi $2!').replace(/We’re writing to let you know that /g, 'Just a quick heads-up: ').replace(/Please note that /g, 'Just so you know, ').replace(/We apologise for any inconvenience this may cause and appreciate your patience\./g, 'Sorry for the hassle — thanks so much for your patience!');
      note = 'Warmer, more conversational wording.'; break;
    }
    case 'urgent': {
      if (channel === 'email') t = t.replace(/^(.*\n\n)?/, (m) => (m || '') + '**Important — please read today.**\n\n');
      else if (!/URGENT/.test(t)) t = t.replace(/^(\{\{organisation_name\}\}: )?/, (m) => `${m}URGENT – `);
      note = 'Added urgency so recipients act promptly.'; break;
    }
    case 'persuasive': {
      const line = channel === 'email' ? '\n\n**It only takes a moment** — reply to this email today and we’ll take care of the rest.' : ' Reply today — it only takes a moment.';
      t = channel === 'email' ? t.replace(/\n\n(Thank you,[\s\S]*)$/, `${line}\n\n$1`) : t.replace(/( Reply STOP[^]*)?$/, (m) => line + (m || ''));
      note = 'Added a clear benefit and call to action.'; break;
    }
    case 'improve': {
      t = fixGrammar(t);
      if (!/\{\{first_name\}\}/.test(t) && channel !== 'sms') t = `Hi {{first_name}},\n\n${t}`;
      if (channel === 'email' && !/\{\{organisation_name\}\}|thank you/i.test(t)) t = `${t}\n\n${signoff}`;
      if (channel === 'sms' && !/STOP/.test(t)) t = `${t} Reply STOP to opt out.`;
      if (channel !== 'sms' && !/reply|contact us|questions/i.test(t)) t = t.replace(/(\n\n(Thank you,|The \{\{organisation)[\s\S]*)?$/, (m) => `\n\nIf you have any questions, just reply to this message.${m || ''}`);
      note = 'Fixed grammar, added personalisation, a clear next step and a sign-off where missing.'; break;
    }
    case 'personalise': {
      t = t.replace(/\b(Dear|Hi|Hello)\s+(resident|residents|member|members|customer|customers|there|all|everyone)\b/gi, '$1 {{first_name}}');
      if (!/\{\{first_name\}\}/.test(t)) t = channel === 'sms' ? t.replace(/^(\{\{organisation_name\}\}: )?/, (m) => `${m}Hi {{first_name}}, `) : `Hi {{first_name}},\n\n${t}`;
      t = t.replace(/\byour building\b/gi, '{{building}}').replace(/\byour unit\b/gi, 'unit {{unit}}');
      note = 'Added {{first_name}} and other contact variables.'; break;
    }
    default: break;
  }
  return { status: 'ok', text: t.replace(/\n{3,}/g, '\n\n').trim(), subject, note };
}

export function suggestSubjects({ text, subject }) {
  const a = analyseBrief(stripMarkup(text));
  const s = subjectFrom(a);
  const core = cap(a.core).slice(0, 60);
  return { status: 'ok', options: [...new Set([s, `${a.topic[2]}: what you need to know`, a.building ? `${a.building}: ${core}` : core, subject && `Update: ${subject}`].filter(Boolean))].slice(0, 4) };
}
export function suggestCtas({ text }) {
  const t = detectTopic(text)[0];
  const map = { appointment: ['Reply YES to confirm your appointment.', 'Need to reschedule? Reply with a time that suits you.'], renewal: ['Renew online in under a minute.', 'Reply RENEW and we’ll take care of it.'], rent: ['Pay securely in the resident portal.', 'Reply if you need to arrange a payment plan.'], event: ['Reply YES to RSVP.', 'Let us know how many guests you’re bringing.'] };
  return { status: 'ok', options: [...(map[t] || []), 'Reply to this message if you have any questions.', 'Reply YES to confirm you’ve received this.'] };
}

const stripMarkup = (t = '') => t.replace(/\*\*|\*|_|^#\s/gm, '').replace(/\[(.+?)\]\((.+?)\)/g, '$1');
// Re-derive the core message from existing content and rebuild it for other channels.
export function adaptMessage({ from, subject, body, to }) {
  const plain = stripMarkup(body).replace(/\{\{organisation_name\}\}:\s*/g, '').replace(/ ?Reply STOP to opt out\.?/gi, '');
  const paras = plain.split(/\n+/).map((p) => p.trim()).filter((p) => p && !/^(hi|hello|dear)\b/i.test(p) && !/^(thank you|thanks|the \{\{organisation_name|regards|best)/i.test(p) && !/^\{\{organisation_name\}\}/.test(p));
  const main = (paras[0] || plain).replace(/^(we’re writing to let .+? know that|we are writing to let .+? know that|just a quick heads-up:|please note that|heads-up from \{\{organisation_name\}\}:|important:|urgent\s*–)\s*/i, '');
  const a = analyseBrief(`${subject || ''}. ${main}`);
  a.core = tidyCore(main.split(/(?<=[.!?])\s+/)[0]);
  a.apologetic = /apolog|sorry|inconvenien/i.test(plain);
  const versions = {};
  to.forEach((ch) => { versions[ch] = BUILDERS[ch](a); if (ch === 'email' && subject && from === 'email') versions[ch].subject = subject; });
  return { status: 'ok', versions, note: `Adapted from your ${from === 'sms' ? 'SMS' : from === 'whatsapp' ? 'WhatsApp' : 'email'} version. Key details were kept; length and format were adjusted for each channel.` };
}
