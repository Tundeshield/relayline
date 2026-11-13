import { Link } from 'react-router-dom';
import { BookOpen, Upload, Send, Workflow, Inbox, ShieldCheck, FlaskConical, LifeBuoy, Mail } from 'lucide-react';
import { PageHead, Callout } from '../../components/ui';
import { FAQ } from '../marketing/Home';
import { useTitle } from '../../lib/hooks';

const GUIDES = [
  [Upload, 'Import your contacts', 'Upload a CSV, map columns, review errors and duplicates.', '/app/contacts/import'],
  [Send, 'Send a multi-channel campaign', 'Choose an audience, pick channels and preview each version.', '/app/campaigns/new'],
  [Workflow, 'Build an automation', 'Start from a template, test it on a contact, then activate.', '/app/automations/new'],
  [Inbox, 'Work the shared inbox', 'Assign conversations, add notes and reply on any channel.', '/app/inbox'],
  [ShieldCheck, 'Set up consent rules', 'Decide what each channel requires and manage suppression.', '/app/settings/consent'],
  [BookOpen, 'Understand your analytics', 'Sent, delivered, read, failed and replied — and why they differ.', '/app/analytics'],
];
export default function Help() {
  useTitle('Help & support');
  return (
    <>
      <PageHead title="Help & support" description="Guides, answers, and how this demonstration works." />
      <div style={{ marginBottom: 16 }}><Callout icon={FlaskConical}><strong>About demo mode.</strong> Relayline is not connected to any messaging provider. When you send, the built-in simulator creates message records and plays out a realistic lifecycle — most messages are delivered, some fail with a reason, some never receive a delivery report, and a few contacts reply. Fallback delays and automation waits are compressed to seconds. Nothing reaches a real inbox or phone.</Callout></div>
      <div className="grid-3" style={{ marginBottom: 24 }}>{GUIDES.map(([I, t, d, to]) => <Link key={t} to={to} className="card card-body stack" style={{ gap: 8 }}><span className="node-icon ni-trigger" style={{ width: 32, height: 32 }}><I size={16} /></span><span className="strong">{t}</span><span className="muted small">{d}</span></Link>)}</div>
      <div className="grid-2">
        <div className="card"><div className="card-head"><h3>Frequently asked questions</h3></div><div className="card-body faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          <details><summary>How do I test inbound replies?</summary><p>Use “Simulate incoming” in the inbox or “Simulate event” on a contact profile. Try “STOP” by SMS to see opt-out handling, or “YES” on a campaign that requests acknowledgement.</p></details>
          <details><summary>Where is my data stored?</summary><p>In this prototype, in your browser’s local storage. Clearing site data removes it. Reset the demo workspace from the account menu at any time.</p></details>
          <details><summary>Keyboard shortcuts</summary><p>⌘/Ctrl + K opens search. ⌘/Ctrl + Enter sends an inbox reply. Esc closes dialogs.</p></details>
        </div></div>
        <div className="card"><div className="card-head"><h3>Contact support</h3></div><div className="card-body stack">
          <p className="muted small">Questions about the product or early access? We’d love to hear from you.</p>
          <Link to="/contact" className="btn"><Mail />Send us a message</Link>
          <div className="divider" style={{ margin: '4px 0' }} />
          <div className="row small"><LifeBuoy size={16} className="accent" />Accessibility: change text size from your account menu (top right).</div>
        </div></div>
      </div>
    </>
  );
}
