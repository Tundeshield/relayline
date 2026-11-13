import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Zap, GitBranch, Send, Clock, Square, Trash2, Save, Play, Pause, FlaskConical, History, AlertTriangle, CheckCircle2, XCircle, MinusCircle, Workflow, ArrowLeft, Tag, ListPlus, UserCog, Bell, StickyNote, Mail, MessageSquare, MessageCircle, Shuffle, PenLine } from 'lucide-react';
import { useOrg, getState, tx } from '../../data/store';
import { PageHead, Field, Callout, Badge, Menu, MenuItem, StatusBadge, Empty, Switch, useToast } from '../../components/ui';
import { TRIGGERS, CONDITIONS, ACTIONS, DELAY, catalogItem, validateWorkflow } from '../../services/automation/catalog';
import { describeTrigger, startExecution } from '../../services/automation/engine';
import { setAutomationStatus } from './Automations';
import { logActivity, ctxOf } from '../../services/core';
import { AUTOMATION_STATUS, CHANNEL_LABEL, CONTACT_FIELDS } from '../../lib/constants';
import { uid, fullName, cx, relTime, fmtDateTime } from '../../lib/util';
import { upd } from '../../data/store';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

const ACTION_ICON = { send_email: Mail, send_sms: MessageSquare, send_whatsapp: MessageCircle, send_alternative: Shuffle, add_to_list: ListPlus, remove_from_list: ListPlus, add_tag: Tag, remove_tag: Tag, update_field: PenLine, add_note: StickyNote, assign_conversation: UserCog, notify: Bell };
const n = (kind, type, config = {}, extra = {}) => ({ id: uid('n'), kind, type, config, ...(kind === 'condition' ? { yes: [], no: [] } : {}), ...extra });

const STARTERS = [
  { key: 'welcome', name: 'Welcome New Contact', desc: 'Contact created → if email consent, send welcome email and tag.', build: (o) => ({ trigger: { type: 'contact.created', config: {} }, steps: [n('condition', 'consent', { channel: 'email', purpose: 'operational' }, { yes: [n('action', 'send_email', { templateId: o.templates.find((t) => t.category === 'Welcome' && t.channel === 'email')?.id || '', purpose: 'operational' }), n('action', 'add_tag', { tagId: o.tags.find((t) => t.name === 'New Contact')?.id || '' })], no: [] })] }) },
  { key: 'failed', name: 'Failed Message Follow-up', desc: 'Message failed → if another consented channel exists, resend there and log it.', build: () => ({ trigger: { type: 'message.failed', config: {} }, steps: [n('condition', 'alt_channel', {}, { yes: [n('action', 'send_alternative', {}), n('action', 'add_note', { text: 'Fallback sent after a failed message.' })], no: [n('action', 'add_note', { text: 'No eligible fallback channel.' })] })] }) },
  { key: 'appt', name: 'Appointment Reminder', desc: '1 day before appointment → remind, wait, record whether they responded.', build: (o) => ({ trigger: { type: 'time.before_date', config: { field: 'appointment_at', days: 1 } }, steps: [n('action', 'send_sms', { templateId: o.templates.find((t) => t.category === 'Appointment')?.id || '', body: o.templates.find((t) => t.category === 'Appointment') ? '' : 'Hi {{first_name}}, reminder: your appointment is tomorrow. Reply YES to confirm.', purpose: 'operational' }), n('delay', 'delay', { amount: 4, unit: 'hours' }), n('condition', 'responded', {}, { yes: [n('action', 'update_field', { field: 'appointment_confirmed', value: 'Yes' })], no: [n('action', 'notify', { message: '{{first_name}} {{last_name}} has not confirmed.' })] })] }) },
  { key: 'unanswered', name: 'Unanswered Communication', desc: 'Message delivered → wait 48 hours → if no reply, follow up.', build: () => ({ trigger: { type: 'message.delivered', config: { channel: 'sms' } }, steps: [n('delay', 'delay', { amount: 48, unit: 'hours' }), n('condition', 'responded', {}, { yes: [n('end', 'end')], no: [n('action', 'send_sms', { body: 'Hi {{first_name}}, just checking you saw our last message from {{organisation_name}}. Reply here with any questions.', purpose: 'operational' })] })] }) },
  { key: 'renewal', name: 'Membership Renewal Reminder', desc: '14 days before renewal → remind, wait 7 days, follow up if unchanged.', build: () => ({ trigger: { type: 'time.before_date', config: { field: 'renewal_date', days: 14 } }, steps: [n('action', 'send_email', { subject: 'Your renewal is coming up', body: 'Hi {{first_name}},\n\nYour renewal is due soon. Renew online any time.\n\n{{organisation_name}}', purpose: 'operational' }), n('delay', 'delay', { amount: 7, unit: 'days' }), n('condition', 'attribute', { field: 'renewal_status', op: 'equals', value: 'Renewed' }, { yes: [n('end', 'end')], no: [n('action', 'send_sms', { body: 'Hi {{first_name}}, a reminder that your renewal is still open. Reply STOP to opt out.', purpose: 'operational' })] })] }) },
  { key: 'blank', name: 'Start from scratch', desc: 'Choose your own trigger and steps.', build: () => ({ trigger: { type: '', config: {} }, steps: [] }) },
];

