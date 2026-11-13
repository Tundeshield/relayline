import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, XCircle, Download, Pencil, Search, Send, Radio, CalendarClock, MessageSquareReply, AlertCircle, CheckCircle2, Clock, Ban, Users } from 'lucide-react';
import { useOrg } from '../../data/store';
import { PageHead, Empty, StatusBadge, ChannelIcon, Tabs, Badge, Callout, useConfirm, useSort } from '../../components/ui';
import { MessagePreview } from '../../components/Composer';
import { HBars } from '../../components/charts';
import { CAMPAIGN_STATUS, CAMPAIGN_CATEGORIES, CHANNEL_LABEL, MESSAGE_STATUS, CHANNEL_CAPS } from '../../lib/constants';
import { audienceLabel, campaignStats, cancelCampaign, duplicateCampaign } from '../../services/campaigns';
import { fmtDateTime, fullName, pct, relTime, toCSV, download, plural, fmtTime } from '../../lib/util';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

export default function CampaignDetail() {
  const { id } = useParams();
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'overview';
  const c = o.campaigns.find((x) => x.id === id);
  useTitle(c?.name || 'Campaign');
  const msgs = useMemo(() => o.messages.filter((m) => m.campaign_id === id), [o.messages, id]);
  const st = useMemo(() => campaignStats(msgs), [msgs]);
  if (!c) return <Empty title="Campaign not found" action={<Link className="btn" to="/app/campaigns">Back to campaigns</Link>} />;
  const contactById = Object.fromEntries(o.contacts.map((x) => [x.id, x]));
  const tz = o.org.timezone;

  const exportRows = () => download(`${c.name.replace(/\W+/g, '-').toLowerCase()}-recipients.csv`, toCSV([['contact', 'email', 'phone', 'channel', 'role', 'status', 'sent_at', 'delivered_at', 'read_at', 'failed_at', 'reason', 'replied_at', 'acknowledged_at', 'simulated'],
    ...msgs.map((m) => { const ct = contactById[m.contact_id]; return [ct ? fullName(ct) : '(deleted contact)', ct?.email, ct?.phone, m.channel, m.role, m.status, m.sent_at && new Date(m.sent_at).toISOString(), m.delivered_at && new Date(m.delivered_at).toISOString(), m.read_at && new Date(m.read_at).toISOString(), m.failed_at && new Date(m.failed_at).toISOString(), m.failure_reason || m.fallback_note, m.replied_at && new Date(m.replied_at).toISOString(), m.acknowledged_at && new Date(m.acknowledged_at).toISOString(), 'yes']; })]));
  const cancel = async () => { if (await confirm({ title: `Cancel “${c.name}”?`, message: c.status === 'processing' ? 'Queued messages will be cancelled. Messages already sent cannot be recalled.' : 'The scheduled send will not happen.', confirmLabel: 'Cancel campaign', danger: true })) run((d, ctx) => cancelCampaign(d, ctx, c.id), { success: 'Campaign cancelled.' }); };
  const replies = o.conversationMessages.filter((m) => m.direction === 'in' && msgs.some((x) => x.replied_at && x.contact_id === o.conversations.find((cv) => cv.id === m.conversation_id)?.contact_id && Math.abs(m.created_at - x.replied_at) < 1000));

  return (
    <>
      <PageHead crumbs={[{ label: 'Campaigns', to: '/app/campaigns' }, { label: c.name }]}
        title={<span className="row-3 wrap">{c.name}<StatusBadge map={CAMPAIGN_STATUS} status={c.status} />{c.status === 'processing' && <span className="badge badge-accent"><Radio size={12} />Live simulation</span>}</span>}
        description={`${CAMPAIGN_CATEGORIES[c.category]} · ${audienceLabel(c, o.lists)} · ${c.channels.map((ch) => CHANNEL_LABEL[ch]).join(' + ')}${c.delivery_mode === 'fallback' && c.channels.length > 1 ? ` (fallback to ${CHANNEL_LABEL[c.fallback.secondary]})` : ''}`}
        actions={<>
          {msgs.length > 0 && <button className="btn" onClick={exportRows}><Download />Export results</button>}
          <button className="btn" onClick={() => { const n = run((d, ctx) => duplicateCampaign(d, ctx, c.id), { success: 'Duplicated as a draft.' }); n && nav(`/app/campaigns/${n.id}/edit`); }} disabled={!can('campaigns.send')}><Copy />Duplicate</button>
          {c.status === 'scheduled' && <Link className="btn" to={`/app/campaigns/${c.id}/edit`}><Pencil />Edit</Link>}
          {['scheduled', 'processing'].includes(c.status) && <button className="btn btn-danger" onClick={cancel} disabled={!can('campaigns.send')}><XCircle />Cancel</button>}
        </>} />

      {c.status === 'scheduled' && <div style={{ marginBottom: 16 }}><Callout icon={CalendarClock}>Scheduled for <strong>{fmtDateTime(c.schedule_at, c.schedule?.timezone || tz)}</strong> ({c.schedule?.timezone || tz}) — {relTime(c.schedule_at)}. The simulator will start sending automatically at that time while the app is open.</Callout></div>}
      {c.status === 'cancelled' && <div style={{ marginBottom: 16 }}><Callout tone="warn">This campaign was cancelled {c.cancelled_at ? fmtDateTime(c.cancelled_at, tz) : ''}.{st.attempted ? ` ${st.attempted} messages had already been processed.` : ' No messages were sent.'}</Callout></div>}
      {c.status === 'processing' && <div style={{ marginBottom: 16 }}><Callout>Simulated delivery reports are arriving. Statuses update every second — some messages will fail, and some may never get a delivery report.</Callout></div>}

      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'recipients', label: 'Recipients', count: msgs.length }, { value: 'messages', label: 'Messages' }, { value: 'activity', label: 'Activity' }]} />
      <div style={{ marginTop: 20 }}>
        {tab === 'overview' && <Overview c={c} st={st} msgs={msgs} replies={replies} setTab={(t, f) => setSp({ tab: t, ...(f ? { status: f } : {}) })} />}
        {tab === 'recipients' && <Recipients msgs={msgs} contactById={contactById} tz={tz} initialStatus={sp.get('status') || ''} />}
        {tab === 'messages' && <Messages c={c} msgs={msgs} contactById={contactById} />}
        {tab === 'activity' && <CampaignActivity c={c} msgs={msgs} contactById={contactById} />}
      </div>
    </>
  );
}

