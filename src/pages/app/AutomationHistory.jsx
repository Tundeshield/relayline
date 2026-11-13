import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AIButton, Thinking } from '../../components/ai';
import { askWorkspace } from '../../services/ai';
import { getState } from '../../data/store';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { History, Workflow } from 'lucide-react';
import { useOrg } from '../../data/store';
import { PageHead, Empty, Badge, Segmented, useSort, ChannelIcon, StatusBadge } from '../../components/ui';
import { ExecutionLog } from './AutomationBuilder';
import { fullName, fmtDateTime, relTime, plural } from '../../lib/util';
import { MESSAGE_STATUS, AUTOMATION_STATUS } from '../../lib/constants';
import { useTitle } from '../../lib/hooks';

export function ExplainFailure({ automationId }) {
  const o = useOrg();
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { setRes(await askWorkspace('Explain why this workflow failed', `/app/automations/${automationId}`, { ...o, users: getState().users })); } finally { setBusy(false); } };
  return (
    <div className="ai-review" style={{ marginBottom: 16 }}>
      <div className="between wrap"><span className="row strong"><Sparkles size={16} className="accent" />Something not working?</span><AIButton className="btn-sm" onClick={go} disabled={busy}>Explain with AI</AIButton></div>
      {busy && <div style={{ marginTop: 8 }}><Thinking label="Reading the execution history…" /></div>}
      {res && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{res.text}{res.items?.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{res.items.map((it) => <Link key={it.to} className="chip" to={it.to}>{it.label}</Link>)}</div>}</div>}
      {!res && !busy && <p className="faint xs" style={{ marginTop: 4 }}>AI reads this automation’s runs and messages and explains failures in plain words. It only uses data in your workspace.</p>}
    </div>
  );
}

const tone = (s) => (s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'waiting' ? 'warn' : 'neutral');

export function AutomationHistory() {
  const { id } = useParams();
  const o = useOrg();
  const nav = useNavigate();
  const a = o.automations.find((x) => x.id === id);
  useTitle(a ? `${a.name} · history` : 'History');
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('');
  const rows = o.executions.filter((e) => e.automation_id === id && (kind === 'all' || (kind === 'test' ? e.test : !e.test)) && (!status || e.status === status));
  const { sorted, Th } = useSort(rows, { key: 'started_at', dir: 'desc' });
  if (!a) return <Empty title="Automation not found" action={<Link className="btn" to="/app/automations">Back</Link>} />;
  const live = o.executions.filter((e) => e.automation_id === id && !e.test);
  return (
    <>
      <PageHead crumbs={[{ label: 'Automations', to: '/app/automations' }, { label: a.name, to: `/app/automations/${a.id}` }, { label: 'Run history' }]} title={<span className="row-3">Run history <StatusBadge map={AUTOMATION_STATUS} status={a.status} /></span>} description={`${plural(live.length, 'live execution')} · ${plural(live.filter((e) => e.status === 'failed').length, 'failure')} · ${plural(o.executions.filter((e) => e.automation_id === id && e.test).length, 'test run')}`} actions={<Link className="btn" to={`/app/automations/${a.id}`}><Workflow />Edit workflow</Link>} />
      <ExplainFailure automationId={a.id} />
      <div className="card">
        <div className="toolbar"><Segmented value={kind} onChange={setKind} options={[['all', 'All'], ['live', 'Live'], ['test', 'Tests']]} label="Type" />
          <select className="select input-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option value="completed">Completed</option><option value="waiting">Waiting</option><option value="failed">Failed</option></select></div>
        {sorted.length === 0 ? <Empty icon={History} title="No executions yet">Executions appear when a matching event occurs or you run a test.</Empty> : (
          <div className="table-wrap"><table className="table"><thead><tr><Th k="started_at">Started</Th><th>Contact</th><th>Trigger event</th><th>Steps</th><Th k="status">Result</Th><th>Messages</th></tr></thead><tbody>
            {sorted.map((e) => { const c = o.contacts.find((x) => x.id === e.contact_id); return (
              <tr key={e.id} className="clickable" onClick={() => nav(`/app/automations/executions/${e.id}`)}>
                <td className="nowrap small"><Link className="strong" to={`/app/automations/executions/${e.id}`}>{fmtDateTime(e.started_at, o.org.timezone)}</Link><div className="faint xs">{relTime(e.started_at)}</div></td>
                <td>{c ? fullName(c) : <span className="faint">{e.contact_id ? 'Deleted contact' : '—'}</span>}</td>
                <td className="muted small">{e.trigger_event?.label}</td>
                <td className="muted small">{e.log.filter((l) => l.kind !== 'trigger').length}</td>
                <td><span className="row" style={{ gap: 6 }}><Badge tone={tone(e.status)} dot>{e.status}</Badge>{e.test && <Badge tone="info">Test</Badge>}</span></td>
                <td className="muted small">{e.test ? `${e.previews?.length || 0} previewed` : e.message_ids?.length || 0}</td>
              </tr>); })}
          </tbody></table></div>
        )}
      </div>
    </>
  );
}

