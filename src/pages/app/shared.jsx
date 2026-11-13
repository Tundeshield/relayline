import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Modal, Field, ChannelIcon, Badge, Callout } from '../../components/ui';
import { useOrg } from '../../data/store';
import { isEmail, normalizePhone, fullName } from '../../lib/util';
import { CONSENT_STATUS, CONSENT_PURPOSE, CONSENT_SOURCES, CHANNEL_LABEL } from '../../lib/constants';
import { getConsent } from '../../services/consent';
import { getState } from '../../data/store';
import { createContact, updateContact, ensureTag } from '../../services/contacts';
import { setConsent } from '../../services/consent';
import { useAction } from '../../lib/hooks';

export function ChannelAvail({ contact }) {
  return <span className="row" style={{ gap: 4 }}>{['email', 'sms', 'whatsapp'].map((ch) => {
    const has = ch === 'email' ? !!contact.email : !!contact.phone;
    const st = getConsent(getState(), contact.id, ch)?.status;
    return <span key={ch} title={`${CHANNEL_LABEL[ch]}: ${has ? (CONSENT_STATUS[st || 'none'].label) : 'not available'}`} style={{ position: 'relative', opacity: has ? 1 : 0.6 }}><ChannelIcon channel={ch} off={!has} />{has && st === 'revoked' && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--err)', border: '2px solid var(--bg-elev)' }} />}{has && st === 'granted' && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', border: '2px solid var(--bg-elev)' }} />}</span>;
  })}</span>;
}

export const ConsentBadge = ({ status }) => { const s = CONSENT_STATUS[status || 'none']; return <Badge tone={s.tone} dot>{s.label}</Badge>; };
export const ContactStatus = ({ status }) => <Badge tone={status === 'active' ? 'ok' : status === 'unsubscribed' ? 'err' : 'neutral'} dot>{status === 'active' ? 'Active' : status === 'unsubscribed' ? 'Unsubscribed' : 'Archived'}</Badge>;

export function TagPicker({ value, onChange, allowCreate = true }) {
  const { tags } = useOrg();
  const [q, setQ] = useState('');
  const selected = value.map((v) => (typeof v === 'string' && v.startsWith('new:') ? { id: v, name: v.slice(4) } : tags.find((t) => t.id === v))).filter(Boolean);
  const options = tags.filter((t) => !value.includes(t.id) && t.name.toLowerCase().includes(q.toLowerCase()));
  const exact = tags.some((t) => t.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 6 }}>{selected.map((t) => <span key={t.id} className="tag">{t.name}<button type="button" onClick={() => onChange(value.filter((v) => v !== t.id))} aria-label={`Remove ${t.name}`}><X size={12} /></button></span>)}{!selected.length && <span className="faint small">No tags</span>}</div>
      <div className="row"><input className="input input-sm" placeholder="Search or create a tag" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (options[0] && options[0].name.toLowerCase() === q.toLowerCase()) onChange([...value, options[0].id]); else if (q.trim() && allowCreate && !exact) onChange([...value, 'new:' + q.trim()]); setQ(''); } }} aria-label="Tag search" /></div>
      {q && <div className="row wrap" style={{ gap: 6 }}>{options.slice(0, 8).map((t) => <button type="button" key={t.id} className="btn btn-sm" onClick={() => { onChange([...value, t.id]); setQ(''); }}>{t.name}</button>)}{allowCreate && q.trim() && !exact && <button type="button" className="btn btn-sm" onClick={() => { onChange([...value, 'new:' + q.trim()]); setQ(''); }}><Plus />Create “{q.trim()}”</button>}</div>}
    </div>
  );
}

export const resolveTags = (draft, ctx, ids) => ids.map((v) => (String(v).startsWith('new:') ? ensureTag(draft, ctx, v.slice(4)).id : v));

