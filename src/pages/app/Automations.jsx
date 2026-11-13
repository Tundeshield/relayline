import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Workflow, MoreHorizontal, Play, Pause, Copy, Trash2, Pencil, History, Archive, Search, AlertTriangle } from 'lucide-react';
import { useOrg, upd } from '../../data/store';
import { PageHead, Empty, StatusBadge, Menu, MenuItem, useConfirm, useSort, Callout, useToast } from '../../components/ui';
import { AUTOMATION_STATUS } from '../../lib/constants';
import { describeTrigger } from '../../services/automation/engine';
import { validateWorkflow } from '../../services/automation/catalog';
import { logActivity } from '../../services/core';
import { fmtDate, relTime, uid } from '../../lib/util';
import { getState } from '../../data/store';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

export function setAutomationStatus(d, ctx, a, status) {
  const patch = { status, updated_at: ctx.now };
  if (status === 'active') { patch.activated_at = ctx.now; patch.paused_reason = null; patch.runtime = {}; }
  upd(d.automations, a.id, patch);
  logActivity(d, ctx, { event_type: `automation.${status === 'active' ? 'activated' : status}`, entity_type: 'automation', entity_id: a.id, summary: `Automation “${a.name}” ${status === 'active' ? 'activated' : status === 'paused' ? 'paused' : status === 'archived' ? 'archived' : 'set to draft'}` });
}
export function duplicateAutomation(d, ctx, a) {
  const remap = (steps) => steps.map((n) => ({ ...n, id: uid('n'), yes: n.yes ? remap(n.yes) : undefined, no: n.no ? remap(n.no) : undefined }));
  const n = { ...a, id: uid('aut'), name: `${a.name} (copy)`, status: 'draft', run_count: 0, last_run_at: null, activated_at: null, runtime: {}, paused_reason: null, created_at: ctx.now, updated_at: ctx.now, created_by: ctx.userId, workflow: { trigger: { ...a.workflow.trigger }, steps: remap(a.workflow.steps) } };
  d.automations.push(n);
  logActivity(d, ctx, { event_type: 'automation.created', entity_type: 'automation', entity_id: n.id, summary: `Automation “${n.name}” created (duplicate)` });
  return n;
}

