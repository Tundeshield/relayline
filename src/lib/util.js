// Shared utilities: ids, dates, formatting, CSV, validation, templating.

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const cx = (...a) => a.filter(Boolean).join(' ');

export const DAY = 86400000;
export const HOUR = 3600000;

// Deterministic hash (FNV-1a) → used for repeatable simulated outcomes.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const hashPct = (str) => hash(str) % 1000 / 10; // 0–99.9

export function seededRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Dates ----------
export function fmtDate(ts, opts = {}) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: opts.year === false ? undefined : 'numeric', timeZone: opts.tz });
}
export function fmtDateTime(ts, tz) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz });
}
export function fmtTime(ts, tz) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}
export function relTime(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  const future = d < 0;
  const a = Math.abs(d);
  let s;
  if (a < 45000) return future ? 'in a moment' : 'just now';
  if (a < HOUR) s = `${Math.round(a / 60000)}m`;
  else if (a < DAY) s = `${Math.round(a / HOUR)}h`;
  else if (a < 30 * DAY) s = `${Math.round(a / DAY)}d`;
  else return fmtDate(ts);
  return future ? `in ${s}` : `${s} ago`;
}
export const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

// ---------- Numbers ----------
export const fmtNum = (n) => (n ?? 0).toLocaleString('en-US');
export const pct = (a, b, digits = 1) => (b ? `${((a / b) * 100).toFixed(digits)}%` : '—');
export const pctNum = (a, b) => (b ? (a / b) * 100 : 0);
export function fmtMoney(n, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: n < 1 && n > 0 ? 4 : 2 }).format(n);
}
export const plural = (n, word, pl) => `${fmtNum(n)} ${n === 1 ? word : pl || word + 's'}`;
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// ---------- Validation ----------
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
export function normalizePhone(v) {
  if (!v) return '';
  const raw = String(v).trim();
  const digits = raw.replace(/[^\d]/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`; // US default
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
export const isPhone = (v) => !!normalizePhone(v);
export function fmtPhone(p) {
  if (!p) return '';
  const m = p.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : p;
}

// ---------- SMS segments ----------
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€';
export function smsInfo(text = '') {
  const unicode = [...text].some((c) => !GSM.includes(c));
  const len = [...text].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, unicode, segments, encoding: unicode ? 'UCS-2 (Unicode)' : 'GSM-7' };
}

// ---------- Templating ----------
export const VARIABLES = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'organisation_name', label: 'Organisation name' },
  { key: 'unit', label: 'Unit (custom)' },
  { key: 'building', label: 'Building (custom)' },
];
export function varValue(key, contact, org) {
  if (key === 'organisation_name') return org?.name || '';
  if (!contact) return '';
  if (key === 'phone') return fmtPhone(contact.phone);
  if (key in contact && typeof contact[key] !== 'object') return contact[key] || '';
  return contact.custom_fields?.[key] || '';
}
export function renderTemplate(text = '', contact, org) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => varValue(k, contact, org) || '');
}
export const usedVariables = (text = '') => [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
export function missingVariables(text, contact, org) {
  return usedVariables(text).filter((k) => !varValue(k, contact, org));
}
// Minimal Markdown-like formatting for email bodies (escaped first).
export function miniMarkdown(text = '') {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .split(/\n{2,}/)
    .map((block) => {
      if (/^#\s/.test(block)) return `<h2 style="font-size:18px;margin:0 0 8px">${block.slice(2)}</h2>`;
      if (/^(-|\*)\s/m.test(block) && block.split('\n').every((l) => /^(-|\*)\s/.test(l)))
        return `<ul style="margin:0 0 12px;padding-left:20px">${block.split('\n').map((l) => `<li>${l.slice(2)}</li>`).join('')}</ul>`;
      return `<p style="margin:0 0 12px">${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a style="color:#0f766e" href="$2">$1</a>');
}

// ---------- CSV ----------
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
export function toCSV(rows) {
  return rows
    .map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');
}
export function download(filename, content, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const fullName = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || c?.phone || 'Unknown contact';

// Simple non-cryptographic hash for the demo-only local auth. Not for production.
export const demoPasswordHash = (pw) => `demo$${hash('relayline:' + pw).toString(36)}`;