export function ContactForm({ contact, onClose, onSaved }) {
  const run = useAction();
  const { contacts } = useOrg();
  const editing = !!contact;
  const [f, setF] = useState(() => ({
    first_name: contact?.first_name || '', last_name: contact?.last_name || '', email: contact?.email || '', phone: contact?.phone || '',
    company: contact?.company || '', job_title: contact?.job_title || '', preferred_channel: contact?.preferred_channel || '',
    building: contact?.custom_fields?.building || '', unit: contact?.custom_fields?.unit || '', lease_end: contact?.custom_fields?.lease_end || '', renewal_date: contact?.custom_fields?.renewal_date || '',
    tag_ids: contact?.tag_ids || [],
  }));
  const [consents, setConsents] = useState({ email: { status: 'none', purpose: 'operational', source: 'Staff entry' }, sms: { status: 'none', purpose: 'operational', source: 'Staff entry' }, whatsapp: { status: 'none', purpose: 'operational', source: 'Staff entry' } });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.first_name.trim() && !f.last_name.trim()) er.first_name = 'Enter a first or last name.';
    if (f.email && !isEmail(f.email)) er.email = 'Enter a valid email address.';
    const phone = f.phone ? normalizePhone(f.phone) : '';
    if (f.phone && !phone) er.phone = 'Enter a valid phone number (10-digit US or +country code).';
    if (!f.email && !f.phone) er.email = 'Add at least an email or a phone number.';
    if (f.email && contacts.some((c) => c.id !== contact?.id && c.email === f.email.trim().toLowerCase())) er.email = 'Another contact already uses this email.';
    if (phone && contacts.some((c) => c.id !== contact?.id && c.phone === phone)) er.phone = 'Another contact already uses this phone number.';
    setErrors(er);
    if (Object.keys(er).length) return;
    const custom_fields = { building: f.building, unit: f.unit, lease_end: f.lease_end, renewal_date: f.renewal_date };
    const data = { first_name: f.first_name, last_name: f.last_name, email: f.email.trim().toLowerCase(), phone, company: f.company, job_title: f.job_title, preferred_channel: f.preferred_channel, custom_fields };
    const saved = run((d, ctx) => {
      const tag_ids = resolveTags(d, ctx, f.tag_ids);
      if (editing) return updateContact(d, ctx, contact.id, { ...data, tag_ids });
      const c = createContact(d, ctx, { ...data, tag_ids, source: 'Manual' });
      Object.entries(consents).forEach(([ch, cs]) => cs.status !== 'none' && (ch === 'email' ? c.email : c.phone) && setConsent(d, ctx, c.id, ch, cs));
      return c;
    }, { success: editing ? 'Contact updated.' : 'Contact added.' });
    if (saved) { onSaved?.(saved); onClose(); }
  };
  return (
    <Modal title={editing ? `Edit ${fullName(contact)}` : 'Add contact'} onClose={onClose} size="lg" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>{editing ? 'Save changes' : 'Add contact'}</button></>}>
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="First name" error={errors.first_name} htmlFor="cf-fn"><input id="cf-fn" className={`input ${errors.first_name ? 'invalid' : ''}`} value={f.first_name} onChange={(e) => set('first_name', e.target.value)} autoFocus /></Field>
          <Field label="Last name" htmlFor="cf-ln"><input id="cf-ln" className="input" value={f.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
          <Field label="Email" error={errors.email} htmlFor="cf-em"><input id="cf-em" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone" error={errors.phone} hint="US numbers can be 10 digits; others need +country code." htmlFor="cf-ph"><input id="cf-ph" className={`input ${errors.phone ? 'invalid' : ''}`} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(312) 555-0123" /></Field>
          <Field label="Company / organisation" htmlFor="cf-co"><input id="cf-co" className="input" value={f.company} onChange={(e) => set('company', e.target.value)} /></Field>
          <Field label="Job title" htmlFor="cf-jt"><input id="cf-jt" className="input" value={f.job_title} onChange={(e) => set('job_title', e.target.value)} /></Field>
          <Field label="Building (custom)" htmlFor="cf-b"><input id="cf-b" className="input" value={f.building} onChange={(e) => set('building', e.target.value)} /></Field>
          <Field label="Unit (custom)" htmlFor="cf-u"><input id="cf-u" className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label="Lease end (custom)" htmlFor="cf-le"><input id="cf-le" type="date" className="input" value={f.lease_end} onChange={(e) => set('lease_end', e.target.value)} /></Field>
          <Field label="Renewal date (custom)" htmlFor="cf-rd"><input id="cf-rd" type="date" className="input" value={f.renewal_date} onChange={(e) => set('renewal_date', e.target.value)} /></Field>
          <Field label="Preferred channel" htmlFor="cf-pc"><select id="cf-pc" className="select" value={f.preferred_channel} onChange={(e) => set('preferred_channel', e.target.value)}><option value="">No preference</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select></Field>
          <Field className="full" label="Tags"><TagPicker value={f.tag_ids} onChange={(v) => set('tag_ids', v)} /></Field>
        </div>
        {!editing && (
          <div className="stack">
            <div className="label">Consent at creation</div>
            <Callout>Only record consent the contact actually gave. Having an email or phone number does not count as permission.</Callout>
            {['email', 'sms', 'whatsapp'].map((ch) => (
              <div key={ch} className="rule-row">
                <span className="row"><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}</span>
                <select className="select input-sm" aria-label={`${ch} consent status`} value={consents[ch].status} onChange={(e) => setConsents((c) => ({ ...c, [ch]: { ...c[ch], status: e.target.value } }))}>{Object.entries(CONSENT_STATUS).filter(([k]) => k !== 'revoked').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                <select className="select input-sm" aria-label={`${ch} consent purpose`} value={consents[ch].purpose} onChange={(e) => setConsents((c) => ({ ...c, [ch]: { ...c[ch], purpose: e.target.value } }))} disabled={consents[ch].status === 'none'}>{Object.entries(CONSENT_PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select className="select input-sm" aria-label={`${ch} consent source`} value={consents[ch].source} onChange={(e) => setConsents((c) => ({ ...c, [ch]: { ...c[ch], source: e.target.value } }))} disabled={consents[ch].status === 'none'}>{CONSENT_SOURCES.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
}

export function ListPickerModal({ title, lists, onPick, onClose, allowCreate, onCreate }) {
  const [sel, setSel] = useState(lists[0]?.id || '');
  const [name, setName] = useState('');
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!sel && !name.trim()} onClick={() => (name.trim() ? onCreate(name.trim()) : onPick(sel))}>Confirm</button></>}>
      <div className="stack">
        {lists.length ? <Field label="List"><select className="select" value={sel} onChange={(e) => setSel(e.target.value)}>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field> : <p className="muted small">No static lists yet.</p>}
        {allowCreate && <Field label="…or create a new list" hint="Leave blank to use the selected list."><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" /></Field>}
      </div>
    </Modal>
  );
}
