import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Send, CalendarClock, Users, Mail, MessageSquare, MessageCircle, AlertTriangle, CheckCircle2, Search, Info, FlaskConical, Copy } from 'lucide-react';
import { useOrg, getState } from '../../data/store';
import { PageHead, Field, Callout, Badge, ChannelIcon, Modal, Tabs, Empty, useToast } from '../../components/ui';
import Composer, { MessagePreview } from '../../components/Composer';
import { blankCampaign, planCampaign, estimateUsage, saveCampaign, executeCampaign, audienceLabel } from '../../services/campaigns';
import { REASON_LABEL } from '../../services/consent';
import { listMembers } from '../../services/contacts';
import { CAMPAIGN_CATEGORIES, CHANNEL_LABEL, TIMEZONES, categoryPurpose } from '../../lib/constants';
import { fullName, plural, fmtMoney, fmtDateTime, cx, smsInfo, renderTemplate } from '../../lib/util';
import { useAction, usePerm, useTitle } from '../../lib/hooks';
import { tx } from '../../data/store';
import { ctxOf } from '../../services/core';

const STEPS = ['Details', 'Audience', 'Channels', 'Compose', 'Schedule', 'Review'];
const CH_ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle };

// Time-zone helpers: interpret a local date-time string in a specific IANA zone.
function tzOffset(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts;
}
export function zonedToUtc(local, tz) {
  if (!local) return NaN;
  const [d, t] = local.split('T'); const [y, m, day] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, h, mi);
  let ts = guess - tzOffset(guess, tz);
  ts = guess - tzOffset(ts, tz);
  return ts;
}
function utcToLocalInput(ts, tz) {
  if (!ts) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export default function CampaignBuilder() {
  const { id } = useParams();
  const loc = useLocation();
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const toast = useToast();
  const can = usePerm();
  const existing = id ? o.campaigns.find((c) => c.id === id) : null;
  useTitle(existing ? `Edit ${existing.name}` : 'New campaign');
  const [step, setStep] = useState(0);
  const [c, setC] = useState(() => {
    const b = blankCampaign();
    b.fallback = { ...b.fallback, primary: o.org.settings.communication.fallback_primary, secondary: o.org.settings.communication.fallback_secondary, delay_minutes: o.org.settings.communication.fallback_delay };
    b.delivery_mode = o.org.settings.communication.default_mode;
    b.schedule.timezone = o.org.timezone;
    if (existing) return { ...b, ...existing, content: { ...b.content, ...existing.content }, fallback: { ...b.fallback, ...existing.fallback }, schedule: { ...b.schedule, ...existing.schedule, type: existing.status === 'scheduled' ? 'later' : 'now', at: existing.schedule_at ? utcToLocalInput(existing.schedule_at, existing.schedule?.timezone || o.org.timezone) : '' } };
    if (loc.state?.contactIds) b.audience = { type: 'contacts', ids: loc.state.contactIds };
    if (loc.state?.audience) b.audience = loc.state.audience;
    if (loc.state?.templateId) { const t = o.templates.find((x) => x.id === loc.state.templateId); if (t) { b.channels = [t.channel]; b.content[t.channel] = { ...b.content[t.channel], subject: t.subject, body: t.content }; b.name = t.name; } }
    return b;
  });
  const [errors, setErrors] = useState({});
  const [composeTab, setComposeTab] = useState(c.channels[0] || 'email');
  const [sampleId, setSampleId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setC((x) => ({ ...x, ...patch }));
  useEffect(() => { if (!c.channels.includes(composeTab) && c.channels[0]) setComposeTab(c.channels[0]); }, [c.channels]); // eslint-disable-line

  const s = getState();
  const plan = useMemo(() => planCampaign(s, c, { contacts: o.contacts, lists: o.lists, org: o.org }), [c, o]); // eslint-disable-line
  const allChannelPlan = useMemo(() => planCampaign(s, { ...c, channels: ['email', 'sms', 'whatsapp'], delivery_mode: 'all' }, { contacts: o.contacts, lists: o.lists, org: o.org }), [c.audience, c.category, o]); // eslint-disable-line
  const usage = useMemo(() => estimateUsage(plan, c, o.org), [plan, c, o.org]);
  const sample = o.contacts.find((x) => x.id === sampleId) || plan.recipients.find((x) => (composeTab === 'email' ? x.email : x.phone)) || plan.recipients[0];
  const multi = c.channels.length > 1;

  if (existing && !['draft', 'scheduled'].includes(existing.status)) return <Empty title="This campaign can no longer be edited" action={<Link className="btn" to={`/app/campaigns/${existing.id}`}>View results</Link>}>It has already been sent. Duplicate it to send a new version.</Empty>;
  if (!can('campaigns.send')) return <Empty title="You don't have permission to create campaigns">Ask a workspace admin to change your role.</Empty>;

  const validate = (i) => {
    const er = {};
    if (i === 0 && !c.name.trim()) er.name = 'Give the campaign a name.';
    if (i === 1) { if (c.audience.type !== 'all' && !c.audience.ids.length) er.audience = 'Choose at least one list, segment or contact.'; else if (!plan.recipients.length) er.audience = 'This audience has no contacts.'; }
    if (i === 2) {
      if (!c.channels.length) er.channels = 'Select at least one channel.';
      if (multi && c.delivery_mode === 'fallback') {
        if (!c.fallback.primary || !c.fallback.secondary) er.channels = 'Choose a primary and a fallback channel.';
        else if (c.fallback.primary === c.fallback.secondary) er.channels = 'Primary and fallback channels must differ.';
      }
    }
    if (i === 3) {
      c.channels.forEach((ch) => {
        const v = c.content[ch];
        if (!v.body?.trim()) er[`body_${ch}`] = `Write the ${CHANNEL_LABEL[ch]} message.`;
        if (ch === 'email' && !v.subject?.trim()) er[`subject_${ch}`] = 'Email needs a subject line.';
        if (ch === 'sms' && smsInfo(v.body || '').segments > 6) er[`body_${ch}`] = 'SMS is over 6 segments — shorten it.';
      });
    }
    if (i === 4 && c.schedule.type === 'later') {
      const ts = zonedToUtc(c.schedule.at, c.schedule.timezone);
      if (!c.schedule.at || isNaN(ts)) er.schedule = 'Pick a date and time.';
      else if (ts < Date.now() + 60000) er.schedule = 'The scheduled time must be at least a minute in the future.';
      else if (ts > Date.now() + 366 * 86400000) er.schedule = 'Schedule within the next 12 months.';
    }
    setErrors(er);
    if (i === 3 && Object.keys(er).length) { const bad = c.channels.find((ch) => er[`body_${ch}`] || er[`subject_${ch}`]); if (bad) setComposeTab(bad); }
    return !Object.keys(er).length;
  };
  const go = (i) => { if (i <= step || [...Array(i).keys()].every((k) => validate(k))) { setStep(i); window.scrollTo(0, 0); } };
  const record = (status) => {
    const schedule_at = status === 'scheduled' ? zonedToUtc(c.schedule.at, c.schedule.timezone) : null;
    const { id: _id, created_at, created_by, ...rest } = c;
    return { ...rest, name: c.name.trim(), status, schedule_at, channels: c.channels, fallback: multi ? c.fallback : { ...c.fallback } };
  };
  const saveDraft = () => {
    if (!c.name.trim()) { setStep(0); setErrors({ name: 'Name the campaign to save it as a draft.' }); return; }
    const saved = run((d, ctx) => saveCampaign(d, ctx, record('draft'), existing?.id), { success: 'Draft saved.' });
    if (saved) nav('/app/campaigns');
  };
  const launch = () => {
    setBusy(true);
    const scheduled = c.schedule.type === 'later';
    setTimeout(() => {
      try {
        const saved = tx((d) => {
          const ctx = ctxOf(d);
          const camp = saveCampaign(d, ctx, record(scheduled ? 'scheduled' : 'draft'), existing?.id);
          if (!scheduled) executeCampaign(d, ctx, camp.id);
          return camp;
        });
        toast.success(scheduled ? `Scheduled for ${fmtDateTime(saved.schedule_at, c.schedule.timezone)} (${c.schedule.timezone}).` : `Simulation started — ${plural(plan.sends.length, 'message')} queued. Results will update live.`);
        nav(`/app/campaigns/${saved.id}`);
      } catch (e) { console.error(e); toast.error('Could not start the campaign. Nothing was sent.'); setBusy(false); }
    }, 500);
  };

  const warnings = [];
  c.channels.forEach((ch) => { const pc = plan.perChannel[ch]; if (pc?.ineligible) warnings.push({ ch, n: pc.ineligible, reasons: pc.reasons }); });

  return (
    <>
      <PageHead crumbs={[{ label: 'Campaigns', to: '/app/campaigns' }, { label: existing ? existing.name : 'New campaign' }]} title={existing ? 'Edit campaign' : 'Create campaign'} actions={<><Link to="/app/campaigns" className="btn btn-ghost">Cancel</Link><button className="btn" onClick={saveDraft}><Save />Save draft</button></>} />
      <div className="steps" role="tablist" aria-label="Campaign steps">{STEPS.map((sname, i) => <button key={sname} className={cx('step-pill', i < step && 'done', i === step && 'current')} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}><span className="num">{i + 1}</span>{sname}</button>)}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }} className="builder-grid">
        <div className="card card-body stack-lg">
          {step === 0 && <>
            <div><h2 style={{ fontSize: '1.1rem' }}>Campaign details</h2><p className="muted small">Internal information to help your team find and understand this campaign.</p></div>
            <Field label="Campaign name" error={errors.name}><input className={cx('input', errors.name && 'invalid')} value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Scheduled Water Maintenance" autoFocus /></Field>
            <Field label="Internal description (optional)"><textarea className="textarea" style={{ minHeight: 70 }} value={c.description} onChange={(e) => set({ description: e.target.value })} placeholder="Not shown to recipients" /></Field>
            <Field label="Category" hint={c.category === 'marketing' ? 'Marketing campaigns only reach contacts with explicit marketing consent.' : 'Operational communications follow your workspace consent rules.'}>
              <div className="grid-3">{Object.entries(CAMPAIGN_CATEGORIES).map(([k, v]) => <label key={k} className={cx('choice', c.category === k && 'selected')}><input type="radio" name="cat" checked={c.category === k} onChange={() => set({ category: k })} /><span className="small">{v}</span></label>)}</div>
            </Field>
            {c.category === 'emergency' && <Callout tone="warn">Emergency notifications still respect opt-outs and suppression. Keep messages short and actionable.</Callout>}
          </>}

          {step === 1 && <AudienceStep c={c} set={set} plan={allChannelPlan} errors={errors} />}

          {step === 2 && <>
            <div><h2 style={{ fontSize: '1.1rem' }}>Channels</h2><p className="muted small">Choose one or more. Eligibility is based on contact details and consent for a {categoryPurpose(c.category)} message.</p></div>
            {errors.channels && <Callout tone="err">{errors.channels}</Callout>}
            <div className="grid-3">{['email', 'sms', 'whatsapp'].map((ch) => { const I = CH_ICON[ch]; const pc = allChannelPlan.perChannel[ch]; const on = c.channels.includes(ch); const st = o.org.settings.channels[ch]?.status; return (
              <label key={ch} className={cx('choice', on && 'selected')} style={{ flexDirection: 'column', gap: 8 }}>
                <span className="row"><input type="checkbox" checked={on} onChange={() => set({ channels: on ? c.channels.filter((x) => x !== ch) : [...c.channels, ch] })} /><span className={`ch ch-${ch}`}><I /></span><span className="strong">{CHANNEL_LABEL[ch]}</span></span>
                <span className="small"><strong>{pc.eligible}</strong> of {allChannelPlan.recipients.length} eligible</span>
                <span className="faint xs">{st === 'demo' ? 'Demo mode — simulated' : st === 'not_connected' ? 'Not connected — simulated sends only' : ''}</span>
              </label>); })}</div>
            {multi && <>
              <div className="label">How should a multi-channel campaign behave?</div>
              <div className="grid-2">
                <label className={cx('choice', c.delivery_mode === 'all' && 'selected')}><input type="radio" name="mode" checked={c.delivery_mode === 'all'} onChange={() => set({ delivery_mode: 'all' })} /><span><span className="strong" style={{ display: 'block' }}>Send through all selected channels</span><span className="muted small">Every eligible recipient receives a message on <em>each</em> selected channel. Best for urgent notices where redundancy matters.</span></span></label>
                <label className={cx('choice', c.delivery_mode === 'fallback' && 'selected')}><input type="radio" name="mode" checked={c.delivery_mode === 'fallback'} onChange={() => set({ delivery_mode: 'fallback', fallback: { ...c.fallback, primary: c.channels.includes(c.fallback.primary) ? c.fallback.primary : c.channels[0], secondary: c.channels.includes(c.fallback.secondary) && c.fallback.secondary !== c.channels[0] ? c.fallback.secondary : c.channels[1] } })} /><span><span className="strong" style={{ display: 'block' }}>Primary channel with fallback</span><span className="muted small">Each recipient gets <em>one</em> message on the primary channel; the fallback is only used if that fails or isn’t available.</span></span></label>
              </div>
              {c.delivery_mode === 'fallback' && (
                <div className="card card-body form-grid" style={{ background: 'var(--bg)' }}>
                  <Field label="Primary channel"><select className="select" value={c.fallback.primary} onChange={(e) => set({ fallback: { ...c.fallback, primary: e.target.value } })}>{c.channels.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}</select></Field>
                  <Field label="Fallback channel"><select className="select" value={c.fallback.secondary} onChange={(e) => set({ fallback: { ...c.fallback, secondary: e.target.value } })}>{c.channels.filter((ch) => ch !== c.fallback.primary).map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}</select></Field>
                  <Field label="Fallback condition"><select className="select" value={c.fallback.condition} onChange={(e) => set({ fallback: { ...c.fallback, condition: e.target.value } })}><option value="failed">Primary message fails</option><option value="not_delivered">Primary fails or has no delivery confirmation</option></select></Field>
                  <Field label="Fallback delay (minutes)" hint="In demo mode each minute is compressed to one second."><input type="number" min="0" max="1440" className="input" value={c.fallback.delay_minutes} onChange={(e) => set({ fallback: { ...c.fallback, delay_minutes: Math.max(0, Number(e.target.value)) } })} /></Field>
                  <Field label="If the primary channel is unavailable for a contact" className="full"><select className="select" value={c.fallback.unavailable} onChange={(e) => set({ fallback: { ...c.fallback, unavailable: e.target.value } })}><option value="use_fallback">Send on the fallback channel immediately</option><option value="skip">Skip the contact</option></select></Field>
                </div>
              )}
            </>}
          </>}

          {step === 3 && <>
            <div className="between wrap"><div><h2 style={{ fontSize: '1.1rem' }}>Compose</h2><p className="muted small">{multi ? 'Write a version for each channel — each can be tailored.' : 'Write your message.'}</p></div>
              <Field label="Preview as"><select className="select input-sm" value={sample?.id || ''} onChange={(e) => setSampleId(e.target.value)}>{plan.recipients.slice(0, 200).map((x) => <option key={x.id} value={x.id}>{fullName(x)}</option>)}</select></Field></div>
            {multi && <Tabs value={composeTab} onChange={setComposeTab} tabs={c.channels.map((ch) => ({ value: ch, label: <span className="row" style={{ gap: 6 }}><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}{(errors[`body_${ch}`] || errors[`subject_${ch}`]) && <span className="err">•</span>}{c.content[ch].body ? <CheckCircle2 size={13} className="ok" /> : null}</span> }))} />}
            <div className="row wrap">
              <select className="select input-sm" style={{ width: 'auto' }} value="" onChange={(e) => { const t = o.templates.find((x) => x.id === e.target.value); if (t) set({ content: { ...c.content, [composeTab]: { ...c.content[composeTab], subject: t.subject || c.content[composeTab].subject, body: t.content } } }); }} aria-label="Load a template"><option value="">Load {CHANNEL_LABEL[composeTab]} template…</option>{o.templates.filter((t) => t.channel === composeTab).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              {multi && c.channels.filter((ch) => ch !== composeTab && c.content[ch].body).map((ch) => <button key={ch} className="btn btn-sm" onClick={() => set({ content: { ...c.content, [composeTab]: { ...c.content[composeTab], body: c.content[ch].body.replace(/\*\*|_|^# /gm, '') } } })}><Copy />Copy text from {CHANNEL_LABEL[ch]}</button>)}
            </div>
            {c.channels.map((ch) => ch === composeTab && <Composer key={ch} channel={ch} value={c.content[ch]} onChange={(v) => set({ content: { ...c.content, [ch]: v } })} contact={sample} org={o.org} errors={{ body: errors[`body_${ch}`], subject: errors[`subject_${ch}`] }} />)}
            <label className="check"><input type="checkbox" checked={c.request_ack} onChange={(e) => set({ request_ack: e.target.checked })} />Request acknowledgement — replies of “YES” are recorded as acknowledged</label>
            {c.request_ack && !c.channels.every((ch) => /yes/i.test(c.content[ch].body || '')) && <Callout tone="warn">Tell recipients how to acknowledge, e.g. “Reply YES to confirm.”</Callout>}
          </>}

          {step === 4 && <>
            <div><h2 style={{ fontSize: '1.1rem' }}>Schedule</h2><p className="muted small">Send immediately, pick a time, or keep it as a draft.</p></div>
            <div className="grid-3">{[['now', Send, 'Send now', 'Start the simulation as soon as you confirm.'], ['later', CalendarClock, 'Schedule for later', 'Choose a date, time and time zone.'], ['draft', Save, 'Save as draft', 'Come back and finish later.']].map(([k, I, l, d]) => (
              <label key={k} className={cx('choice', c.schedule.type === k && 'selected')}><input type="radio" name="sched" checked={c.schedule.type === k} onChange={() => set({ schedule: { ...c.schedule, type: k } })} /><span><span className="strong row" style={{ gap: 6 }}><I size={15} />{l}</span><span className="muted small">{d}</span></span></label>))}</div>
            {c.schedule.type === 'later' && (
              <div className="form-grid">
                <Field label="Date & time" error={errors.schedule}><input type="datetime-local" className={cx('input', errors.schedule && 'invalid')} value={c.schedule.at} onChange={(e) => set({ schedule: { ...c.schedule, at: e.target.value } })} /></Field>
                <Field label="Time zone"><select className="select" value={c.schedule.timezone} onChange={(e) => set({ schedule: { ...c.schedule, timezone: e.target.value } })}>{[...new Set([o.org.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}</select></Field>
                {c.schedule.at && !errors.schedule && !isNaN(zonedToUtc(c.schedule.at, c.schedule.timezone)) && <p className="faint small full">Sends at {fmtDateTime(zonedToUtc(c.schedule.at, c.schedule.timezone), c.schedule.timezone)} {c.schedule.timezone} · your local time {fmtDateTime(zonedToUtc(c.schedule.at, c.schedule.timezone))}.</p>}
                {o.org.settings.communication.quiet_hours && c.schedule.at && (() => { const h = Number(c.schedule.at.split('T')[1]?.slice(0, 2)); return h >= 21 || h < 8; })() && <div className="full"><Callout tone="warn">This is within quiet hours (9 PM – 8 AM). Consider a daytime send, especially for SMS.</Callout></div>}
              </div>
            )}
            {c.schedule.type === 'draft' && <Callout>Choosing “Save as draft” and continuing will save without sending. You can also use “Save draft” at any time.</Callout>}
          </>}

          {step === 5 && <>
            <div><h2 style={{ fontSize: '1.1rem' }}>Review and confirm</h2><p className="muted small">Check everything before {c.schedule.type === 'later' ? 'scheduling' : 'sending'}.</p></div>
            <dl className="kv">
              <dt>Campaign</dt><dd className="strong">{c.name}</dd>
              <dt>Category</dt><dd>{CAMPAIGN_CATEGORIES[c.category]}</dd>
              <dt>Audience</dt><dd>{audienceLabel(c, o.lists)} · {plural(plan.recipients.length, 'recipient')}</dd>
              <dt>Channels</dt><dd>{c.channels.map((ch) => CHANNEL_LABEL[ch]).join(' + ')}{multi && (c.delivery_mode === 'fallback' ? ` — ${CHANNEL_LABEL[c.fallback.primary]} first, fallback to ${CHANNEL_LABEL[c.fallback.secondary]} if ${c.fallback.condition === 'failed' ? 'it fails' : 'not delivered'} after ${c.fallback.delay_minutes} min` : ' — all channels')}</dd>
              <dt>Schedule</dt><dd>{c.schedule.type === 'later' ? `${fmtDateTime(zonedToUtc(c.schedule.at, c.schedule.timezone), c.schedule.timezone)} (${c.schedule.timezone})` : c.schedule.type === 'draft' ? 'Save as draft' : 'Immediately after confirmation'}</dd>
              <dt>Messages</dt><dd>{plural(plan.sends.length, 'message')} to {plural(new Set(plan.sends.map((x) => x.contact.id)).size, 'contact')}{plan.unreachable.length ? <span className="warn"> · {plan.unreachable.length} can’t be reached</span> : ''}</dd>
              <dt>Acknowledgement</dt><dd>{c.request_ack ? 'Requested (reply YES)' : 'Not requested'}</dd>
            </dl>
            {warnings.length > 0 && <Callout tone="warn"><div className="stack" style={{ gap: 6 }}><strong>Some recipients won’t receive every version</strong>{warnings.map((w) => <div key={w.ch}>{CHANNEL_LABEL[w.ch]}: {w.n} excluded — {Object.entries(w.reasons).map(([r, n]) => `${n} ${REASON_LABEL[r].toLowerCase()}`).join(', ')}</div>)}<span className="small muted">Excluded contacts are listed on the results page with their reasons.</span></div></Callout>}
            {!plan.sends.length && <Callout tone="err">No recipients are eligible on the selected channels. Change the audience, channels or category.</Callout>}
            <div className="label">Message previews ({sample ? fullName(sample) : 'sample'})</div>
            <div className="grid-2">{c.channels.map((ch) => <div key={ch} className="stack" style={{ gap: 8 }}><span className="row small"><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}{ch === 'sms' && <span className="faint">· {smsInfo(renderTemplate(c.content.sms.body, sample, o.org)).segments} segment(s)</span>}</span><MessagePreview channel={ch} subject={c.content[ch].subject} body={c.content[ch].body} contact={sample} org={o.org} /></div>)}</div>
            <Callout icon={FlaskConical}>Demonstration mode: confirming creates real records and simulates delivery. <strong>No real emails, texts or WhatsApp messages are sent.</strong></Callout>
          </>}

          <div className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            {step > 0 ? <button className="btn btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft />Back</button> : <span />}
            {step < 5 ? <button className="btn btn-primary" onClick={() => { if (step === 4 && c.schedule.type === 'draft') return saveDraft(); go(step + 1); }}>{step === 4 && c.schedule.type === 'draft' ? 'Save draft' : 'Continue'}<ArrowRight /></button>
              : <button className="btn btn-primary btn-lg" disabled={!plan.sends.length} onClick={() => [0, 1, 2, 3, 4].every(validate) ? setConfirming(true) : toast.error('Some steps need attention.')}>{c.schedule.type === 'later' ? <><CalendarClock />Schedule campaign</> : <><Send />Send campaign</>}</button>}
          </div>
        </div>

        <aside className="card card-body stack" style={{ position: 'sticky', top: 80 }}>
          <div className="label">Summary</div>
          <div className="row-3"><span className="avatar" style={{ borderRadius: 8 }}><Users size={15} /></span><div><div className="strong" style={{ fontSize: '1.3rem' }}>{plan.recipients.length}</div><div className="faint xs">recipients in audience</div></div></div>
          <div className="stack" style={{ gap: 10 }}>{['email', 'sms', 'whatsapp'].map((ch) => { const pc = allChannelPlan.perChannel[ch]; const on = c.channels.includes(ch); return (
            <div key={ch} style={{ opacity: on || step < 2 ? 1 : 0.45 }}><div className="between small"><span className="row" style={{ gap: 6 }}><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}</span><span><strong>{pc.eligible}</strong><span className="faint"> eligible</span></span></div>
              <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${allChannelPlan.recipients.length ? (pc.eligible / allChannelPlan.recipients.length) * 100 : 0}%`, background: `var(--ch-${ch})` }} /></div></div>); })}</div>
          {c.channels.length > 0 && <>
            <div className="divider" style={{ margin: '4px 0' }} />
            <div className="label">Estimated usage <span className="faint">(illustrative)</span></div>
            <div className="small stack" style={{ gap: 4 }}>
              {usage.email > 0 && <div className="between"><span>Emails</span><span>{usage.email}</span></div>}
              {usage.sms > 0 && <div className="between"><span>SMS ({usage.smsSegments} segments)</span><span>{usage.sms}</span></div>}
              {usage.whatsapp > 0 && <div className="between"><span>WhatsApp</span><span>{usage.whatsapp}</span></div>}
              <div className="between strong"><span>Est. cost</span><span>{fmtMoney(usage.cost, o.org.settings.currency)}</span></div>
              {c.delivery_mode === 'fallback' && multi && <span className="faint xs">Fallback sends are extra and only counted if they happen.</span>}
            </div>
          </>}
          <p className="faint xs row" style={{ gap: 6, alignItems: 'flex-start' }}><Info size={13} style={{ marginTop: 2, flex: 'none' }} />Counts update as you change the audience, channels and category.</p>
        </aside>
      </div>
      <style>{`@media (max-width: 1100px){ .builder-grid{ grid-template-columns: 1fr !important; } .builder-grid aside{ position: static !important; } }`}</style>

      {confirming && (
        <Modal title={c.schedule.type === 'later' ? 'Schedule this campaign?' : 'Send this campaign now?'} onClose={() => !busy && setConfirming(false)} footer={<><button className="btn" disabled={busy} onClick={() => setConfirming(false)}>Go back</button><button className="btn btn-primary" disabled={busy} onClick={launch}>{busy ? 'Starting…' : c.schedule.type === 'later' ? 'Confirm schedule' : 'Confirm & send'}</button></>}>
          <div className="stack">
            <p><strong>{c.name}</strong> will {c.schedule.type === 'later' ? `be sent on ${fmtDateTime(zonedToUtc(c.schedule.at, c.schedule.timezone), c.schedule.timezone)}` : 'start sending immediately'} — {plural(plan.sends.length, 'simulated message')} to {plural(new Set(plan.sends.map((x) => x.contact.id)).size, 'contact')}.</p>
            {plan.excluded.length > 0 && <p className="muted small">{plan.excluded.length} recipient/channel combinations will be skipped for consent or missing details.</p>}
            <Callout icon={FlaskConical}>This is a simulation. No real messages will be delivered to anyone.</Callout>
          </div>
        </Modal>
      )}
    </>
  );
}

function AudienceStep({ c, set, plan, errors }) {
  const o = useOrg();
  const [q, setQ] = useState('');
  const s = getState();
  const statics = o.lists.filter((l) => l.type === 'static');
  const segs = o.lists.filter((l) => l.type === 'segment');
  const toggleId = (id) => set({ audience: { ...c.audience, ids: c.audience.ids.includes(id) ? c.audience.ids.filter((x) => x !== id) : [...c.audience.ids, id] } });
  const typeChange = (type) => set({ audience: { type, ids: type === c.audience.type ? c.audience.ids : [] } });
  const reasons = {};
  Object.values(plan.perChannel).forEach((pc) => Object.entries(pc.reasons).forEach(([r, n]) => (reasons[r] = Math.max(reasons[r] || 0, n))));
  return (
    <>
      <div><h2 style={{ fontSize: '1.1rem' }}>Select audience</h2><p className="muted small">Who should receive this campaign?</p></div>
      {errors.audience && <Callout tone="err">{errors.audience}</Callout>}
      <div className="grid-4">{[['all', 'All contacts'], ['list', 'Lists'], ['segment', 'Segments'], ['contacts', 'Pick contacts']].map(([k, l]) => <label key={k} className={cx('choice', c.audience.type === k && 'selected')}><input type="radio" name="aud" checked={c.audience.type === k} onChange={() => typeChange(k)} /><span className="small strong">{l}</span></label>)}</div>
      {(c.audience.type === 'list' || c.audience.type === 'segment') && (
        <div className="card" style={{ background: 'var(--bg)' }}>{(c.audience.type === 'list' ? statics : segs).map((l) => (
          <label key={l.id} className="between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}><span className="check"><input type="checkbox" checked={c.audience.ids.includes(l.id)} onChange={() => toggleId(l.id)} />{l.name}</span><span className="faint small">{listMembers(s, l, o.contacts).length} contacts</span></label>))}
          {!(c.audience.type === 'list' ? statics : segs).length && <div className="faint small" style={{ padding: 16 }}>None yet. <Link className="accent" to="/app/lists">Create one</Link>.</div>}
        </div>
      )}
      {c.audience.type === 'contacts' && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="input-icon"><Search /><input className="input" placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" /></div>
          <div className="card" style={{ maxHeight: 300, overflowY: 'auto', background: 'var(--bg)' }}>
            {o.contacts.filter((x) => x.status !== 'archived' && (!q || fullName(x).toLowerCase().includes(q.toLowerCase()))).map((x) => <label key={x.id} className="between" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}><span className="check"><input type="checkbox" checked={c.audience.ids.includes(x.id)} onChange={() => toggleId(x.id)} />{fullName(x)}</span><span className="faint xs">{x.email || x.phone}</span></label>)}
          </div>
          <span className="faint small">{c.audience.ids.length} selected</span>
        </div>
      )}
      <div className="card card-body" style={{ background: 'var(--bg)' }}>
        <div className="between"><span className="strong">{plural(plan.recipients.length, 'recipient')}</span><Badge tone="accent">{c.category === 'marketing' ? 'Marketing consent rules' : 'Operational consent rules'}</Badge></div>
        <div className="table-wrap" style={{ marginTop: 10 }}><table className="table"><thead><tr><th>Channel</th><th>Eligible</th><th>Not eligible</th><th>Why</th></tr></thead><tbody>
          {['email', 'sms', 'whatsapp'].map((ch) => { const pc = plan.perChannel[ch]; return <tr key={ch}><td><span className="row"><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}</span></td><td className="strong ok">{pc.eligible}</td><td className={pc.ineligible ? 'warn' : 'faint'}>{pc.ineligible}</td><td className="muted small">{Object.entries(pc.reasons).map(([r, n]) => `${n} ${REASON_LABEL[r].toLowerCase()}`).join(' · ') || '—'}</td></tr>; })}
        </tbody></table></div>
        {plan.recipients.length > 0 && <p className="faint xs" style={{ marginTop: 8 }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> Contacts are never messaged without the consent your rules require.</p>}
      </div>
    </>
  );
}
