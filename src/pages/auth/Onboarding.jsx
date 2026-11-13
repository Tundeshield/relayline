import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, MessageSquare, MessageCircle, Upload, FlaskConical, FileX, ArrowLeft } from 'lucide-react';
import Logo from '../../components/Logo';
import { Field, Callout, useToast } from '../../components/ui';
import { useOrg, tx, upd } from '../../data/store';
import { createOrganisation } from '../../services/org';
import { seedWorkspace } from '../../data/seed';
import { INDUSTRIES, COUNTRIES, TIMEZONES, ORG_SIZES, GOALS } from '../../lib/constants';
import { cx } from '../../lib/util';
import { useTitle } from '../../lib/hooks';

const guessTz = () => { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; return TIMEZONES.includes(tz) ? tz : 'America/New_York'; } catch { return 'America/New_York'; } };

export default function Onboarding() {
  useTitle('Set up your workspace');
  const { user } = useOrg();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const isNew = sp.get('new');
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: '', industry: '', website: '', country: 'United States', timezone: guessTz(), userName: user?.name || '', jobTitle: user?.job_title || '', size: '', goals: [], channels: ['email', 'sms'] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const next = () => {
    if (step === 1) {
      const er = {};
      if (!f.name.trim()) er.name = 'Organisation name is required.';
      if (f.website && !/^https?:\/\/\S+\.\S+/.test(f.website) && !/^\S+\.\S+$/.test(f.website)) er.website = 'Enter a valid website, e.g. example.com';
      setErrors(er);
      if (Object.keys(er).length) return;
    }
    setStep((s) => s + 1);
  };

  const finish = (mode) => {
    setBusy(true);
    setTimeout(() => {
      const orgId = tx((d) => {
        const website = f.website && !/^https?:/.test(f.website) ? `https://${f.website}` : f.website;
        const org = createOrganisation(d, { userId: user.id, name: f.name, industry: f.industry || 'Other', website, country: f.country, timezone: f.timezone, size: f.size, goals: f.goals, channels: f.channels, is_demo: mode === 'sample' });
        upd(d.organisations, org.id, { onboarding: { channels: f.channels, completed: true } });
        upd(d.users, user.id, { name: f.userName.trim() || user.name, job_title: f.jobTitle });
        if (mode === 'sample') {
          const o = d.organisations.find((x) => x.id === org.id);
          o.settings.channels.email = { ...o.settings.channels.email, status: 'demo', from_name: f.name, from_email: 'updates@' + (website ? website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : 'yourorg.example') };
          seedWorkspace(d, { orgId: org.id, users: { owner: user.id, admin: user.id, manager: user.id, member: user.id } });
        }
        d.session = { ...d.session, orgId: org.id };
        return org.id;
      });
      toast.success(mode === 'sample' ? 'Workspace created with sample data. Explore away!' : 'Workspace created.');
      nav(mode === 'import' ? '/app/contacts/import' : '/app', { replace: true });
      return orgId;
    }, 500);
  };

  const steps = 5;
  return (
    <div className="onb">
      <div className="between" style={{ marginBottom: 32 }}>
        <div className="row strong"><Logo />Relayline</div>
        {isNew ? <Link to="/app" className="btn btn-ghost btn-sm"><ArrowLeft />Back to app</Link> : <span className="faint small">Signed in as {user?.email}</span>}
      </div>
      <div className="onb-progress" aria-label={`Step ${step} of ${steps}`}>{Array.from({ length: steps }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}</div>
      <div className="faint small" style={{ marginBottom: 8 }}>Step {step} of {steps}</div>

      {step === 1 && (
        <div className="stack-lg">
          <div><h1 style={{ fontSize: '1.6rem' }}>Tell us about your organisation</h1><p className="muted" style={{ marginTop: 6 }}>This creates your workspace. You can change any of this later in Settings.</p></div>
          <div className="form-grid">
            <Field className="full" label="Organisation name" error={errors.name} htmlFor="o-name"><input id="o-name" className={cx('input', errors.name && 'invalid')} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lakeside Community Association" autoFocus /></Field>
            <Field label="Industry" htmlFor="o-ind"><select id="o-ind" className="select" value={f.industry} onChange={(e) => set('industry', e.target.value)}><option value="">Select an industry</option>{INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select></Field>
            <Field label="Website (optional)" error={errors.website} htmlFor="o-web"><input id="o-web" className={cx('input', errors.website && 'invalid')} value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="example.com" /></Field>
            <Field label="Country" htmlFor="o-country"><select id="o-country" className="select" value={f.country} onChange={(e) => set('country', e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Time zone" htmlFor="o-tz"><select id="o-tz" className="select" value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack-lg">
          <div><h1 style={{ fontSize: '1.6rem' }}>About you and your team</h1><p className="muted" style={{ marginTop: 6 }}>Helps us tailor defaults. Optional.</p></div>
          <div className="form-grid">
            <Field label="Your name" htmlFor="o-un"><input id="o-un" className="input" value={f.userName} onChange={(e) => set('userName', e.target.value)} /></Field>
            <Field label="Job title" htmlFor="o-jt"><input id="o-jt" className="input" value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="e.g. Operations Manager" /></Field>
            <Field className="full" label="Organisation size"><div className="row wrap">{ORG_SIZES.map((s) => <button key={s} type="button" className={cx('btn', f.size === s && 'btn-primary')} onClick={() => set('size', s)} aria-pressed={f.size === s}>{s}</button>)}</div></Field>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="stack-lg">
          <div><h1 style={{ fontSize: '1.6rem' }}>What do you want to communicate?</h1><p className="muted" style={{ marginTop: 6 }}>Select all that apply.</p></div>
          <div className="grid-2">{GOALS.map((g) => <label key={g} className={cx('choice', f.goals.includes(g) && 'selected')}><input type="checkbox" checked={f.goals.includes(g)} onChange={() => toggle('goals', g)} /><span>{g}</span></label>)}</div>
        </div>
      )}
      {step === 4 && (
        <div className="stack-lg">
          <div><h1 style={{ fontSize: '1.6rem' }}>Choose your channels</h1><p className="muted" style={{ marginTop: 6 }}>Pick the channels you plan to use.</p></div>
          <div className="stack">{[['email', Mail, 'Email', 'Newsletters, notices and rich updates'], ['sms', MessageSquare, 'SMS', 'Time-sensitive alerts and reminders'], ['whatsapp', MessageCircle, 'WhatsApp', 'Conversational updates with explicit opt-in']].map(([k, I, l, d]) => (
            <label key={k} className={cx('choice', f.channels.includes(k) && 'selected')}><input type="checkbox" checked={f.channels.includes(k)} onChange={() => toggle('channels', k)} /><span className={`ch ch-${k}`}><I /></span><span><span className="strong" style={{ display: 'block' }}>{l}</span><span className="muted small">{d}</span></span></label>
          ))}</div>
          <Callout icon={FlaskConical}>Channels run in <strong>demonstration mode</strong>. Sends, deliveries and replies are simulated so you can explore everything safely. You’ll be able to connect real providers when integrations become available.</Callout>
        </div>
      )}
      {step === 5 && (
        <div className="stack-lg">
          <div><h1 style={{ fontSize: '1.6rem' }}>Add your contacts</h1><p className="muted" style={{ marginTop: 6 }}>Import your own, or explore a fully populated sample workspace first.</p></div>
          <div className="stack">
            <button className="choice" onClick={() => finish('import')} disabled={busy}><Upload className="accent" /><span><span className="strong" style={{ display: 'block' }}>Import contacts</span><span className="muted small">Upload a CSV, map the columns and review issues before importing.</span></span></button>
            <button className="choice" onClick={() => finish('sample')} disabled={busy}><FlaskConical className="accent" /><span><span className="strong" style={{ display: 'block' }}>Load sample workspace</span><span className="muted small">40 contacts, campaigns, automations and inbox conversations from a property management company. You can reset or remove it later.</span></span></button>
            <button className="choice" onClick={() => finish('empty')} disabled={busy}><FileX className="faint" /><span><span className="strong" style={{ display: 'block' }}>Start with an empty workspace</span><span className="muted small">Add contacts later.</span></span></button>
          </div>
          {busy && <p className="muted small">Setting up your workspace…</p>}
        </div>
      )}

      <div className="between" style={{ marginTop: 36 }}>
        {step > 1 ? <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}><ArrowLeft />Back</button> : <span />}
        {step < 5 && <div className="row">{step > 1 && <button className="btn btn-ghost" onClick={() => setStep(5)}>Skip to finish</button>}<button className="btn btn-primary" onClick={next}>Continue</button></div>}
      </div>
    </div>
  );
}
