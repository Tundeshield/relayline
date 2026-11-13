import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Building2, Radio, MessagesSquare, ShieldCheck, Users, CreditCard, Lock, User, Trash2, Upload, Mail, MessageSquare, MessageCircle, Plug, FlaskConical, Download, RotateCcw } from 'lucide-react';
import { useOrg, tx, upd, getState } from '../../data/store';
import { PageHead, Field, Callout, Badge, Switch, Modal, Empty, useConfirm, useToast, Segmented } from '../../components/ui';
import { INDUSTRIES, TIMEZONES, CURRENCIES, LANGUAGES, COUNTRIES, PLANS, CHANNEL_LABEL, USAGE_RATES } from '../../lib/constants';
import { logActivity, ctxOf } from '../../services/core';
import { removeSuppression, addSuppression, DEFAULT_CONSENT_RULES } from '../../services/consent';
import { changePassword, logout } from '../../services/auth';
import { wipeOrgData } from '../../services/org';
import { resetDemoWorkspace } from '../../data/seed';
import { fullName, fmtDate, fmtMoney, cx, toCSV, download, DAY } from '../../lib/util';
import { usePerm, useTitle } from '../../lib/hooks';
import { setTextSize } from '../../components/AppShell';

const TABS = [['general', 'General', Building2], ['channels', 'Channels', Radio], ['communication', 'Communication', MessagesSquare], ['consent', 'Consent', ShieldCheck], ['team', 'Team', Users], ['billing', 'Billing', CreditCard], ['security', 'Security', Lock], ['profile', 'Your profile', User]];

function useSaveOrg() {
  const toast = useToast();
  return (summary, patchFn) => {
    tx((d) => { const ctx = ctxOf(d); upd(d.organisations, ctx.orgId, patchFn); logActivity(d, ctx, { event_type: 'settings.changed', entity_type: 'organisation', entity_id: ctx.orgId, summary }); });
    toast.success('Settings saved.');
  };
}

