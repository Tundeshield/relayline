import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, ListChecks, Filter, Trash2, Send, UserPlus, Search, X, Pencil, Download } from 'lucide-react';
import { useOrg, getState, upd } from '../../data/store';
import { CONTACT_TABS, PageHead, Empty, Modal, Field, Badge, Callout, Segmented, useConfirm, useSort } from '../../components/ui';
import { ChannelAvail, ContactStatus } from './shared';
import { exportContacts } from './Contacts';
import { listMembers, createList, addToList, removeFromList, SEGMENT_FIELDS, OP_LABEL, evaluateSegment } from '../../services/contacts';
import { logActivity } from '../../services/core';
import { fmtDate, plural, fullName, uid } from '../../lib/util';
import { CHANNEL_LABEL } from '../../lib/constants';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

export default function Lists() {
  useTitle('Groups');
  const o = useOrg();
  const nav = useNavigate();
  const can = usePerm();
  const [create, setCreate] = useState(null);
  const [type, setType] = useState('all');
  const counts = useMemo(() => Object.fromEntries(o.lists.map((l) => [l.id, listMembers(getState(), l, o.contacts).length])), [o]);
  const rows = o.lists.filter((l) => type === 'all' || l.type === type);
  const { sorted, Th } = useSort(rows, { key: 'name', dir: 'asc' }, { count: (l) => counts[l.id] });
  return (
    <>
      <PageHead tabs={CONTACT_TABS} title="Contacts" description="Groups organise contacts for campaigns. Fixed groups contain the people you add; smart groups fill themselves from rules you set."
        actions={<><button className="btn" onClick={() => setCreate('segment')} disabled={!can('contacts.manage')}><Filter />New smart group</button><button className="btn btn-primary" onClick={() => setCreate('static')} disabled={!can('contacts.manage')}><Plus />New group</button></>} />
      <div className="card">
        <div className="toolbar"><Segmented value={type} onChange={setType} options={[['all', 'All groups'], ['static', 'Fixed'], ['segment', 'Smart']]} label="Type" /></div>
        {sorted.length === 0 ? <Empty icon={ListChecks} title="No groups yet" action={<button className="btn btn-primary" onClick={() => setCreate('static')}><Plus />Create a group</button>}>Put contacts into groups (like “Building A Residents”) so you can message them together.</Empty> : (
          <div className="table-wrap"><table className="table"><thead><tr><Th k="name">Name</Th><Th k="type">Type</Th><Th k="count">Contacts</Th><th>Definition</th><Th k="created_at">Created</Th></tr></thead><tbody>
            {sorted.map((l) => <tr key={l.id} className="clickable" onClick={() => nav(`/app/lists/${l.id}`)}><td><Link to={`/app/lists/${l.id}`} className="strong">{l.name}</Link>{l.description && <div className="faint xs">{l.description}</div>}</td><td><Badge tone={l.type === 'segment' ? 'accent' : 'neutral'}>{l.type === 'segment' ? 'Smart group' : 'Fixed group'}</Badge></td><td className="strong">{counts[l.id]}</td><td className="muted small" style={{ maxWidth: 360 }}>{l.type === 'segment' ? <RuleSummary rules={l.rules} /> : 'People you add'}</td><td className="muted">{fmtDate(l.created_at)}</td></tr>)}
          </tbody></table></div>
        )}
      </div>
      {create && <ListEditor type={create} onClose={() => setCreate(null)} onSaved={(l) => nav(`/app/lists/${l.id}`)} />}
    </>
  );
}

export function RuleSummary({ rules }) {
  const o = useOrg();
  if (!rules?.rules?.length) return <span className="faint">No conditions</span>;
  const val = (r) => {
    const f = SEGMENT_FIELDS.find((x) => x.key === r.field);
    if (f?.value === 'tag') return `“${o.tags.find((t) => t.id === r.value)?.name || '?'}”`;
    if (f?.value === 'list') return `“${o.lists.find((t) => t.id === r.value)?.name || '?'}”`;
    if (f?.value === 'channel') return CHANNEL_LABEL[r.value];
    if (f?.value === 'number') return `${r.value} days`;
    if (['is_set', 'is_not_set'].includes(r.op)) return '';
    return `“${r.value}”`;
  };
  return <span>{rules.rules.map((r, i) => <span key={i}>{i > 0 && <strong className="accent"> {rules.match === 'any' ? 'OR' : 'AND'} </strong>}{SEGMENT_FIELDS.find((x) => x.key === r.field)?.label} {OP_LABEL[r.op]} {val(r)}</span>)}</span>;
}

