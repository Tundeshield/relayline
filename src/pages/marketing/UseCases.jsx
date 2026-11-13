import { Link } from 'react-router-dom';
import { Building2, Wrench, Users, HeartHandshake, GraduationCap, Briefcase, Mail, MessageSquare, MessageCircle } from 'lucide-react';
import { useTitle } from '../../lib/hooks';

const CH = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle };
const CASES = [
  ['property', Building2, 'Property management', 'Keep residents, owners and maintenance teams informed — and capture every reply.', [
    ['sms', 'Water shut-off notice', 'Building A residents, the day before', 'We will be carrying out scheduled water maintenance at Building A tomorrow between 10:00 AM and 2:00 PM.'],
    ['email', 'Lease renewal reminder', 'Automation: 14 days before renewal', 'Your lease for unit A-204 is coming up for renewal. Review your options in the resident portal.'],
    ['whatsapp', 'Package arrival', 'Triggered when a package is logged', 'A package has arrived for unit B-302. Collect it from the package room (7 AM – 10 PM).']]],
  ['field', Wrench, 'Field service businesses', 'Confirm appointments, reduce no-shows and follow up after every visit.', [
    ['sms', 'Appointment reminder', 'Automation: 1 day before', 'Reminder: your HVAC service is tomorrow 9–11 AM. Reply YES to confirm.'],
    ['whatsapp', 'Technician en route', 'Triggered by dispatch status', 'Jamal is on the way and should arrive in about 25 minutes.'],
    ['email', 'Job follow-up', 'Automation: 2 days after visit', 'How did we do? Reply to this email with any questions about your service.']]],
  ['membership', Users, 'Membership organisations', 'Run renewals and member communications without spreadsheets.', [
    ['email', 'Renewal reminder', 'Automation: 14 days before renewal', 'Your membership renews on March 1. Renew online in under a minute.'],
    ['sms', 'Renewal follow-up', 'If renewal status is unchanged after 7 days', 'Quick reminder — your membership renewal is still open.'],
    ['email', 'Event invitation', 'Segment: active members', 'Join us for the annual meeting on April 12. RSVP by replying to this email.']]],
  ['nonprofit', HeartHandshake, 'Nonprofits', 'Coordinate volunteers and supporters with consent built in.', [
    ['sms', 'Volunteer shift reminder', 'List: Saturday volunteers', 'Thanks for volunteering! Your shift starts at 8 AM at the community pantry.'],
    ['email', 'Impact update', 'Segment: donors with marketing consent', 'Because of you, 1,200 families received groceries this month.'],
    ['whatsapp', 'Event-day logistics', 'List: event staff', 'Doors open at 6 PM. Parking is in Lot C.']]],
  ['education', GraduationCap, 'Education', 'Reach families on the channel they use, especially when it matters most.', [
    ['sms', 'Weather closure', 'Emergency notification · all families', 'School is closed today due to weather. Remote assignments are posted online.'],
    ['email', 'Weekly class update', 'List: Grade 5 families', 'This week: science fair projects are due Friday.'],
    ['whatsapp', 'Field trip confirmation', 'Reply YES to acknowledge', 'Please confirm Ava will attend the museum trip on Thursday.']]],
  ['business', Briefcase, 'General business operations', 'Customer updates, incident notices and internal announcements in one place.', [
    ['email', 'Service update', 'Segment: affected customers', 'We are performing scheduled maintenance on Sunday from 1–3 AM ET.'],
    ['sms', 'Order ready', 'Triggered by order status', 'Your order is ready for pickup at the Main St location.'],
    ['email', 'Internal announcement', 'List: all staff', 'Open enrolment for benefits begins Monday.']]],
];

export default function UseCases() {
  useTitle('Use cases');
  return (
    <>
      <section className="mk-hero" style={{ paddingBottom: 64 }}>
        <div className="mk-container"><div className="mk-eyebrow">Use cases</div><h1 className="mk-h1" style={{ fontSize: 'clamp(2.2rem,5vw,3.8rem)' }}>One platform. Many kinds of organisations.</h1><p className="mk-lead">Practical examples of how teams use Relayline to communicate across email, SMS and WhatsApp.</p></div>
      </section>
      <div className="mk-container">
        {CASES.map(([id, I, title, lead, examples]) => (
          <section key={id} id={id} className="mk-feature" style={{ gridTemplateColumns: '0.8fr 1.2fr', alignItems: 'start' }}>
            <div><div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', marginBottom: 16 }}><I size={19} /></div><h2 className="mk-h2" style={{ fontSize: '1.9rem' }}>{title}</h2><p className="mk-lead" style={{ marginTop: 12 }}>{lead}</p></div>
            <div className="stack">
              {examples.map(([ch, name, when, body]) => { const C = CH[ch]; return (
                <div key={name} className="mk-card" style={{ padding: 18 }}>
                  <div className="row" style={{ marginBottom: 8 }}><span className={`ch ch-${ch}`}><C /></span><span className="strong">{name}</span><span className="faint small" style={{ marginLeft: 'auto' }}>{when}</span></div>
                  <p style={{ margin: 0, color: 'var(--text-2)' }}>“{body}”</p>
                </div>); })}
            </div>
          </section>
        ))}
      </div>
      <section className="mk-section" style={{ textAlign: 'center', borderBottom: 0 }}><h2 className="mk-h2">Explore a property management workspace.</h2><p className="muted" style={{ marginTop: 10 }}>The demo is pre-loaded with Northstar Property Group’s residents, campaigns, automations and inbox.</p><div className="row" style={{ justifyContent: 'center', marginTop: 24, gap: 12 }}><Link to="/login?demo=1" className="btn btn-primary btn-lg">Open the demo workspace</Link><Link to="/signup" className="btn btn-lg">Create your own</Link></div></section>
    </>
  );
}