// ---- tree helpers ----
const mapSteps = (steps, fn) => steps.map((s) => { const r = fn(s); return r.kind === 'condition' ? { ...r, yes: mapSteps(r.yes || [], fn), no: mapSteps(r.no || [], fn) } : r; });
const removeStep = (steps, id) => steps.filter((s) => s.id !== id).map((s) => (s.kind === 'condition' ? { ...s, yes: removeStep(s.yes || [], id), no: removeStep(s.no || [], id) } : s));
function insertStep(steps, parentId, branch, index, node) {
  if (!parentId) { const c = [...steps]; c.splice(index, 0, node); return c; }
  return steps.map((s) => (s.id === parentId ? { ...s, [branch]: (() => { const c = [...(s[branch] || [])]; c.splice(index, 0, node); return c; })() } : s.kind === 'condition' ? { ...s, yes: insertStep(s.yes || [], parentId, branch, index, node), no: insertStep(s.no || [], parentId, branch, index, node) } : s));
}
function findStep(steps, id) { for (const s of steps) { if (s.id === id) return s; if (s.kind === 'condition') { const r = findStep(s.yes || [], id) || findStep(s.no || [], id); if (r) return r; } } return null; }

export function nodeSummary(node, state) {
  const c = node.config || {};
  const name = (coll, id) => (state[coll] || []).find((x) => x.id === id)?.name;
  switch (node.type) {
    case 'consent': return `${CHANNEL_LABEL[c.channel] || '…'} ${c.purpose || ''} consent?`;
    case 'channel': return `Has ${CHANNEL_LABEL[c.channel] || '…'}?`;
    case 'tag': return `Has tag “${name('tags', c.tagId) || '…'}”?`;
    case 'list': return `In “${name('lists', c.listId) || '…'}”?`;
    case 'attribute': return `${CONTACT_FIELDS.find((f) => f.key === c.field)?.label || c.field || '…'} ${c.op?.replace('_', ' ') || ''} ${c.value || ''}`;
    case 'alt_channel': return 'Another consented channel?';
    case 'delivery_status': return `Message ${c.status || '…'}?`;
    case 'responded': return 'Contact has responded?';
    case 'datetime': return c.window?.replace('_', ' ') || '…';
    case 'delay': return `Wait ${c.amount || '?'} ${c.unit || ''}`;
    case 'end': return 'Stop the workflow';
    case 'send_email': case 'send_sms': case 'send_whatsapp': return c.templateId ? `Template: ${name('templates', c.templateId) || '(deleted)'}` : (c.body || 'No message yet').slice(0, 48);
    case 'send_alternative': return 'Resend on the next consented channel';
    case 'add_tag': case 'remove_tag': return `“${name('tags', c.tagId) || '…'}”`;
    case 'add_to_list': case 'remove_from_list': return `“${name('lists', c.listId) || '…'}”`;
    case 'update_field': return `${c.field || '…'} → “${c.value || ''}”`;
    case 'add_note': return (c.text || '').slice(0, 48);
    case 'assign_conversation': return `To ${state.users.find((u) => u.id === c.userId)?.name || '…'}`;
    case 'notify': return (c.message || '').slice(0, 48);
    default: return '';
  }
}