export function RuleBuilder({ value, onChange }) {
  const o = useOrg();
  const rules = value.rules || [];
  const setRule = (i, patch) => onChange({ ...value, rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const valueInput = (r, i) => {
    const f = SEGMENT_FIELDS.find((x) => x.key === r.field);
    if (!f || ['is_set', 'is_not_set'].includes(r.op)) return <span />;
    if (f.value === 'tag') return <select className="select input-sm" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Tag"><option value="">Select tag</option>{o.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>;
    if (f.value === 'list') return <select className="select input-sm" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="List"><option value="">Select list</option>{o.lists.filter((l) => l.type === 'static').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>;
    if (f.value === 'channel') return <select className="select input-sm" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Channel">{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>;
    if (f.value === 'status') return <select className="select input-sm" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Status"><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option><option value="archived">Archived</option></select>;
    if (f.value === 'number') return <input type="number" min="1" className="input input-sm" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Days" />;
    return <input className="input input-sm" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} aria-label="Value" />;
  };
  const defaults = (field) => { const f = SEGMENT_FIELDS.find((x) => x.key === field); return { field, op: f.ops[0], value: f.value === 'channel' ? 'email' : f.value === 'status' ? 'active' : f.value === 'number' ? 30 : '' }; };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row small">Match <Segmented value={value.match} onChange={(m) => onChange({ ...value, match: m })} options={[['all', 'ALL conditions (AND)'], ['any', 'ANY condition (OR)']]} label="Match type" /></div>
      {rules.map((r, i) => {
        const f = SEGMENT_FIELDS.find((x) => x.key === r.field);
        return (
          <div key={i} className="rule-row">
            <select className="select input-sm" value={r.field} onChange={(e) => setRule(i, defaults(e.target.value))} aria-label="Field">{SEGMENT_FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            <select className="select input-sm" value={r.op} onChange={(e) => setRule(i, { op: e.target.value })} aria-label="Operator" disabled={f?.ops.length === 1}>{f?.ops.map((op) => <option key={op} value={op}>{OP_LABEL[op] || 'days'}</option>)}</select>
            {valueInput(r, i)}
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange({ ...value, rules: rules.filter((_, j) => j !== i) })} aria-label="Remove condition"><X /></button>
          </div>
        );
      })}
      <div><button type="button" className="btn btn-sm" onClick={() => onChange({ ...value, rules: [...rules, defaults('tag')] })}><Plus />Add condition</button></div>
    </div>
  );
}

function ListEditor({ type, list, onClose, onSaved }) {
  const o = useOrg();
  const run = useAction();
  const [name, setName] = useState(list?.name || '');
  const [description, setDescription] = useState(list?.description || '');
  const [rules, setRules] = useState(list?.rules || { match: 'all', rules: [{ field: 'tag', op: 'has', value: o.tags[0]?.id || '' }] });
  const [err, setErr] = useState('');
  const preview = useMemo(() => (type === 'segment' ? o.contacts.filter((c) => evaluateSegment(getState(), c, { id: list?.id || 'new', rules })) : []), [rules, o.contacts]); // eslint-disable-line
  const incomplete = type === 'segment' && rules.rules.some((r) => { const f = SEGMENT_FIELDS.find((x) => x.key === r.field); return !['is_set', 'is_not_set'].includes(r.op) && f.value !== 'channel' && f.value !== 'status' && (r.value === '' || r.value == null); });
  const save = () => {
    if (!name.trim()) return setErr('Name is required.');
    if (o.lists.some((l) => l.id !== list?.id && l.name.toLowerCase() === name.trim().toLowerCase())) return setErr('A group with this name already exists.');
    if (type === 'segment' && (!rules.rules.length || incomplete)) return setErr('Complete every condition.');
    const saved = run((d, ctx) => {
      if (list) { upd(d.lists, list.id, { name: name.trim(), description, rules: type === 'segment' ? rules : null }); logActivity(d, ctx, { event_type: 'list.updated', entity_type: 'list', entity_id: list.id, summary: `${type === 'segment' ? 'Smart group' : 'Group'} “${name.trim()}” updated` }); return d.lists.find((x) => x.id === list.id); }
      return createList(d, ctx, { name, description, type, rules: type === 'segment' ? rules : null });
    }, { success: list ? 'Saved.' : type === 'segment' ? 'Smart group created.' : 'Group created.' });
    if (saved) { onSaved?.(saved); onClose(); }
  };
  return (
    <Modal title={list ? `Edit ${list.name}` : type === 'segment' ? 'New smart group' : 'New group'} size={type === 'segment' ? 'lg' : undefined} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{list ? 'Save' : 'Create'}</button></>}>
      <div className="stack">
        {err && <Callout tone="err">{err}</Callout>}
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Description (optional)"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        {type === 'segment' && <><div className="label">Conditions</div><RuleBuilder value={rules} onChange={setRules} /><Callout>Right now this matches <strong>{plural(preview.length, 'contact')}</strong> right now{preview.length ? `: ${preview.slice(0, 4).map(fullName).join(', ')}${preview.length > 4 ? '…' : ''}` : ''}. Membership updates automatically.</Callout></>}
      </div>
    </Modal>
  );
}

