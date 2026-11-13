import { Link } from 'react-router-dom';
import { Check, Users, Send, Layers, Workflow, Inbox, BarChart3, ShieldCheck, ArrowRight } from 'lucide-react';
import { useTitle } from '../../lib/hooks';

const SECTIONS = [
  ['contacts', Users, 'Contact management', 'A single, trustworthy record for everyone you communicate with.', ['Searchable, filterable contact table with bulk actions', 'Tags, static lists and dynamic segments with AND/OR rules', 'CSV import with column mapping, validation and duplicate handling', 'A full timeline of messages, replies, automations and changes'],
    <MiniTable key="t" rows={[['Maria Gonzalez', 'Building A · A-101', 'Resident, VIP'], ['Catherine Wells', 'Wells Holdings LLC', 'Owner'], ['Carlos Diaz', 'Maintenance Lead', 'Maintenance']]} />],
  ['campaigns', Send, 'Campaign management', 'A guided builder that makes the right choice the easy one.', ['Audience from lists, segments or hand-picked contacts', 'Live eligibility per channel before you send', 'Send now, schedule with time-zone awareness, or save a draft', 'Per-recipient results with reasons for every failure'],
    <MiniSteps key="s" />],
  ['messaging', Layers, 'Unified messaging', 'Compose once, then tailor each channel’s version.', ['Email with subject, formatting and preview', 'SMS with live character and segment counts', 'WhatsApp with template placeholders', 'Send on all channels, or use a primary channel with fallback'],
    <MiniPhone key="p" />],
  ['automation', Workflow, 'Automation workflows', 'A visual builder for the communications you repeat.', ['Triggers from contact changes, messages, replies, dates and campaigns', 'Branching conditions on attributes, tags, lists and consent', 'Actions to send, tag, update fields, assign and notify', 'Test any workflow against a real contact before activating'],
    <MiniFlow key="f" />],
  ['inbox', Inbox, 'Central inbox', 'Replies from every channel, handled as a team.', ['Email, SMS and WhatsApp threads in one place', 'Assignment, internal notes, and open/closed status', 'The contact’s profile and history beside every conversation', 'Opt-out keywords handled automatically'],
    <MiniInbox key="i" />],
  ['analytics', BarChart3, 'Analytics and reporting', 'Numbers you can trace back to the underlying records.', ['Volume, delivery, failure and response trends', 'Filter by date range, channel and campaign', 'Sent, delivered, read, failed, replied and acknowledged kept distinct', 'Export reports and recipient-level results to CSV'],
    <MiniBars key="b" />],
  ['consent', ShieldCheck, 'Consent management', 'Permission-based communication by design.', ['Consent per contact, channel and purpose — with source and timestamps', 'Suppression list and unsubscribe handling', 'Operational vs. marketing rules, configurable per workspace', 'Warnings whenever an audience includes ineligible recipients'],
    <MiniConsent key="c" />],
];