export function ExecutionDetail() {
  const { execId } = useParams();
  const o = useOrg();
  const e = o.executions.find((x) => x.id === execId);
  useTitle('Execution');
  if (!e) return <Empty title="Execution not found" action={<Link className="btn" to="/app/automations">Back</Link>} />;
  const a = o.automations.find((x) => x.id === e.automation_id);
  const c = o.contacts.find((x) => x.id === e.contact_id);
  const msgs = (e.message_ids || []).map((id) => o.messages.find((m) => m.id === id)).filter(Boolean);
  return (
    <>
      <PageHead crumbs={[{ label: 'Automations', to: '/app/automations' }, { label: a?.name || 'Automation', to: a ? `/app/automations/${a.id}` : undefined }, { label: 'History', to: a ? `/app/automations/${a.id}/history` : undefined }, { label: 'Execution' }]} title={<span className="row-3">Execution <Badge tone={tone(e.status)} dot>{e.status}</Badge>{e.test && <Badge tone="info">Test run</Badge>}</span>} description={`${e.trigger_event?.label} · started ${fmtDateTime(e.started_at, o.org.timezone)}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="exec-grid">
        <div className="card"><div className="card-head"><h3>Step-by-step log</h3></div><div className="card-body"><ExecutionLog exec={e} contact={c} /></div></div>
        <div className="stack">
          <div className="card"><div className="card-head"><h3>Context</h3></div><div className="card-body"><dl className="kv">
            <dt>Automation</dt><dd>{a ? <Link className="accent" to={`/app/automations/${a.id}`}>{a.name}</Link> : 'Deleted'}</dd>
            <dt>Contact</dt><dd>{c ? <Link className="accent" to={`/app/contacts/${c.id}`}>{fullName(c)}</Link> : '—'}</dd>
            <dt>Trigger</dt><dd>{e.trigger_event?.label}</dd>
            <dt>Started</dt><dd>{fmtDateTime(e.started_at, o.org.timezone)}</dd>
            <dt>Finished</dt><dd>{e.completed_at ? fmtDateTime(e.completed_at, o.org.timezone) : e.status === 'waiting' ? `Waiting — resumes ${relTime(e.resume_at)}` : '—'}</dd>
            {e.error && <><dt>Error</dt><dd className="err">{e.error}</dd></>}
          </dl></div></div>
          <div className="card"><div className="card-head"><h3>Messages generated</h3></div><div className="card-body stack" style={{ gap: 8 }}>
            {e.test ? (e.previews?.length ? e.previews.map((p, i) => <div key={i} className="small"><span className="row"><ChannelIcon channel={p.channel} />to {p.to || '—'}</span><div className="muted xs" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{p.subject ? p.subject + ' — ' : ''}{p.body.slice(0, 200)}</div></div>) : <span className="faint small">None.</span>)
              : msgs.length ? msgs.map((m) => <div key={m.id} className="between small"><span className="row"><ChannelIcon channel={m.channel} />{m.subject || m.content.slice(0, 40)}</span><StatusBadge map={MESSAGE_STATUS} status={m.status} /></div>) : <span className="faint small">None.</span>}
          </div></div>
        </div>
      </div>
      <style>{`@media (max-width: 1000px){ .exec-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
