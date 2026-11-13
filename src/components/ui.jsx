import { createContext, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink } from 'react-router-dom';
import { X, Check, AlertTriangle, Info, AlertCircle, Mail, MessageSquare, MessageCircle, ChevronUp, ChevronDown, Inbox as InboxIcon } from 'lucide-react';
import { cx, initials } from '../lib/util';
import { CHANNEL_LABEL } from '../lib/constants';

// ---------- Toasts ----------
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'success', ms = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const api = useMemo(() => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error', 6000), info: (m) => push(m, 'info'), warn: (m) => push(m, 'warn', 6000) }), [push]);
  const Icon = { success: Check, error: AlertCircle, info: Info, warn: AlertTriangle };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => { const I = Icon[t.tone]; return <div key={t.id} className={`toast toast-${t.tone}`}><I /><div className="grow">{t.message}</div><button className="btn-ghost btn btn-icon btn-sm" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X /></button></div>; })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Confirm dialog ----------
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => close(false)} footer={<><button className="btn" onClick={() => close(false)}>Cancel</button><button className={state.danger ? 'btn btn-danger-solid' : 'btn btn-primary'} onClick={() => close(true)} autoFocus>{state.confirmLabel || 'Confirm'}</button></>}>
          <div className="muted">{state.message}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------- Overlays ----------
function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}
export function Modal({ title, description, children, footer, onClose, size }) {
  useEscape(onClose);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('modal', size && `modal-${size}`)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h2>{title}</h2>{description && <p className="muted small" style={{ marginTop: 4 }}>{description}</p>}</div>
          {onClose && <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body);
}
export function Drawer({ title, children, footer, onClose, width }) {
  useEscape(onClose);
  return createPortal(
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="drawer" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body" style={{ flex: 1, paddingTop: 16 }}>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body);
}

// Dropdown menu rendered in a portal with fixed positioning, so it is never clipped
// by scrolling or overflow-hidden containers. Flips above the trigger near the viewport edge.
export function Menu({ trigger, children, align = 'right', width }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const open = !!pos;
  const place = () => {
    const r = ref.current.getBoundingClientRect();
    const w = width || 230;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom;
    setPos(below < 320 && r.top > below ? { left, bottom: window.innerHeight - r.top + 6, w } : { left, top: r.bottom + 6, w });
  };
  useEffect(() => {
    if (!open) return;
    const h = (e) => !ref.current?.contains(e.target) && !menuRef.current?.contains(e.target) && setPos(null);
    const k = (e) => e.key === 'Escape' && setPos(null);
    const close = (e) => { if (e?.type === 'scroll' && menuRef.current?.contains(e.target)) return; setPos(null); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ open, toggle: () => (open ? setPos(null) : place()) })}
      {open && createPortal(
        <div ref={menuRef} className="menu" role="menu" style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.w, maxHeight: '70vh', overflowY: 'auto', zIndex: 150 }} onClick={(e) => e.target.closest('[data-close]') && setPos(null)}>
          {typeof children === 'function' ? children(() => setPos(null)) : children}
        </div>, document.body)}
    </div>
  );
}
export const MenuItem = ({ icon: I, children, danger, onClick, to, disabled }) => {
  const inner = <>{I && <I />}{children}</>;
  if (to) return <Link className={cx('menu-item', danger && 'danger')} to={to} data-close>{inner}</Link>;
  return <button className={cx('menu-item', danger && 'danger')} onClick={onClick} data-close disabled={disabled} style={disabled ? { opacity: .45, cursor: 'not-allowed' } : undefined}>{inner}</button>;
};

