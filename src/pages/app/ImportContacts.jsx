import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, Download, FileText, AlertTriangle, CheckCircle2, XCircle, ArrowLeft, ArrowRight, Copy } from 'lucide-react';
import { useOrg } from '../../data/store';
import { CONTACT_TABS, PageHead, Field, Callout, Badge, Empty, Tabs } from '../../components/ui';
import { TagPicker, resolveTags } from './shared';
import { parseCSV, toCSV, download, isEmail, normalizePhone, plural, fullName } from '../../lib/util';
import { createContact, updateContact, addToList, addTag, createList } from '../../services/contacts';
import { setConsent } from '../../services/consent';
import { logActivity, notify } from '../../services/core';
import { emit } from '../../services/automation/engine';
import { useAction, useTitle, usePerm } from '../../lib/hooks';

const TARGETS = [
  ['', 'Do not import'], ['first_name', 'First name'], ['last_name', 'Last name'], ['full_name', 'Full name (split)'], ['email', 'Email'], ['phone', 'Phone'], ['company', 'Company'], ['job_title', 'Job title'],
  ['building', 'Building (custom)'], ['unit', 'Unit (custom)'], ['lease_end', 'Lease end (custom)'], ['renewal_date', 'Renewal date (custom)'], ['tags', 'Tags (separate with ;)'],
  ['email_consent', 'Email consent (yes/no)'], ['sms_consent', 'SMS consent (yes/no)'], ['whatsapp_consent', 'WhatsApp consent (yes/no)'],
];
const GUESS = { email_consent: /email.?(consent|opt)/i, sms_consent: /sms.?(consent|opt)|text.?(consent|opt)/i, whatsapp_consent: /whats.?app.?(consent|opt)/i, first_name: /^(first|given|fname|first.?name)$/i, last_name: /^(last|surname|family|lname|last.?name)$/i, full_name: /^(name|full.?name|contact)$/i, email: /e-?mail/i, phone: /(phone|mobile|cell|tel)/i, company: /(company|organi[sz]ation|org)$/i, job_title: /(title|role|position)/i, building: /building|property/i, unit: /^(unit|apt|apartment|suite)/i, lease_end: /lease/i, renewal_date: /renew/i, tags: /tags?/i };
const SAMPLE = `first_name,last_name,email,phone,unit,building,tags,email_consent,sms_consent
Jasmine,Reed,jasmine.reed@example.com,(312) 555-0181,A-402,Building A,Resident;Pet Owner,yes,yes
Leo,Martinez,leo.martinez@example.com,312-555-0182,A-403,Building A,Resident,yes,no
Priya,Natarajan,priya.n@example,312-555-0183,A-404,Building A,Resident,yes,yes
Owen,Clarke,,555-01,B-405,Building B,Resident,,
Maria,Gonzalez,maria.gonzalez@example.com,,A-101,Building A,Resident;VIP,yes,yes
Zoe,Fitzgerald,zoe.fitzgerald@example.com,+44 20 7946 0958,B-406,Building B,Resident,yes,
,,,,,,,,
Hiro,Tanaka,hiro.tanaka@example.com,(312) 555-0186,B-407,Building B,Resident;Parking Permit,no,yes`;
const yes = (v) => /^(y|yes|true|1|opted.?in|granted)$/i.test(String(v || '').trim());
const no = (v) => /^(n|no|false|0|opted.?out|revoked)$/i.test(String(v || '').trim());

