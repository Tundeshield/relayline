import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Upload, Download, Search, Tag, ListPlus, Trash2, Users, X, MoreHorizontal, Pencil, Send } from 'lucide-react';
import { useOrg } from '../../data/store';
import { PageHead, Empty, useConfirm, useSort, Menu, MenuItem, useToast } from '../../components/ui';
import { ContactForm, ChannelAvail, ContactStatus, TagPicker, ListPickerModal, resolveTags } from './shared';
import { fullName, fmtDate, fmtPhone, toCSV, download, plural } from '../../lib/util';
import { contactLists, deleteContacts, addTag, addToList, createList, removeFromList } from '../../services/contacts';
import { getConsent } from '../../services/consent';
import { getState } from '../../data/store';
import { useAction, usePerm, useTitle } from '../../lib/hooks';
import { Modal } from '../../components/ui';

export function exportContacts(contacts, o, filename = 'contacts.csv') {
  const s = getState();
  const rows = [['first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'building', 'unit', 'tags', 'lists', 'status', 'email_consent', 'sms_consent', 'whatsapp_consent', 'created_at']];
  contacts.forEach((c) => rows.push([c.first_name, c.last_name, c.email, c.phone, c.company, c.job_title, c.custom_fields?.building, c.custom_fields?.unit, c.tag_ids.map((t) => o.tags.find((x) => x.id === t)?.name).join('; '), contactLists(s, c, o.lists).map((l) => l.name).join('; '), c.status, getConsent(s, c.id, 'email')?.status || 'none', getConsent(s, c.id, 'sms')?.status || 'none', getConsent(s, c.id, 'whatsapp')?.status || 'none', new Date(c.created_at).toISOString()]));
  download(filename, toCSV(rows));
}

export default function Contacts() {
  useTitle('Contacts');
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const can = usePerm();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState(sp.get('tag') || '');
  const [list, setList] = useState(sp.get('list') || '');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState(sp.get('new') ? { contact: null } : null);
  const [bulk, setBulk] = useState(null);

  const tagName = Object.fromEntries(o.tags.map((t) => [t.id, t.name]));
  const memberships = useMemo(() => {
    const s = getState();
    return Object.fromEntries(o.contacts.map((c) => [c.id, contactLists(s, c, o.lists)]));
  }, [o.contacts, o.lists, o.listMemberships, o.consents, o.messages]); // eslint-disable-line

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return o.contacts.filter((c) => {
      if (s && ![fullName(c), c.email, c.phone, c.company, c.custom_fields?.unit].some((v) => String(v || '').toLowerCase().includes(s))) return false;
      if (tag && !c.tag_ids.includes(tag)) return false;
      if (list && !memberships[c.id]?.some((l) => l.id === list)) return false;
      if (channel === 'email' && !c.email) return false;
      if ((channel === 'sms' || channel === 'whatsapp') && !c.phone) return false;
      if (channel === 'none' && (c.email || c.phone)) return false;
      if (channel === 'missing_email' && c.email) return false;
      if (channel === 'missing_phone' && c.phone) return false;
      if (status && c.status !== status) return false;
      return true;
    });
  }, [o.contacts, q, tag, list, channel, status, memberships]);
  const { sorted, Th } = useSort(filtered, { key: 'created_at', dir: 'desc' }, { name: (c) => fullName(c).toLowerCase() });
  const allSel = sorted.length > 0 && sorted.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(sorted.map((c) => c.id)));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sel = [...selected].filter((id) => o.contacts.some((c) => c.id === id));
  const filtersOn = q || tag || list || channel || status;
  const clear = () => { setQ(''); setTag(''); setList(''); setChannel(''); setStatus(''); setSp({}); };

  const bulkDelete = async () => {
    if (!(await confirm({ title: `Delete ${plural(sel.length, 'contact')}?`, message: 'Their profiles, list memberships, consent records and notes will be permanently removed. Message history remains in campaign reports.', confirmLabel: 'Delete', danger: true }))) return;
    run((d, ctx) => deleteContacts(d, ctx, sel), { success: `${plural(sel.length, 'contact')} deleted.` });
    setSelected(new Set());
  };
  const staticLists = o.lists.filter((l) => l.type === 'static');

  return (
    <>
      <PageHead title="Contacts" description={`${plural(o.contacts.length, 'contact')} in ${o.org.name}. Every person you communicate with, with their channels and consent.`}
        actions={<>
          <button className="btn" onClick={() => exportContacts(filtersOn ? sorted : o.contacts, o)} disabled={!can('contacts.delete') || !o.contacts.length} title={can('contacts.delete') ? 'Export to CSV' : 'Your role cannot export contacts'}><Download />Export</button>
          <Link to="/app/contacts/import" className="btn"><Upload />Import</Link>
          <button className="btn btn-primary" onClick={() => setForm({ contact: null })} disabled={!can('contacts.manage')}><Plus />Add contact</button>
        </>} />
      <div className="card">
        <div className="toolbar">
          <div className="input-icon" style={{ flex: '1 1 240px', maxWidth: 340 }}><Search /><input className="input input-sm" placeholder="Search name, email, phone, unit" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" /></div>
          <select className="select input-sm" style={{ width: 'auto' }} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag"><option value="">All tags</option>{o.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select className="select input-sm" style={{ width: 'auto' }} value={list} onChange={(e) => setList(e.target.value)} aria-label="Filter by group"><option value="">All lists & segments</option>{o.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select className="select input-sm" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Filter by channel availability"><option value="">Any channel</option><option value="email">Has email</option><option value="sms">Has phone (SMS/WhatsApp)</option><option value="missing_email">Missing email</option><option value="missing_phone">Missing phone</option></select>
          <select className="select input-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">Any status</option><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option><option value="archived">Archived</option></select>
          {filtersOn && <button className="btn btn-ghost btn-sm" onClick={clear}><X />Clear</button>}
          <span className="faint small" style={{ marginLeft: 'auto' }}>{plural(sorted.length, 'result')}</span>
        </div>
        {sel.length > 0 && (
          <div className="toolbar" style={{ background: 'var(--accent-soft)' }}>
            <span className="strong small">{sel.length} selected</span>
            <button className="btn btn-sm" onClick={() => setBulk('tag')} disabled={!can('contacts.manage')}><Tag />Add tag</button>
            <button className="btn btn-sm" onClick={() => setBulk('list')} disabled={!can('contacts.manage')}><ListPlus />Add to list</button>
            <button className="btn btn-sm" onClick={() => setBulk('unlist')} disabled={!can('contacts.manage')}>Remove from list</button>
            <button className="btn btn-sm" onClick={() => nav('/app/campaigns/new', { state: { contactIds: sel } })} disabled={!can('campaigns.send')}><Send />Message</button>
            <button className="btn btn-sm" onClick={() => exportContacts(o.contacts.filter((c) => selected.has(c.id)), o, 'selected-contacts.csv')} disabled={!can('contacts.delete')}><Download />Export</button>
            <button className="btn btn-sm btn-danger" onClick={bulkDelete} disabled={!can('contacts.delete')}><Trash2 />Delete</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Clear selection</button>
          </div>
        )}
        {o.contacts.length === 0 ? (
          <Empty icon={Users} title="No contacts yet" action={<div className="row"><Link className="btn btn-primary" to="/app/contacts/import"><Upload />Import CSV</Link><button className="btn" onClick={() => setForm({ contact: null })}><Plus />Add manually</button></div>}>Import a CSV or add people one by one. You can record consent per channel as you go.</Empty>
        ) : sorted.length === 0 ? (
          <Empty icon={Search} title="No matching contacts" action={<button className="btn" onClick={clear}>Clear filters</button>}>Try a different search or remove a filter.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th className="cell-check"><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Select all" style={{ accentColor: 'var(--accent)' }} /></th>
                <Th k="name">Name</Th><Th k="email">Email</Th><Th k="phone">Phone</Th><Th k="company">Company</Th><th>Tags</th><th>Lists</th><th>Channels</th><Th k="status">Status</Th><Th k="created_at">Added</Th><th />
              </tr></thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className={`clickable ${selected.has(c.id) ? 'selected' : ''}`} onClick={(e) => !e.target.closest('input,button,a') && nav(`/app/contacts/${c.id}`)}>
                    <td className="cell-check"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${fullName(c)}`} style={{ accentColor: 'var(--accent)' }} /></td>
                    <td><Link to={`/app/contacts/${c.id}`} className="strong">{fullName(c)}</Link>{c.custom_fields?.unit && <div className="faint xs">{c.custom_fields.building} · {c.custom_fields.unit}</div>}</td>
                    <td className="muted">{c.email || <span className="faint">—</span>}</td>
                    <td className="muted nowrap">{fmtPhone(c.phone) || <span className="faint">—</span>}</td>
                    <td className="muted">{c.company || <span className="faint">—</span>}</td>
                    <td><div className="row wrap" style={{ gap: 4, maxWidth: 220 }}>{c.tag_ids.slice(0, 3).map((t) => <span key={t} className="tag">{tagName[t]}</span>)}{c.tag_ids.length > 3 && <span className="faint xs">+{c.tag_ids.length - 3}</span>}</div></td>
                    <td className="muted small" style={{ maxWidth: 200 }}>{memberships[c.id]?.filter((l) => l.type === 'static').map((l) => l.name).join(', ') || <span className="faint">—</span>}</td>
                    <td><ChannelAvail contact={c} /></td>
                    <td><ContactStatus status={c.status} /></td>
                    <td className="muted nowrap">{fmtDate(c.created_at)}</td>
                    <td><Menu trigger={({ toggle: t }) => <button className="btn btn-ghost btn-icon btn-sm" onClick={t} aria-label="Contact actions"><MoreHorizontal /></button>}>
                      <MenuItem icon={Pencil} onClick={() => setForm({ contact: c })} disabled={!can('contacts.manage')}>Edit</MenuItem>
                      <MenuItem icon={Trash2} danger disabled={!can('contacts.delete')} onClick={async () => { if (await confirm({ title: `Delete ${fullName(c)}?`, message: 'This permanently removes the contact.', confirmLabel: 'Delete', danger: true })) run((d, ctx) => deleteContacts(d, ctx, [c.id]), { success: 'Contact deleted.' }); }}>Delete</MenuItem>
                    </Menu></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="faint xs" style={{ marginTop: 10 }}>Channel dots: green = opted in, red = opted out, none = no consent recorded. Dashed icon = channel detail missing.</p>
      {form && <ContactForm contact={form.contact} onClose={() => { setForm(null); if (sp.get('new')) setSp({}); }} onSaved={(c) => !form.contact && nav(`/app/contacts/${c.id}`)} />}
      {bulk === 'tag' && <BulkTag ids={sel} onClose={() => setBulk(null)} />}
      {bulk === 'list' && <ListPickerModal title={`Add ${plural(sel.length, 'contact')} to a list`} lists={staticLists} allowCreate onClose={() => setBulk(null)}
        onPick={(id) => { run((d, ctx) => addToList(d, ctx, id, sel), { success: (n) => `${plural(n, 'contact')} added to the list.` }); setBulk(null); }}
        onCreate={(name) => { run((d, ctx) => { const l = createList(d, ctx, { name }); return addToList(d, ctx, l.id, sel); }, { success: (n) => `List “${name}” created with ${plural(n, 'contact')}.` }); setBulk(null); }} />}
      {bulk === 'unlist' && <ListPickerModal title={`Remove ${plural(sel.length, 'contact')} from a list`} lists={staticLists} onClose={() => setBulk(null)}
        onPick={(id) => { run((d, ctx) => removeFromList(d, ctx, id, sel), { success: (n) => `${plural(n, 'contact')} removed.` }); setBulk(null); }} />}
    </>
  );
}

function BulkTag({ ids, onClose }) {
  const run = useAction();
  const [tags, setTags] = useState([]);
  return (
    <Modal title={`Tag ${plural(ids.length, 'contact')}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!tags.length} onClick={() => { run((d, ctx) => { const t = resolveTags(d, ctx, tags); let n = 0; ids.forEach((id) => t.forEach((tg) => (n += addTag(d, ctx, id, tg) ? 1 : 0))); return n; }, { success: 'Tags applied.' }); onClose(); }}>Apply tags</button></>}>
      <TagPicker value={tags} onChange={setTags} />
    </Modal>
  );
}
