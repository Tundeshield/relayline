// Static, illustrative rendering of the app used on the marketing site.
import { LayoutDashboard, Send, Workflow, Inbox, Users, BarChart3, Mail, MessageSquare, MessageCircle } from 'lucide-react';

const bars = [18, 26, 22, 34, 28, 41, 30, 24, 38, 46, 33, 52, 44, 39];
export default function ProductPreview() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', minHeight: 420, fontSize: 13 }} aria-label="Illustration of the Relayline dashboard" role="img">
      <div style={{ borderRight: '1px solid var(--border)', padding: 14, background: 'var(--bg)' }} className="desktop-only">
        <div className="row strong" style={{ marginBottom: 18 }}><span className="avatar avatar-sm" style={{ borderRadius: 6 }}>N</span>Northstar</div>
        {[[LayoutDashboard, 'Dashboard', 1], [Send, 'Campaigns'], [Workflow, 'Automations'], [Inbox, 'Inbox'], [Users, 'Contacts'], [BarChart3, 'Analytics']].map(([I, l, a]) => (
          <div key={l} className="row" style={{ padding: '7px 8px', borderRadius: 6, color: a ? 'var(--text)' : 'var(--text-2)', background: a ? 'var(--bg-active)' : 'none', marginBottom: 2 }}><I size={15} color={a ? 'var(--accent)' : undefined} />{l}</div>
        ))}
      </div>
      <div style={{ padding: 18 }} className="stack">
        <div className="between"><div><div className="strong" style={{ fontSize: 16 }}>Good morning, Alex</div><div className="faint xs">Here is what is happening across your channels.</div></div><span className="btn btn-primary btn-sm">Create campaign</span></div>
        <div className="grid-4" style={{ gap: 10 }}>
          {[['Contacts', '1,284', '+42 this month'], ['Messages sent', '9,412', '+12.4%'], ['Delivery rate', '96.8%', '+0.6 pts'], ['Active automations', '6', '1,903 runs']].map(([l, v, d]) => (
            <div key={l} className="card" style={{ padding: 12 }}><div className="faint xs">{l}</div><div className="strong" style={{ fontSize: 20, marginTop: 2 }}>{v}</div><div className="xs accent">{d}</div></div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="between xs faint" style={{ marginBottom: 10 }}><span className="strong" style={{ color: 'var(--text)', fontSize: 12.5 }}>Communication activity</span><span>Last 14 days</span></div>
            <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 120 }}>
              {bars.map((h, i) => <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ height: h * 0.9, background: '#4f7fe8', borderRadius: '3px 3px 0 0' }} /><div style={{ height: h * 0.6, background: '#c7741f' }} /><div style={{ height: h * 0.35, background: '#1a9e8b' }} /></div>)}
            </div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="strong" style={{ fontSize: 12.5, marginBottom: 10 }}>Inbox</div>
            {[[MessageSquare, 'Maria G.', 'Will the water be restored by 3 PM?', '#9a560f'], [Mail, 'Sofia R.', 'Is the laundry room affected too?', '#2f5fc4'], [MessageCircle, 'Olivia P.', 'Can the freight elevator be reserved?', '#127a6b']].map(([I, n, t, c]) => (
              <div key={n} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}><I size={14} color={c} style={{ marginTop: 3 }} /><div className="grow" style={{ minWidth: 0 }}><div className="strong xs">{n}</div><div className="faint xs truncate">{t}</div></div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