export function ListDetail() {
  const { id } = useParams();
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const list = o.lists.find((l) => l.id === id);
  useTitle(list?.name || 'List');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const members = useMemo(() => (list ? listMembers(getState(), list, o.contacts) : []), [list, o]);
  const shown = members.filter((c) => !q || fullName(c).toLowerCase().includes(q.toLowerCase()) || (c.email || '').includes(q.toLowerCase()));
  const { sorted, Th } = useSort(shown, { key: 'name', dir: 'asc' }, { name: (c) => fullName(c) });
  if (!list) return <Empty title="List not found" action={<Link className="btn" to="/app/lists">Back to lists</Link>} />;
  const usedBy = o.campaigns.filter((c) => c.audience?.ids?.includes(list.id));
  const autos = o.automations.filter((a) => JSON.stringify(a.workflow).includes(list.id));
  const del = async () => {
    if (!(await confirm({ title: `Delete “${list.name}”?`, message: `${usedBy.length || autos.length ? `It is referenced by ${usedBy.length} campaign(s) and ${autos.length} automation(s). ` : ''}Contacts themselves are not deleted.`, confirmLabel: 'Delete', danger: true }))) return;
    run((d, ctx) => { d.lists = d.lists.filter((l) => l.id !== list.id); d.listMemberships = d.listMemberships.filter((m) => m.list_id !== list.id); logActivity(d, ctx, { event_type: 'list.deleted', entity_type: 'list', entity_id: list.id, summary: `${list.type === 'segment' ? 'Smart group' : 'Group'} “${list.name}” deleted` }); }, { success: 'Deleted.' });
    nav('/app/lists');
  };
  const reach = { email: members.filter((c) => c.email).length, phone: members.filter((c) => c.phone).length };
  return (
    <>
      <PageHead crumbs={[{ label: 'Groups', to: '/app/lists' }, { label: list.name }]} title={list.name} description={list.description || (list.type === 'segment' ? 'Smart group — updates automatically' : 'Fixed group')}
        actions={<>
          <button className="btn" onClick={() => exportContacts(members, o, `${list.name.replace(/\W+/g, '-').toLowerCase()}.csv`)} disabled={!can('contacts.delete') || !members.length}><Download />Export</button>
          <button className="btn" onClick={() => nav('/app/campaigns/new', { state: { audience: { type: list.type === 'segment' ? 'segment' : 'list', ids: [list.id] } } })} disabled={!can('campaigns.send') || !members.length}><Send />Send campaign</button>
          <button className="btn" onClick={() => setEditing(true)} disabled={!can('contacts.manage')}><Pencil />Edit</button>
          {list.type === 'static' && <button className="btn btn-primary" onClick={() => setAdding(true)} disabled={!can('contacts.manage')}><UserPlus />Add contacts</button>}
          <button className="btn btn-danger btn-icon" onClick={del} aria-label="Delete list" disabled={!can('contacts.manage')}><Trash2 /></button>
        </>} />
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="stat-label">Contacts</div><div className="stat-value">{members.length}</div></div>
        <div className="card stat"><div className="stat-label">With email</div><div className="stat-value">{reach.email}</div></div>
        <div className="card stat"><div className="stat-label">With phone</div><div className="stat-value">{reach.phone}</div></div>
        <div className="card stat"><div className="stat-label">Used in campaigns</div><div className="stat-value">{usedBy.length}</div></div>
      </div>
      {list.type === 'segment' && <div style={{ marginBottom: 16 }}><Callout icon={Filter}><RuleSummary rules={list.rules} /></Callout></div>}
      <div className="card">
        <div className="toolbar"><div className="input-icon" style={{ maxWidth: 320, flex: 1 }}><Search /><input className="input input-sm" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" /></div></div>
        {members.length === 0 ? <Empty icon={ListChecks} title={list.type === 'segment' ? 'No contacts match these conditions' : 'This group is empty'} action={list.type === 'static' ? <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus />Add contacts</button> : <button className="btn" onClick={() => setEditing(true)}>Edit conditions</button>} /> : (
          <div className="table-wrap"><table className="table"><thead><tr><Th k="name">Name</Th><Th k="email">Email</Th><th>Channels</th><Th k="status">Status</Th>{list.type === 'static' && <th />}</tr></thead><tbody>
            {sorted.map((c) => <tr key={c.id}><td><Link to={`/app/contacts/${c.id}`} className="strong">{fullName(c)}</Link></td><td className="muted">{c.email || '—'}</td><td><ChannelAvail contact={c} /></td><td><ContactStatus status={c.status} /></td>
              {list.type === 'static' && <td className="right"><button className="btn btn-ghost btn-sm" disabled={!can('contacts.manage')} onClick={() => run((d, ctx) => removeFromList(d, ctx, list.id, [c.id]), { success: `${fullName(c)} removed.` })}>Remove</button></td>}</tr>)}
          </tbody></table></div>
        )}
      </div>
      {adding && <AddMembers list={list} existing={new Set(members.map((m) => m.id))} onClose={() => setAdding(false)} />}
      {editing && <ListEditor type={list.type} list={list} onClose={() => setEditing(false)} />}
    </>
  );
}