export default function ImportContacts() {
  useTitle('Import contacts');
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const can = usePerm();
  const fileRef = useRef(null);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState([]);
  const [dupMode, setDupMode] = useState('skip');
  const [listId, setListId] = useState('');
  const [newList, setNewList] = useState('');
  const [tags, setTags] = useState([]);
  const [consentSource, setConsentSource] = useState('CSV import');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [dragOver, setDragOver] = useState(false);

  const load = (f) => {
    setError('');
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setError('Please upload a .csv file.');
    if (f.size > 5 * 1024 * 1024) return setError('File is larger than 5 MB. Split it into smaller files.');
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result).replace(/^﻿/, ''));
      if (parsed.length < 2) return setError('The file needs a header row and at least one data row.');
      const [h, ...data] = parsed;
      setHeaders(h);
      setRows(data);
      const used = new Set(); setMap(h.map((col) => { const k = Object.entries(GUESS).find(([key, re]) => !used.has(key) && re.test(col.trim()))?.[0] || ''; if (k) used.add(k); return k; }));
      setFile({ name: f.name, size: f.size });
      setStep(2);
    };
    reader.onerror = () => setError('Could not read the file.');
    reader.readAsText(f);
  };
  const useSample = () => load(new File([SAMPLE], 'sample-contacts.csv', { type: 'text/csv' }));

  // Validate every row against the mapping and existing contacts.
  const analysis = useMemo(() => {
    if (!rows.length) return [];
    const byEmail = Object.fromEntries(o.contacts.filter((c) => c.email).map((c) => [c.email, c]));
    const byPhone = Object.fromEntries(o.contacts.filter((c) => c.phone).map((c) => [c.phone, c]));
    const seen = new Set();
    return rows.map((r, i) => {
      const v = {};
      map.forEach((t, ci) => { if (t) v[t] = (r[ci] || '').trim(); });
      if (v.full_name && !v.first_name && !v.last_name) { const p = v.full_name.split(/\s+/); v.first_name = p[0]; v.last_name = p.slice(1).join(' '); }
      const errors = []; const warnings = [];
      const empty = !r.some((x) => x.trim());
      if (empty) errors.push('Empty row');
      if (!empty && !v.first_name && !v.last_name) errors.push('Missing name');
      if (v.email && !isEmail(v.email)) errors.push(`Invalid email “${v.email}”`);
      let phone = '';
      if (v.phone) { phone = normalizePhone(v.phone); if (!phone) errors.push(`Invalid phone “${v.phone}”`); }
      if (!empty && !v.email && !v.phone) errors.push('No email or phone');
      const email = v.email?.toLowerCase();
      const key = email || phone;
      let dup = null; let dupInFile = false;
      if (key && seen.has(key)) dupInFile = true;
      if (key) seen.add(key);
      if (email && byEmail[email]) dup = byEmail[email];
      else if (phone && byPhone[phone]) dup = byPhone[phone];
      if (!v.email && !errors.length) warnings.push('No email — email campaigns will skip this contact');
      if (!v.phone && !errors.length) warnings.push('No phone — SMS/WhatsApp will skip this contact');
      if (dupInFile) errors.push('Duplicate row within this file');
      return { i: i + 2, raw: r, v: { ...v, email: email || '', phone: phone || '' }, errors, warnings, dup };
    });
  }, [rows, map, o.contacts]);
  const valid = analysis.filter((a) => !a.errors.length);
  const invalid = analysis.filter((a) => a.errors.length);
  const dups = valid.filter((a) => a.dup);
  const mapped = new Set(map.filter(Boolean));
  const mapErr = !mapped.has('email') && !mapped.has('phone') ? 'Map at least an Email or Phone column.' : !mapped.has('first_name') && !mapped.has('full_name') && !mapped.has('last_name') ? 'Map a name column (first, last or full name).' : null;
  const doubleMapped = map.filter((t, i) => t && map.indexOf(t) !== i);

  const doImport = () => {
    const res = run((d, ctx) => {
      const tagIds = resolveTags(d, ctx, tags);
      let target = listId;
      if (newList.trim()) target = createList(d, ctx, { name: newList.trim(), description: `Imported from ${file.name}` }).id;
      const out = { created: [], updated: [], skipped: [], failed: invalid.map((a) => ({ row: a.i, reason: a.errors.join('; '), raw: a.raw })) };
      valid.forEach((a) => {
        const v = a.v;
        const custom_fields = Object.fromEntries(['building', 'unit', 'lease_end', 'renewal_date'].filter((k) => v[k]).map((k) => [k, v[k]]));
        const rowTags = resolveTags(d, ctx, (v.tags || '').split(/[;|]/).map((t) => t.trim()).filter(Boolean).map((t) => 'new:' + t));
        let contact;
        if (a.dup) {
          if (dupMode === 'skip') { out.skipped.push({ row: a.i, name: fullName(a.dup), reason: 'Duplicate of existing contact' }); return; }
          const patch = {};
          ['first_name', 'last_name', 'email', 'phone', 'company', 'job_title'].forEach((k) => v[k] && (patch[k] = v[k]));
          if (Object.keys(custom_fields).length) patch.custom_fields = custom_fields;
          contact = updateContact(d, ctx, a.dup.id, patch);
          out.updated.push({ row: a.i, name: fullName(contact), id: contact.id });
        } else {
          contact = createContact(d, ctx, { first_name: v.first_name, last_name: v.last_name, email: v.email, phone: v.phone, company: v.company, job_title: v.job_title, custom_fields, source: 'CSV import' }, { silent: true });
          out.created.push({ row: a.i, name: fullName(contact), id: contact.id });
        }
        [...new Set([...tagIds, ...rowTags])].forEach((t) => addTag(d, ctx, contact.id, t));
        [['email', v.email_consent], ['sms', v.sms_consent], ['whatsapp', v.whatsapp_consent]].forEach(([ch, val]) => {
          if (yes(val) && (ch === 'email' ? contact.email : contact.phone)) setConsent(d, ctx, contact.id, ch, { status: 'granted', purpose: 'operational', source: consentSource });
          else if (no(val)) setConsent(d, ctx, contact.id, ch, { status: 'revoked', source: consentSource });
        });
        if (!a.dup) emit(d, ctx, { type: 'contact.created', contactId: contact.id });
      });
      if (target) addToList(d, ctx, target, [...out.created, ...out.updated].map((x) => x.id));
      logActivity(d, ctx, { event_type: 'contact.imported', entity_type: 'import', entity_id: null, summary: `${out.created.length} contacts imported from ${file.name}${out.updated.length ? `, ${out.updated.length} updated` : ''}${out.skipped.length ? `, ${out.skipped.length} skipped as duplicates` : ''}${out.failed.length ? `, ${out.failed.length} rejected` : ''}`, details: { created: out.created.length, updated: out.updated.length, skipped: out.skipped.length, failed: out.failed.length } });
      notify(d, ctx, { type: 'import', message: `Contact import completed — ${out.created.length} created, ${out.updated.length} updated, ${out.skipped.length + out.failed.length} not imported.`, link: '/app/contacts', tone: out.failed.length ? 'warn' : 'success' });
      return out;
    });
    if (res) { setResult(res); setStep(4); }
  };
  const errorReport = () => download('import-errors.csv', toCSV([['row', 'reason', ...headers], ...result.failed.map((f) => [f.row, f.reason, ...f.raw]), ...result.skipped.map((s) => [s.row, s.reason])]));

  if (!can('contacts.manage')) return <Empty title="You don't have permission to import contacts">Ask a workspace admin to change your role.</Empty>;

  const preview = tab === 'errors' ? invalid : tab === 'dups' ? dups : tab === 'ok' ? valid.filter((a) => !a.dup) : analysis;
  return (
    <>
      <PageHead tabs={CONTACT_TABS} title="Contacts" description="Upload a spreadsheet (CSV). We’ll match the columns, flag problems and duplicates, and show you everything before importing." actions={<button className="btn" onClick={() => download('relayline-sample-contacts.csv', SAMPLE)}><Download />Sample CSV</button>} />
      <div className="steps" aria-label="Import progress">{['Upload', 'Map columns', 'Review', 'Results'].map((s, i) => <span key={s} className={`step-pill ${step > i + 1 ? 'done' : step === i + 1 ? 'current' : ''}`}><span className="num">{i + 1}</span>{s}</span>)}</div>

      {step === 1 && (
        <div className="card card-body stack">
          {error && <Callout tone="err">{error}</Callout>}
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); load(e.dataTransfer.files[0]); }}
            className="empty" style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 12, background: dragOver ? 'var(--accent-soft)' : 'transparent' }}>
            <div className="empty-icon"><Upload size={20} /></div><h3>Drop a CSV file here</h3><p>One contact per row with a header row. Up to 5 MB. Columns for name and at least email or phone are required.</p>
            <div className="row"><button className="btn btn-primary" onClick={() => fileRef.current.click()}><FileText />Choose file</button><button className="btn" onClick={useSample}>Use sample file</button></div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => load(e.target.files[0])} aria-label="CSV file" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="card"><div className="card-head"><h3>Map columns — {file.name}</h3><span className="faint small">{plural(rows.length, 'row')} detected</span></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>CSV column</th><th>Sample values</th><th>Import as</th></tr></thead><tbody>
              {headers.map((h, i) => (
                <tr key={i}><td className="strong">{h || <span className="faint">(blank header)</span>}</td><td className="muted small">{rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ') || '—'}</td>
                  <td><select className={`select input-sm ${doubleMapped.includes(map[i]) ? 'invalid' : ''}`} value={map[i]} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Map ${h}`}>{TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>
              ))}
            </tbody></table></div>
          </div>
          {(mapErr || doubleMapped.length > 0) && <Callout tone="err">{mapErr || `Each field can only be mapped once (${doubleMapped.join(', ')}).`}</Callout>}
          <div className="between"><button className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft />Back</button><button className="btn btn-primary" disabled={!!mapErr || doubleMapped.length > 0} onClick={() => setStep(3)}>Review data<ArrowRight /></button></div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <div className="grid-4">
            <div className="card stat"><div className="stat-label">Rows</div><div className="stat-value">{analysis.length}</div></div>
            <div className="card stat"><div className="stat-label"><CheckCircle2 size={14} className="ok" />Ready to import</div><div className="stat-value">{valid.length - dups.length}</div></div>
            <div className="card stat"><div className="stat-label"><Copy size={14} className="warn" />Possible duplicates</div><div className="stat-value">{dups.length}</div></div>
            <div className="card stat"><div className="stat-label"><XCircle size={14} className="err" />Errors (won’t import)</div><div className="stat-value">{invalid.length}</div></div>
          </div>
          {invalid.length > 0 && <Callout tone="warn">{plural(invalid.length, 'row has', 'rows have')} validation errors. They will not be imported, and you can download them afterwards to fix and re-upload.</Callout>}
          <div className="card">
            <div style={{ padding: '0 14px' }}><Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All rows', count: analysis.length }, { value: 'ok', label: 'Ready', count: valid.length - dups.length }, { value: 'dups', label: 'Duplicates', count: dups.length }, { value: 'errors', label: 'Errors', count: invalid.length }]} /></div>
            <div className="table-wrap" style={{ maxHeight: 420 }}><table className="table"><thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>
              {preview.map((a) => (
                <tr key={a.i}><td className="faint">{a.i}</td><td>{[a.v.first_name, a.v.last_name].filter(Boolean).join(' ') || <span className="faint">—</span>}</td><td className="muted">{a.v.email || a.raw[map.indexOf('email')] || '—'}</td><td className="muted">{a.v.phone || a.raw[map.indexOf('phone')] || '—'}</td>
                  <td>{a.errors.length ? <span className="err small">{a.errors.join('; ')}</span> : a.dup ? <span className="row small"><Badge tone="warn">Duplicate</Badge>matches <Link className="accent" to={`/app/contacts/${a.dup.id}`}>{fullName(a.dup)}</Link></span> : <span className="row small"><Badge tone="ok">Ready</Badge>{a.warnings[0] && <span className="faint xs">{a.warnings[0]}</span>}</span>}</td></tr>
              ))}
              {!preview.length && <tr><td colSpan={5} className="faint" style={{ textAlign: 'center', padding: 24 }}>No rows in this view.</td></tr>}
            </tbody></table></div>
          </div>
          <div className="card card-body form-grid">
            <Field label="When a contact already exists" className="full">
              <div className="row wrap">{[['skip', 'Skip duplicates', 'Keep existing records unchanged'], ['update', 'Update existing contacts', 'Overwrite fields that have values in the file']].map(([k, l, d]) => <label key={k} className={`choice ${dupMode === k ? 'selected' : ''}`} style={{ flex: 1, minWidth: 220 }}><input type="radio" name="dup" checked={dupMode === k} onChange={() => setDupMode(k)} /><span><span className="strong small" style={{ display: 'block' }}>{l}</span><span className="faint xs">{d}</span></span></label>)}</div>
            </Field>
            <Field label="Add imported contacts to a list (optional)"><select className="select" value={listId} onChange={(e) => { setListId(e.target.value); setNewList(''); }}><option value="">Don’t add to a list</option>{o.lists.filter((l) => l.type === 'static').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="…or create a new list"><input className="input" value={newList} onChange={(e) => { setNewList(e.target.value); setListId(''); }} placeholder="e.g. Building C Residents" /></Field>
            <Field label="Tag all imported contacts (optional)" className="full"><TagPicker value={tags} onChange={setTags} /></Field>
            <Field label="Consent source for consent columns" hint="Applied to any 'yes' values in consent columns. Only import consent you can evidence." className="full"><input className="input" value={consentSource} onChange={(e) => setConsentSource(e.target.value)} /></Field>
          </div>
          <div className="between"><button className="btn btn-ghost" onClick={() => setStep(2)}><ArrowLeft />Back to mapping</button>
            <button className="btn btn-primary" disabled={!valid.length || (dupMode === 'skip' && valid.length === dups.length)} onClick={doImport}>Import {plural(dupMode === 'skip' ? valid.length - dups.length : valid.length, 'contact')}</button></div>
        </div>
      )}

      {step === 4 && result && (
        <div className="stack">
          <Callout tone={result.failed.length ? 'warn' : 'info'} icon={result.failed.length ? AlertTriangle : CheckCircle2}>Import finished: <strong>{result.created.length}</strong> created, <strong>{result.updated.length}</strong> updated, <strong>{result.skipped.length}</strong> skipped, <strong>{result.failed.length}</strong> rejected.</Callout>
          <div className="grid-2">
            <div className="card"><div className="card-head"><h3>Imported</h3><Badge tone="ok">{result.created.length + result.updated.length}</Badge></div><div className="card-body stack" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {[...result.created.map((x) => ({ ...x, t: 'Created' })), ...result.updated.map((x) => ({ ...x, t: 'Updated' }))].map((x) => <div key={x.id + x.t} className="between small"><Link to={`/app/contacts/${x.id}`} className="accent">{x.name}</Link><span className="faint">Row {x.row} · {x.t}</span></div>)}
              {!result.created.length && !result.updated.length && <span className="faint small">Nothing was imported.</span>}
            </div></div>
            <div className="card"><div className="card-head"><h3>Not imported</h3><Badge tone={result.failed.length ? 'err' : 'neutral'}>{result.failed.length + result.skipped.length}</Badge></div><div className="card-body stack" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {result.failed.map((f) => <div key={'f' + f.row} className="between small"><span>Row {f.row}</span><span className="err">{f.reason}</span></div>)}
              {result.skipped.map((s) => <div key={'s' + s.row} className="between small"><span>Row {s.row} · {s.name}</span><span className="warn">{s.reason}</span></div>)}
              {!result.failed.length && !result.skipped.length && <span className="faint small">Every valid row was imported.</span>}
            </div></div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => nav('/app/contacts')}>View contacts</button>
            {(result.failed.length > 0 || result.skipped.length > 0) && <button className="btn" onClick={errorReport}><Download />Download rows not imported</button>}
            <button className="btn btn-ghost" onClick={() => { setStep(1); setRows([]); setResult(null); setTags([]); setNewList(''); setListId(''); }}>Import another file</button>
          </div>
        </div>
      )}
    </>
  );
}