export default function AutomationBuilder() {
  const { id } = useParams();
  const o = useOrg();
  const nav = useNavigate();
  const toast = useToast();
  const can = usePerm();
  const existing = id ? o.automations.find((a) => a.id === id) : null;
  useTitle(existing ? existing.name : 'New automation');
  const [draft, setDraft] = useState(() => existing ? { name: existing.name, description: existing.description || '', workflow: JSON.parse(JSON.stringify(existing.workflow)) } : null);
  const [selected, setSelected] = useState('trigger');
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [panel, setPanel] = useState('config');

  if (id && !existing) return <Empty title="Automation not found" action={<Link className="btn" to="/app/automations">Back</Link>} />;
  if (!can('automations.manage')) return <Empty title="You don't have permission to manage automations" />;
  if (!draft) {
    return (
      <>
        <PageHead crumbs={[{ label: 'Automations', to: '/app/automations' }, { label: 'New' }]} title="Create automation" description="Start from a proven workflow or from scratch. Everything can be edited." />
        <div className="grid-3">{STARTERS.map((s) => (
          <button key={s.key} className="card card-body stack" style={{ textAlign: 'left', cursor: 'pointer', gap: 8 }} onClick={() => { setDraft({ name: s.key === 'blank' ? 'Untitled automation' : s.name, description: s.desc, workflow: s.build(o) }); setSelected('trigger'); setDirty(true); }}>
            <span className="node-icon ni-trigger" style={{ width: 32, height: 32 }}>{s.key === 'blank' ? <Plus size={16} /> : <Workflow size={16} />}</span>
            <span className="strong">{s.name}</span><span className="muted small">{s.desc}</span>
          </button>))}</div>
      </>
    );
  }

  const wf = draft.workflow;
  const errors = validateWorkflow(wf);
  const errIds = new Set(errors.map((e) => e.id));
  const setWf = (next) => { setDraft((d) => ({ ...d, workflow: typeof next === 'function' ? next(d.workflow) : next })); setDirty(true); };
  const addStep = (parentId, branch, index, kind, type) => {
    const node = n(kind, type, kind === 'delay' ? { amount: 1, unit: 'hours' } : kind === 'action' && ACTIONS.find((a) => a.type === type)?.channel ? { purpose: 'operational' } : type === 'consent' ? { channel: 'email', purpose: 'operational' } : type === 'attribute' ? { op: 'is_set' } : {});
    setWf((w) => ({ ...w, steps: insertStep(w.steps, parentId, branch, index, node) }));
    setSelected(node.id); setPanel('config');
  };
  const save = (status) => {
    if (!draft.name.trim()) { toast.error('Give the automation a name.'); return null; }
    if (status === 'active' && errors.length) { setShowErrors(true); toast.error(`Fix ${errors.length} issue(s) before activating.`); return null; }
    const saved = tx((d) => {
      const ctx = ctxOf(d);
      if (existing) {
        upd(d.automations, existing.id, { name: draft.name.trim(), description: draft.description, workflow: draft.workflow, updated_at: ctx.now });
        logActivity(d, ctx, { event_type: 'automation.updated', entity_type: 'automation', entity_id: existing.id, summary: `Automation “${draft.name.trim()}” saved` });
        const a = d.automations.find((x) => x.id === existing.id);
        if (status && status !== a.status) setAutomationStatus(d, ctx, a, status);
        return d.automations.find((x) => x.id === existing.id);
      }
      const a = { id: uid('aut'), organisation_id: ctx.orgId, name: draft.name.trim(), description: draft.description, status: 'draft', workflow: draft.workflow, run_count: 0, last_run_at: null, created_by: ctx.userId, created_at: ctx.now, updated_at: ctx.now };
      d.automations.push(a);
      logActivity(d, ctx, { event_type: 'automation.created', entity_type: 'automation', entity_id: a.id, summary: `Automation “${a.name}” created` });
      if (status === 'active') setAutomationStatus(d, ctx, a, 'active');
      return d.automations.find((x) => x.id === a.id);
    });
    setDirty(false);
    toast.success(status === 'active' ? 'Saved and activated. Matching simulated events will now trigger it.' : status === 'paused' ? 'Saved and paused.' : 'Automation saved.');
    if (!existing) nav(`/app/automations/${saved.id}`, { replace: true });
    return saved;
  };
  const sel = selected === 'trigger' ? wf.trigger : findStep(wf.steps, selected);
  const status = existing?.status || 'draft';

  return (
    <>
      <PageHead crumbs={[{ label: 'Automations', to: '/app/automations' }, { label: draft.name || 'Untitled' }]}
        title={<span className="row-3 wrap"><input className="input" value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setDirty(true); }} aria-label="Automation name" style={{ fontSize: '1.2rem', fontWeight: 650, height: 42, maxWidth: 420, background: 'transparent' }} /><StatusBadge map={AUTOMATION_STATUS} status={status} />{dirty && <Badge tone="warn">Unsaved changes</Badge>}</span>}
        actions={<>
          {existing && <Link to={`/app/automations/${existing.id}/history`} className="btn"><History />History ({existing.run_count || 0})</Link>}
          <button className="btn" onClick={() => setPanel('test')}><FlaskConical />Test</button>
          <button className="btn" onClick={() => save()}><Save />Save</button>
          {status === 'active' ? <button className="btn" onClick={() => save('paused')}><Pause />Pause</button> : <button className="btn btn-primary" onClick={() => save('active')}><Play />{existing ? 'Save & activate' : 'Activate'}</button>}
        </>} />
      {existing?.paused_reason && status === 'paused' && <div style={{ marginBottom: 12 }}><Callout tone="warn">Paused automatically after an error: {existing.paused_reason}</Callout></div>}
      {showErrors && errors.length > 0 && <div style={{ marginBottom: 12 }}><Callout tone="err"><strong>{errors.length} issue(s) to fix:</strong> {errors.flatMap((e) => e.errors).slice(0, 4).join(' · ')}</Callout></div>}

      <div className="builder">
        <div className="canvas" aria-label="Workflow canvas">
          <div className="flow">
            <NodeCard kind="trigger" node={wf.trigger} selected={selected === 'trigger'} invalid={showErrors && errIds.has('trigger')} onClick={() => { setSelected('trigger'); setPanel('config'); }} />
            <StepList steps={wf.steps} parentId={null} branch={null} selected={selected} setSelected={(x) => { setSelected(x); setPanel('config'); }} addStep={addStep} errIds={showErrors ? errIds : new Set()} />
          </div>
        </div>
        <div className="card" style={{ position: 'sticky', top: 80 }}>
          <div className="tabs" style={{ padding: '0 12px' }}><button aria-selected={panel === 'config'} onClick={() => setPanel('config')}>Configure</button><button aria-selected={panel === 'test'} onClick={() => setPanel('test')}>Test run</button><button aria-selected={panel === 'about'} onClick={() => setPanel('about')}>Details</button></div>
          <div className="card-body">
            {panel === 'config' && (sel ? <NodeConfig kind={selected === 'trigger' ? 'trigger' : sel.kind} node={sel} onChange={(patch) => selected === 'trigger' ? setWf((w) => ({ ...w, trigger: { ...w.trigger, ...patch } })) : setWf((w) => ({ ...w, steps: mapSteps(w.steps, (s) => (s.id === selected ? { ...s, ...patch } : s)) }))} onDelete={selected !== 'trigger' ? () => { setWf((w) => ({ ...w, steps: removeStep(w.steps, selected) })); setSelected('trigger'); } : null} errors={errors.find((e) => e.id === selected)?.errors} /> : <span className="faint small">Select a step to configure it.</span>)}
            {panel === 'test' && <TestPanel draft={draft} existing={existing} dirty={dirty} save={save} />}
            {panel === 'about' && <div className="stack"><Field label="Description"><textarea className="textarea" value={draft.description} onChange={(e) => { setDraft({ ...draft, description: e.target.value }); setDirty(true); }} /></Field>{existing && <dl className="kv"><dt>Created</dt><dd>{fmtDateTime(existing.created_at)}</dd><dt>Activated</dt><dd>{existing.activated_at ? fmtDateTime(existing.activated_at) : '—'}</dd><dt>Executions</dt><dd>{existing.run_count || 0}</dd><dt>Last run</dt><dd>{existing.last_run_at ? relTime(existing.last_run_at) : 'Never'}</dd></dl>}<Callout>In demo mode, waits are compressed to ~8 seconds and messages are simulated. Active automations respond to events from campaigns, the inbox, imports and contact edits.</Callout></div>}
          </div>
        </div>
      </div>
    </>
  );
}