function Overview({ c, st, msgs, setTab }) {
  const o = useOrg();
  const tiles = [
    ['Recipients', st.recipients || c.recipient_count || 0, null, Users],
    ['Attempted', st.attempted, `${st.skipped} not sent (consent/details)`, Send, 'all'],
    ['Delivered', st.delivered, st.attempted - st.pending ? `${pct(st.delivered, st.attempted - st.pending)} of reported` : null, CheckCircle2, 'delivered'],
    ['Failed', st.failed, st.fallbacks ? `${st.fallbacks} fallback messages sent` : null, AlertCircle, 'failed'],
    ['Awaiting report', st.pending, 'Sent with no delivery report yet', Clock, 'pending'],
    ['Replies', st.replied, st.delivered ? `${pct(st.replied, st.delivered)} of delivered` : null, MessageSquareReply],
  ];
  if (c.request_ack) tiles.push(['Acknowledged', st.acknowledged, st.delivered ? `${pct(st.acknowledged, st.delivered)} of delivered` : null, CheckCircle2]);
  if (c.channels.includes('whatsapp')) tiles.push(['Read (WhatsApp)', st.byChannel.whatsapp?.read || 0, 'Only WhatsApp reports reads', CheckCircle2]);
  const reasons = {};
  msgs.filter((m) => m.status === 'failed').forEach((m) => (reasons[m.failure_reason] = (reasons[m.failure_reason] || 0) + 1));
  const skip = {};
  msgs.filter((m) => m.status === 'skipped').forEach((m) => (skip[m.failure_reason] = (skip[m.failure_reason] || 0) + 1));
  if (!msgs.length) return <div className="card"><Empty icon={Send} title={c.status === 'scheduled' ? 'Not sent yet' : 'No messages'}>{c.status === 'scheduled' ? 'Results will appear here once the campaign starts.' : 'This campaign did not produce any messages.'}</Empty></div>;
  return (
    <div className="stack">
      <div className="grid-4">{tiles.map(([l, v, sub, I, f]) => (
        <button key={l} className="card stat" style={{ textAlign: 'left', cursor: f ? 'pointer' : 'default' }} onClick={() => f && setTab('recipients', f)} disabled={!f}><div className="stat-label"><I size={14} />{l}</div><div className="stat-value">{v}</div>{sub && <div className="faint xs" style={{ marginTop: 2 }}>{sub}</div>}</button>))}</div>
      <div className="grid-2">
        <div className="card"><div className="card-head"><h3>By channel</h3></div><div className="card-body">
          <div className="table-wrap"><table className="table"><thead><tr><th>Channel</th><th>Attempted</th><th>Delivered</th><th>Failed</th><th>Pending</th><th>Replied</th></tr></thead><tbody>
            {Object.entries(st.byChannel).map(([ch, b]) => <tr key={ch}><td><span className="row"><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}</span></td><td>{b.attempted}</td><td className="ok">{b.delivered}{CHANNEL_CAPS[ch].read && b.read ? <span className="faint xs"> ({b.read} read)</span> : ''}</td><td className={b.failed ? 'err' : ''}>{b.failed}</td><td>{b.pending}</td><td>{b.replied}</td></tr>)}
          </tbody></table></div>
          <p className="faint xs" style={{ marginTop: 10 }}>Read receipts are shown only for WhatsApp. Email and SMS report delivery, not reads.</p>
        </div></div>
        <div className="card"><div className="card-head"><h3>Why messages didn’t arrive</h3></div><div className="card-body stack">
          {Object.keys(reasons).length === 0 && Object.keys(skip).length === 0 && <span className="faint small">No failures or exclusions.</span>}
          {Object.keys(reasons).length > 0 && <><div className="label">Delivery failures (simulated)</div><HBars rows={Object.entries(reasons).map(([r, n]) => ({ key: r, label: r, value: n, color: 'var(--err)' }))} onRowClick={() => setTab('recipients', 'failed')} /></>}
          {Object.keys(skip).length > 0 && <><div className="label" style={{ marginTop: 8 }}>Not sent — eligibility</div><HBars rows={Object.entries(skip).map(([r, n]) => ({ key: r, label: r, value: n, color: 'var(--warn)' }))} onRowClick={() => setTab('recipients', 'skipped')} /></>}
        </div></div>
      </div>
      <div className="card"><div className="card-head"><h3>Timeline</h3></div><div className="card-body"><div className="timeline">
        {[[c.created_at, `Created by ${o.members.find((m) => m.user_id === c.created_by)?.user?.name || 'a team member'}`], c.schedule_at && c.status !== 'draft' && [c.created_at + 1, `Scheduled for ${fmtDateTime(c.schedule_at, o.org.timezone)}`], c.sent_at && [c.sent_at, `Sending started — ${st.attempted} messages queued, ${st.skipped} excluded`], c.completed_at && [c.completed_at, c.status === 'partially_failed' ? `Completed with ${st.failed} failures` : 'Completed'], c.cancelled_at && [c.cancelled_at, 'Cancelled']].filter(Boolean).sort((a, b) => a[0] - b[0]).map(([t, l], i) => (
          <div key={i} className="tl-item"><span className="tl-icon"><Clock /></span><div><div className="small">{l}</div><div className="faint xs">{fmtDateTime(t, o.org.timezone)}</div></div></div>))}
      </div></div></div>
    </div>
  );
}

