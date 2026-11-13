import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Check } from 'lucide-react';
import { useOrg, tx, upd } from '../../data/store';
import { PageHead, Empty, Segmented } from '../../components/ui';
import { relTime, fmtDateTime } from '../../lib/util';
import { useTitle } from '../../lib/hooks';

export default function Notifications() {
  useTitle('Notifications');
  const o = useOrg();
  const nav = useNavigate();
  const [f, setF] = useState('all');
  const mine = [...o.myNotifications].sort((a, b) => b.created_at - a.created_at).filter((n) => f === 'all' || !n.read_at);
  const unread = o.myNotifications.filter((n) => !n.read_at).length;
  const markAll = () => tx((d) => d.notifications.forEach((n, i) => { if (n.user_id === o.user.id && n.organisation_id === o.orgId && !n.read_at) d.notifications[i] = { ...n, read_at: Date.now() }; }));
  const mark = (n, read = true) => tx((d) => upd(d.notifications, n.id, { read_at: read ? Date.now() : null }));
  return (
    <>
      <PageHead title="Notifications" description={`${unread} unread`} actions={<button className="btn" onClick={markAll} disabled={!unread}><CheckCheck />Mark all as read</button>} />
      <div className="card">
        <div className="toolbar"><Segmented value={f} onChange={setF} options={[['all', 'All'], ['unread', 'Unread']]} label="Filter" /></div>
        {mine.length === 0 ? <Empty icon={Bell} title={f === 'unread' ? 'No unread notifications' : 'No notifications yet'} /> : mine.map((n) => (
          <div key={n.id} className="between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', gap: 12 }}>
            <button className="row" style={{ background: 'none', border: 0, textAlign: 'left', cursor: n.link ? 'pointer' : 'default', alignItems: 'flex-start', flex: 1, minWidth: 0, padding: 0 }} onClick={() => { mark(n); n.link && nav(n.link); }}>
              <span style={{ width: 8, marginTop: 7, flex: 'none' }}>{!n.read_at && <span className="unread-dot" style={{ display: 'block' }} />}</span>
              <span><span className="small" style={{ color: n.read_at ? 'var(--text-2)' : 'var(--text)', display: 'block' }}>{n.message}</span><span className="faint xs" title={fmtDateTime(n.created_at)}>{relTime(n.created_at)}</span></span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => mark(n, !n.read_at)}>{n.read_at ? 'Mark unread' : <><Check />Mark read</>}</button>
          </div>
        ))}
      </div>
    </>
  );
}
