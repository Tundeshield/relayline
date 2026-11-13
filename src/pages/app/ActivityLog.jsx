import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, ChevronRight, ChevronDown, History } from 'lucide-react';
import { useOrg } from '../../data/store';
import { REPORT_TABS, PageHead, Empty, Badge, Avatar } from '../../components/ui';
import { fmtDateTime, relTime, toCSV, download, plural, DAY } from '../../lib/util';
import { useTitle } from '../../lib/hooks';

const GROUPS = { campaign: 'Campaigns', contact: 'Contacts', consent: 'Consent', suppression: 'Consent', list: 'Lists', segment: 'Lists', automation: 'Automations', message: 'Messages', reply: 'Conversations', conversation: 'Conversations', template: 'Templates', team: 'Team', settings: 'Settings' };
const groupOf = (t) => GROUPS[t.split('.')[0]] || 'Other';
const TONE = { Campaigns: 'accent', Contacts: 'info', Consent: 'warn', Automations: 'ok', Messages: 'err', Conversations: 'info', Team: 'neutral', Settings: 'neutral', Lists: 'neutral', Templates: 'neutral' };
const link = (a) => a.entity_type === 'campaign' && a.entity_id ? `/app/campaigns/${a.entity_id}` : a.entity_type === 'contact' && a.entity_id ? `/app/contacts/${a.entity_id}` : a.entity_type === 'automation' && a.entity_id ? `/app/automations/${a.entity_id}` : a.entity_type === 'conversation' ? `/app/inbox/${a.entity_id}` : a.entity_type === 'list' && a.entity_id ? `/app/lists/${a.entity_id}` : a.entity_type === 'template' ? '/app/templates' : a.entity_type === 'invitation' || a.entity_type === 'user' ? '/app/team' : a.entity_type === 'organisation' ? '/app/settings' : null;

export default function ActivityLog() {
  useTitle('Activity log');
  const o = useOrg();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [who, setWho] = useState('');
  const [range, setRange] = useState('');
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(100);
  const name = (id) => o.members.find((m) => m.user_id === id)?.user?.name || 'Former member';
  const rows = o.activity.filter((a) => (!q || a.summary.toLowerCase().includes(q.toLowerCase()) || a.event_type.includes(q.toLowerCase())) && (!group || groupOf(a.event_type) === group) && (!who || (who === 'system' ? !a.user_id : a.user_id === who)) && (!range || a.created_at >= Date.now() - Number(range) * DAY)).sort((a, b) => b.created_at - a.created_at);
  const exp = () => download('activity-log.csv', toCSV([['timestamp', 'event', 'summary', 'by', 'entity_type', 'entity_id', 'details'], ...rows.map((a) => [new Date(a.created_at).toISOString(), a.event_type, a.summary, a.user_id ? name(a.user_id) : 'System', a.entity_type, a.entity_id, JSON.stringify(a.details || {})])]));
  return (
    <>
      <PageHead tabs={REPORT_TABS} title="Reports" description="An organisation-wide audit trail of what happened, who did it, and when." actions={<button className="btn" onClick={exp} disabled={!rows.length}><Download />Export</button>} />
      <div className="card">
        <div className="toolbar">
          <div className="input-icon" style={{ flex: '1 1 240px', maxWidth: 340 }}><Search /><input className="input input-sm" placeholder="Search activity" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activity" /></div>
          <select className="select input-sm" style={{ width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Event type"><option value="">All events</option>{[...new Set(Object.values(GROUPS))].map((g) => <option key={g}>{g}</option>)}</select>
          <select className="select input-sm" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Performed by"><option value="">Anyone</option><option value="system">System / automations</option>{o.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user?.name}</option>)}</select>
          <select className="select input-sm" style={{ width: 'auto' }} value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range"><option value="">All time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
          <span className="faint small" style={{ marginLeft: 'auto' }}>{plural(rows.length, 'event')}</span>
        </div>
        {rows.length === 0 ? <Empty icon={History} title="No activity matches" /> : (
          <div className="table-wrap"><table className="table"><thead><tr><th style={{ width: 28 }} /><th>Event</th><th>Details</th><th>By</th><th>Related</th><th>When</th></tr></thead><tbody>
            {rows.slice(0, limit).map((a) => { const g = groupOf(a.event_type); const l = link(a); const hasDetails = a.details && Object.keys(a.details).length > 0; return (
              <Fragment key={a.id}>
                <tr className={hasDetails ? 'clickable' : ''} onClick={() => hasDetails && setOpen(open === a.id ? null : a.id)}>
                  <td>{hasDetails && (open === a.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</td>
                  <td className="nowrap"><Badge tone={TONE[g]}>{g}</Badge><div className="faint xs mono" style={{ marginTop: 3 }}>{a.event_type}</div></td>
                  <td className="small">{a.summary}</td>
                  <td className="nowrap small">{a.user_id ? <span className="row"><Avatar name={name(a.user_id)} size="sm" />{name(a.user_id)}</span> : <span className="faint">System</span>}</td>
                  <td className="small">{l ? <Link className="accent" to={l} onClick={(e) => e.stopPropagation()}>{a.entity_type}</Link> : <span className="faint">{a.entity_type || '—'}</span>}</td>
                  <td className="nowrap small muted" title={fmtDateTime(a.created_at, o.org.timezone)}>{relTime(a.created_at)}<div className="faint xs">{fmtDateTime(a.created_at, o.org.timezone)}</div></td>
                </tr>
                {open === a.id && <tr><td /><td colSpan={5}><pre className="mono xs" style={{ margin: 0, whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 12, borderRadius: 8 }}>{JSON.stringify(a.details, null, 2)}</pre></td></tr>}
              </Fragment>); })}
          </tbody></table></div>
        )}
        {rows.length > limit && <div style={{ padding: 14, textAlign: 'center' }}><button className="btn btn-sm" onClick={() => setLimit(limit + 100)}>Load more ({rows.length - limit} remaining)</button></div>}
      </div>
    </>
  );
}
