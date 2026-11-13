import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Send, MoreHorizontal, Copy, XCircle, Pencil, Trash2, Eye } from 'lucide-react';
import { useOrg } from '../../data/store';
import { PageHead, Empty, StatusBadge, ChannelIcon, Progress, Menu, MenuItem, useConfirm, useSort } from '../../components/ui';
import { CAMPAIGN_STATUS, CAMPAIGN_CATEGORIES, CHANNEL_LABEL } from '../../lib/constants';
import { audienceLabel, campaignStats, cancelCampaign, duplicateCampaign } from '../../services/campaigns';
import { logActivity } from '../../services/core';
import { fmtDate, fmtDateTime, plural } from '../../lib/util';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

export function DeliveryBar({ st }) {
  if (!st.attempted) return <span className="faint small">—</span>;
  return (
    <div style={{ minWidth: 130 }}>
      <Progress parts={[{ label: 'Delivered', value: st.delivered, color: 'var(--ok)' }, { label: 'Pending', value: st.pending, color: 'var(--text-3)' }, { label: 'Failed', value: st.failed, color: 'var(--err)' }]} />
      <div className="faint xs" style={{ marginTop: 4 }}>{st.delivered}/{st.attempted} delivered{st.failed ? ` · ${st.failed} failed` : ''}{st.pending ? ` · ${st.pending} pending` : ''}</div>
    </div>
  );
}