function AddMembers({ list, existing, onClose }) {
  const o = useOrg();
  const run = useAction();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const cands = o.contacts.filter((c) => !existing.has(c.id) && (!q || fullName(c).toLowerCase().includes(q.toLowerCase()) || (c.email || '').includes(q.toLowerCase())));
  return (
    <Modal title={`Add contacts to ${list.name}`} size="lg" onClose={onClose} footer={<><span className="faint small" style={{ marginRight: 'auto' }}>{sel.size} selected</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!sel.size} onClick={() => { run((d, ctx) => addToList(d, ctx, list.id, [...sel]), { success: (n) => `${plural(n, 'contact')} added to ${list.name}.` }); onClose(); }}>Add {sel.size || ''}</button></>}>
      <div className="input-icon" style={{ marginBottom: 12 }}><Search /><input className="input" placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search contacts" /></div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }} className="card">
        {cands.length === 0 && <div className="faint small" style={{ padding: 20, textAlign: 'center' }}>No contacts to add.</div>}
        {cands.map((c) => <label key={c.id} className="between" style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}><span className="check"><input type="checkbox" checked={sel.has(c.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />{fullName(c)}<span className="faint small">{c.email || c.phone}</span></span><ChannelAvail contact={c} /></label>)}
      </div>
      <p className="faint xs" style={{ marginTop: 8 }}>Adding contacts can trigger active automations (e.g. “Contact added to a list”).</p>
    </Modal>
  );
}
