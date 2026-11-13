// Small natural-language helpers used by the demo AI engine.
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, 'twenty-four': 24, thirty: 30, 'forty-eight': 48, sixty: 60, ninety: 90 };
export const toNum = (w) => (w == null ? null : /^\d+$/.test(w) ? Number(w) : WORDS[String(w).toLowerCase()] ?? null);
const NUM = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|fifteen|twenty|twenty-four|thirty|forty-eight|sixty|ninety)';
const UNIT = '(minutes?|mins?|hours?|hrs?|days?|weeks?)';
export const DURATION_RE = new RegExp(`${NUM}\\s*-?\\s*${UNIT}`, 'i');
export const DURATION_RE_G = new RegExp(`${NUM}\\s*-?\\s*${UNIT}`, 'gi');
export function parseDuration(text) {
  const m = String(text).match(DURATION_RE);
  if (!m) return null;
  const n = toNum(m[1]); let u = m[2].toLowerCase();
  if (u.startsWith('min')) return { amount: n, unit: 'minutes' };
  if (u.startsWith('h')) return { amount: n, unit: 'hours' };
  if (u.startsWith('w')) return { amount: n * 7, unit: 'days' };
  return { amount: n, unit: 'days' };
}
export const toHours = (d) => (!d ? null : d.unit === 'days' ? d.amount * 24 : d.unit === 'minutes' ? d.amount / 60 : d.amount);
export function hoursToDuration(h) { return h % 24 === 0 ? { amount: h / 24, unit: 'days' } : { amount: h, unit: 'hours' }; }
export const humanDuration = (d) => `${d.amount} ${d.amount === 1 ? d.unit.replace(/s$/, '') : d.unit}`;
export function channelIn(text) {
  const t = text.toLowerCase();
  if (/whats\s?app/.test(t)) return 'whatsapp';
  if (/\b(sms|text message|text|texts)\b/.test(t)) return 'sms';
  if (/\b(e-?mail|emails)\b/.test(t)) return 'email';
  return null;
}
export const sentences = (text) => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\s*;\s*|\s+then\s+|,\s*then\s+/i).map((s) => s.trim()).filter(Boolean);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const ordinal = (w) => ({ first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, last: -1, final: -1 }[String(w || '').toLowerCase()]);