function Recipients({ msgs, contactById, tz, initialStatus }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [channel, setChannel] = useState('');
  const rows = msgs.filter((m) => {
    const ct = contactById[m.contact_id];
    if (q && !(ct ? fullName(ct) : '').toLowerCase().includes(q.toLowerCase())) return false;
    if (channel && m.channel !== channel) return false;
    if (status === 'delivered' && !['delivered', 'read'].includes(m.status)) return false;
    if (status === 'pending' && !['queued', 'sent'].includes(m.status)) return false;
    if (status === 'all' && m.status === 'skipped') return false;
    if (status && !['delivered', 'pending', 'all'].includes(status) && m.status !== status) return false;
    return true;
  });
  const { sorted, Th } = useSort(rows, { key: 'name', dir: 'asc' }, { name: (m) => (contactById[m.contact_id] ? fullName(contactById[m.contact_id]) : 'zzz'), time: (m) => m.delivered_at || m.failed_at || m.sent_at || 0 });
  return (
    <div className="card">
      <div className="toolbar">
        <div className="input-icon" style={{ flex: '1 1 200px', maxWidth: 300 }}><Search /><input className="input input-sm" placeholder="Search recipients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipients" /></div>
        <select className="select input-sm" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All records</option><option value="all">Attempted</option><option value="delivered">Delivered</option><option value="read">Read</option><option value="failed">Failed</option><option value="pending">Awaiting report</option><option value="skipped">Not sent</option><option value="cancelled">Cancelled</option></select>
        <select className="select input-sm" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel"><option value="">All channels</option>{[...new Set(msgs.map((m) => m.channel))].map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}</select>
        <span className="faint small" style={{ marginLeft: 'auto' }}>{plural(rows.length, 'record')}</span>
      </div>
      {sorted.length === 0 ? <Empty title="No recipients match" /> : (
        <div className="table-wrap"><table className="table"><thead><tr><Th k="name">Recipient</Th><Th k="channel">Channel</Th><Th k="status">Status</Th><Th k="time">Updated</Th><th>Details</th></tr></thead><tbody>
          {sorted.map((m) => { const ct = contactById[m.contact_id]; return (
            <tr key={m.id}>
              <td>{ct ? <Link className="strong" to={`/app/contacts/${ct.id}`}>{fullName(ct)}</Link> : <span className="faint">Deleted contact</span>}<div className="faint xs">{m.channel === 'email' ? ct?.email : ct?.phone}</div></td>
              <td><span className="row"><ChannelIcon channel={m.channel} />{m.role === 'fallback' && <Badge tone="info">Fallback</Badge>}{m.role === 'fallback_unavailable' && <Badge tone="info">Fallback (primary unavailable)</Badge>}</span></td>
              <td><StatusBadge map={MESSAGE_STATUS} status={m.status} /></td>
              <td className="muted small nowrap">{m.read_at ? `Read ${fmtTime(m.read_at, tz)}` : m.delivered_at ? fmtDateTime(m.delivered_at, tz) : m.failed_at ? fmtDateTime(m.failed_at, tz) : m.sent_at ? `Sent ${fmtDateTime(m.sent_at, tz)}` : m.status === 'queued' ? 'Queued' : '—'}</td>
              <td className="small">{m.failure_reason ? <span className={m.status === 'failed' ? 'err' : 'warn'}>{m.failure_reason}</span> : null}{m.fallback_note && <div className="warn xs">{m.fallback_note}</div>}<span className="row wrap" style={{ gap: 4 }}>{m.replied_at && <Badge tone="info">Replied</Badge>}{m.acknowledged_at && <Badge tone="ok">Acknowledged</Badge>}{m.clicked_at && <Badge tone="info">Clicked</Badge>}{m.fallback_message_id && m.fallback_message_id !== 'none' && <Badge tone="neutral">Fallback sent</Badge>}{m.status === 'sent' && m.sim?.done && <span className="faint xs">No delivery report received</span>}</span></td>
            </tr>); })}
        </tbody></table></div>
      )}
    </div>
  );
}

