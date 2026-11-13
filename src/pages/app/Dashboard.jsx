import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, Send, CheckCircle2, Workflow, Plus, UserPlus, Upload, Inbox, ArrowUpRight, ArrowDownRight, AlertCircle, MessageSquareReply, Clock, FlaskConical } from 'lucide-react';
import { useOrg } from '../../data/store';
import { Segmented, StatusBadge, ChannelIcon, Empty, Callout } from '../../components/ui';
import { StackedBars, HBars, SERIES_COLORS, Legend } from '../../components/charts';
import { DeliveryBar } from './Campaigns';
import { campaignStats, audienceLabel } from '../../services/campaigns';
import { summarize, filterMessages, timeSeries, isAttempted } from '../../services/analytics';
import { CAMPAIGN_STATUS, CHANNEL_LABEL } from '../../lib/constants';
import { fmtNum, fmtDate, relTime, DAY, plural } from '../../lib/util';
import { useTitle } from '../../lib/hooks';
import { GoalBox } from '../../components/ai';
import { MessageCircle, PauseCircle, FileEdit, CalendarClock } from 'lucide-react';

function Delta({ cur, prev, unit = '', invert }) {
  if (prev == null) return null;
  const d = cur - prev;
  if (!prev && !cur) return <span className="faint">No change vs previous 30 days</span>;
  const up = d >= 0;
  const good = invert ? !up : up;
  const I = up ? ArrowUpRight : ArrowDownRight;
  return <span className={good ? 'ok' : 'err'}><I size={13} style={{ verticalAlign: -2 }} />{unit === 'pts' ? `${Math.abs(d).toFixed(1)} pts` : prev ? `${Math.abs((d / prev) * 100).toFixed(0)}%` : `+${d}`} <span className="faint">vs previous 30 days</span></span>;
}

const ACT_ICON = { 'campaign.completed': CheckCircle2, 'message.failed': AlertCircle, 'contact.imported': Upload, 'automation.executed': Workflow, 'reply.received': MessageSquareReply, 'campaign.sent': Send, 'contact.created': UserPlus };

