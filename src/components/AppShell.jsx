import { useEffect, useMemo, useState, useRef } from 'react';
import { NavLink, Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Send, Workflow, Inbox, FileText, Users, ListChecks, Upload, BarChart3, History, UserCog, Settings, LifeBuoy,
  Search, Bell, HelpCircle, ChevronsUpDown, Plus, LogOut, PanelLeftClose, PanelLeft, Menu as MenuIcon, Check, Type, User, Building2, CheckCheck, RotateCcw, FlaskConical,
} from 'lucide-react';
import { useOrg, getState, tx, upd } from '../data/store';
import { logout, switchOrg } from '../services/auth';
import { Menu, MenuItem, Avatar, Modal, ChannelIcon, useConfirm, useToast } from './ui';
import { cx, fullName, relTime } from '../lib/util';
import { ROLE_LABEL } from '../lib/constants';
import { resetDemoWorkspace } from '../data/seed';
import Logo from './Logo';
import { AssistantProvider, useAssistant } from './ai';
import { Sparkles } from 'lucide-react';

const NAV = [
  ['MAIN', [['/app', 'Home', LayoutDashboard, ['/app']], ['/app/inbox', 'Inbox', Inbox, ['/app/inbox'], 'inbox'], ['/app/campaigns', 'Campaigns', Send, ['/app/campaigns', '/app/templates']], ['/app/automations', 'Automations', Workflow, ['/app/automations']], ['/app/contacts', 'Contacts', Users, ['/app/contacts', '/app/lists']], ['/app/analytics', 'Reports', BarChart3, ['/app/analytics', '/app/activity']]]],
  ['WORKSPACE', [['/app/settings', 'Settings', Settings, ['/app/settings', '/app/team']], ['/app/help', 'Help', LifeBuoy, ['/app/help']]]],
];
const isActive = (path, prefixes) => prefixes.some((p) => (p === '/app' ? path === '/app' || path === '/app/' : path === p || path.startsWith(p + '/')));

export function setTextSize(size) {
  document.documentElement.dataset.textSize = size;
  tx((d) => { d.prefs = { ...d.prefs, textSize: size }; });
}

export default function AppShell() {
  return <AssistantProvider><Shell /></AssistantProvider>;
}

function AskAIButton() {
  const { open } = useAssistant();
  return <button className="btn btn-ai btn-sm" onClick={() => open()} title="Ask AI about your workspace"><Sparkles /><span className="desktop-only">Ask AI</span></button>;
}

