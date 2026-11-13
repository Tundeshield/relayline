import { Link } from 'react-router-dom';
import { Users, Send, Workflow, Inbox, Activity, BarChart3, Mail, MessageSquare, MessageCircle, Building2, Wrench, HeartHandshake, GraduationCap, Church, Briefcase, Check, ArrowRight, Layers, ShieldCheck } from 'lucide-react';
import ProductPreview from '../../components/ProductPreview';
import { PLANS } from '../../lib/constants';
import { useTitle } from '../../lib/hooks';

export const FAQ = [
  ['Does Relayline send real messages today?', 'Not yet. This version is a working product prototype: campaigns, deliveries, failures and replies are simulated so you can explore every workflow without connecting a provider or sharing API keys. Provider integrations are planned.'],
  ['Which channels are supported?', 'Email, SMS and WhatsApp. You can send through one channel, through several at once, or through a primary channel with an automatic fallback when delivery fails.'],
  ['How does Relayline handle consent?', 'Consent is tracked per contact, per channel and per purpose (operational or marketing), including its source and timestamps. Ineligible recipients are flagged before you send, STOP replies are honoured, and suppressed contacts are excluded. You remain responsible for meeting the rules in your jurisdiction.'],
  ['Can I see whether people read my messages?', 'Only where the channel supports it. WhatsApp can report reads; email and SMS generally cannot, so Relayline reports delivery, failures and replies for those channels rather than guessing at read rates.'],
  ['Can my whole team work in one inbox?', 'Yes. Replies from every channel land in a shared inbox where conversations can be assigned, annotated with internal notes, and closed.'],
  ['How is usage billed?', 'Plans cover the platform. When provider integrations launch, messaging usage (for example SMS segments or WhatsApp conversations) will be billed separately or according to your plan.'],
];

const INDUSTRIES = [
  [Building2, 'Property management', 'Maintenance notices, rent reminders and building-wide alerts — with replies from residents in one inbox.'],
  [Wrench, 'Field services', 'Appointment confirmations, technician en-route updates and follow-ups after each job.'],
  [HeartHandshake, 'Nonprofits & memberships', 'Renewal reminders, event invitations and volunteer coordination that respects every opt-out.'],
  [GraduationCap, 'Education', 'Closures, schedule changes and parent updates delivered on the channel families actually use.'],
  [Church, 'Faith communities', 'Service updates, group announcements and pastoral follow-ups for every ministry.'],
  [Briefcase, 'Operations teams', 'Customer updates, incident notices and internal announcements from one coordinated workspace.'],
];

