import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Info, ExternalLink } from 'lucide-react';
import { useOrg } from '../../data/store';
import { PageHead, Segmented, ChannelIcon, Drawer, StatusBadge, Empty, Callout } from '../../components/ui';
import { StackedBars, LineChart, HBars, Legend, SERIES_COLORS } from '../../components/charts';
import { summarize, filterMessages, timeSeries, rangeFor, isAttempted, isDelivered, msgTime } from '../../services/analytics';
import { campaignStats } from '../../services/campaigns';
import { CHANNEL_LABEL, MESSAGE_STATUS, CHANNEL_CAPS } from '../../lib/constants';
import { fmtNum, fmtDate, fmtDateTime, fullName, toCSV, download, pct } from '../../lib/util';
import { useTitle, usePerm } from '../../lib/hooks';

const iso = (ts) => new Date(ts).toISOString().slice(0, 10);

export default function Analytics() {
  useTitle('Analytics');
  const o = useOrg();
  const can = usePerm();
  const [sp] = useSearchParams();
  const qFrom = Number(sp.get('from')); const qTo = Number(sp.get('to'));
  const [preset, setPreset] = useState(qFrom ? 'custom' : '30d');
  const [custom, setCustom] = useState({ from: qFrom ? iso(qFrom) : iso(Date.now() - 30 * 864e5), to: qTo ? iso(qTo - 1) : iso(Date.now()) });
  const [channel, setChannel] = useState(sp.get('channel') || 'all');
  const [campaignId, setCampaignId] = useState('all');
  const [drill, setDrill] = useState(null);
  const { from, to } = rangeFor(preset, custom);
  const badRange = preset === 'custom' && from > to;
  const msgs = useMemo(() => (badRange ? [] : filterMessages(o.messages, { from, to, channel, campaignId })), [o.messages, from, to, channel, campaignId, badRange]);
  const s = summarize(msgs);
  const keys = channel === 'all' ? ['email', 'sms', 'whatsapp'] : [channel];
  const vol = timeSeries(msgs, from, to, { keys });
  const perf = timeSeries(msgs, from, to, { keys: ['delivered', 'failed'], keyFn: (m) => (isDelivered(m) ? 'delivered' : m.status === 'failed' ? 'failed' : 'other') });
  const replies = timeSeries(msgs.filter((m) => m.replied_at).map((m) => ({ ...m, attempted_at: m.replied_at })), from, to, { keys: ['replied'], keyFn: () => 'replied' });
  const camps = o.campaigns.filter((c) => c.sent_at && c.sent_at >= from && c.sent_at <= to && (campaignId === 'all' || c.id === campaignId));
  const campRows = camps.map((c) => ({ c, st: campaignStats(o.messages.filter((m) => m.campaign_id === c.id && (channel === 'all' || m.channel === channel))) })).filter((r) => r.st.attempted || r.st.skipped);
  const execs = o.executions.filter((e) => !e.test && e.started_at >= from && e.started_at <= to);
  const activeAutos = o.automations.filter((a) => a.status === 'active').length;
  const byCh = ['email', 'sms', 'whatsapp'].map((ch) => ({ ch, ...summarize(msgs.filter((m) => m.channel === ch)) }));
  const label = preset === 'custom' ? `${fmtDate(from)} – ${fmtDate(to)}` : { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }[preset];

  const open = (title, pred) => setDrill({ title, rows: msgs.filter(pred).sort((a, b) => msgTime(b) - msgTime(a)) });
  const exportReport = () => {
    const rows = [['Relayline communication report'], ['Workspace', o.org.name], ['Period', label], ['Channel', channel === 'all' ? 'All' : CHANNEL_LABEL[channel]], ['Campaign', campaignId === 'all' ? 'All' : o.campaigns.find((c) => c.id === campaignId)?.name], ['Note', 'All activity is simulated in demonstration mode'], [],
      ['Metric', 'Value'], ['Total message records', s.total], ['Messages attempted', s.attempted], ['Delivered', s.delivered], ['Read (WhatsApp only)', s.read], ['Failed', s.failed], ['Awaiting delivery report', s.pending], ['Not sent (eligibility)', s.skipped], ['Delivery rate', `${s.deliveryRate.toFixed(1)}%`], ['Replies', s.replied], ['Response rate', `${s.responseRate.toFixed(1)}%`], ['Acknowledged', s.acknowledged], ['Campaigns sent', camps.length], ['Automation executions', execs.length], [],
      ['Period start', ...keys.map((k) => CHANNEL_LABEL[k] + ' attempted'), 'Delivered', 'Failed', 'Replies'], ...vol.labels.map((l, i) => [iso(vol.ranges[i][0]), ...keys.map((k) => vol.series[k][i]), perf.series.delivered[i], perf.series.failed[i], replies.series.replied[i]]), [],
      ['Campaign', 'Sent', 'Recipients', 'Attempted', 'Delivered', 'Failed', 'Replied', 'Delivery rate'], ...campRows.map(({ c, st }) => [c.name, iso(c.sent_at), st.recipients, st.attempted, st.delivered, st.failed, st.replied, pct(st.delivered, st.attempted - st.pending)])];
    download(`relayline-report-${iso(from)}-to-${iso(to)}.csv`, toCSV(rows));
  };
  if (!can('analytics.view')) return <Empty title="You don't have access to analytics">Ask a workspace admin to change your role.</Empty>;

  const tiles = [
    ['Total messages', s.total, 'All message records, including not-sent', () => open('All message records', () => true)],
    ['Messages attempted', s.attempted, 'Handed to the (simulated) provider', () => open('Attempted messages', isAttempted)],
    ['Delivered', s.delivered, 'Delivery confirmed', () => open('Delivered messages', isDelivered)],
    ['Failed', s.failed, 'Rejected or bounced', () => open('Failed messages', (m) => m.status === 'failed')],
    ['Delivery rate', s.attempted ? `${s.deliveryRate.toFixed(1)}%` : '—', 'Delivered ÷ messages with a final report', null],
    ['Replies received', s.replied, 'Messages that got a reply', () => open('Messages with replies', (m) => !!m.replied_at)],
    ['Response rate', s.delivered ? `${s.responseRate.toFixed(1)}%` : '—', 'Replies ÷ delivered', null],
    ['Campaigns sent', camps.length, 'Started in this period', null],
    ['Active automations', activeAutos, 'Currently active', null],
    ['Automation executions', execs.length, 'Live runs in this period', null],
  ];

  return (
    <>
      <PageHead title="Analytics" description="Communication volume, delivery and responses — computed from the underlying message records." actions={<button className="btn" onClick={exportReport}><Download />Export report</button>} />
      <div className="card" style={{ marginBottom: 16 }}><div className="toolbar" style={{ borderBottom: 0 }}>
        <Segmented value={preset} onChange={setPreset} options={[['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['custom', 'Custom']]} label="Date range" />
        {preset === 'custom' && <><input type="date" className="input input-sm" style={{ width: 'auto' }} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From date" /><span className="faint">to</span><input type="date" className="input input-sm" style={{ width: 'auto' }} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To date" /></>}
        <select className="select input-sm" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel"><option value="all">All channels</option>{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
        <select className="select input-sm" style={{ width: 'auto', maxWidth: 240 }} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign"><option value="all">All campaigns & automations</option>{o.campaigns.filter((c) => c.sent_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <span className="faint small" style={{ marginLeft: 'auto' }}>{label}</span>
      </div></div>
      {badRange && <div style={{ marginBottom: 16 }}><Callout tone="err">The start date must be before the end date.</Callout></div>}

      <div className="grid-4" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', marginBottom: 16 }} >
        {tiles.map(([l, v, sub, fn]) => <button key={l} className="card stat" style={{ textAlign: 'left', cursor: fn ? 'pointer' : 'default' }} onClick={fn || undefined} disabled={!fn} title={fn ? 'Open the underlying records' : undefined}><div className="stat-label">{l}</div><div className="stat-value" style={{ fontSize: '1.4rem' }}>{typeof v === 'number' ? fmtNum(v) : v}</div><div className="faint xs">{sub}</div></button>)}
      </div>
      <style>{`@media (max-width: 1200px){ .grid-4[style*="repeat(5"]{ grid-template-columns: repeat(2,minmax(0,1fr)) !important; } }`}</style>

      {s.total === 0 && !badRange ? <div className="card"><Empty title="No messages in this period">Widen the date range or clear filters.</Empty></div> : <>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="card"><div className="card-head"><h3>Message volume over time</h3><span className="faint xs">{vol.bucket > 864e5 ? 'Weekly' : 'Daily'} · click a bar for records</span></div><div className="card-body">
            <StackedBars labels={vol.labels} series={keys.map((k) => ({ key: k, label: CHANNEL_LABEL[k], color: SERIES_COLORS[k], values: vol.series[k] }))} onBarClick={(i) => open(`Messages · ${vol.labels[i]}`, (m) => isAttempted(m) && msgTime(m) >= vol.ranges[i][0] && msgTime(m) < vol.ranges[i][1])} />
            {keys.length > 1 && <div style={{ marginTop: 10 }}><Legend items={keys.map((k) => ({ key: k, label: CHANNEL_LABEL[k], color: SERIES_COLORS[k] }))} /></div>}
          </div></div>
          <div className="card"><div className="card-head"><h3>Delivery performance</h3><span className="faint xs">Delivered vs failed</span></div><div className="card-body">
            <LineChart labels={perf.labels} series={[{ key: 'delivered', label: 'Delivered', color: SERIES_COLORS.delivered, values: perf.series.delivered }, { key: 'failed', label: 'Failed', color: SERIES_COLORS.failed, values: perf.series.failed }]} onPointClick={(i) => open(`Delivery reports · ${perf.labels[i]}`, (m) => (isDelivered(m) || m.status === 'failed') && msgTime(m) >= perf.ranges[i][0] && msgTime(m) < perf.ranges[i][1])} />
            <div style={{ marginTop: 10 }}><Legend items={[{ key: 'd', label: 'Delivered', color: SERIES_COLORS.delivered }, { key: 'f', label: 'Failed', color: SERIES_COLORS.failed }]} /></div>
          </div></div>
        </div>
        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="card"><div className="card-head"><h3>Channel usage</h3></div><div className="card-body"><HBars rows={byCh.map((b) => ({ key: b.ch, label: CHANNEL_LABEL[b.ch], value: b.attempted, color: SERIES_COLORS[b.ch], icon: <ChannelIcon channel={b.ch} />, sub: s.attempted ? `${Math.round((b.attempted / s.attempted) * 100)}%` : '' }))} onRowClick={(r) => open(`${r.label} messages`, (m) => m.channel === r.key && isAttempted(m))} /></div></div>
          <div className="card"><div className="card-head"><h3>Failed message trend</h3></div><div className="card-body"><LineChart height={180} labels={perf.labels} series={[{ key: 'failed', label: 'Failed', color: SERIES_COLORS.failed, values: perf.series.failed }]} onPointClick={(i) => open(`Failed · ${perf.labels[i]}`, (m) => m.status === 'failed' && msgTime(m) >= perf.ranges[i][0] && msgTime(m) < perf.ranges[i][1])} /></div></div>
          <div className="card"><div className="card-head"><h3>Response activity</h3></div><div className="card-body"><StackedBars height={180} labels={replies.labels} series={[{ key: 'replied', label: 'Replies', color: SERIES_COLORS.replied, values: replies.series.replied }]} onBarClick={(i) => open(`Replies · ${replies.labels[i]}`, (m) => m.replied_at && m.replied_at >= replies.ranges[i][0] && m.replied_at < replies.ranges[i][1])} /></div></div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h3>Events by channel</h3><span className="faint xs row" style={{ gap: 4 }}><Info size={12} />These are distinct events and are never combined.</span></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Channel</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Failed</th><th>Replied</th><th>Acknowledged</th><th>Delivery rate</th></tr></thead><tbody>
            {byCh.map((b) => <tr key={b.ch}><td><span className="row"><ChannelIcon channel={b.ch} />{CHANNEL_LABEL[b.ch]}</span></td><td>{b.sent}</td><td>{b.delivered}</td><td title={CHANNEL_CAPS[b.ch].note}>{CHANNEL_CAPS[b.ch].read ? `${b.read}${b.waReadRate != null ? ` (${b.waReadRate.toFixed(0)}%)` : ''}` : <span className="faint">Not available</span>}</td><td className={b.failed ? 'err' : ''}>{b.failed}</td><td>{b.replied}</td><td>{b.acknowledged}</td><td>{b.attempted ? `${b.deliveryRate.toFixed(1)}%` : '—'}</td></tr>)}
          </tbody></table></div>
          <p className="faint xs" style={{ padding: '0 20px 14px' }}>Read receipts are only reported for WhatsApp. Email open tracking and SMS reads are not reliable, so no read rate is calculated for them.</p>
        </div>

        <div className="card">
          <div className="card-head"><h3>Campaign comparison</h3><span className="faint xs">{campRows.length} campaigns in period</span></div>
          {campRows.length === 0 ? <Empty title="No campaigns sent in this period" /> : (
            <div className="table-wrap"><table className="table"><thead><tr><th>Campaign</th><th>Sent</th><th>Recipients</th><th>Attempted</th><th style={{ width: '24%' }}>Delivery rate</th><th>Failed</th><th>Replies</th><th /></tr></thead><tbody>
              {campRows.sort((a, b) => b.c.sent_at - a.c.sent_at).map(({ c, st }) => { const rate = st.attempted - st.pending ? (st.delivered / (st.attempted - st.pending)) * 100 : 0; return (
                <tr key={c.id}><td><Link to={`/app/campaigns/${c.id}`} className="strong">{c.name}</Link><div className="row" style={{ gap: 3, marginTop: 3 }}>{c.channels.map((ch) => <ChannelIcon key={ch} channel={ch} size={18} />)}</div></td><td className="muted small nowrap">{fmtDate(c.sent_at)}</td><td>{st.recipients}</td><td>{st.attempted}</td>
                  <td><div className="row"><div style={{ flex: 1, height: 8, background: 'var(--bg-active)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${rate}%`, height: '100%', background: 'var(--ok)', borderRadius: 4 }} /></div><span className="small strong" style={{ width: 48, textAlign: 'right' }}>{st.attempted ? `${rate.toFixed(0)}%` : '—'}</span></div></td>
                  <td className={st.failed ? 'err' : ''}>{st.failed}</td><td>{st.replied}</td><td><Link to={`/app/campaigns/${c.id}?tab=recipients`} className="btn btn-ghost btn-sm">Recipients <ExternalLink size={12} /></Link></td></tr>); })}
            </tbody></table></div>
          )}
        </div>
      </>}
      <p className="faint xs" style={{ marginTop: 12 }}>All figures reflect simulated activity in demonstration mode.</p>
      {drill && <RecordsDrawer drill={drill} onClose={() => setDrill(null)} />}
    </>
  );
}

function RecordsDrawer({ drill, onClose }) {
  const o = useOrg();
  const byId = Object.fromEntries(o.contacts.map((c) => [c.id, c]));
  const camp = Object.fromEntries(o.campaigns.map((c) => [c.id, c]));
  const auto = Object.fromEntries(o.automations.map((c) => [c.id, c]));
  const exp = () => download('message-records.csv', toCSV([['time', 'contact', 'channel', 'status', 'source', 'reason'], ...drill.rows.map((m) => [new Date(msgTime(m)).toISOString(), byId[m.contact_id] ? fullName(byId[m.contact_id]) : '', m.channel, m.status, camp[m.campaign_id]?.name || auto[m.automation_id]?.name || m.role, m.failure_reason || ''])]));
  return (
    <Drawer title={`${drill.title} (${drill.rows.length})`} onClose={onClose} width={560} footer={<button className="btn" onClick={exp} disabled={!drill.rows.length}><Download />Export these records</button>}>
      {drill.rows.length === 0 ? <Empty title="No records" /> : (
        <div className="stack" style={{ gap: 0 }}>
          {drill.rows.slice(0, 300).map((m) => (
            <div key={m.id} className="between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start', gap: 10 }}>
              <div className="row" style={{ alignItems: 'flex-start', minWidth: 0 }}><ChannelIcon channel={m.channel} /><div style={{ minWidth: 0 }}>
                <div className="small">{byId[m.contact_id] ? <Link className="strong" to={`/app/contacts/${m.contact_id}`} onClick={onClose}>{fullName(byId[m.contact_id])}</Link> : 'Deleted contact'}</div>
                <div className="faint xs truncate">{m.campaign_id ? <Link to={`/app/campaigns/${m.campaign_id}`} onClick={onClose} className="accent">{camp[m.campaign_id]?.name}</Link> : m.automation_id ? `Automation: ${auto[m.automation_id]?.name}` : m.role === 'reply' ? 'Inbox reply' : m.role}{m.failure_reason ? ` · ${m.failure_reason}` : ''}</div>
              </div></div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}><StatusBadge map={MESSAGE_STATUS} status={m.status} /><span className="faint xs nowrap">{fmtDateTime(msgTime(m), o.org.timezone)}</span></div>
            </div>
          ))}
          {drill.rows.length > 300 && <p className="faint xs" style={{ paddingTop: 10 }}>Showing the first 300 records. Export to see all.</p>}
        </div>
      )}
    </Drawer>
  );
}