function MiniTable({ rows }) { return <div className="mk-card" style={{ padding: 0 }}><table className="table"><thead><tr><th>Name</th><th>Details</th><th>Tags</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td className="strong">{r[0]}</td><td className="muted">{r[1]}</td><td>{r[2].split(', ').map((t) => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}</td></tr>)}</tbody></table></div>; }
function MiniSteps() { return <div className="mk-card stack">{['Details', 'Audience', 'Channels', 'Compose', 'Schedule', 'Review'].map((s, i) => <div key={s} className="row"><span className="step-pill done" style={{ padding: 0 }}><span className="num">{i + 1}</span></span><span className={i < 3 ? '' : 'muted'}>{s}</span>{i === 2 && <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>Email + SMS fallback</span>}</div>)}</div>; }
function MiniPhone() { return <div className="mk-card"><div className="preview-phone"><div className="pp-head">Northstar · SMS</div><div className="pp-bubble">Hi Maria, we will be carrying out scheduled water maintenance at Building A tomorrow between 10:00 AM and 2:00 PM.</div><div className="faint xs" style={{ marginTop: 10, textAlign: 'center' }}>142 characters · 1 segment · GSM-7</div></div></div>; }
function MiniFlow() { return <div className="mk-card"><div className="flow">{[['ni-trigger', 'Trigger', 'Contact added to Building A'], ['ni-condition', 'Condition', 'Email consent?'], ['ni-action', 'Action', 'Send welcome email']].map(([c, k, t], i) => <div key={k} className="col" style={{ alignItems: 'center', gap: 0 }}>{i > 0 && <div className="connector" />}<div className="node" style={{ width: 260 }}><div className="node-head"><span className={`node-icon ${c}`}><Workflow size={13} /></span><div><div className="node-kind">{k}</div><div className="node-title">{t}</div></div></div></div></div>)}</div></div>; }
function MiniInbox() { return <div className="mk-card stack"><div className="bubble-wrap"><div className="bubble out">We will be carrying out scheduled water maintenance at Building A tomorrow…</div></div><div className="bubble-wrap"><div className="bubble in">Thanks. Will the water be restored by 3 PM?</div></div><div className="bubble note">Internal note: confirmed with plumbing — back by 2 PM.</div></div>; }
function MiniBars() { const v = [[62, 3], [74, 5], [58, 2], [80, 4], [91, 6], [70, 3]]; return <div className="mk-card"><div className="row" style={{ alignItems: 'flex-end', gap: 14, height: 160 }}>{v.map(([d, f], i) => <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ height: f * 4, background: '#e66767', borderRadius: '3px 3px 0 0' }} /><div style={{ height: d * 1.4, background: '#1a9e8b' }} /></div>)}</div><div className="legend" style={{ marginTop: 12 }}><span><i style={{ background: '#1a9e8b' }} />Delivered</span><span><i style={{ background: '#e66767' }} />Failed</span></div></div>; }
function MiniConsent() { return <div className="mk-card stack small">{[['Email', 'Opted in · Operational & marketing', 'ok'], ['SMS', 'Opted out · Keyword “STOP”', 'err'], ['WhatsApp', 'No consent recorded', 'neutral']].map(([c, s, t]) => <div key={c} className="between"><span className="strong">{c}</span><span className={`badge badge-${t}`}><span className="dot" />{s}</span></div>)}</div>; }

export default function Product() {
  useTitle('Product');
  return (
    <>
      <section className="mk-hero" style={{ paddingBottom: 72 }}>
        <div className="mk-container">
          <div className="mk-eyebrow">The platform</div>
          <h1 className="mk-h1" style={{ fontSize: 'clamp(2.2rem,5vw,3.8rem)' }}>A communications operating system for your organisation.</h1>
          <p className="mk-lead">Contacts, campaigns, automations, conversations and analytics — connected to one underlying record of every interaction.</p>
          <div className="row wrap" style={{ justifyContent: 'center', marginTop: 28, gap: 8 }}>{SECTIONS.map(([id, , t]) => <a key={id} href={`#${id}`} className="btn btn-sm">{t}</a>)}</div>
        </div>
      </section>
      <div className="mk-container">
        {SECTIONS.map(([id, I, title, lead, bullets, visual], i) => (
          <section key={id} id={id} className={`mk-feature ${i % 2 ? 'flip' : ''}`}>
            <div><div className="ic" style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', marginBottom: 16 }}><I size={19} /></div><h2 className="mk-h2" style={{ fontSize: '2rem' }}>{title}</h2><p className="mk-lead" style={{ marginTop: 12 }}>{lead}</p><ul>{bullets.map((b) => <li key={b}><Check />{b}</li>)}</ul></div>
            <div>{visual}</div>
          </section>
        ))}
      </div>
      <section className="mk-section" style={{ textAlign: 'center', borderBottom: 0 }}>
        <h2 className="mk-h2">See it working with real sample data.</h2>
        <div className="row" style={{ justifyContent: 'center', marginTop: 24, gap: 12 }}><Link to="/signup" className="btn btn-primary btn-lg">Get Started <ArrowRight /></Link><Link to="/login?demo=1" className="btn btn-lg">Open the demo workspace</Link></div>
      </section>
    </>
  );
}
