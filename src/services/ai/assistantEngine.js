// Demo AI: answers questions using ONLY the workspace data passed in. When it can't
// find an answer it says so instead of guessing.
import { fullName, DAY, pct } from '../../lib/util';
import { CHANNEL_LABEL } from '../../lib/constants';
import { campaignStats } from '../campaigns';
import { summarize } from '../analytics';
import { explainFailures } from './automationEngine';
import { REASON_LABEL, getConsent } from '../consent';
import { toNum } from './nlp';

const cItem = (c, sub) => ({ label: fullName(c), sub, to: `/app/contacts/${c.id}` });
const list = (arr, n = 8) => arr.slice(0, n);
const more = (arr, n = 8) => (arr.length > n ? ` Showing the first ${n}.` : '');

export function answerQuestion({ question, route = '', data }) {
  const q = question.toLowerCase().trim();
  const d = data;
  const now = Date.now();
  const contacts = d.contacts.filter((c) => c.status !== 'archived');
  let m;

  // ---- Intents that hand off to a creation flow ----
  if ((/\b(automate|automation|remind (?:customers|people|members|residents|clients)|follow up with|set up a workflow)\b/.test(q) && /\b(help|create|set up|build|make|how|can i|automate|remind|follow up)\b/.test(q) || /\b(send|try) (another|again|a second).*\bfails?\b|\bif (the |a |an )?(first |sms |email |message )*(one |message )?fails?\b.*\b(send|try)/.test(q)) && !/\bwhy\b|explain|went wrong/.test(q)) {
    const prompt = /renew/.test(q) ? 'Send members an email 14 days before their membership expires. If they haven’t renewed after seven days, send a reminder by SMS if they have consented to SMS.'
      : /appointment/.test(q) ? 'Send customers a reminder 24 hours before their appointment. If they haven’t confirmed by 12 hours before the appointment, send another reminder.'
        : /respond|reply|answer/.test(q) ? 'When an SMS is delivered, wait 2 days. If they haven’t replied, send a follow-up SMS.'
          : /fail/.test(q) ? 'If an SMS fails, try sending the same message by email instead, but only if the contact has given permission to receive emails.'
            : question;
    return { text: /how can i|how do i/.test(q) ? 'The simplest way is an automation that waits for a reply and follows up if none arrives. I’ve drafted the instruction below — open it to review the workflow before anything is switched on.' : 'I can set that up as an automation. Review the draft workflow before activating it — nothing runs until you confirm.', actions: [{ label: 'Create automation with AI', to: `/app/automations/new?ai=${encodeURIComponent(prompt)}` }] };
  }
  if (/\b(write|draft|help me (?:write|create)|create|compose)\b.*\b(message|announcement|email|text|sms|notice|update|newsletter)\b/.test(q)) {
    return { text: 'I’ll open a new campaign with “Write with AI” ready. You’ll review and edit the draft before anything is sent.', actions: [{ label: 'Write it with AI', to: `/app/campaigns/new?ai=${encodeURIComponent(question)}` }] };
  }

  // ---- Contacts ----
  if ((m = q.match(/(?:haven'?t|not|no|without)\s+(?:received|been sent|gotten|had|got)\s+(?:a |any )?(?:message|campaign|anything|communication)s?.*?(\d+|thirty|sixty|ninety|fourteen|seven)\s*days?/)) || /(not contacted|haven'?t (?:heard|messaged)).*(\d+|thirty)\s*days?/.test(q)) {
    const n = toNum(m?.[1] || (q.match(/(\d+|thirty|sixty)\s*days?/) || [])[1]) || 30;
    const since = now - n * DAY;
    const res = contacts.filter((c) => !d.messages.some((x) => x.contact_id === c.id && x.status !== 'skipped' && (x.attempted_at || x.created_at) >= since));
    return { text: `${res.length} contact${res.length === 1 ? ' hasn’t' : 's haven’t'} been sent any message in the last ${n} days.${more(res)}`, items: list(res).map((c) => cItem(c, c.email || c.phone)), actions: res.length ? [{ label: 'Message these contacts', to: '/app/campaigns/new', state: { contactIds: res.map((c) => c.id) } }] : [] };
  }
  if ((m = q.match(/\b(?:without|no|missing|don'?t have)(?: an?)? (email|phone|mobile|number)/))) {
    const key = m[1] === 'email' ? 'email' : 'phone';
    const res = contacts.filter((c) => !c[key]);
    return { text: `${res.length} contact${res.length === 1 ? ' has' : 's have'} no ${key === 'email' ? 'email address' : 'phone number'} — they can’t receive ${key === 'email' ? 'email' : 'SMS or WhatsApp'}.${more(res)}`, items: list(res).map((c) => cItem(c, c[key === 'email' ? 'phone' : 'email'] || 'No other channel')), actions: [{ label: 'Open contacts', to: `/app/contacts` }] };
  }
  if ((m = q.match(/\bbuilding\s+([a-z0-9]+)/))) {
    const b = `building ${m[1]}`;
    const res = contacts.filter((c) => (c.custom_fields?.building || '').toLowerCase() === b);
    if (!res.length) return { text: `I couldn’t find any contacts whose building is “Building ${m[1].toUpperCase()}”.` };
    return { text: `${res.length} contacts are in Building ${m[1].toUpperCase()}.${more(res)}`, items: list(res).map((c) => cItem(c, c.custom_fields?.unit ? `Unit ${c.custom_fields.unit}` : c.email)) };
  }
  if (/\b(opted out|unsubscribed|suppressed|stop)\b/.test(q) && /\b(who|which|show|list|how many)\b/.test(q)) {
    const res = contacts.filter((c) => c.status === 'unsubscribed' || ['email', 'sms', 'whatsapp'].some((ch) => getConsent(d, c.id, ch)?.status === 'revoked'));
    return { text: `${res.length} contacts have opted out of at least one channel or are suppressed.${more(res)}`, items: list(res).map((c) => cItem(c, ['email', 'sms', 'whatsapp'].filter((ch) => getConsent(d, c.id, ch)?.status === 'revoked').map((ch) => CHANNEL_LABEL[ch]).join(', ') ? `Opted out: ${['email', 'sms', 'whatsapp'].filter((ch) => getConsent(d, c.id, ch)?.status === 'revoked').map((ch) => CHANNEL_LABEL[ch]).join(', ')}` : 'Suppressed')) };
  }
  // ---- Who hasn't responded ----
  if (/\b(hasn'?t|haven'?t|not|didn'?t|no)\b.*\b(respond|repl|answer|confirm|acknowledg)/.test(q) || /who (?:hasn'?t|didn'?t) /.test(q)) {
    const campId = route.match(/\/app\/campaigns\/(cmp_[\w]+)/)?.[1];
    const camp = campId ? d.campaigns.find((c) => c.id === campId) : [...d.campaigns].filter((c) => c.sent_at).sort((a, b) => b.sent_at - a.sent_at)[0];
    if (!camp) return { text: 'There are no sent campaigns yet, so there’s nobody to follow up with.' };
    const msgs = d.messages.filter((x) => x.campaign_id === camp.id && (x.status === 'delivered' || x.status === 'read'));
    const by = new Map();
    msgs.forEach((x) => { const cur = by.get(x.contact_id) || { replied: false }; by.set(x.contact_id, { replied: cur.replied || !!x.replied_at || !!x.acknowledged_at }); });
    const res = [...by.entries()].filter(([, v]) => !v.replied).map(([id]) => d.contacts.find((c) => c.id === id)).filter(Boolean);
    return { text: `For “${camp.name}”, ${res.length} of ${by.size} people who received it haven’t replied${camp.request_ack ? ' or acknowledged it' : ''}.${more(res)}`, items: list(res).map((c) => cItem(c, c.email || c.phone)), actions: [{ label: 'Open campaign results', to: `/app/campaigns/${camp.id}?tab=recipients` }, res.length && { label: 'Send them a follow-up', to: '/app/campaigns/new', state: { contactIds: res.map((c) => c.id) } }].filter(Boolean) };
  }

  // ---- Campaign eligibility / exclusions ----
  if (/\b(excluded|eligible|not (?:sent|receive)|didn'?t (?:get|receive)|skipped|why (?:are|were|did) (?:some )?(?:recipients|people|contacts))\b/.test(q)) {
    const campId = route.match(/\/app\/campaigns\/(cmp_[\w]+)/)?.[1];
    const camp = campId ? d.campaigns.find((c) => c.id === campId) : [...d.campaigns].filter((c) => c.sent_at).sort((a, b) => b.sent_at - a.sent_at)[0];
    if (!camp) return { text: 'Open a campaign (or send one) and I can explain exactly who was excluded and why.' };
    const msgs = d.messages.filter((x) => x.campaign_id === camp.id);
    if (!msgs.length) return { text: `“${camp.name}” hasn’t been sent yet. When it’s being created, the Audience step shows who is eligible on each channel and why others aren’t.` };
    const st = campaignStats(msgs);
    const reasons = {};
    msgs.filter((x) => x.status === 'skipped').forEach((x) => (reasons[`${CHANNEL_LABEL[x.channel]}: ${x.failure_reason}`] = (reasons[`${CHANNEL_LABEL[x.channel]}: ${x.failure_reason}`] || 0) + 1));
    const r = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
    return { text: `“${camp.name}” reached ${st.recipients} contacts with ${st.attempted} messages. ${st.skipped} recipient/channel combinations were not sent${r.length ? ', because:' : '.'}\n${r.map(([k, n]) => `• ${k} — ${n}`).join('\n')}\n\nContacts are only messaged on a channel when they have the details and the consent your rules require. Marketing campaigns need explicit marketing consent.`, actions: [{ label: 'See excluded recipients', to: `/app/campaigns/${camp.id}?tab=recipients&status=skipped` }] };
  }

  // ---- Analytics ----
  if (/(highest|most|worst|which channel).*(fail|failure|bounce)|(fail|failure).*(highest|most|worst|which channel)/.test(q)) {
    const since = now - 30 * DAY;
    const rows = ['email', 'sms', 'whatsapp'].map((ch) => ({ ch, ...summarize(d.messages.filter((x) => x.channel === ch && (x.attempted_at || x.created_at) >= since)) })).filter((r) => r.attempted);
    if (!rows.length) return { text: 'No messages were sent in the last 30 days, so there are no failure rates to compare.' };
    rows.sort((a, b) => b.failed / b.attempted - a.failed / a.attempted);
    const w = rows[0];
    return { text: `In the last 30 days, ${CHANNEL_LABEL[w.ch]} had the highest failure rate: ${w.failed} of ${w.attempted} messages failed (${pct(w.failed, w.attempted)}).\n${rows.map((r) => `• ${CHANNEL_LABEL[r.ch]}: ${pct(r.failed, r.attempted)} failed (${r.failed}/${r.attempted})`).join('\n')}\n\nAll delivery results are simulated in demo mode.`, actions: [{ label: 'Open reports', to: `/app/analytics?channel=${w.ch}` }] };
  }
  if (/\b(summar|overview|recap|how did we do|what happened)\b/.test(q)) {
    const month = /month/.test(q);
    const start = month ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() : now - 30 * DAY;
    const s = summarize(d.messages.filter((x) => (x.attempted_at || x.created_at) >= start));
    const camps = d.campaigns.filter((c) => c.sent_at >= start);
    const convs = d.conversationMessages.filter((x) => x.direction === 'in' && x.created_at >= start).length;
    const runs = d.executions.filter((e) => !e.test && e.started_at >= start).length;
    const newC = d.contacts.filter((c) => c.created_at >= start).length;
    if (!s.attempted && !camps.length) return { text: `Nothing was sent ${month ? 'this month' : 'in the last 30 days'} yet.` };
    return { text: `${month ? 'This month' : 'In the last 30 days'}: ${camps.length} campaign${camps.length === 1 ? '' : 's'} sent ${s.attempted} messages. ${s.delivered} were delivered (${s.deliveryRate.toFixed(1)}% of those with a final report), ${s.failed} failed and ${s.pending} have no delivery report yet. People replied to ${s.replied} messages, and ${convs} inbound messages arrived in the inbox. Automations ran ${runs} times, and ${newC} new contact${newC === 1 ? ' was' : 's were'} added.`, actions: [{ label: 'Open reports', to: '/app/analytics' }] };
  }
  if (/\b(best|top|most successful|performed best|highest delivery|most replies)\b/.test(q)) {
    const rows = d.campaigns.filter((c) => c.sent_at).map((c) => ({ c, st: campaignStats(d.messages.filter((x) => x.campaign_id === c.id)) })).filter((r) => r.st.attempted >= 3);
    if (!rows.length) return { text: 'There aren’t enough sent campaigns to compare yet.' };
    const score = (r) => (r.st.delivered / Math.max(1, r.st.attempted - r.st.pending)) * 100 + (r.st.replied / Math.max(1, r.st.delivered)) * 100;
    rows.sort((a, b) => score(b) - score(a));
    return { text: 'Ranked by delivery rate plus reply rate:', items: rows.slice(0, 5).map((r, i) => ({ label: `${i + 1}. ${r.c.name}`, sub: `${pct(r.st.delivered, r.st.attempted - r.st.pending)} delivered · ${r.st.replied} replies of ${r.st.delivered}`, to: `/app/campaigns/${r.c.id}` })) };
  }
  // ---- Automations ----
  if (/\b(why|explain|what went wrong|diagnos)\b.*\b(fail|error|paused|didn'?t (?:run|work|send))|\b(fail|failed|error)\b.*\b(workflow|automation)/.test(q)) {
    const autoId = route.match(/\/app\/automations\/(aut_[\w]+)/)?.[1];
    const targets = autoId ? d.automations.filter((a) => a.id === autoId) : d.automations.filter((a) => a.paused_reason || d.executions.some((e) => e.automation_id === a.id && e.status === 'failed'));
    if (!targets.length) return { text: 'None of your automations have failed runs. If one isn’t doing what you expect, open it and run a test to see the exact path.' };
    const parts = targets.slice(0, 3).map((a) => { const r = explainFailures({ automation: a, executions: d.executions.filter((e) => e.automation_id === a.id), state: d }); return { text: `${a.name}:\n${r.text}`, items: r.items }; });
    return { text: parts.map((p) => p.text).join('\n\n'), items: parts.flatMap((p) => p.items).slice(0, 6) };
  }
  // ---- Inbox / attention ----
  if (/\b(unread|need(?:s)? (?:a )?(?:reply|attention)|waiting|inbox)\b/.test(q)) {
    const waiting = d.conversations.filter((c) => c.status === 'open' && lastDir(d, c.id) === 'in');
    return { text: `${waiting.length} open conversation${waiting.length === 1 ? ' is' : 's are'} waiting for a reply.`, items: list(waiting).map((c) => { const ct = d.contacts.find((x) => x.id === c.contact_id); return { label: fullName(ct), sub: CHANNEL_LABEL[c.channel], to: `/app/inbox/${c.id}` }; }), actions: [{ label: 'Open inbox', to: '/app/inbox' }] };
  }
  if (/how many (contacts|people|residents|members)/.test(q)) return { text: `You have ${contacts.length} contacts (${contacts.filter((c) => c.status === 'active').length} active, ${contacts.filter((c) => c.status === 'unsubscribed').length} unsubscribed).` };

  return { text: 'I can only answer from the data in this workspace, and I couldn’t find an answer to that. Try one of the suggestions below.', unknown: true };
}
const lastDir = (d, convId) => d.conversationMessages.filter((m) => m.conversation_id === convId && m.direction !== 'note').sort((a, b) => b.created_at - a.created_at)[0]?.direction;

export const SUGGESTIONS = {
  campaigns: ['Help me create a maintenance announcement', 'Why are some recipients excluded?', 'Who hasn’t responded to the last campaign?'],
  contacts: ['Find contacts who haven’t received a message in 30 days', 'Show me contacts without an email address', 'Find residents in Building B'],
  automations: ['Help me automate membership renewals', 'Explain why this workflow failed', 'How can I follow up with people who don’t respond?'],
  analytics: ['Which channel had the highest delivery failure rate?', 'Summarise this month’s communication activity', 'Which campaigns performed best?'],
  inbox: ['Which conversations need a reply?', 'Show me who hasn’t responded'],
  default: ['Help me write a message to all our residents', 'Remind customers about their appointments', 'Show me who hasn’t responded', 'Summarise this month’s communication activity'],
};
export const suggestionsFor = (route) => (route.includes('/campaigns') ? SUGGESTIONS.campaigns : route.includes('/contacts') || route.includes('/lists') ? SUGGESTIONS.contacts : route.includes('/automations') ? SUGGESTIONS.automations : route.includes('/analytics') || route.includes('/activity') ? SUGGESTIONS.analytics : route.includes('/inbox') ? SUGGESTIONS.inbox : SUGGESTIONS.default);