export default function Settings() {
  const { tab = 'general' } = useParams();
  const nav = useNavigate();
  const can = usePerm();
  useTitle('Settings');
  const editable = can('settings.manage');
  return (
    <>
      <PageHead title="Settings" description="Workspace configuration, channels, consent and your account." />
      <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 24, alignItems: 'start' }} className="settings-grid">
        <nav className="card" style={{ padding: 8 }} aria-label="Settings sections">{TABS.map(([k, l, I]) => <button key={k} className={cx('nav-link', tab === k && 'active')} style={{ width: '100%', border: 0, background: tab === k ? undefined : 'none', cursor: 'pointer' }} onClick={() => nav(`/app/settings/${k}`)}><I /><span>{l}</span></button>)}</nav>
        <div>
          {!editable && !['profile', 'security', 'team'].includes(tab) && <div style={{ marginBottom: 16 }}><Callout>You can view these settings. Only Owners and Admins can change them.</Callout></div>}
          <fieldset disabled={!editable && !['profile', 'security'].includes(tab)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {tab === 'general' && <General />}
            {tab === 'channels' && <Channels />}
            {tab === 'communication' && <Communication />}
            {tab === 'consent' && <Consent />}
            {tab === 'team' && <TeamTab />}
            {tab === 'billing' && <Billing />}
            {tab === 'security' && <Security />}
            {tab === 'profile' && <Profile />}
          </fieldset>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .settings-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

function Section({ title, description, children, footer }) {
  return <div className="card" style={{ marginBottom: 16 }}><div className="card-head" style={{ display: 'block' }}><h3>{title}</h3>{description && <p className="muted small" style={{ marginTop: 4 }}>{description}</p>}</div><div className="card-body stack">{children}</div>{footer && <div className="modal-foot">{footer}</div>}</div>;
}

function General() {
  const { org } = useOrg();
  const save = useSaveOrg();
  const [f, setF] = useState({ name: org.name, industry: org.industry, website: org.website, address: org.settings.address, country: org.country, timezone: org.timezone, language: org.settings.language, currency: org.settings.currency, logo: org.settings.logo });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const onLogo = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return setErr('Logo must be an image.');
    if (file.size > 300 * 1024) return setErr('Logo must be under 300 KB.');
    const r = new FileReader(); r.onload = () => { set('logo', r.result); setErr(''); }; r.readAsDataURL(file);
  };
  const submit = () => {
    if (!f.name.trim()) return setErr('Organisation name is required.');
    save('General settings updated', (o) => ({ name: f.name.trim(), industry: f.industry, website: f.website, country: f.country, timezone: f.timezone, settings: { ...o.settings, address: f.address, language: f.language, currency: f.currency, logo: f.logo } }));
  };
  return (
    <Section title="General" description="How your organisation appears across the workspace and in messages." footer={<button className="btn btn-primary" onClick={submit}>Save changes</button>}>
      {err && <Callout tone="err">{err}</Callout>}
      <div className="row-3">{f.logo ? <img src={f.logo} alt="Logo" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} /> : <span className="avatar avatar-lg" style={{ borderRadius: 10 }}>{f.name[0]}</span>}
        <label className="btn btn-sm"><Upload />Upload logo<input type="file" accept="image/*" hidden onChange={(e) => onLogo(e.target.files[0])} /></label>{f.logo && <button className="btn btn-ghost btn-sm" onClick={() => set('logo', null)}>Remove</button>}</div>
      <div className="form-grid">
        <Field label="Organisation name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Industry"><select className="select" value={f.industry} onChange={(e) => set('industry', e.target.value)}>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select></Field>
        <Field label="Website"><input className="input" value={f.website} onChange={(e) => set('website', e.target.value)} /></Field>
        <Field label="Country"><select className="select" value={f.country} onChange={(e) => set('country', e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Address" className="full" hint="Shown in email footers."><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Time zone"><select className="select" value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>{[...new Set([f.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Default language"><select className="select" value={f.language} onChange={(e) => set('language', e.target.value)}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</select></Field>
        <Field label="Currency" hint="Used for illustrative usage estimates and billing."><select className="select" value={f.currency} onChange={(e) => set('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
    </Section>
  );
}

function Channels() {
  const { org } = useOrg();
  const save = useSaveOrg();
  const toast = useToast();
  const [ch, setCh] = useState(org.settings.channels);
  const ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle };
  const set = (c, k, v) => setCh((x) => ({ ...x, [c]: { ...x[c], [k]: v } }));
  const FIELDS = { email: [['from_name', 'Default sender name'], ['from_email', 'Default from address'], ['reply_to', 'Reply-to address']], sms: [['sender_id', 'Sender number / ID']], whatsapp: [['business_name', 'Business display name'], ['phone', 'WhatsApp business number']] };
  return (
    <>
      <Callout icon={FlaskConical}>No messaging provider is connected. Channels run in <strong>demo mode</strong>: sends are simulated and never delivered. “Connected” is reserved for real integrations.</Callout>
      <div style={{ height: 16 }} />
      {['email', 'sms', 'whatsapp'].map((c) => { const I = ICON[c]; const st = ch[c].status; return (
        <Section key={c} title={<span className="row"><span className={`ch ch-${c}`}><I /></span>{CHANNEL_LABEL[c]}<Badge tone={st === 'demo' ? 'warn' : st === 'connected' ? 'ok' : 'neutral'} dot>{st === 'demo' ? 'Demo mode' : st === 'connected' ? 'Connected' : 'Not connected'}</Badge></span>}>
          <div className="between"><span className="small muted">Use {CHANNEL_LABEL[c]} in this workspace (simulated)</span><Switch checked={st === 'demo'} onChange={(v) => set(c, 'status', v ? 'demo' : 'not_connected')} label={`Enable ${CHANNEL_LABEL[c]} demo mode`} /></div>
          <div className="form-grid">{FIELDS[c].map(([k, l]) => <Field key={k} label={l}><input className="input" value={ch[c][k] || ''} onChange={(e) => set(c, k, e.target.value)} /></Field>)}</div>
          <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}><span className="faint small row" style={{ gap: 6 }}><Plug size={14} />Provider integration — coming soon</span><button className="btn btn-sm" type="button" onClick={() => toast.info(`${CHANNEL_LABEL[c]} provider integrations aren’t available yet. Your settings here will carry over when they are.`)}>Connect provider</button></div>
        </Section>); })}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => save('Channel settings updated', (o) => ({ settings: { ...o.settings, channels: ch } }))}>Save channel settings</button></div>
    </>
  );
}

function Communication() {
  const { org } = useOrg();
  const save = useSaveOrg();
  const [c, setC] = useState(org.settings.communication);
  const [n, setN] = useState(org.settings.notifications);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const NOTES = [['reply', 'New incoming replies'], ['campaign_completed', 'Campaign completed'], ['campaign_failed', 'Campaign partially failed'], ['automation_error', 'Automation paused due to an error'], ['automation', 'Automation notifications'], ['import', 'Contact import completed'], ['team', 'Team invitation accepted']];
  return (
    <>
      <Section title="Default sending preferences" description="Pre-selected options in the campaign builder.">
        <Field label="Default multi-channel behaviour"><Segmented value={c.default_mode} onChange={(v) => set('default_mode', v)} options={[['all', 'Send on all selected channels'], ['fallback', 'Primary with fallback']]} label="Default mode" /></Field>
        <div className="form-grid">
          <Field label="Default primary channel"><select className="select" value={c.fallback_primary} onChange={(e) => set('fallback_primary', e.target.value)}>{['email', 'sms', 'whatsapp'].map((x) => <option key={x} value={x}>{CHANNEL_LABEL[x]}</option>)}</select></Field>
          <Field label="Default fallback channel"><select className="select" value={c.fallback_secondary} onChange={(e) => set('fallback_secondary', e.target.value)}>{['email', 'sms', 'whatsapp'].filter((x) => x !== c.fallback_primary).map((x) => <option key={x} value={x}>{CHANNEL_LABEL[x]}</option>)}</select></Field>
          <Field label="Default fallback delay (minutes)"><input type="number" min="0" className="input" value={c.fallback_delay} onChange={(e) => set('fallback_delay', Number(e.target.value))} /></Field>
        </div>
        <div className="between"><span><span className="small strong">Warn about quiet hours</span><span className="faint xs" style={{ display: 'block' }}>Flag scheduled sends between {c.quiet_start} and {c.quiet_end}.</span></span><Switch checked={c.quiet_hours} onChange={(v) => set('quiet_hours', v)} label="Quiet hours warning" /></div>
        <p className="faint xs">Default sender details are configured per channel under <Link className="accent" to="/app/settings/channels">Channels</Link>.</p>
      </Section>
      <Section title="Notification preferences" description="Which events create in-app notifications for your team.">
        {NOTES.map(([k, l]) => <div key={k} className="between"><span className="small">{l}</span><Switch checked={n[k] !== false} onChange={(v) => setN((x) => ({ ...x, [k]: v }))} label={l} /></div>)}
      </Section>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => save('Communication & notification settings updated', (o) => ({ settings: { ...o.settings, communication: c, notifications: n } }))}>Save changes</button></div>
    </>
  );
}

function Consent() {
  const o = useOrg();
  const save = useSaveOrg();
  const toast = useToast();
  const confirm = useConfirm();
  const [r, setR] = useState({ ...DEFAULT_CONSENT_RULES, ...o.org.settings.consent });
  const [addOpen, setAddOpen] = useState(false);
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
  return (
    <>
      <Callout tone="warn">These controls help you run permission-based communications. They are not legal advice and do not guarantee compliance — review your rules with counsel for each jurisdiction you message.</Callout>
      <div style={{ height: 16 }} />
      <Section title="Default consent rules" description="Applied whenever a campaign or automation decides who can receive a message.">
        <div className="between"><span><span className="small strong">Marketing messages require explicit marketing consent</span><span className="faint xs" style={{ display: 'block' }}>Always on. A contact’s email or phone number is never treated as permission.</span></span><Switch checked onChange={() => {}} disabled label="Marketing consent required" /></div>
        <div className="between"><span><span className="small strong">Operational SMS requires an opt-in</span><span className="faint xs" style={{ display: 'block' }}>Recommended in the US for text messages.</span></span><Switch checked={r.operationalSmsRequiresOptIn} onChange={(v) => set('operationalSmsRequiresOptIn', v)} label="SMS opt-in" /></div>
        <div className="between"><span><span className="small strong">Operational email requires an opt-in</span><span className="faint xs" style={{ display: 'block' }}>Off: transactional/operational email is allowed unless the contact opted out.</span></span><Switch checked={r.operationalEmailRequiresOptIn} onChange={(v) => set('operationalEmailRequiresOptIn', v)} label="Email opt-in" /></div>
        <div className="between"><span><span className="small strong">WhatsApp requires an opt-in</span><span className="faint xs" style={{ display: 'block' }}>Always on, per WhatsApp business policy.</span></span><Switch checked disabled onChange={() => {}} label="WhatsApp opt-in" /></div>
        <Field label="Primary jurisdiction / legal review note"><input className="input" value={r.jurisdictionNote} onChange={(e) => set('jurisdictionNote', e.target.value)} /></Field>
      </Section>
      <Section title="Unsubscribe behaviour">
        <Field label="When a contact unsubscribes or replies STOP"><Segmented value={r.unsubscribeScope} onChange={(v) => set('unsubscribeScope', v)} options={[['channel', 'Opt out of that channel only'], ['global', 'Add to global suppression list']]} label="Unsubscribe scope" /></Field>
        <div className="form-grid">
          <Field label="SMS opt-out keywords" hint="Comma separated. Replies matching these revoke SMS consent (simulated)."><input className="input" value={r.stopKeywords.join(', ')} onChange={(e) => set('stopKeywords', e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))} /></Field>
          <Field label="SMS opt-in keywords"><input className="input" value={r.startKeywords.join(', ')} onChange={(e) => set('startKeywords', e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))} /></Field>
        </div>
      </Section>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 16 }}><button className="btn btn-primary" onClick={() => save('Consent rules updated', (org) => ({ settings: { ...org.settings, consent: r } }))}>Save consent rules</button></div>
      <Section title={`Suppression list (${o.suppressions.length})`} description="Suppressed contacts receive nothing on any channel, from campaigns or automations.">
        <div className="row"><button className="btn btn-sm" onClick={() => setAddOpen(true)}>Add contact to suppression list</button><button className="btn btn-sm" disabled={!o.suppressions.length} onClick={() => download('suppression-list.csv', toCSV([['value', 'contact', 'reason', 'source', 'added'], ...o.suppressions.map((s) => [s.value, fullName(o.contacts.find((c) => c.id === s.contact_id)), s.reason, s.source, new Date(s.created_at).toISOString()])]))}><Download />Export</button></div>
        {o.suppressions.length === 0 ? <span className="faint small">No suppressed contacts.</span> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Contact</th><th>Reason</th><th>Source</th><th>Added</th><th /></tr></thead><tbody>
            {o.suppressions.map((s) => { const c = o.contacts.find((x) => x.id === s.contact_id); return <tr key={s.id}><td>{c ? <Link className="strong" to={`/app/contacts/${c.id}`}>{fullName(c)}</Link> : s.value}<div className="faint xs">{s.value}</div></td><td className="small">{s.reason}</td><td className="muted small">{s.source}</td><td className="muted small">{fmtDate(s.created_at)}</td><td className="right"><button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirm({ title: 'Remove from suppression list?', message: 'This contact may receive messages again where their channel consent allows.', confirmLabel: 'Remove' })) { tx((d) => removeSuppression(d, ctxOf(d), s.id)); toast.success('Removed from suppression list.'); } }}>Remove</button></td></tr>; })}
          </tbody></table></div>
        )}
      </Section>
      <Section title="Contact communication preferences">
        <p className="muted small">Per-contact consent (status, purpose, source and timestamps for each channel) and preferred channel are managed on each contact’s profile. Changes are recorded in the activity log.</p>
        <div className="row"><Link to="/app/contacts" className="btn btn-sm">Go to contacts</Link><Link to="/app/activity" className="btn btn-sm btn-ghost">View consent changes</Link></div>
      </Section>
      {addOpen && <AddSuppression onClose={() => setAddOpen(false)} />}
    </>
  );
}

