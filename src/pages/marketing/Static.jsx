import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Check } from 'lucide-react';
import { useTitle } from '../../lib/hooks';
import { Field } from '../../components/ui';
import { isEmail } from '../../lib/util';

const Hero = ({ eyebrow, title, lead }) => <section className="mk-hero" style={{ paddingBottom: 56, textAlign: 'left' }}><div className="mk-container"><div className="mk-eyebrow">{eyebrow}</div><h1 className="mk-h1" style={{ fontSize: 'clamp(2.2rem,5vw,3.6rem)' }}>{title}</h1>{lead && <p className="mk-lead" style={{ margin: '18px 0 0' }}>{lead}</p>}</div></section>;

export function About() {
  useTitle('About');
  return (<><Hero eyebrow="About" title="We build calm software for important conversations." lead="Relayline exists because the communications that matter most — a water shut-off, a renewal, a school closure — are too often scattered across tools, inboxes and personal phones." />
    <section className="mk-section"><div className="mk-container grid-3">
      {[['Clarity over noise', 'Every screen answers one question: who did we reach, how, and what happened next.'], ['Permission first', 'Consent is part of the data model, not an afterthought. We never assume an address means permission.'], ['Honest numbers', 'We report what channels can actually tell us, and keep sent, delivered, read and replied distinct.']].map(([t, d]) => <div key={t} className="mk-card"><h3 className="mk-h3">{t}</h3><p>{d}</p></div>)}
    </div></section>
    <section className="mk-section" style={{ borderBottom: 0 }}><div className="mk-container prose"><h2>Where we are today</h2><p>Relayline is currently a functional product prototype. Every workflow — importing contacts, building campaigns, automations, the inbox and analytics — works end to end, with messaging simulated locally. Real email, SMS and WhatsApp provider integrations will plug into the same messaging interface.</p><p>We are focused first on organisations in the United States, with currency, time zones and regional settings configurable for teams everywhere.</p><p><Link className="accent" to="/contact">Get in touch</Link> if you would like to help shape what we build next.</p></div></section></>);
}

export function Contact() {
  useTitle('Contact');
  const [f, setF] = useState({ name: '', email: '', org: '', message: '' });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = 'Please enter your name.';
    if (!isEmail(f.email)) er.email = 'Enter a valid email address.';
    if (f.message.trim().length < 10) er.message = 'Tell us a little more (at least 10 characters).';
    setErrors(er);
    if (Object.keys(er).length) return;
    try { const all = JSON.parse(localStorage.getItem('rl:contact') || '[]'); all.push({ ...f, at: Date.now() }); localStorage.setItem('rl:contact', JSON.stringify(all)); } catch { /* ignore */ }
    setSent(true);
  };
  return (<><Hero eyebrow="Contact" title="Talk to us." lead="Questions about the product, partnerships or early access? Send us a note." />
    <section className="mk-section" style={{ borderBottom: 0 }}><div className="mk-container grid-2" style={{ gap: 48, alignItems: 'start' }}>
      <div className="mk-card">{sent ? <div className="stack" style={{ alignItems: 'flex-start' }}><span className="badge badge-ok"><Check size={13} />Message received</span><h3 className="mk-h3">Thanks, {f.name.split(' ')[0]}.</h3><p>Your message was saved in this browser. In this prototype no email is sent — in production it would reach our team, who reply within two business days.</p><button className="btn" onClick={() => { setSent(false); setF({ name: '', email: '', org: '', message: '' }); }}>Send another message</button></div> : (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="form-grid"><Field label="Name" error={errors.name} htmlFor="c-name"><input id="c-name" className={`input ${errors.name ? 'invalid' : ''}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Work email" error={errors.email} htmlFor="c-email"><input id="c-email" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
          <Field label="Organisation (optional)" htmlFor="c-org"><input id="c-org" className="input" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} /></Field>
          <Field label="How can we help?" error={errors.message} htmlFor="c-msg"><textarea id="c-msg" className={`textarea ${errors.message ? 'invalid' : ''}`} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <button className="btn btn-primary btn-lg" type="submit">Send message</button>
        </form>)}</div>
      <div className="stack-lg"><div className="row-3"><Mail className="accent" /><div><div className="strong">Email</div><div className="muted">hello@relayline.example</div></div></div><div className="row-3"><MapPin className="accent" /><div><div className="strong">Remote-first</div><div className="muted">Serving teams in the US and internationally</div></div></div></div>
    </div></section></>);
}

const LEGAL_NOTE = 'This is a placeholder document for a product prototype. It has not been reviewed by counsel and is not legal advice.';
export function Privacy() {
  useTitle('Privacy policy');
  return (<><Hero eyebrow="Legal" title="Privacy policy" lead={LEGAL_NOTE} /><section className="mk-section" style={{ borderBottom: 0 }}><div className="mk-container prose">
    <h2>What this prototype stores</h2><p>In this demonstration, all account and workspace data — contacts, campaigns, conversations and settings — is stored in your own browser’s local storage. Nothing is transmitted to a Relayline server, and no messages are sent to real recipients.</p>
    <h2>Data you manage about others</h2><p>When you add contacts, you act as the controller of that data and are responsible for having a lawful basis and appropriate consent to communicate with them. Relayline provides tools to record consent, honour opt-outs and maintain a suppression list.</p>
    <h2>Production service</h2><p>A production version would process data to deliver messages through third-party providers, retain records needed for consent and compliance, and offer export and deletion on request. A full policy will be published before launch.</p>
    <h2>Contact</h2><p>Questions: privacy@relayline.example</p></div></section></>);
}
export function Terms() {
  useTitle('Terms of service');
  return (<><Hero eyebrow="Legal" title="Terms of service" lead={LEGAL_NOTE} /><section className="mk-section" style={{ borderBottom: 0 }}><div className="mk-container prose">
    <h2>Prototype use</h2><p>Relayline is provided as a demonstration. Messaging, delivery and replies are simulated. The service must not be relied upon to deliver real communications.</p>
    <h2>Acceptable use</h2><p>You agree to only communicate with people who have given appropriate consent, to honour opt-out requests, and to comply with laws applicable to your communications (for example, in the United States, the TCPA and CAN-SPAM). Relayline does not certify or guarantee your compliance.</p>
    <h2>Plans and billing</h2><p>Plans shown are illustrative. No payments are processed in this prototype.</p>
    <h2>Changes</h2><p>These terms will be replaced by final terms before any production launch.</p></div></section></>);
}
