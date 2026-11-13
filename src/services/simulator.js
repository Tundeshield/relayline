// Demo simulation loop. Advances simulated message lifecycles, fires scheduled
// campaigns, triggers fallbacks, generates simulated replies and resumes
// waiting automations. In production this role belongs to provider webhooks
// and background jobs (e.g. Cloud Functions + Cloud Scheduler).
import { getState, tx, find } from '../data/store';
import { uid, hashPct } from '../lib/util';
import { advanceMessage, receiveMessage, simulateClick } from './messaging';
import { executeCampaign, triggerFallback, isCampaignSettled, completeCampaign } from './campaigns';
import { emit, runScheduled } from './automation/engine';

const REPLIES = {
  water: ['Thanks. Will the water be restored by 3 PM?', 'Is the laundry room affected too?', 'Thanks for the heads up.'],
  maintenance: ['Will someone need to enter my unit?', 'Thanks for letting us know.', 'What time will the crew arrive?'],
  reminder: ['Already paid through the portal, thanks!', 'Can I get a few extra days this month?', 'Got it, thank you.'],
  default: ['Thanks for the update!', 'Got it, thank you.', 'Can someone call me about this?', 'Who should I contact with questions?'],
};
function pickReply(m, campaign) {
  if (campaign?.request_ack && hashPct('ack' + m.id) < 70) return 'YES';
  if (m.channel === 'sms' && hashPct('stop' + m.id) < 14) return 'STOP';
  const text = `${campaign?.name || ''} ${m.content || ''}`.toLowerCase();
  const bank = text.includes('water') ? REPLIES.water : text.includes('maint') || text.includes('repair') ? REPLIES.maintenance : campaign?.category === 'reminder' ? REPLIES.reminder : REPLIES.default;
  return bank[Math.floor(hashPct('txt' + m.id) / 100 * bank.length)];
}

function needsWork(s, now) {
  return s.campaigns.some((c) => (c.status === 'scheduled' && c.schedule_at <= now) || c.status === 'processing')
    || s.messages.some((m) => !m.sim?.done && m.status !== 'skipped' && m.send_at <= now)
    || s.simQueue.some((q) => q.at <= now)
    || s.executions.some((e) => e.status === 'waiting' && e.resume_at <= now)
    || s.automations.some((a) => a.status === 'active' && a.workflow?.trigger?.type?.match(/^time\.|no_response/));
}

let lastScheduledCheck = 0;
export function tick() {
  const s = getState();
  if (!s) return;
  const now = Date.now();
  if (!needsWork(s, now)) return;
  const scheduledDue = now - lastScheduledCheck > 15000;
  const hotWork = s.campaigns.some((c) => (c.status === 'scheduled' && c.schedule_at <= now) || c.status === 'processing')
    || s.messages.some((m) => !m.sim?.done && m.status !== 'skipped' && m.send_at <= now)
    || s.simQueue.some((q) => q.at <= now) || s.executions.some((e) => e.status === 'waiting' && e.resume_at <= now);
  if (!hotWork && !scheduledDue) return;
  tx((draft) => {
    const orgIds = [...new Set(draft.organisations.map((o) => o.id))];
    orgIds.forEach((orgId) => {
      const base = { orgId, userId: null, now, depth: 0, system: true };
      // 1. Scheduled campaigns
      draft.campaigns.filter((c) => c.organisation_id === orgId && c.status === 'scheduled' && c.schedule_at <= now)
        .forEach((c) => executeCampaign(draft, { ...base, userId: c.created_by, system: false }, c.id));
      // 2. Message lifecycles
      draft.messages.filter((m) => m.organisation_id === orgId && !m.sim?.done && m.status !== 'skipped' && m.status !== 'cancelled' && m.send_at <= now).forEach((m) => {
        const events = advanceMessage(draft, base, m);
        const cur = find(draft.messages, m.id);
        const camp = cur.campaign_id ? find(draft.campaigns, cur.campaign_id) : null;
        events.forEach((ev) => {
          if (ev === 'delivered') {
            emit(draft, base, { type: 'message.delivered', contactId: cur.contact_id, messageId: cur.id, channel: cur.channel, automationId: cur.automation_id });
            if (cur.sim.reply && (cur.campaign_id || cur.automation_id)) draft.simQueue.push({ id: uid('sq'), organisation_id: orgId, type: 'reply', message_id: cur.id, at: now + 3000 + Math.floor(hashPct('d' + cur.id) * 80) });
            if (cur.sim.click) draft.simQueue.push({ id: uid('sq'), organisation_id: orgId, type: 'click', message_id: cur.id, at: now + 2500 });
          }
          if (ev === 'failed') {
            emit(draft, base, { type: 'message.failed', contactId: cur.contact_id, messageId: cur.id, channel: cur.channel, automationId: cur.automation_id });
            if (camp) triggerFallback(draft, base, cur);
          }
        });
        const fin = find(draft.messages, m.id);
        if (camp && fin.sim.done && fin.status === 'sent' && camp.fallback?.condition === 'not_delivered') triggerFallback(draft, base, fin);
      });
      // 3. Simulated replies / clicks
      draft.simQueue.filter((q) => q.organisation_id === orgId && q.at <= now).forEach((q) => {
        draft.simQueue = draft.simQueue.filter((x) => x.id !== q.id);
        const m = find(draft.messages, q.message_id);
        if (!m) return;
        if (q.type === 'click') simulateClick(draft, base, m.id);
        else receiveMessage(draft, base, { contactId: m.contact_id, channel: m.channel, content: pickReply(m, m.campaign_id ? find(draft.campaigns, m.campaign_id) : null), inReplyTo: m.id });
      });
      // 4. Campaign completion
      draft.campaigns.filter((c) => c.organisation_id === orgId && c.status === 'processing' && isCampaignSettled(draft, c.id))
        .forEach((c) => completeCampaign(draft, base, c.id));
      // 5. Automations: waits, time-based triggers, no-response checks
      runScheduled(draft, base);
    });
  });
  if (scheduledDue) lastScheduledCheck = now;
}

let timer = null;
export function startSimulator() {
  if (timer) return;
  timer = setInterval(() => { try { tick(); } catch (e) { console.error('Simulator error', e); } }, 1000);
}