function AddSuppression({ onClose }) {
  const o = useOrg();
  const toast = useToast();
  const cands = o.contacts.filter((c) => !o.suppressions.some((s) => s.contact_id === c.id));
  const [cid, setCid] = useState(cands[0]?.id || '');
  const [reason, setReason] = useState('Requested no further contact');
  return (
    <Modal title="Suppress a contact" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger-solid" disabled={!cid} onClick={() => { tx((d) => addSuppression(d, ctxOf(d), d.contacts.find((c) => c.id === cid), reason, 'Staff entry')); toast.success('Contact suppressed.'); onClose(); }}>Suppress</button></>}>
      <div className="stack"><Field label="Contact"><select className="select" value={cid} onChange={(e) => setCid(e.target.value)}>{cands.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}</select></Field><Field label="Reason"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
    </Modal>
  );
}

function TeamTab() {
  const o = useOrg();
  return <Section title="Team" description={`${o.members.length} members · ${o.invitations.filter((i) => i.status === 'pending').length} pending invitations`}><p className="muted small">Invite members, change roles and customise permissions on the Team page.</p><div><Link to="/app/team" className="btn btn-primary btn-sm"><Users />Manage team</Link></div></Section>;
}

function Billing() {
  const o = useOrg();
  const save = useSaveOrg();
  const toast = useToast();
  const plan = PLANS[o.org.plan];
  const since = Date.now() - 30 * DAY;
  const m = o.messages.filter((x) => x.status !== 'skipped' && (x.attempted_at || x.created_at) >= since);
  const usage = { email: m.filter((x) => x.channel === 'email').length, sms: m.filter((x) => x.channel === 'sms').length, whatsapp: m.filter((x) => x.channel === 'whatsapp').length };
  const cost = usage.email * USAGE_RATES.email + usage.sms * USAGE_RATES.sms + usage.whatsapp * USAGE_RATES.whatsapp;
  return (
    <>
      <Callout icon={FlaskConical}>Billing is illustrative. No payment method is stored and no charges are made.</Callout>
      <div style={{ height: 16 }} />
      <Section title="Current plan">
        <div className="between"><div><div className="strong" style={{ fontSize: '1.2rem' }}>{plan.name}</div><div className="muted small">{fmtMoney(plan.price, 'USD')} / month (illustrative)</div></div><Badge tone="accent">Current plan</Badge></div>
        <div className="grid-3">{[['Contacts', o.contacts.length, plan.contacts], ['Team seats', o.members.length, plan.seats], ['Campaigns this month', o.campaigns.filter((c) => c.sent_at >= since).length, plan.campaigns]].map(([l, v, max]) => <div key={l}><div className="between small"><span>{l}</span><span className="faint">{v}{max ? ` / ${max.toLocaleString()}` : ' / unlimited'}</span></div><div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${max ? Math.min(100, (v / max) * 100) : 4}%`, background: 'var(--accent)' }} /></div></div>)}</div>
      </Section>
      <Section title="Change plan">
        <div className="grid-3">{Object.entries(PLANS).map(([k, p]) => <div key={k} className={cx('card card-body stack', k === o.org.plan && 'selected')} style={{ gap: 8, borderColor: k === o.org.plan ? 'var(--accent)' : undefined }}><div className="strong">{p.name}</div><div className="muted small">{fmtMoney(p.price, 'USD')}/mo</div><button className={cx('btn btn-sm', k !== o.org.plan && 'btn-primary')} disabled={k === o.org.plan} onClick={() => save(`Plan changed to ${p.name} (illustrative)`, () => ({ plan: k }))}>{k === o.org.plan ? 'Current' : 'Switch (demo)'}</button></div>)}</div>
      </Section>
      <Section title="Usage — last 30 days" description="Messaging usage will be billed separately or according to your plan once providers are connected. Rates below are illustrative.">
        <div className="table-wrap"><table className="table"><thead><tr><th>Channel</th><th>Messages</th><th>Illustrative rate</th><th>Estimate</th></tr></thead><tbody>
          {['email', 'sms', 'whatsapp'].map((c) => <tr key={c}><td>{CHANNEL_LABEL[c]}</td><td>{usage[c]}</td><td className="muted">{fmtMoney(USAGE_RATES[c], o.org.settings.currency)}{c === 'sms' ? ' / segment' : ''}</td><td>{fmtMoney(usage[c] * USAGE_RATES[c], o.org.settings.currency)}</td></tr>)}
          <tr><td className="strong">Total</td><td>{usage.email + usage.sms + usage.whatsapp}</td><td /><td className="strong">{fmtMoney(cost, o.org.settings.currency)}</td></tr>
        </tbody></table></div>
      </Section>
      <Section title="Billing history"><span className="faint small">No invoices — this is a prototype. Invoices will appear here when billing is enabled.</span><div><button className="btn btn-sm" onClick={() => toast.info('Payment methods are not collected in this prototype.')}><CreditCard />Add payment method</button></div></Section>
    </>
  );
}

function Security() {
  const o = useOrg();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState('');
  const [timeout, setTimeoutV] = useState(o.org.settings.session_timeout || '7d');
  const [delOpen, setDelOpen] = useState(false);
  const change = () => {
    setErr('');
    if (pw.next !== pw.confirm) return setErr('New passwords do not match.');
    if (!o.user.password_hash) return setErr('This demo teammate has no password set.');
    try { changePassword(o.user.id, pw.current, pw.next); setPw({ current: '', next: '', confirm: '' }); toast.success('Password updated.'); } catch (e) { setErr(e.message); }
  };
  return (
    <>
      <Section title="Password" footer={<button className="btn btn-primary" onClick={change} disabled={!pw.current || !pw.next}>Update password</button>}>
        {err && <Callout tone="err">{err}</Callout>}
        <div className="form-grid"><Field label="Current password" className="full"><input type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters."><input type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Confirm new password"><input type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field></div>
        {o.org.is_demo && o.user.email === 'demo@relayline.app' && <p className="faint xs">Changing the shared demo password only affects this browser.</p>}
      </Section>
      <Section title="Sessions">
        <Field label="Keep me signed in for"><select className="select" style={{ maxWidth: 240 }} value={timeout} onChange={(e) => { setTimeoutV(e.target.value); tx((d) => { const ctx = ctxOf(d); upd(d.organisations, ctx.orgId, (org) => ({ settings: { ...org.settings, session_timeout: e.target.value } })); logActivity(d, ctx, { event_type: 'settings.changed', entity_type: 'organisation', entity_id: ctx.orgId, summary: `Session length set to ${e.target.value}` }); }); toast.success('Session setting saved.'); }}><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option></select></Field>
        <div className="between"><span className="small">Current session · this browser{o.user.last_login_at ? ` · signed in ${fmtDate(o.user.last_login_at)}` : ''}</span><button className="btn btn-sm" onClick={() => { logout(); nav('/login'); }}>Sign out</button></div>
      </Section>
      {o.role === 'owner' && (
        <Section title="Danger zone">
          {o.org.is_demo && <div className="between"><span><span className="small strong">Reset demo data</span><span className="faint xs" style={{ display: 'block' }}>Restore the sample workspace to its original state.</span></span><button className="btn btn-sm" onClick={async () => { if (await confirm({ title: 'Reset demo data?', message: 'All changes in this workspace will be replaced by the original sample data.', confirmLabel: 'Reset', danger: true })) { tx((d) => resetDemoWorkspace(d, o.orgId)); toast.success('Demo data reset.'); nav('/app'); } }}><RotateCcw />Reset</button></div>}
          <div className="between"><span><span className="small strong">Delete workspace</span><span className="faint xs" style={{ display: 'block' }}>Permanently delete {o.org.name} and all of its contacts, campaigns and history.</span></span><button className="btn btn-sm btn-danger" onClick={() => setDelOpen(true)}><Trash2 />Delete workspace</button></div>
        </Section>
      )}
      {delOpen && <DeleteWorkspace onClose={() => setDelOpen(false)} />}
    </>
  );
}

function DeleteWorkspace({ onClose }) {
  const o = useOrg();
  const nav = useNavigate();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const go = () => {
    tx((d) => {
      wipeOrgData(d, o.orgId, { keepMembers: false });
      d.organisations = d.organisations.filter((x) => x.id !== o.orgId);
      const next = d.memberships.find((m) => m.user_id === o.user.id && m.status === 'active');
      d.session = { ...d.session, orgId: next?.organisation_id || null };
    });
    toast.success('Workspace deleted.');
    nav(getState().session?.orgId ? '/app' : '/onboarding');
  };
  return (
    <Modal title="Delete this workspace?" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger-solid" disabled={typed !== o.org.name} onClick={go}>Delete permanently</button></>}>
      <div className="stack"><Callout tone="err">This removes every contact, campaign, conversation, automation and log in <strong>{o.org.name}</strong>. It cannot be undone.</Callout><Field label={`Type “${o.org.name}” to confirm`}><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} /></Field></div>
    </Modal>
  );
}

function Profile() {
  const o = useOrg();
  const toast = useToast();
  const [f, setF] = useState({ name: o.user.name, job_title: o.user.job_title || '' });
  const size = getState().prefs?.textSize || 'default';
  const [ts, setTs] = useState(size);
  return (
    <>
      <Section title="Your profile" footer={<button className="btn btn-primary" onClick={() => { if (!f.name.trim()) return toast.error('Name is required.'); tx((d) => upd(d.users, o.user.id, { name: f.name.trim(), job_title: f.job_title })); toast.success('Profile saved.'); }}>Save profile</button>}>
        <div className="form-grid"><Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Job title"><input className="input" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field><Field label="Email" hint="Email changes are disabled in the prototype."><input className="input" value={o.user.email} disabled /></Field><Field label="Role in this workspace"><input className="input" value={o.role} disabled style={{ textTransform: 'capitalize' }} /></Field></div>
      </Section>
      <Section title="Accessibility" description="Increase text size across the application.">
        <Segmented value={ts} onChange={(v) => { setTs(v); setTextSize(v); }} options={[['default', 'Default'], ['large', 'Large'], ['larger', 'Larger']]} label="Text size" />
        <p className="faint xs">Saved on this device. Focus outlines and keyboard navigation are always on.</p>
      </Section>
    </>
  );
}