export default function Campaigns() {
  useTitle('Campaigns');
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [category, setCategory] = useState('');
  const stats = useMemo(() => Object.fromEntries(o.campaigns.map((c) => [c.id, campaignStats(o.messages.filter((m) => m.campaign_id === c.id))])), [o.campaigns, o.messages]);
  const rows = o.campaigns.filter((c) => (!q || c.name.toLowerCase().includes(q.toLowerCase())) && (!status || c.status === status) && (!channel || c.channels.includes(channel)) && (!category || c.category === category));
  const { sorted, Th } = useSort(rows, { key: 'date', dir: 'desc' }, { date: (c) => c.sent_at || c.schedule_at || c.created_at, recipients: (c) => stats[c.id].recipients || 0 });
  const del = async (c) => { if (await confirm({ title: `Delete draft “${c.name}”?`, message: 'This draft will be permanently removed.', confirmLabel: 'Delete', danger: true })) run((d, ctx) => { d.campaigns = d.campaigns.filter((x) => x.id !== c.id); logActivity(d, ctx, { event_type: 'campaign.deleted', entity_type: 'campaign', entity_id: c.id, summary: `Draft campaign “${c.name}” deleted` }); }, { success: 'Draft deleted.' }); };
  const cancel = async (c) => { if (await confirm({ title: `Cancel “${c.name}”?`, message: c.status === 'processing' ? 'Messages not yet sent will be cancelled. Messages already sent cannot be recalled.' : 'The scheduled send will not happen. You can duplicate it later.', confirmLabel: 'Cancel campaign', danger: true })) run((d, ctx) => cancelCampaign(d, ctx, c.id), { success: 'Campaign cancelled.' }); };
  const counts = Object.fromEntries(Object.keys(CAMPAIGN_STATUS).map((s) => [s, o.campaigns.filter((c) => c.status === s).length]));
  return (
    <>
      <PageHead title="Campaigns" description="Compose once, choose your channels, and track what happened to every message." actions={<Link to="/app/campaigns/new" className={`btn btn-primary ${!can('campaigns.send') ? 'disabled' : ''}`} onClick={(e) => !can('campaigns.send') && e.preventDefault()}><Plus />Create campaign</Link>} />
      <div className="row wrap" style={{ marginBottom: 14, gap: 6 }}>
        <button className={`btn btn-sm ${!status ? 'btn-primary' : ''}`} onClick={() => setStatus('')}>All · {o.campaigns.length}</button>
        {Object.entries(CAMPAIGN_STATUS).map(([k, v]) => <button key={k} className={`btn btn-sm ${status === k ? 'btn-primary' : ''}`} onClick={() => setStatus(k)}>{v.label} · {counts[k]}</button>)}
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="input-icon" style={{ flex: '1 1 240px', maxWidth: 340 }}><Search /><input className="input input-sm" placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search campaigns" /></div>
          <select className="select input-sm" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel"><option value="">All channels</option>{['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
          <select className="select input-sm" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{Object.entries(CAMPAIGN_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        {o.campaigns.length === 0 ? <Empty icon={Send} title="No campaigns yet" action={<Link to="/app/campaigns/new" className="btn btn-primary"><Plus />Create campaign</Link>}>Send an announcement, reminder or update across email, SMS and WhatsApp.</Empty>
          : sorted.length === 0 ? <Empty icon={Search} title="No campaigns match these filters" /> : (
            <div className="table-wrap"><table className="table"><thead><tr><Th k="name">Campaign</Th><th>Channels</th><th>Audience</th><Th k="recipients">Recipients</Th><Th k="created_at">Created</Th><Th k="date">Scheduled / sent</Th><Th k="status">Status</Th><th>Delivery</th><th /></tr></thead><tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="clickable" onClick={(e) => !e.target.closest('button,a') && nav(c.status === 'draft' ? `/app/campaigns/${c.id}/edit` : `/app/campaigns/${c.id}`)}>
                  <td><Link to={c.status === 'draft' ? `/app/campaigns/${c.id}/edit` : `/app/campaigns/${c.id}`} className="strong">{c.name}</Link><div className="faint xs">{CAMPAIGN_CATEGORIES[c.category]}{c.delivery_mode === 'fallback' && c.channels.length > 1 ? ' · fallback' : ''}</div></td>
                  <td><span className="row" style={{ gap: 4 }}>{c.channels.map((ch) => <ChannelIcon key={ch} channel={ch} />)}{!c.channels.length && <span className="faint">—</span>}</span></td>
                  <td className="muted small" style={{ maxWidth: 200 }}>{audienceLabel(c, o.lists)}</td>
                  <td>{stats[c.id].recipients || (c.status === 'draft' || c.status === 'scheduled' ? <span className="faint">—</span> : 0)}</td>
                  <td className="muted nowrap">{fmtDate(c.created_at)}</td>
                  <td className="muted nowrap small">{c.status === 'scheduled' ? <span className="accent">{fmtDateTime(c.schedule_at, o.org.timezone)}</span> : c.sent_at ? fmtDateTime(c.sent_at, o.org.timezone) : '—'}</td>
                  <td><StatusBadge map={CAMPAIGN_STATUS} status={c.status} /></td>
                  <td><DeliveryBar st={stats[c.id]} /></td>
                  <td><Menu trigger={({ toggle }) => <button className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label="Campaign actions"><MoreHorizontal /></button>}>
                    {c.status !== 'draft' && <MenuItem icon={Eye} to={`/app/campaigns/${c.id}`}>View results</MenuItem>}
                    {['draft', 'scheduled'].includes(c.status) && <MenuItem icon={Pencil} to={`/app/campaigns/${c.id}/edit`} disabled={!can('campaigns.send')}>Edit</MenuItem>}
                    <MenuItem icon={Copy} onClick={() => { const n = run((d, ctx) => duplicateCampaign(d, ctx, c.id), { success: 'Campaign duplicated as a draft.' }); n && nav(`/app/campaigns/${n.id}/edit`); }} disabled={!can('campaigns.send')}>Duplicate</MenuItem>
                    {['scheduled', 'processing'].includes(c.status) && <MenuItem icon={XCircle} danger onClick={() => cancel(c)} disabled={!can('campaigns.send')}>Cancel</MenuItem>}
                    {c.status === 'draft' && <MenuItem icon={Trash2} danger onClick={() => del(c)} disabled={!can('campaigns.send')}>Delete draft</MenuItem>}
                  </Menu></td>
                </tr>
              ))}
            </tbody></table></div>
          )}
      </div>
      <p className="faint xs" style={{ marginTop: 10 }}>{plural(o.campaigns.length, 'campaign')}. All sends are simulated in demonstration mode.</p>
    </>
  );
}