export default function Automations() {
  useTitle('Automations');
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const rows = o.automations.filter((a) => (status ? a.status === status : a.status !== 'archived') && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  const { sorted, Th } = useSort(rows, { key: 'name', dir: 'asc' }, { runs: (a) => a.run_count || 0 });
  const activate = (a) => {
    const errs = validateWorkflow(a.workflow);
    if (errs.length) { toast.error(`Fix ${errs.length} issue(s) in the workflow before activating.`); return nav(`/app/automations/${a.id}`); }
    run((d, ctx) => setAutomationStatus(d, ctx, a, 'active'), { success: `“${a.name}” is active. Matching simulated events will now trigger it.` });
  };
  const del = async (a) => { if (await confirm({ title: `Delete “${a.name}”?`, message: 'The workflow and its execution history will be removed. Messages it already sent remain in reports.', confirmLabel: 'Delete', danger: true })) run((d, ctx) => { d.automations = d.automations.filter((x) => x.id !== a.id); d.executions = d.executions.filter((e) => e.automation_id !== a.id); logActivity(d, ctx, { event_type: 'automation.deleted', entity_type: 'automation', entity_id: a.id, summary: `Automation “${a.name}” deleted` }); }, { success: 'Automation deleted.' }); };
  const paused = o.automations.filter((a) => a.status === 'paused' && a.paused_reason);
  return (
    <>
      <PageHead title="Automations" description="Workflows that react to contact changes, messages, replies, dates and campaigns." actions={<Link to="/app/automations/new" className="btn btn-primary" onClick={(e) => !can('automations.manage') && e.preventDefault()}><Plus />Create automation</Link>} />
      {paused.map((a) => <div key={a.id} style={{ marginBottom: 12 }}><Callout tone="warn" icon={AlertTriangle}><strong>{a.name}</strong> was paused automatically after an error: {a.paused_reason} <Link className="accent" to={`/app/automations/${a.id}`}>Fix workflow</Link></Callout></div>)}
      <div className="card">
        <div className="toolbar">
          <div className="input-icon" style={{ flex: '1 1 220px', maxWidth: 320 }}><Search /><input className="input input-sm" placeholder="Search automations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search automations" /></div>
          <select className="select input-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All (excluding archived)</option>{Object.entries(AUTOMATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </div>
        {o.automations.length === 0 ? <Empty icon={Workflow} title="No automations yet" action={<Link to="/app/automations/new" className="btn btn-primary"><Plus />Create automation</Link>}>Start from a template like “Welcome new contact” or build your own.</Empty>
          : sorted.length === 0 ? <Empty title="No automations match" /> : (
            <div className="table-wrap"><table className="table"><thead><tr><Th k="name">Automation</Th><Th k="status">Status</Th><th>Trigger</th><Th k="runs">Executions</Th><Th k="last_run_at">Last executed</Th><Th k="created_at">Created</Th><th /></tr></thead><tbody>
              {sorted.map((a) => (
                <tr key={a.id} className="clickable" onClick={(e) => !e.target.closest('button,a') && nav(`/app/automations/${a.id}`)}>
                  <td><Link to={`/app/automations/${a.id}`} className="strong">{a.name}</Link>{a.description && <div className="faint xs truncate" style={{ maxWidth: 340 }}>{a.description}</div>}</td>
                  <td><StatusBadge map={AUTOMATION_STATUS} status={a.status} /></td>
                  <td className="muted small">{describeTrigger(a.workflow.trigger, getState())}</td>
                  <td><Link to={`/app/automations/${a.id}/history`} className="accent">{a.run_count || 0}</Link></td>
                  <td className="muted small">{a.last_run_at ? relTime(a.last_run_at) : 'Never'}</td>
                  <td className="muted small">{fmtDate(a.created_at)}</td>
                  <td><div className="row" style={{ justifyContent: 'flex-end' }}>
                    {a.status === 'active' ? <button className="btn btn-sm" onClick={() => run((d, ctx) => setAutomationStatus(d, ctx, a, 'paused'), { success: 'Automation paused.' })} disabled={!can('automations.manage')}><Pause />Pause</button>
                      : a.status !== 'archived' && <button className="btn btn-sm" onClick={() => activate(a)} disabled={!can('automations.manage')}><Play />Activate</button>}
                    <Menu trigger={({ toggle }) => <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label="Automation actions"><MoreHorizontal /></button>}>
                      <MenuItem icon={Pencil} to={`/app/automations/${a.id}`}>Edit workflow</MenuItem>
                      <MenuItem icon={History} to={`/app/automations/${a.id}/history`}>Execution history</MenuItem>
                      <MenuItem icon={Copy} onClick={() => { const n = run((d, ctx) => duplicateAutomation(d, ctx, a), { success: 'Duplicated as a draft.' }); n && nav(`/app/automations/${n.id}`); }} disabled={!can('automations.manage')}>Duplicate</MenuItem>
                      {a.status !== 'archived' ? <MenuItem icon={Archive} onClick={() => run((d, ctx) => setAutomationStatus(d, ctx, a, 'archived'), { success: 'Archived.' })} disabled={!can('automations.manage')}>Archive</MenuItem> : <MenuItem icon={Archive} onClick={() => run((d, ctx) => setAutomationStatus(d, ctx, a, 'draft'), { success: 'Restored as draft.' })}>Restore</MenuItem>}
                      <MenuItem icon={Trash2} danger onClick={() => del(a)} disabled={!can('automations.manage')}>Delete</MenuItem>
                    </Menu>
                  </div></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
      </div>
      <p className="faint xs" style={{ marginTop: 10 }}>Automations run on simulated events in demo mode. Waits are compressed to a few seconds.</p>
    </>
  );
}