export function PricingCards() {
  return (
    <div className="grid-3">
      {Object.entries(PLANS).map(([key, p]) => (
        <div key={key} className={`mk-card price-card ${key === 'growth' ? 'featured' : ''}`}>
          <div className="between"><h3 className="mk-h3">{p.name}</h3>{key === 'growth' && <span className="badge badge-accent">Most popular</span>}</div>
          <div><span className="price">${p.price}</span><span className="muted"> / month</span></div>
          <p className="muted small">{key === 'starter' ? 'For small teams getting their communications in one place.' : key === 'growth' ? 'For organisations coordinating several channels and automations.' : 'For larger teams that need control, roles and scale.'}</p>
          <ul>{p.features.map((f) => <li key={f}><Check />{f}</li>)}</ul>
          <div className="grow" />
          <Link to={`/signup?plan=${key}`} className={`btn btn-lg ${key === 'growth' ? 'btn-primary' : ''}`}>Get Started</Link>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  useTitle('Every important conversation. One place.');
  return (
    <>
      <section className="mk-hero">
        <div className="mk-container" style={{ position: 'relative' }}>
          <div className="mk-eyebrow">Omnichannel communications workspace</div>
          <h1 className="mk-h1">Every important conversation.<br />One place.</h1>
          <p className="mk-lead">Manage your contacts, coordinate communications across channels, and automate the updates that keep your organisation connected.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 32, gap: 12 }}>
            <Link to="/signup" className="btn btn-primary btn-lg">Get Started <ArrowRight /></Link>
            <Link to="/product" className="btn btn-lg">Explore the Platform</Link>
          </div>
          <p className="faint small" style={{ marginTop: 16 }}>Try the full demo workspace — no credit card or provider account required.</p>
          <div className="mk-hero-shot"><ProductPreview /></div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container grid-2" style={{ gap: 56, alignItems: 'center' }}>
          <div>
            <div className="mk-eyebrow">The problem</div>
            <h2 className="mk-h2">Your communications are scattered.</h2>
            <p className="mk-lead" style={{ marginTop: 18 }}>Email lives in one tool, texts in another, WhatsApp on someone's phone. Contact lists drift out of date, nobody is sure who opted out, and replies get lost between inboxes.</p>
          </div>
          <div className="grid-2">
            {[['Separate tools', 'A different app for every channel, each with its own contact list.'], ['No shared history', 'Nobody can see who heard what, on which channel, and when.'], ['Unclear consent', 'Opt-outs live in spreadsheets — or in someone’s memory.'], ['Lost replies', 'Responses land in personal inboxes and phones, not with the team.']].map(([n, t]) => (
              <div key={t} className="mk-card"><h3 className="mk-h3">{n}</h3><p>{t}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div style={{ maxWidth: 720 }}>
            <div className="mk-eyebrow">The solution</div>
            <h2 className="mk-h2">One coordinated communications workspace.</h2>
            <p className="mk-lead" style={{ marginTop: 18 }}>Relayline brings your audience, your messages, your automations and your replies together — so every team member can see who you communicate with, what you sent, which channel you used, and what happened afterwards.</p>
          </div>
          <div className="grid-3" style={{ marginTop: 48 }}>
            {[[Users, 'Contact management', 'One clean record per person, with tags, lists, custom fields and a complete communication history.'],
              [Send, 'Omnichannel messaging', 'Compose once, tailor per channel, and choose whether to send everywhere or fall back when delivery fails.'],
              [Workflow, 'Automated workflows', 'Trigger messages from contact changes, replies, failures and dates — with conditions that respect consent.'],
              [Inbox, 'Centralised inbox', 'Every reply from email, SMS and WhatsApp in one shared inbox, with assignment and internal notes.'],
              [Activity, 'Delivery monitoring', 'Track each message from queued to delivered or failed, with reasons, retries and fallbacks.'],
              [BarChart3, 'Communication analytics', 'Volume, delivery and response trends by channel and campaign — and only read rates where channels support them.']].map(([I, t, d]) => (
              <div key={t} className="mk-card"><div className="ic"><I /></div><h3 className="mk-h3">{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-eyebrow">Supported channels</div>
          <h2 className="mk-h2">Reach people where they already are.</h2>
          <div className="grid-3" style={{ marginTop: 40 }}>
            {[[Mail, 'email', 'Email', 'Rich updates, newsletters and documents. Subject lines, formatting and an unsubscribe flow built in.'],
              [MessageSquare, 'sms', 'SMS', 'Time-sensitive alerts and reminders. Live character and segment counts, and automatic STOP handling.'],
              [MessageCircle, 'whatsapp', 'WhatsApp', 'Conversational updates with explicit opt-in, template placeholders and read receipts where available.']].map(([I, ch, t, d]) => (
              <div key={t} className="mk-card"><span className={`ch ch-${ch}`} style={{ width: 38, height: 38, borderRadius: 9, marginBottom: 16 }}><I size={18} /></span><h3 className="mk-h3">{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-eyebrow">How it works</div>
          <h2 className="mk-h2">Organise. Communicate. Automate. Monitor.</h2>
          <div className="grid-4" style={{ marginTop: 40 }}>
            {[['01', 'Organise', 'Import contacts, record consent per channel, and group people into lists and dynamic segments.'],
              ['02', 'Communicate', 'Build a campaign, choose the audience and channels, preview each version with real contact data, and send or schedule.'],
              ['03', 'Automate', 'Turn recurring communications into workflows triggered by events, dates and replies.'],
              ['04', 'Monitor', 'Watch deliveries and failures, handle replies in the inbox, and learn what works in analytics.']].map(([n, t, d]) => (
              <div key={n}><div className="mono accent">{n}</div><h3 className="mk-h3" style={{ marginTop: 10 }}>{t}</h3><p className="muted" style={{ marginTop: 8 }}>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="between wrap" style={{ alignItems: 'flex-end' }}>
            <div><div className="mk-eyebrow">Industry use cases</div><h2 className="mk-h2">Built for organisations that communicate at scale.</h2></div>
            <Link to="/use-cases" className="btn">See all use cases <ArrowRight /></Link>
          </div>
          <div className="grid-3" style={{ marginTop: 40 }}>
            {INDUSTRIES.map(([I, t, d]) => <div key={t} className="mk-card"><div className="ic"><I /></div><h3 className="mk-h3">{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-eyebrow">Inside the product</div>
          <h2 className="mk-h2">Designed for clarity under pressure.</h2>
          <div className="grid-2" style={{ marginTop: 40 }}>
            <div className="mk-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 20 }}><h3 className="mk-h3 row"><Layers size={18} className="accent" />Channel-aware campaign builder</h3><p>See exactly how many recipients are eligible on each channel before you send.</p></div>
              <div style={{ padding: '0 20px 20px' }} className="stack">
                {[['email', 'Email', 12, 14], ['sms', 'SMS', 9, 14], ['whatsapp', 'WhatsApp', 6, 14]].map(([ch, l, e, t]) => (
                  <div key={ch} className="col" style={{ gap: 6 }}><div className="between small"><span>{l}</span><span className="muted">{e} of {t} eligible</span></div><div className="progress"><span style={{ width: `${(e / t) * 100}%`, background: `var(--ch-${ch})` }} /></div></div>
                ))}
              </div>
            </div>
            <div className="mk-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: 20 }}><h3 className="mk-h3 row"><ShieldCheck size={18} className="accent" />Consent in every decision</h3><p>Opt-ins, opt-outs and suppression are checked automatically — at send time and inside every automation.</p></div>
              <div style={{ padding: '0 20px 20px' }} className="stack small">
                {[['Maria Gonzalez', 'Opted in', 'ok', 'Resident portal · Mar 4'], ['Grace Okafor', 'Opted out', 'err', 'SMS keyword “STOP”'], ['Ethan Walsh', 'Pending', 'warn', 'Awaiting confirmation']].map(([n, s, t, src]) => (
                  <div key={n} className="between" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><span>{n}<span className="faint xs" style={{ display: 'block' }}>{src}</span></span><span className={`badge badge-${t}`}><span className="dot" />SMS · {s}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section" id="pricing">
        <div className="mk-container">
          <div style={{ textAlign: 'center', marginBottom: 40 }}><div className="mk-eyebrow">Pricing</div><h2 className="mk-h2">Simple plans that grow with you.</h2><p className="muted" style={{ marginTop: 12 }}>Illustrative pricing for this prototype. Messaging usage will be billed separately or according to your plan.</p></div>
          <PricingCards />
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container" style={{ maxWidth: 860 }}>
          <div className="mk-eyebrow">FAQ</div>
          <h2 className="mk-h2" style={{ marginBottom: 24 }}>Questions, answered.</h2>
          <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div>
      </section>

      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <h2 className="mk-h2">Bring every conversation into one place.</h2>
          <p className="mk-lead" style={{ margin: '16px auto 0' }}>Explore the full demo workspace in minutes. No provider accounts, API keys or credit card needed.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 28, gap: 12 }}><Link to="/signup" className="btn btn-primary btn-lg">Get Started</Link><Link to="/login?demo=1" className="btn btn-lg">Open the demo workspace</Link></div>
        </div>
      </section>
    </>
  );
}