function Shell() {
  const o = useOrg();
  const nav = useNavigate();
  const loc = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('rl:sidebar') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [loc.pathname]);
  useEffect(() => { localStorage.setItem('rl:sidebar', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const unreadInbox = o.conversations.filter((c) => c.unread && c.status === 'open').length;
  const myOrgs = getState().memberships.filter((m) => m.user_id === o.user?.id && m.status === 'active').map((m) => getState().organisations.find((x) => x.id === m.organisation_id)).filter(Boolean);
  const unreadN = o.myNotifications.filter((n) => !n.read_at).length;

  const doReset = async () => {
    if (!(await confirm({ title: 'Reset demo data?', message: 'This restores the sample workspace to its original state. Contacts, campaigns, conversations and automations you created here will be removed.', confirmLabel: 'Reset demo data', danger: true }))) return;
    tx((d) => resetDemoWorkspace(d, o.orgId));
    toast.success('Demo workspace reset to its original state.');
    nav('/app');
  };

  return (
    <div className="shell">
      <aside className={cx('sidebar', collapsed && 'collapsed', mobileOpen && 'mobile-open')} aria-label="Main navigation">
        <div className="sidebar-brand"><Logo /><span className="brand-text">Relayline</span></div>
        <nav className="sidebar-nav">
          {NAV.map(([group, items]) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-label">{group}</div>
              {items.map(([to, label, Icon, prefixes, count]) => (
                <NavLink key={to} to={to} className={() => cx('nav-link', isActive(loc.pathname, prefixes) && 'active')} title={collapsed ? label : undefined}>
                  <Icon /><span>{label}</span>{count === 'inbox' && unreadInbox > 0 && <span className="count">{unreadInbox}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot desktop-only">
          <button className="btn btn-ghost btn-sm btn-block" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeft /> : <><PanelLeftClose /><span className="sidebar-foot-text">Collapse</span></>}
          </button>
        </div>
      </aside>
      {mobileOpen && <div className="overlay" style={{ zIndex: 35 }} onClick={() => setMobileOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon mobile-only" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><MenuIcon /></button>
          <Menu align="left" width={280} trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle} aria-label="Switch workspace" style={{ paddingLeft: 8 }}>
              <span className="avatar avatar-sm" style={{ borderRadius: 6 }}>{o.org?.name?.[0]}</span>
              <span className="truncate desktop-only" style={{ maxWidth: 200, fontWeight: 600 }}>{o.org?.name}</span>
              <ChevronsUpDown />
            </button>
          )}>
            <div className="menu-label">Workspaces</div>
            {myOrgs.map((org) => (
              <MenuItem key={org.id} icon={org.id === o.orgId ? Check : Building2} onClick={() => { switchOrg(org.id); nav('/app'); }}>
                <span className="grow truncate">{org.name}</span>{org.is_demo && <span className="demo-pill" style={{ height: 18, fontSize: '0.62rem' }}>Demo</span>}
              </MenuItem>
            ))}
            <div className="menu-sep" />
            <MenuItem icon={Plus} onClick={() => nav('/onboarding?new=1')}>Create workspace</MenuItem>
          </Menu>
          <button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={16} /><span>Search contacts, campaigns…</span><kbd>⌘K</kbd></button>
          <div className="grow" />
          {o.org?.is_demo && <span className="demo-pill desktop-only" title="All messaging in this workspace is simulated"><FlaskConical size={12} />Demo</span>}
          <AskAIButton />
          <NotificationsMenu o={o} unreadN={unreadN} />
          <Link to="/app/help" className="btn btn-ghost btn-icon" aria-label="Help"><HelpCircle /></Link>
          <Menu width={250} trigger={({ toggle }) => <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label="Account menu"><Avatar name={o.user?.name} size="sm" /></button>}>
            <div style={{ padding: '8px 10px' }}><div className="strong">{o.user?.name}</div><div className="faint small truncate">{o.user?.email}</div><div className="faint xs" style={{ marginTop: 2 }}>{ROLE_LABEL[o.role]} · {o.org?.name}</div></div>
            <div className="menu-sep" />
            <MenuItem icon={User} to="/app/settings/profile">Profile & security</MenuItem>
            <MenuItem icon={Settings} to="/app/settings">Workspace settings</MenuItem>
            <div className="menu-label"><Type size={11} style={{ verticalAlign: -1 }} /> Text size</div>
            <div className="row" style={{ padding: '2px 8px 8px', gap: 4 }}>
              {[['default', 'A'], ['large', 'A+'], ['larger', 'A++']].map(([v, l]) => <button key={v} className={cx('btn btn-sm grow', (getState().prefs?.textSize || 'default') === v && 'btn-primary')} onClick={() => setTextSize(v)} aria-label={`Text size ${v}`}>{l}</button>)}
            </div>
            {o.org?.is_demo && <MenuItem icon={RotateCcw} onClick={doReset}>Reset demo data</MenuItem>}
            <div className="menu-sep" />
            <MenuItem icon={LogOut} onClick={() => { logout(); nav('/login'); }}>Log out</MenuItem>
          </Menu>
        </header>
        {o.org?.is_demo && (
          <div className="demo-banner" role="note"><FlaskConical size={14} />Demo workspace — sends, deliveries and replies are simulated. No real messages are sent. <button onClick={doReset}>Reset demo data</button></div>
        )}
        <main className={cx(!loc.pathname.startsWith('/app/inbox') && 'content')} id="main"><Outlet /></main>
      </div>
      {searchOpen && <GlobalSearch o={o} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

function NotificationsMenu({ o, unreadN }) {
  const nav = useNavigate();
  const mine = [...o.myNotifications].sort((a, b) => b.created_at - a.created_at).slice(0, 8);
  const markAll = () => tx((d) => d.notifications.forEach((n, i) => { if (n.user_id === o.user.id && n.organisation_id === o.orgId && !n.read_at) d.notifications[i] = { ...n, read_at: Date.now() }; }));
  const open = (n) => { tx((d) => upd(d.notifications, n.id, { read_at: n.read_at || Date.now() })); if (n.link) nav(n.link); };
  return (
    <Menu width={360} trigger={({ toggle }) => (
      <span className="icon-btn-wrap"><button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={`Notifications${unreadN ? `, ${unreadN} unread` : ''}`}><Bell /></button>{unreadN > 0 && <span className="badge-dot">{unreadN > 9 ? '9+' : unreadN}</span>}</span>
    )}>
      <div className="between" style={{ padding: '6px 10px' }}><span className="strong small">Notifications</span>{unreadN > 0 && <button className="btn btn-ghost btn-sm" onClick={markAll}><CheckCheck />Mark all read</button>}</div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {mine.length === 0 && <div className="faint small" style={{ padding: 16, textAlign: 'center' }}>You're all caught up.</div>}
        {mine.map((n) => (
          <button key={n.id} className="menu-item" style={{ alignItems: 'flex-start' }} onClick={() => open(n)} data-close>
            <span style={{ width: 8, marginTop: 7, flex: 'none' }}>{!n.read_at && <span className="unread-dot" style={{ display: 'block' }} />}</span>
            <span className="grow"><span className="small" style={{ display: 'block', color: n.read_at ? 'var(--text-2)' : 'var(--text)' }}>{n.message}</span><span className="faint xs">{relTime(n.created_at)}</span></span>
          </button>
        ))}
      </div>
      <div className="menu-sep" />
      <MenuItem to="/app/notifications">View all notifications</MenuItem>
    </Menu>
  );
}

function GlobalSearch({ o, onClose }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const has = (...v) => v.some((x) => String(x || '').toLowerCase().includes(s));
    const out = [];
    o.contacts.filter((c) => has(fullName(c), c.email, c.phone, c.company, c.custom_fields?.unit)).slice(0, 6).forEach((c) => out.push({ group: 'Contacts', label: fullName(c), sub: c.email || c.phone, to: `/app/contacts/${c.id}` }));
    o.campaigns.filter((c) => has(c.name, c.description)).slice(0, 5).forEach((c) => out.push({ group: 'Campaigns', label: c.name, sub: c.status, to: `/app/campaigns/${c.id}` }));
    o.templates.filter((t) => has(t.name, t.content, t.category)).slice(0, 5).forEach((t) => out.push({ group: 'Templates', label: t.name, sub: t.category, channel: t.channel, to: `/app/templates?open=${t.id}` }));
    const contactById = Object.fromEntries(o.contacts.map((c) => [c.id, c]));
    o.conversations.filter((cv) => has(fullName(contactById[cv.contact_id])) || o.conversationMessages.some((m) => m.conversation_id === cv.id && has(m.content))).slice(0, 5)
      .forEach((cv) => out.push({ group: 'Conversations', label: fullName(contactById[cv.contact_id]), sub: o.conversationMessages.filter((m) => m.conversation_id === cv.id).slice(-1)[0]?.content, channel: cv.channel, to: `/app/inbox/${cv.id}` }));
    o.automations.filter((a) => has(a.name, a.description)).slice(0, 5).forEach((a) => out.push({ group: 'Automations', label: a.name, sub: a.status, to: `/app/automations/${a.id}` }));
    return out;
  }, [q, o]);
  const go = (r) => { onClose(); nav(r.to); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && results[active]) go(results[active]);
  };
  let lastGroup = null;
  return (
    <Modal title="Search" onClose={onClose} size="lg">
      <div className="input-icon"><Search /><input ref={inputRef} className="input" placeholder="Search contacts, campaigns, templates, conversations, automations" value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} aria-label="Search query" /></div>
      <div className="search-results" style={{ marginTop: 12 }}>
        {q && results.length === 0 && <div className="faint small" style={{ padding: 20, textAlign: 'center' }}>No results for “{q}”.</div>}
        {!q && <div className="faint small" style={{ padding: 20, textAlign: 'center' }}>Type to search across your workspace. Use ↑ ↓ and Enter to navigate.</div>}
        {results.map((r, i) => {
          const header = r.group !== lastGroup ? (lastGroup = r.group) : null;
          return (
            <div key={i}>
              {header && <div className="menu-label" style={{ paddingTop: 10 }}>{header}</div>}
              <button className={cx('search-item', i === active && 'active')} onClick={() => go(r)} onMouseEnter={() => setActive(i)}>
                {r.channel && <ChannelIcon channel={r.channel} />}
                <span className="grow" style={{ minWidth: 0 }}><span className="small strong" style={{ display: 'block' }}>{r.label}</span>{r.sub && <span className="faint xs truncate" style={{ display: 'block' }}>{r.sub}</span>}</span>
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