function NodeCard({ kind, node, selected, invalid, onClick }) {
  const s = getState();
  const item = catalogItem(kind, node?.type);
  const icon = kind === 'trigger' ? <Zap /> : kind === 'condition' ? <GitBranch /> : kind === 'delay' ? <Clock /> : kind === 'end' ? <Square /> : (() => { const I = ACTION_ICON[node.type] || Send; return <I />; })();
  const title = kind === 'trigger' ? (node?.type ? describeTrigger(node, s) : 'Choose a trigger') : item?.label || 'Choose a type';
  const desc = kind === 'trigger' ? item?.group : nodeSummary(node, s);
  return (
    <button type="button" className={cx('node', selected && 'selected', invalid && 'invalid')} onClick={(e) => { e.stopPropagation(); onClick(); }} aria-pressed={selected}>
      <div className="node-head"><span className={`node-icon ni-${kind}`}>{icon}</span><div style={{ minWidth: 0 }}><div className="node-kind">{kind === 'trigger' ? 'When' : kind === 'condition' ? 'If' : kind === 'delay' ? 'Wait' : kind === 'end' ? 'End' : 'Then'}</div><div className="node-title truncate">{title}</div></div>{invalid && <AlertTriangle size={14} className="err" style={{ marginLeft: 'auto' }} />}</div>
      {desc && kind !== 'end' && <div className="node-desc truncate">{desc}</div>}
    </button>
  );
}