// ---------- Display ----------
const TONE = { ok: 'badge-ok', warn: 'badge-warn', err: 'badge-err', info: 'badge-info', accent: 'badge-accent', neutral: 'badge-neutral' };
export const Badge = ({ tone = 'neutral', dot, children, title }) => <span className={cx('badge', TONE[tone])} title={title}>{dot && <span className="dot" />}{children}</span>;
export function StatusBadge({ map, status }) {
  const s = map[status] || { label: status, tone: 'neutral' };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
const CH_ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle };
export function ChannelIcon({ channel, off, size }) {
  const I = CH_ICON[channel] || InboxIcon;
  return <span className={cx('ch', off ? 'ch-off' : `ch-${channel}`)} title={`${CHANNEL_LABEL[channel]}${off ? ' — not available' : ''}`} style={size ? { width: size, height: size } : undefined} aria-label={CHANNEL_LABEL[channel]}><I /></span>;
}
export const ChannelPill = ({ channel }) => <span className="row" style={{ gap: 6 }}><ChannelIcon channel={channel} /><span className="small">{CHANNEL_LABEL[channel]}</span></span>;
export const Avatar = ({ name, size }) => <span className={cx('avatar', size && `avatar-${size}`)} aria-hidden="true">{initials(name)}</span>;

export function Empty({ icon: I = InboxIcon, title, children, action }) {
  return <div className="empty"><div className="empty-icon"><I size={20} /></div><h3>{title}</h3>{children && <p>{children}</p>}{action && <div style={{ marginTop: 6 }}>{action}</div>}</div>;
}
export function Callout({ tone = 'info', icon, children }) {
  const I = icon || (tone === 'warn' ? AlertTriangle : tone === 'err' ? AlertCircle : Info);
  return <div className={`callout callout-${tone}`}><I /><div className="grow">{children}</div></div>;
}
export function PageHead({ title, description, actions, crumbs, tabs }) {
  return (
    <>
    <div className="page-head">
      <div className="grow">
        {crumbs && <div className="crumbs">{crumbs.map((c, i) => <span key={i} className="row" style={{ gap: 6 }}>{i > 0 && <span>/</span>}{c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}</span>)}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
    {tabs && <SectionTabs tabs={tabs} />}
    </>
  );
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>{t.label}{t.count != null && <span className="faint" style={{ marginLeft: 6 }}>{t.count}</span>}</button>)}</div>;
}
export function Segmented({ options, value, onChange, label }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
export const Switch = ({ checked, onChange, label, disabled }) => <button type="button" className="switch" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;

export function Field({ label, hint, error, children, htmlFor, className }) {
  return (
    <div className={cx('field', className)}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="error-text" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
export function Progress({ parts }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return <div className="progress" title={parts.map((p) => `${p.label}: ${p.value}`).join(' · ')}>{parts.map((p, i) => p.value > 0 && <span key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color, marginRight: i < parts.length - 1 ? 2 : 0 }} />)}</div>;
}
export const Spinner = () => <span className="spinner" aria-label="Loading" />;

// ---------- Sorting helper ----------
export function useSort(rows, initial, getters = {}) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const g = getters[sort.key] || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = g(a), y = g(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort]); // eslint-disable-line
  const Th = ({ k, children, className }) => (
    <th className={cx('sortable', className)} onClick={() => setSort((s) => ({ key: k, dir: s?.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))} aria-sort={sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}>
      <span className="row" style={{ gap: 4 }}>{children}{sort?.key === k && (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</span>
    </th>
  );
  return { sorted, Th, sort };
}

// Secondary navigation between closely related pages (keeps the sidebar short).
export function SectionTabs({ tabs }) {
  return <nav className="section-tabs" aria-label="Section">{tabs.map(([to, label]) => <NavLink key={to} to={to} end className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>)}</nav>;
}
export const CAMPAIGN_TABS = [['/app/campaigns', 'Campaigns'], ['/app/templates', 'Templates']];
export const CONTACT_TABS = [['/app/contacts', 'All contacts'], ['/app/lists', 'Groups'], ['/app/contacts/import', 'Import']];
export const REPORT_TABS = [['/app/analytics', 'Performance'], ['/app/activity', 'Activity log']];