function Messages({ c, msgs, contactById }) {
  const o = useOrg();
  const sample = contactById[msgs[0]?.contact_id] || o.contacts[0];
  return (
    <div className="grid-2">
      {c.channels.map((ch) => (
        <div key={ch} className="card"><div className="card-head"><h3 className="row"><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]} version</h3>{c.delivery_mode === 'fallback' && c.channels.length > 1 && <Badge tone={c.fallback.primary === ch ? 'accent' : 'neutral'}>{c.fallback.primary === ch ? 'Primary' : 'Fallback'}</Badge>}</div>
          <div className="card-body stack">
            <MessagePreview channel={ch} subject={c.content[ch]?.subject} body={c.content[ch]?.body || ''} contact={sample} org={o.org} />
            <details><summary className="small muted" style={{ cursor: 'pointer' }}>Raw content with variables</summary><pre className="mono small" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 12, borderRadius: 8, marginTop: 8 }}>{c.content[ch]?.subject ? `Subject: ${c.content[ch].subject}\n\n` : ''}{c.content[ch]?.body}</pre></details>
          </div>
        </div>
      ))}
    </div>
  );
}

function CampaignActivity({ c, msgs, contactById }) {
  const o = useOrg();
  const items = [
    ...o.activity.filter((a) => a.entity_id === c.id).map((a) => ({ at: a.created_at, icon: Clock, text: a.summary, who: a.user_id ? o.members.find((m) => m.user_id === a.user_id)?.user?.name : 'System' })),
    ...msgs.filter((m) => m.replied_at).map((m) => ({ at: m.replied_at, icon: MessageSquareReply, text: <>{contactById[m.contact_id] ? fullName(contactById[m.contact_id]) : 'A contact'} replied by {CHANNEL_LABEL[m.channel]} — <Link className="accent" to={`/app/inbox/${o.conversations.find((cv) => cv.contact_id === m.contact_id && cv.channel === m.channel)?.id || ''}`}>open in inbox</Link></> })),
    ...msgs.filter((m) => m.status === 'failed').map((m) => ({ at: m.failed_at, icon: AlertCircle, text: `${CHANNEL_LABEL[m.channel]} to ${contactById[m.contact_id] ? fullName(contactById[m.contact_id]) : 'contact'} failed: ${m.failure_reason}`, tone: 'err' })),
    ...msgs.filter((m) => m.status === 'skipped').slice(0, 30).map((m) => ({ at: m.created_at, icon: Ban, text: `${CHANNEL_LABEL[m.channel]} not sent to ${contactById[m.contact_id] ? fullName(contactById[m.contact_id]) : 'contact'}: ${m.failure_reason}`, tone: 'warn' })),
  ].sort((a, b) => b.at - a.at);
  return (
    <div className="card card-body">{items.length === 0 ? <Empty title="No activity yet" /> : <div className="timeline">{items.map((t, i) => { const I = t.icon; return <div key={i} className="tl-item"><span className="tl-icon" style={t.tone ? { color: `var(--${t.tone})` } : undefined}><I /></span><div className="grow"><div className="small">{t.text}</div><div className="faint xs">{fmtDateTime(t.at, o.org.timezone)}{t.who ? ` · ${t.who}` : ''}</div></div></div>; })}</div>}</div>
  );
}