function AddButton({ onAdd }) {
  return (
    <Menu align="left" width={260} trigger={({ toggle }) => <button type="button" className="add-step" onClick={toggle} aria-label="Add step"><Plus /></button>}>
      <div className="menu-label">Logic</div>
      <MenuItem icon={GitBranch} onClick={() => onAdd('condition', 'consent')}>Condition (if / else)</MenuItem>
      <MenuItem icon={Clock} onClick={() => onAdd('delay', 'delay')}>Wait / delay</MenuItem>
      <MenuItem icon={Square} onClick={() => onAdd('end', 'end')}>End workflow</MenuItem>
      <div className="menu-label">Actions</div>
      {ACTIONS.map((a) => { const I = ACTION_ICON[a.type] || Send; return <MenuItem key={a.type} icon={I} onClick={() => onAdd('action', a.type)}>{a.label}</MenuItem>; })}
    </Menu>
  );
}

function StepList({ steps, parentId, branch, selected, setSelected, addStep, errIds }) {
  const ended = steps.some((s) => s.kind === 'end');
  return (
    <>
      <div className="connector" />
      <AddButton onAdd={(k, t) => addStep(parentId, branch, 0, k, t)} />
      {steps.map((s, i) => (
        <div key={s.id} className="col" style={{ alignItems: 'center', gap: 0 }}>
          <div className="connector" />
          <NodeCard kind={s.kind} node={s} selected={selected === s.id} invalid={errIds.has(s.id)} onClick={() => setSelected(s.id)} />
          {s.kind === 'condition' && (<>
            <div className="connector" style={{ height: 16 }} />
            <div className="branches">
              {['yes', 'no'].map((b) => (
                <div key={b} className="branch">
                  <span className={`branch-label branch-${b}`}>{b === 'yes' ? 'YES' : 'NO'}</span>
                  <div className="flow"><StepList steps={s[b] || []} parentId={s.id} branch={b} selected={selected} setSelected={setSelected} addStep={addStep} errIds={errIds} /></div>
                </div>
              ))}
            </div>
          </>)}
          {s.kind !== 'end' && <><div className="connector" />{s.kind === 'condition' && <span className="faint xs" style={{ padding: '2px 0' }}>then</span>}<AddButton onAdd={(k, t) => addStep(parentId, branch, i + 1, k, t)} /></>}
        </div>
      ))}
      {!ended && <><div className="connector" /><span className="flow-end">{steps.length ? 'End' : 'No steps — add one'}</span></>}
    </>
  );
}

