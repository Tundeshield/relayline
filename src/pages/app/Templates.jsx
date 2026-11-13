import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Copy, Trash2, Pencil, Eye, Send } from 'lucide-react';
import { useOrg, upd } from '../../data/store';
import { PageHead, Empty, Modal, Field, ChannelIcon, Badge, Menu, MenuItem, useConfirm, Callout } from '../../components/ui';
import Composer, { MessagePreview } from '../../components/Composer';
import { uid, fmtDate, usedVariables } from '../../lib/util';
import { TEMPLATE_CATEGORIES, CHANNEL_LABEL } from '../../lib/constants';
import { logActivity } from '../../services/core';
import { useAction, usePerm, useTitle } from '../../lib/hooks';
import { MoreHorizontal } from 'lucide-react';

export default function Templates() {
  useTitle('Templates');
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [category, setCategory] = useState('');
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => { const id = sp.get('open'); const t = id && o.templates.find((x) => x.id === id); if (t) { setPreview(t); setSp({}, { replace: true }); } }, [sp]); // eslint-disable-line

  const rows = useMemo(() => o.templates.filter((t) => (!channel || t.channel === channel) && (!category || t.category === category) && (!q || `${t.name} ${t.content} ${t.subject}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)), [o.templates, q, channel, category]);
  const groups = TEMPLATE_CATEGORIES.map((c) => [c, rows.filter((t) => t.category === c)]).filter(([, r]) => r.length);
  const usage = (t) => o.automations.filter((a) => JSON.stringify(a.workflow).includes(t.id)).length;

  const duplicate = (t) => run((d, ctx) => { const n = { ...t, id: uid('tpl'), name: `${t.name} (copy)`, created_at: ctx.now, updated_at: ctx.now, created_by: ctx.userId }; d.templates.push(n); logActivity(d, ctx, { event_type: 'template.created', entity_type: 'template', entity_id: n.id, summary: `Template “${n.name}” created` }); }, { success: 'Template duplicated.' });
  const remove = async (t) => {
    const u = usage(t);
    if (!(await confirm({ title: `Delete “${t.name}”?`, message: u ? `This template is used by ${u} automation(s). Those steps will need a message before they can run.` : 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    run((d, ctx) => { d.templates = d.templates.filter((x) => x.id !== t.id); logActivity(d, ctx, { event_type: 'template.deleted', entity_type: 'template', entity_id: t.id, summary: `Template “${t.name}” deleted` }); }, { success: 'Template deleted.' });
  };

  return (
    <>
      <PageHead title="Templates" description="Reusable, channel-specific messages with personalisation variables." actions={<button className="btn btn-primary" onClick={() => setEdit({})} disabled={!can('templates.manage')}><Plus />New template</button>} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <div className="input-icon" style={{ flex: '1 1 240px', maxWidth: 340 }}><Search /><input className="input input-sm" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" /></div>
          <select className="select input-sm" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel"><option value="">All channels</option>{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
          <select className="select input-sm" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{TEMPLATE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <span className="faint small" style={{ marginLeft: 'auto' }}>{rows.length} templates</span>
        </div>
      </div>
      {o.templates.length === 0 ? <div className="card"><Empty icon={FileText} title="No templates yet" action={<button className="btn btn-primary" onClick={() => setEdit({})}><Plus />Create template</button>}>Save messages you send often — like maintenance notices or reminders.</Empty></div>
        : rows.length === 0 ? <div className="card"><Empty icon={Search} title="No matching templates" /></div>
          : groups.map(([cat, list]) => (
            <div key={cat} style={{ marginBottom: 24 }}>
              <div className="nav-group-label" style={{ padding: '0 0 8px' }}>{cat.toUpperCase()}</div>
              <div className="grid-3">
                {list.map((t) => (
                  <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-body stack" style={{ gap: 10, flex: 1 }}>
                      <div className="between" style={{ alignItems: 'flex-start' }}>
                        <div className="row" style={{ minWidth: 0 }}><ChannelIcon channel={t.channel} /><button className="strong truncate" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setPreview(t)}>{t.name}</button></div>
                        <Menu trigger={({ toggle }) => <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label="Template actions"><MoreHorizontal /></button>}>
                          <MenuItem icon={Eye} onClick={() => setPreview(t)}>Preview</MenuItem>
                          <MenuItem icon={Pencil} onClick={() => setEdit(t)} disabled={!can('templates.manage')}>Edit</MenuItem>
                          <MenuItem icon={Copy} onClick={() => duplicate(t)} disabled={!can('templates.manage')}>Duplicate</MenuItem>
                          <MenuItem icon={Send} onClick={() => nav('/app/campaigns/new', { state: { templateId: t.id } })} disabled={!can('campaigns.send')}>Use in campaign</MenuItem>
                          <MenuItem icon={Trash2} danger onClick={() => remove(t)} disabled={!can('templates.manage')}>Delete</MenuItem>
                        </Menu>
                      </div>
                      {t.subject && <div className="small strong" style={{ fontWeight: 500 }}>{t.subject}</div>}
                      <p className="muted small" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.content}</p>
                    </div>
                    <div className="between" style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
                      <span className="row wrap" style={{ gap: 4 }}>{usedVariables(t.content + t.subject).slice(0, 3).map((v) => <span key={v} className="var-chip">{v}</span>)}</span>
                      <span className="faint xs">{usage(t) ? `${usage(t)} automation${usage(t) > 1 ? 's' : ''}` : `Updated ${fmtDate(t.updated_at, { year: false })}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      {edit && <TemplateEditor template={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {preview && <TemplatePreview t={preview} onClose={() => setPreview(null)} onEdit={() => { setEdit(preview); setPreview(null); }} />}
    </>
  );
}

function TemplatePreview({ t, onClose, onEdit }) {
  const o = useOrg();
  const [cid, setCid] = useState(o.contacts.find((c) => (t.channel === 'email' ? c.email : c.phone))?.id || '');
  const contact = o.contacts.find((c) => c.id === cid);
  return (
    <Modal title={t.name} description={`${CHANNEL_LABEL[t.channel]} · ${t.category}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={onEdit}><Pencil />Edit</button></>}>
      <div className="stack">
        <Field label="Preview with contact"><select className="select" value={cid} onChange={(e) => setCid(e.target.value)}>{o.contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].join(' ')}</option>)}</select></Field>
        <MessagePreview channel={t.channel} subject={t.subject} body={t.content} contact={contact} org={o.org} />
      </div>
    </Modal>
  );
}

function TemplateEditor({ template, onClose }) {
  const o = useOrg();
  const run = useAction();
  const [f, setF] = useState({ name: template?.name || '', channel: template?.channel || 'email', category: template?.category || 'Announcement', subject: template?.subject || '', body: template?.content || '', template_name: template?.template_name || '' });
  const [errors, setErrors] = useState({});
  const sample = o.contacts.find((c) => (f.channel === 'email' ? c.email : c.phone));
  const save = () => {
    const er = {};
    if (!f.name.trim()) er.name = 'Name is required.';
    if (!f.body.trim()) er.body = 'Message is required.';
    if (f.channel === 'email' && !f.subject.trim()) er.subject = 'Email templates need a subject.';
    setErrors(er);
    if (Object.keys(er).length) return;
    run((d, ctx) => {
      const data = { name: f.name.trim(), channel: f.channel, category: f.category, subject: f.channel === 'email' ? f.subject : '', content: f.body, template_name: f.template_name, updated_at: ctx.now };
      if (template) { upd(d.templates, template.id, data); logActivity(d, ctx, { event_type: 'template.updated', entity_type: 'template', entity_id: template.id, summary: `Template “${data.name}” updated` }); }
      else { const t = { id: uid('tpl'), organisation_id: ctx.orgId, ...data, created_by: ctx.userId, created_at: ctx.now }; d.templates.push(t); logActivity(d, ctx, { event_type: 'template.created', entity_type: 'template', entity_id: t.id, summary: `Template “${t.name}” created` }); }
    }, { success: template ? 'Template saved.' : 'Template created.' });
    onClose();
  };
  return (
    <Modal title={template ? 'Edit template' : 'New template'} size="xl" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{template ? 'Save template' : 'Create template'}</button></>}>
      <div className="stack">
        <div className="grid-3">
          <Field label="Name" error={errors.name}><input className={`input ${errors.name ? 'invalid' : ''}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Channel"><select className="select" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} disabled={!!template}>{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select></Field>
          <Field label="Category"><select className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{TEMPLATE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        {template && <Callout>Channel can’t be changed after creation — duplicate the template to adapt it for another channel.</Callout>}
        <Composer channel={f.channel} value={{ subject: f.subject, body: f.body, template_name: f.template_name }} onChange={(v) => setF({ ...f, subject: v.subject ?? f.subject, body: v.body, template_name: v.template_name ?? f.template_name })} contact={sample} org={o.org} errors={errors} />
      </div>
    </Modal>
  );
}
