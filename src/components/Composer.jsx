import { useRef } from 'react';
import { Bold, Italic, Link2, List, Heading, Paperclip, Braces, AlertTriangle } from 'lucide-react';
import { Field, Callout, useToast } from './ui';
import { VARIABLES, smsInfo, renderTemplate, miniMarkdown, missingVariables, fullName, fmtPhone } from '../lib/util';

export function MessagePreview({ channel, subject, body, contact, org }) {
  const text = renderTemplate(body, contact, org);
  if (channel === 'email') {
    return (
      <div className="preview-email">
        <div className="pe-head"><div><strong>From:</strong> {org?.settings?.channels?.email?.from_name || org?.name} &lt;{org?.settings?.channels?.email?.from_email || 'updates@example.com'}&gt;</div><div><strong>To:</strong> {contact ? `${fullName(contact)} <${contact.email || 'no email'}>` : 'Recipient'}</div><div style={{ color: '#111', marginTop: 4, fontWeight: 600 }}>{renderTemplate(subject, contact, org) || '(no subject)'}</div></div>
        <div className="pe-body" dangerouslySetInnerHTML={{ __html: miniMarkdown(text) || '<span style="color:#999">Message body</span>' }} />
        <div className="pe-foot">{org?.name} · {org?.settings?.address || 'Organisation address'}<br />Unsubscribe from these emails (simulated link)</div>
      </div>
    );
  }
  return (
    <div className={`preview-phone ${channel === 'whatsapp' ? 'wa' : ''}`}>
      <div className="pp-head">{channel === 'whatsapp' ? `${org?.name} · WhatsApp` : `${org?.settings?.channels?.sms?.sender_id || 'SMS'}`}<br />to {contact ? fmtPhone(contact.phone) || 'no phone' : 'recipient'}</div>
      <div className="pp-bubble">{text || <span className="faint">Message body</span>}</div>
    </div>
  );
}

export function SmsMeter({ text }) {
  const i = smsInfo(text);
  return <span className={`small ${i.segments > 3 ? 'warn' : 'faint'}`}>{i.len} characters · {i.segments} segment{i.segments === 1 ? '' : 's'} · {i.encoding}{i.unicode && ' — emoji or special characters reduce characters per segment'}</span>;
}

export default function Composer({ channel, value, onChange, contact, org, compact, showPreview = true, errors = {} }) {
  const ref = useRef(null);
  const toast = useToast();
  const set = (k, v) => onChange({ ...value, [k]: v });
  const insert = (before, after = '') => {
    const el = ref.current;
    const body = value.body || '';
    const s = el?.selectionStart ?? body.length; const e = el?.selectionEnd ?? body.length;
    const next = body.slice(0, s) + before + body.slice(s, e) + after + body.slice(e);
    set('body', next);
    requestAnimationFrame(() => { el?.focus(); const p = s + before.length + (e - s) + after.length; el?.setSelectionRange(p, p); });
  };
  const missing = contact ? [...new Set([...missingVariables(value.body, contact, org), ...(channel === 'email' ? missingVariables(value.subject, contact, org) : [])])] : [];
  const chMissing = contact && (channel === 'email' ? !contact.email : !contact.phone);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(0,1.15fr) minmax(0,1fr)' : '1fr', gap: 20 }} className="composer-grid">
      <div className="stack">
        {channel === 'email' && <Field label="Subject line" error={errors.subject}><input className={`input ${errors.subject ? 'invalid' : ''}`} value={value.subject || ''} onChange={(e) => set('subject', e.target.value)} placeholder="e.g. Scheduled water maintenance — {{building}}" /></Field>}
        {channel === 'whatsapp' && <Field label="Approved template name (placeholder)" hint="Business-initiated WhatsApp messages need a pre-approved template. Recorded for future provider integration."><input className="input" value={value.template_name || ''} onChange={(e) => set('template_name', e.target.value)} placeholder="e.g. building_update_v1" /></Field>}
        <Field label="Message" error={errors.body}>
          <div className="row wrap" style={{ gap: 4, marginBottom: 6 }}>
            {channel === 'email' && <>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => insert('**', '**')} aria-label="Bold" title="Bold"><Bold /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => insert('_', '_')} aria-label="Italic" title="Italic"><Italic /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => insert('\n\n# ')} aria-label="Heading" title="Heading"><Heading /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => insert('\n\n- ')} aria-label="Bullet list" title="Bullet list"><List /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => insert('[', '](https://)')} aria-label="Link" title="Link"><Link2 /></button>
              <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
            </>}
            <span className="faint xs row" style={{ gap: 4 }}><Braces size={13} />Insert:</span>
            {VARIABLES.map((v) => <button key={v.key} type="button" className="btn btn-sm" style={{ height: 24, padding: '0 7px', fontSize: '0.74rem' }} onClick={() => insert(`{{${v.key}}}`)} title={v.label}>{v.key}</button>)}
          </div>
          <textarea ref={ref} className={`textarea ${errors.body ? 'invalid' : ''}`} style={{ minHeight: compact ? 120 : channel === 'email' ? 220 : 130 }} value={value.body || ''} onChange={(e) => set('body', e.target.value)} placeholder={channel === 'email' ? 'Write your email. Use **bold**, _italic_, - lists and [links](https://…).' : 'Keep it short and clear.'} aria-label={`${channel} message body`} />
        </Field>
        <div className="between wrap">
          {channel === 'sms' ? <SmsMeter text={renderTemplate(value.body || '', contact, org) || value.body || ''} /> : <span className="faint small">{(value.body || '').length} characters</span>}
          {channel === 'email' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => toast.info('Attachments are a placeholder in this prototype — files are not uploaded or sent.')} title="Attachment placeholder"><Paperclip />Attach file</button>}
        </div>
        {channel === 'sms' && !/stop/i.test(value.body || '') && <p className="faint xs">Tip: include opt-out language such as “Reply STOP to opt out”.</p>}
      </div>
      {showPreview && (
        <div className="stack">
          <div className="label">Preview {contact && <span className="faint">with {fullName(contact)}</span>}</div>
          <MessagePreview channel={channel} subject={value.subject} body={value.body || ''} contact={contact} org={org} />
          {chMissing && <Callout tone="warn" icon={AlertTriangle}>{fullName(contact)} has no {channel === 'email' ? 'email address' : 'phone number'} — they will not receive this version.</Callout>}
          {missing.length > 0 && <Callout tone="warn" icon={AlertTriangle}>Missing for this contact: {missing.map((m) => <code key={m} style={{ marginRight: 6 }}>{`{{${m}}}`}</code>)} — these will render blank.</Callout>}
        </div>
      )}
      <style>{`@media (max-width: 900px){ .composer-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