function ConfigField({ f, value, onChange }) {
  const o = useOrg();
  const set = (v) => onChange(f.key, v);
  switch (f.type) {
    case 'list': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">{f.required ? 'Select…' : 'Any'}</option>{o.lists.map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === 'segment' ? ' (segment)' : ''}</option>)}</select>;
    case 'staticlist': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{o.lists.filter((l) => l.type === 'static').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>;
    case 'tag': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{o.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>;
    case 'channel': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}>{!f.required && <option value="">Any channel</option>}{f.required && !value && <option value="">Select…</option>}{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>;
    case 'purpose': return <select className="select" value={value || 'operational'} onChange={(e) => set(e.target.value)}><option value="operational">Operational</option><option value="marketing">Marketing</option></select>;
    case 'field': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">{f.required ? 'Select…' : 'Any attribute'}</option>{CONTACT_FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>;
    case 'datefield': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{CONTACT_FIELDS.filter((x) => x.type === 'date').map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>;
    case 'template': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">No template — write below</option>{o.templates.filter((t) => t.channel === f.channel).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>;
    case 'campaign': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">Any campaign</option>{o.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
    case 'user': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{o.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user?.name}</option>)}</select>;
    case 'select': return <select className="select" value={value || ''} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
    case 'number': return <input type="number" min="0" className="input" value={value ?? ''} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'datetime': return <input type="datetime-local" className="input" value={value || ''} onChange={(e) => set(e.target.value)} />;
    case 'textarea': return <textarea className="textarea" value={value || ''} onChange={(e) => set(e.target.value)} placeholder="Supports {{first_name}}, {{unit}} and other variables" />;
    default: return <input className="input" value={value || ''} onChange={(e) => set(e.target.value)} />;
  }
}

function NodeConfig({ kind, node, onChange, onDelete, errors }) {
  const item = catalogItem(kind, node.type);
  const options = kind === 'trigger' ? TRIGGERS : kind === 'condition' ? CONDITIONS : kind === 'action' ? ACTIONS : null;
  const setCfg = (k, v) => onChange({ config: { ...node.config, [k]: v } });
  const groups = options ? [...new Set(options.map((x) => x.group || ''))] : [];
  return (
    <div className="stack">
      <div className="between"><span className="label">{kind === 'trigger' ? 'Trigger' : kind === 'condition' ? 'Condition' : kind === 'delay' ? 'Delay' : kind === 'end' ? 'End' : 'Action'}</span>{onDelete && <button className="btn btn-ghost btn-sm" onClick={onDelete}><Trash2 />Delete step</button>}</div>
      {options && (
        <Field label="Type"><select className="select" value={node.type || ''} onChange={(e) => onChange({ type: e.target.value, config: kind === 'action' && ACTIONS.find((a) => a.type === e.target.value)?.channel ? { purpose: 'operational' } : {} })}>
          {!node.type && <option value="">Choose…</option>}
          {groups.map((g) => g ? <optgroup key={g} label={g}>{options.filter((x) => x.group === g).map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}</optgroup> : options.map((x) => <option key={x.type} value={x.type}>{x.label}</option>))}
        </select></Field>
      )}
      {item?.fields.map((f) => (f.key === 'value' && ['is_set', 'is_not_set'].includes(node.config?.op) ? null : <Field key={f.key} label={f.label + (f.required ? '' : '')}><ConfigField f={f} value={node.config?.[f.key]} onChange={setCfg} /></Field>))}
      {kind === 'condition' && <p className="faint xs">Contacts who match follow the YES branch; everyone else follows NO. Nest conditions in a branch for else-if logic.</p>}
      {kind === 'action' && item?.channel && <p className="faint xs">Sends are checked against consent and suppression at run time. Ineligible contacts are skipped and logged.</p>}
      {kind === 'delay' && <p className="faint xs">Live runs pause here and resume automatically. In demo mode, waits are compressed to ~8 seconds.</p>}
      {kind === 'end' && <p className="faint xs">The workflow stops here for this contact.</p>}
      {errors?.length > 0 && <Callout tone="err">{errors.join(' · ')}</Callout>}
    </div>
  );
}

function TestPanel({ draft, existing, dirty, save }) {
  const o = useOrg();
  const run = useAction();
  const t = draft.workflow.trigger?.type || '';
  const [cid, setCid] = useState(o.contacts[0]?.id || '');
  const [channel, setChannel] = useState('sms');
  const [assume, setAssume] = useState(false);
  const [result, setResult] = useState(null);
  const errs = validateWorkflow(draft.workflow);
  const needsMsg = /^message\.|no_response|reply/.test(t);
  const go = () => {
    let a = existing;
    if (!a || dirty) { a = save(); if (!a) return; }
    const event = { type: 'test', contactId: cid, channel: needsMsg ? channel : undefined, status: t === 'message.failed' ? 'failed' : t === 'message.delivered' ? 'delivered' : undefined, messageId: needsMsg ? o.messages.filter((m) => m.contact_id === cid && m.channel === channel && m.status !== 'skipped').sort((x, y) => y.created_at - x.created_at)[0]?.id : undefined };
    const ex = run((d, ctx) => startExecution(d, ctx, a.id, cid || null, event, { test: true, assumeResponded: assume }));
    if (ex) setResult(ex);
  };
  const contact = o.contacts.find((c) => c.id === cid);
  return (
    <div className="stack">
      <p className="muted small">Run the workflow against a real contact without sending anything or changing data. Conditions use the contact’s current data and consent.</p>
      {errs.length > 0 && <Callout tone="warn">The workflow has {errs.length} incomplete step(s); the test may stop with an error.</Callout>}
      <Field label="Sample contact"><select className="select" value={cid} onChange={(e) => { setCid(e.target.value); setResult(null); }}>{o.contacts.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}</select></Field>
      {needsMsg && <Field label="Simulate event on channel"><select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}>{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select></Field>}
      {JSON.stringify(draft.workflow).includes('"responded"') && <label className="between small"><span>Assume the contact has responded</span><Switch checked={assume} onChange={setAssume} label="Assume responded" /></label>}
      <button className="btn btn-primary" onClick={go} disabled={!cid}><FlaskConical />Run test{dirty ? ' (saves first)' : ''}</button>
      {result && <ExecutionLog exec={result} contact={contact} />}
      {existing && <Link to={`/app/automations/${existing.id}/history`} className="btn btn-ghost btn-sm"><History />View all executions</Link>}
    </div>
  );
}

const RESULT_ICON = { ok: CheckCircle2, yes: CheckCircle2, no: MinusCircle, skipped: MinusCircle, waiting: Clock, error: XCircle };
export function ExecutionLog({ exec, contact }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="between"><span className="strong small">{exec.test ? 'Test result' : 'Execution'}{contact ? ` · ${fullName(contact)}` : ''}</span><Badge tone={exec.status === 'completed' ? 'ok' : exec.status === 'failed' ? 'err' : 'warn'} dot>{exec.status}</Badge></div>
      <div>
        {exec.log.map((l, i) => { const I = RESULT_ICON[l.result] || CheckCircle2; const tone = l.result === 'error' ? 'err' : l.result === 'yes' || l.result === 'ok' ? 'ok' : l.result === 'no' || l.result === 'skipped' ? 'warn' : 'faint'; return (
          <div key={i} className="log-step"><I size={16} className={tone} style={{ flex: 'none', marginTop: 2 }} /><div className="grow" style={{ minWidth: 0 }}><div className="small"><span className="faint xs" style={{ textTransform: 'uppercase', letterSpacing: '.05em', marginRight: 6 }}>{l.kind}</span>{l.label}{l.kind === 'condition' && <strong className={tone}> → {l.result.toUpperCase()}</strong>}</div>{l.detail && <div className="muted xs" style={{ marginTop: 2 }}>{l.detail}</div>}{l.preview && <div className="card" style={{ padding: 8, marginTop: 6, background: 'var(--bg)' }}><div className="faint xs">{CHANNEL_LABEL[l.preview.channel]}{l.preview.subject ? ` · ${l.preview.subject}` : ''}</div><div className="xs" style={{ whiteSpace: 'pre-wrap' }}>{l.preview.body.slice(0, 280)}</div></div>}</div></div>); })}
      </div>
      {exec.error && <Callout tone="err">{exec.error}</Callout>}
      <div className="faint xs">{exec.test ? `${exec.previews?.length || 0} message(s) would be generated · nothing was sent or changed` : `${exec.message_ids?.length || 0} simulated message(s) generated`}</div>
    </div>
  );
}
