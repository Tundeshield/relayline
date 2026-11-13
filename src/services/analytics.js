// Derived analytics. Everything is computed from message, conversation and execution
// records, so numbers always agree with the underlying records.
import { DAY, startOfDay } from '../lib/util';

export const isAttempted = (m) => m.status !== 'skipped' && m.status !== 'cancelled' && m.role !== 'system';
export const isDelivered = (m) => m.status === 'delivered' || m.status === 'read';
export const msgTime = (m) => m.attempted_at || m.send_at || m.created_at;

export function filterMessages(messages, { from, to, channel, campaignId } = {}) {
  return messages.filter((m) => {
    const t = msgTime(m);
    if (from && t < from) return false;
    if (to && t > to) return false;
    if (channel && channel !== 'all' && m.channel !== channel) return false;
    if (campaignId && campaignId !== 'all' && m.campaign_id !== campaignId) return false;
    return true;
  });
}

export function summarize(messages) {
  const att = messages.filter(isAttempted);
  const delivered = att.filter(isDelivered).length;
  const failed = att.filter((m) => m.status === 'failed').length;
  const pending = att.filter((m) => m.status === 'queued' || m.status === 'sent').length;
  const read = att.filter((m) => m.status === 'read').length;
  const replied = att.filter((m) => m.replied_at).length;
  const acknowledged = att.filter((m) => m.acknowledged_at).length;
  const waAtt = att.filter((m) => m.channel === 'whatsapp');
  return {
    total: messages.length, attempted: att.length, sent: att.filter((m) => m.sent_at).length, delivered, failed, pending, read, replied, acknowledged,
    skipped: messages.filter((m) => m.status === 'skipped').length,
    deliveryRate: att.length - pending ? (delivered / (att.length - pending)) * 100 : 0,
    responseRate: delivered ? (replied / delivered) * 100 : 0,
    waReadRate: waAtt.filter(isDelivered).length ? (waAtt.filter((m) => m.status === 'read').length / waAtt.filter(isDelivered).length) * 100 : null,
  };
}

// Bucket attempted messages by day (or week for long ranges).
export function timeSeries(messages, from, to, { keyFn = (m) => m.channel, keys = ['email', 'sms', 'whatsapp'], pred = isAttempted } = {}) {
  const span = to - from;
  const bucket = span > 60 * DAY ? 7 * DAY : DAY;
  const start = startOfDay(from);
  const n = Math.max(1, Math.ceil((to - start) / bucket));
  const labels = []; const ranges = [];
  for (let i = 0; i < n; i++) {
    const a = start + i * bucket;
    labels.push(new Date(a).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    ranges.push([a, a + bucket]);
  }
  const series = Object.fromEntries(keys.map((k) => [k, new Array(n).fill(0)]));
  messages.forEach((m) => {
    if (!pred(m)) return;
    const i = Math.floor((msgTime(m) - start) / bucket);
    const k = keyFn(m);
    if (i >= 0 && i < n && series[k]) series[k][i]++;
  });
  return { labels, ranges, series, bucket };
}

export function rangeFor(preset, custom) {
  const now = Date.now();
  if (preset === 'custom' && custom?.from && custom?.to) return { from: new Date(custom.from + 'T00:00:00').getTime(), to: new Date(custom.to + 'T23:59:59').getTime() };
  const days = { '7d': 7, '30d': 30, '90d': 90 }[preset] || 30;
  return { from: now - days * DAY, to: now };
}