export default function Dashboard() {
  useTitle('Dashboard');
  const o = useOrg();
  const nav = useNavigate();
  const [ch, setCh] = useState('all');
  const now = Date.now();
  const cur = useMemo(() => summarize(filterMessages(o.messages, { from: now - 30 * DAY, to: now })), [o.messages]); // eslint-disable-line
  const prev = useMemo(() => summarize(filterMessages(o.messages, { from: now - 60 * DAY, to: now - 30 * DAY })), [o.messages]); // eslint-disable-line
  const contactsPrev = o.contacts.filter((c) => c.created_at < now - 30 * DAY).length;
  const active = o.automations.filter((a) => a.status === 'active');
  const execs30 = o.executions.filter((e) => !e.test && e.started_at >= now - 30 * DAY).length;
  const ts = useMemo(() => timeSeries(o.messages, now - 30 * DAY, now), [o.messages]); // eslint-disable-line
  const series = (ch === 'all' ? ['email', 'sms', 'whatsapp'] : [ch]).map((k) => ({ key: k, label: CHANNEL_LABEL[k], color: SERIES_COLORS[k], values: ts.series[k] }));
  const byCh = ['email', 'sms', 'whatsapp'].map((k) => ({ key: k, label: CHANNEL_LABEL[k], value: o.messages.filter((m) => m.channel === k && isAttempted(m) && (m.attempted_at || m.created_at) >= now - 30 * DAY).length, color: SERIES_COLORS[k], icon: <ChannelIcon channel={k} /> }));
  const totalCh = byCh.reduce((a, b) => a + b.value, 0);
  const recent = [...o.campaigns].filter((c) => c.status !== 'draft').sort((a, b) => (b.sent_at || b.schedule_at || b.created_at) - (a.sent_at || a.schedule_at || a.created_at)).slice(0, 6);
  const acts = [...o.activity].filter((a) => ['campaign.completed', 'message.failed', 'contact.imported', 'automation.executed', 'reply.received', 'campaign.sent', 'contact.created', 'campaign.scheduled'].includes(a.event_type)).sort((a, b) => b.created_at - a.created_at).slice(0, 8);
  const openConvs = o.conversations.filter((c) => c.status === 'open').length;
  const unread = o.conversations.filter((c) => c.unread).length;
  const hour = new Date().getHours();
  const waiting = o.conversations.filter((c) => c.status === 'open' && o.conversationMessages.filter((m) => m.conversation_id === c.id && m.direction !== 'note').sort((x, y) => y.created_at - x.created_at)[0]?.direction === 'in').length;
  const failed7 = o.messages.filter((m) => m.status === 'failed' && m.failed_at >= now - 7 * DAY).length;
  const pausedErr = o.automations.filter((a) => a.status === 'paused' && a.paused_reason);
  const drafts = o.campaigns.filter((c) => c.status === 'draft');
  const nextScheduled = o.campaigns.filter((c) => c.status === 'scheduled').sort((a, b) => a.schedule_at - b.schedule_at)[0];
  const attention = [
    waiting && { icon: MessageCircle, tone: 'warn', text: `${waiting} conversation${waiting > 1 ? 's are' : ' is'} waiting for a reply`, to: '/app/inbox', cta: 'Reply' },
    failed7 && { icon: AlertCircle, tone: 'err', text: `${failed7} message${failed7 > 1 ? 's' : ''} failed to deliver in the last 7 days`, to: '/app/analytics', cta: 'Review' },
    ...pausedErr.map((a) => ({ icon: PauseCircle, tone: 'warn', text: `Automation “${a.name}” was paused after an error`, to: `/app/automations/${a.id}/history`, cta: 'Fix' })),
    drafts.length && { icon: FileEdit, tone: 'text-3', text: `${drafts.length} campaign draft${drafts.length > 1 ? 's' : ''} not sent yet`, to: `/app/campaigns/${drafts[0].id}/edit`, cta: 'Finish' },
    nextScheduled && { icon: CalendarClock, tone: 'accent', text: `“${nextScheduled.name}” is scheduled ${relTime(nextScheduled.schedule_at)}`, to: `/app/campaigns/${nextScheduled.id}`, cta: 'View' },
  ].filter(Boolean);
  const empty = o.contacts.length === 0;

  return (
    <>
      <div className="page-head">
        <div><h1>Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, {o.user.name.split(' ')[0]}</h1><p>Here’s what is happening across {o.org.name}’s channels over the last 30 days.</p></div>
        <div className="row wrap">
          <Link to="/app/campaigns/new" className="btn btn-primary"><Plus />New campaign</Link>
          <Link to="/app/contacts?new=1" className="btn"><UserPlus />Add contact</Link>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}><GoalBox /></div>
      {attention.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}><div className="card-head"><h3>Needs your attention</h3></div><div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {attention.map((a) => { const I = a.icon; return <Link key={a.to + a.text} to={a.to} className="attention-item"><span className="tl-icon" style={{ color: `var(--${a.tone})` }}><I /></span><span className="grow small">{a.text}</span><span className="btn btn-sm">{a.cta}</span></Link>; })}
        </div></div>
      )}
      {empty && <div className="card" style={{ marginBottom: 16 }}><Empty icon={FlaskConical} title="Your workspace is ready" action={<div className="row"><Link to="/app/contacts/import" className="btn btn-primary"><Upload />Import contacts</Link><Link to="/app/contacts?new=1" className="btn"><UserPlus />Add a contact</Link></div>}>Start by adding the people you communicate with. Every chart here fills in from your own activity.</Empty></div>}

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Link to="/app/contacts" className="card stat"><div className="stat-label"><Users size={14} />Total contacts</div><div className="stat-value">{fmtNum(o.contacts.length)}</div><div className="stat-delta"><Delta cur={o.contacts.length} prev={contactsPrev} /></div></Link>
        <Link to="/app/analytics" className="card stat"><div className="stat-label"><Send size={14} />Messages sent</div><div className="stat-value">{fmtNum(cur.attempted)}</div><div className="stat-delta"><Delta cur={cur.attempted} prev={prev.attempted} /></div></Link>
        <Link to="/app/analytics" className="card stat"><div className="stat-label"><CheckCircle2 size={14} />Delivery rate</div><div className="stat-value">{cur.attempted ? `${cur.deliveryRate.toFixed(1)}%` : '—'}</div><div className="stat-delta">{prev.attempted ? <Delta cur={cur.deliveryRate} prev={prev.deliveryRate} unit="pts" /> : <span className="faint">{fmtNum(cur.failed)} failed</span>}</div></Link>
        <Link to="/app/automations" className="card stat"><div className="stat-label"><Workflow size={14} />Active automations</div><div className="stat-value">{active.length}</div><div className="stat-delta faint">{plural(execs30, 'run')} in 30 days</div></Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, marginBottom: 16 }} className="dash-grid">
        <div className="card">
          <div className="card-head"><h3>Communication activity</h3><Segmented value={ch} onChange={setCh} options={[['all', 'All channels'], ['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']]} label="Channel" /></div>
          <div className="card-body">
            {totalCh === 0 ? <Empty icon={Send} title="No messages in the last 30 days" /> : <>
              <StackedBars labels={ts.labels} series={series} onBarClick={(i) => nav(`/app/analytics?from=${ts.ranges[i][0]}&to=${ts.ranges[i][1]}${ch !== 'all' ? `&channel=${ch}` : ''}`)} />
              {series.length > 1 && <div style={{ marginTop: 10 }}><Legend items={series} /></div>}
            </>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Channel breakdown</h3><span className="faint small">30 days</span></div>
          <div className="card-body stack">
            <HBars rows={byCh.map((r) => ({ ...r, sub: totalCh ? `${Math.round((r.value / totalCh) * 100)}%` : '' }))} onRowClick={(r) => nav(`/app/analytics?channel=${r.key}`)} />
            <div className="divider" style={{ margin: '4px 0' }} />
            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="faint xs">Replies</div><div className="strong">{cur.replied}</div></div>
              <div><div className="faint xs">Failed</div><div className="strong err">{cur.failed}</div></div>
              <div><div className="faint xs">Open conversations</div><div className="strong">{openConvs}</div></div>
              <div><div className="faint xs">Awaiting report</div><div className="strong">{cur.pending}</div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Recent campaigns</h3><Link to="/app/campaigns" className="btn btn-ghost btn-sm">View all</Link></div>
        {recent.length === 0 ? <Empty icon={Send} title="No campaigns yet" action={<Link to="/app/campaigns/new" className="btn btn-primary"><Plus />Create campaign</Link>} /> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Campaign</th><th>Channel</th><th>Audience</th><th>Date</th><th>Status</th><th>Delivery</th></tr></thead><tbody>
            {recent.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/app/campaigns/${c.id}`)}><td className="strong">{c.name}</td><td><span className="row" style={{ gap: 4 }}>{c.channels.map((x) => <ChannelIcon key={x} channel={x} />)}</span></td><td className="muted small">{audienceLabel(c, o.lists)}</td><td className="muted nowrap">{fmtDate(c.sent_at || c.schedule_at || c.created_at)}</td><td><StatusBadge map={CAMPAIGN_STATUS} status={c.status} /></td><td><DeliveryBar st={campaignStats(o.messages.filter((m) => m.campaign_id === c.id))} /></td></tr>
            ))}
          </tbody></table></div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Recent activity</h3><Link to="/app/activity" className="btn btn-ghost btn-sm">Activity log</Link></div>
          <div className="card-body">{acts.length === 0 ? <span className="faint small">No activity yet.</span> : <div className="timeline">{acts.map((a) => { const I = ACT_ICON[a.event_type] || Clock; return (
            <div key={a.id} className="tl-item"><span className="tl-icon" style={a.event_type === 'message.failed' ? { color: 'var(--err)' } : undefined}><I /></span><div className="grow" style={{ minWidth: 0 }}><div className="small">{a.summary}</div><div className="faint xs">{relTime(a.created_at)}</div></div></div>); })}</div>}</div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Automation overview</h3><Link to="/app/automations" className="btn btn-ghost btn-sm">Manage</Link></div>
          <div className="card-body stack">
            {o.automations.length === 0 && <Empty icon={Workflow} title="No automations yet" action={<Link to="/app/automations/new" className="btn btn-primary"><Plus />Create automation</Link>} />}
            {o.automations.filter((a) => a.status !== 'archived').map((a) => (
              <Link key={a.id} to={`/app/automations/${a.id}`} className="between"><span className="row" style={{ minWidth: 0 }}><span className={`dot`} style={{ width: 8, height: 8, borderRadius: '50%', background: a.status === 'active' ? 'var(--ok)' : a.status === 'paused' ? 'var(--warn)' : 'var(--text-3)', flex: 'none' }} /><span className="small truncate">{a.name}</span></span><span className="faint xs nowrap">{a.status === 'active' ? 'Active' : a.status === 'paused' ? 'Paused' : 'Draft'} · {plural(a.run_count || 0, 'run')}{a.last_run_at ? ` · ${relTime(a.last_run_at)}` : ''}</span></Link>
            ))}
            {o.automations.some((a) => a.status === 'paused' && a.paused_reason) && <Callout tone="warn">An automation was paused after an error. <Link className="accent" to="/app/automations">Review</Link></Callout>}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 1000px){ .dash-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
