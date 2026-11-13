import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Inbox as InboxIcon, UserCheck, User, CircleDot, CheckCircle2, Mail, MessageSquare, MessageCircle, Search, Send, StickyNote, ArrowLeft, RotateCcw, FlaskConical, ExternalLink, Info, Bot } from 'lucide-react';
import { useOrg, upd, getState } from '../../data/store';
import { ChannelIcon, Avatar, Badge, Empty, Callout, Menu, MenuItem, Segmented, Modal, Field, StatusBadge } from '../../components/ui';
import { ChannelAvail, ConsentBadge } from './shared';
import { sendReply, replyEligibility, receiveMessage } from '../../services/messaging';
import { logActivity } from '../../services/core';
import { getConsent } from '../../services/consent';
import { fullName, relTime, fmtDateTime, fmtPhone, uid, cx, smsInfo } from '../../lib/util';
import { CHANNEL_LABEL, MESSAGE_STATUS } from '../../lib/constants';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

const FOLDERS = [['needs', 'Needs reply', MessageCircle], ['all', 'All conversations', InboxIcon], ['unassigned', 'Unassigned', User], ['mine', 'Assigned to me', UserCheck], ['open', 'Open', CircleDot], ['closed', 'Closed', CheckCircle2]];
const CHS = [['email', 'Email', Mail], ['sms', 'SMS', MessageSquare], ['whatsapp', 'WhatsApp', MessageCircle]];

export default function Inbox() {
  useTitle('Inbox');
  const { id } = useParams();
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const can = usePerm();
  const [folder, setFolder] = useState('needs');
  const [chan, setChan] = useState('');
  const [assignee, setAssignee] = useState('');
  const [q, setQ] = useState('');
  const [simOpen, setSimOpen] = useState(false);
  const contactById = useMemo(() => Object.fromEntries(o.contacts.map((c) => [c.id, c])), [o.contacts]);
  const lastMsg = useMemo(() => { const m = {}; o.conversationMessages.forEach((x) => { if (x.direction !== 'note' && (!m[x.conversation_id] || x.created_at > m[x.conversation_id].created_at)) m[x.conversation_id] = x; }); return m; }, [o.conversationMessages]);
  const meId = o.user.id;
  const visible = o.conversations.filter((cv) => can('inbox.all') || cv.assigned_to === meId || !cv.assigned_to);
  const filtered = visible.filter((cv) => {
    if (folder === 'needs' && !(cv.status === 'open' && lastMsg[cv.id]?.direction === 'in')) return false;
    if (folder === 'unassigned' && cv.assigned_to) return false;
    if (folder === 'mine' && cv.assigned_to !== meId) return false;
    if (folder === 'open' && cv.status !== 'open') return false;
    if (folder === 'closed' && cv.status !== 'closed') return false;
    if (chan && cv.channel !== chan) return false;
    if (assignee && (assignee === 'none' ? cv.assigned_to : cv.assigned_to !== assignee)) return false;
    if (q) { const s = q.toLowerCase(); const ct = contactById[cv.contact_id]; if (!(fullName(ct).toLowerCase().includes(s) || o.conversationMessages.some((m) => m.conversation_id === cv.id && m.content.toLowerCase().includes(s)))) return false; }
    return true;
  }).sort((a, b) => b.last_message_at - a.last_message_at);
  const count = (f) => visible.filter((cv) => (f === 'needs' ? cv.status === 'open' && lastMsg[cv.id]?.direction === 'in' : f === 'unassigned' ? !cv.assigned_to : f === 'mine' ? cv.assigned_to === meId : f === 'open' ? cv.status === 'open' : f === 'closed' ? cv.status === 'closed' : true)).length;
  const conv = o.conversations.find((c) => c.id === id);
  useEffect(() => { if (conv?.unread) run((d) => upd(d.conversations, conv.id, { unread: false })); }, [conv?.id, conv?.unread]); // eslint-disable-line

  return (
    <div className="inbox" data-view={id ? 'thread' : 'list'}>
      <nav className="inbox-filters" aria-label="Inbox folders">
        <div className="nav-group-label">INBOX</div>
        {FOLDERS.map(([k, l, I]) => <button key={k} className={cx('nav-link', folder === k && 'active')} style={{ width: '100%', border: 0, background: folder === k ? undefined : 'none', cursor: 'pointer' }} onClick={() => setFolder(k)}><I /><span>{l}</span><span className="faint xs" style={{ marginLeft: 'auto' }}>{count(k)}</span></button>)}
        <div className="nav-group-label" style={{ marginTop: 16 }}>CHANNELS</div>
        {CHS.map(([k, l, I]) => <button key={k} className={cx('nav-link', chan === k && 'active')} style={{ width: '100%', border: 0, background: chan === k ? undefined : 'none', cursor: 'pointer' }} onClick={() => setChan(chan === k ? '' : k)}><I /><span>{l}</span><span className="faint xs" style={{ marginLeft: 'auto' }}>{visible.filter((c) => c.channel === k).length}</span></button>)}
        <div style={{ padding: '16px 6px 0' }} className="desktop-only"><button className="btn btn-sm btn-block" onClick={() => setSimOpen(true)}><FlaskConical />Simulate incoming</button></div>
      </nav>

      <div className="conv-list">
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }} className="stack" >
          <div className="between"><h1 style={{ fontSize: '1.1rem' }}>Inbox</h1><button className="btn btn-ghost btn-sm mobile-only" onClick={() => setSimOpen(true)}><FlaskConical />Simulate</button></div>
          <div className="input-icon"><Search /><input className="input input-sm" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" /></div>
          <select className="select input-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by assignee"><option value="">Any assignee</option><option value="none">Unassigned</option>{o.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user?.name}</option>)}</select>
        </div>
        {filtered.length === 0 && <Empty icon={InboxIcon} title={folder === 'needs' && !q && !chan ? 'You’re all caught up' : 'No conversations'}>{folder === 'needs' && !q && !chan ? 'Nobody is waiting for a reply right now.' : q || chan || folder !== 'all' ? 'Nothing matches these filters.' : 'Replies to your campaigns and incoming messages appear here.'}</Empty>}
        {filtered.map((cv) => { const ct = contactById[cv.contact_id]; const lm = lastMsg[cv.id]; const as = o.members.find((m) => m.user_id === cv.assigned_to); return (
          <button key={cv.id} className={cx('conv-item', cv.id === id && 'active', cv.unread && 'unread')} onClick={() => nav(`/app/inbox/${cv.id}`)}>
            <div style={{ position: 'relative' }}><Avatar name={fullName(ct)} /><span style={{ position: 'absolute', right: -4, bottom: -4 }}><ChannelIcon channel={cv.channel} size={18} /></span></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="between"><span className="conv-name truncate small">{fullName(ct)}</span><span className="faint xs nowrap">{relTime(cv.last_message_at)}</span></div>
              <div className={cx('xs truncate', cv.unread ? '' : 'muted')} style={{ marginTop: 2 }}>{lm?.direction === 'out' ? 'You: ' : ''}{lm?.content}</div>
              <div className="row" style={{ marginTop: 6, gap: 6 }}>{cv.status === 'closed' && <Badge>Closed</Badge>}{lm?.direction === 'in' && cv.status === 'open' && <span className="badge badge-warn" style={{ height: 20 }}>Needs reply</span>}<span className="faint xs truncate">{as ? `→ ${as.user?.name}` : 'Unassigned'}</span></div>
            </div>
            {cv.unread && <span className="unread-dot" style={{ marginTop: 6 }} aria-label="Unread" />}
          </button>); })}
      </div>

      <section className="thread" aria-label="Conversation">{conv ? <Thread conv={conv} contact={contactById[conv.contact_id]} /> : <Empty icon={InboxIcon} title="Select a conversation">Choose a conversation to read and reply.</Empty>}</section>
      <aside className="inbox-contact">{conv && contactById[conv.contact_id] && <ContactPanel contact={contactById[conv.contact_id]} conv={conv} />}</aside>
      {simOpen && <SimulateModal onClose={() => setSimOpen(false)} />}
    </div>
  );
}

function Thread({ conv, contact }) {
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const [mode, setMode] = useState('reply');
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const msgs = o.conversationMessages.filter((m) => m.conversation_id === conv.id).sort((a, b) => a.created_at - b.created_at);
  const msgById = Object.fromEntries(o.messages.map((m) => [m.id, m]));
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, conv.id]);
  const elig = contact ? replyEligibility(getState(), contact, conv.channel) : { ok: false, reason: 'Contact no longer exists.' };
  const lastIn = [...msgs].reverse().find((m) => m.direction === 'in');
  const waWindow = conv.channel === 'whatsapp' && (!lastIn || Date.now() - lastIn.created_at > 24 * 3600000);
  const submit = (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    if (mode === 'note') {
      run((d, ctx) => { d.conversationMessages.push({ id: uid('cm'), organisation_id: ctx.orgId, conversation_id: conv.id, direction: 'note', content: text.trim(), channel: conv.channel, user_id: ctx.userId, created_at: ctx.now }); logActivity(d, ctx, { event_type: 'conversation.note', entity_type: 'conversation', entity_id: conv.id, contact_id: conv.contact_id, summary: `Internal note added to conversation with ${fullName(contact)}` }); }, { success: 'Internal note added.' });
    } else {
      const r = run((d, ctx) => sendReply(d, ctx, conv.id, text.trim()), { success: `Simulated ${CHANNEL_LABEL[conv.channel]} reply queued.` });
      if (!r) return;
    }
    setText('');
  };
  const assign = (uidv) => run((d, ctx) => { upd(d.conversations, conv.id, { assigned_to: uidv }); logActivity(d, ctx, { event_type: 'conversation.assigned', entity_type: 'conversation', entity_id: conv.id, contact_id: conv.contact_id, summary: `Conversation with ${fullName(contact)} ${uidv ? `assigned to ${o.members.find((m) => m.user_id === uidv)?.user?.name}` : 'unassigned'}` }); }, { success: uidv ? 'Conversation assigned.' : 'Conversation unassigned.' });
  const setStatus = (status) => run((d, ctx) => { upd(d.conversations, conv.id, { status, unread: false }); logActivity(d, ctx, { event_type: `conversation.${status}`, entity_type: 'conversation', entity_id: conv.id, contact_id: conv.contact_id, summary: `Conversation with ${fullName(contact)} ${status === 'closed' ? 'closed' : 'reopened'}` }); }, { success: status === 'closed' ? 'Conversation closed.' : 'Conversation reopened.' });
  const assigned = o.members.find((m) => m.user_id === conv.assigned_to);
  return (
    <>
      <div className="between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', gap: 8, flexWrap: 'wrap' }}>
        <div className="row" style={{ minWidth: 0 }}>
          <button className="btn btn-ghost btn-icon btn-sm mobile-only" onClick={() => nav('/app/inbox')} aria-label="Back to list"><ArrowLeft /></button>
          <ChannelIcon channel={conv.channel} />
          <div style={{ minWidth: 0 }}><Link to={`/app/contacts/${contact?.id}`} className="strong truncate" style={{ display: 'block' }}>{fullName(contact)}</Link><span className="faint xs">{CHANNEL_LABEL[conv.channel]} · {conv.channel === 'email' ? contact?.email : fmtPhone(contact?.phone)}</span></div>
        </div>
        <div className="row">
          <Menu trigger={({ toggle }) => <button className="btn btn-sm" onClick={toggle}><UserCheck />{assigned ? assigned.user?.name.split(' ')[0] : 'Assign'}</button>}>
            <div className="menu-label">Assign to</div>
            {o.members.map((m) => <MenuItem key={m.user_id} icon={m.user_id === conv.assigned_to ? CheckCircle2 : User} onClick={() => assign(m.user_id)}>{m.user?.name}{m.user_id === o.user.id ? ' (you)' : ''}</MenuItem>)}
            {conv.assigned_to && <><div className="menu-sep" /><MenuItem onClick={() => assign(null)}>Unassign</MenuItem></>}
          </Menu>
          {conv.status === 'open' ? <button className="btn btn-sm" onClick={() => setStatus('closed')}><CheckCircle2 />Close</button> : <button className="btn btn-sm" onClick={() => setStatus('open')}><RotateCcw />Reopen</button>}
        </div>
      </div>
      <div className="thread-body">
        {msgs.map((m) => {
          if (m.direction === 'note') return <div key={m.id} className="bubble note"><div className="row xs strong warn" style={{ marginBottom: 4 }}><StickyNote size={13} />Internal note · {o.members.find((x) => x.user_id === m.user_id)?.user?.name || 'Team'}</div>{m.content}<div className="bubble-meta">{fmtDateTime(m.created_at, o.org.timezone)} · not visible to the contact</div></div>;
          const out = m.direction === 'out';
          const linked = m.message_id ? msgById[m.message_id] : null;
          const camp = m.campaign_id ? o.campaigns.find((c) => c.id === m.campaign_id) : linked?.campaign_id ? o.campaigns.find((c) => c.id === linked.campaign_id) : null;
          return (
            <div key={m.id} className={cx('bubble-wrap', out && 'out')}>
              {camp && <Link to={`/app/campaigns/${camp.id}`} className="faint xs row" style={{ gap: 4, marginBottom: 4 }}><ExternalLink size={11} />Campaign: {camp.name}</Link>}
              {m.auto && <span className="faint xs row" style={{ gap: 4, marginBottom: 4 }}><Bot size={11} />Automatic keyword response</span>}
              <div className={cx('bubble', out ? 'out' : 'in')}>{m.subject && <div className="strong small" style={{ marginBottom: 4 }}>{m.subject}</div>}{m.content}</div>
              <div className="bubble-meta">{fmtDateTime(m.created_at, o.org.timezone)}{out && m.user_id && ` · ${o.members.find((x) => x.user_id === m.user_id)?.user?.name}`}{out && linked && <> · <StatusBadge map={MESSAGE_STATUS} status={linked.status} /></>}{(m.simulated || linked?.simulated) && <span title="Simulated in demo mode">· simulated</span>}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="between" style={{ marginBottom: 8 }}>
          <Segmented value={mode} onChange={setMode} options={[['reply', `Reply via ${CHANNEL_LABEL[conv.channel]}`], ['note', 'Internal note']]} label="Composer mode" />
          {mode === 'reply' && conv.channel === 'sms' && <span className="faint xs">{smsInfo(text).len} chars · {smsInfo(text).segments} seg</span>}
        </div>
        {mode === 'reply' && !elig.ok && <div style={{ marginBottom: 8 }}><Callout tone="err">{elig.reason} Replies are blocked.</Callout></div>}
        {mode === 'reply' && elig.ok && waWindow && <div style={{ marginBottom: 8 }}><Callout tone="warn">More than 24 hours since the contact’s last WhatsApp message. In production an approved template would be required.</Callout></div>}
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'note' ? 'Write an internal note — only your team sees this' : `Write a ${CHANNEL_LABEL[conv.channel]} reply…`} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); }} aria-label="Message" style={mode === 'note' ? { borderColor: 'rgba(251,191,36,.4)' } : undefined} />
        <div className="between" style={{ marginTop: 8 }}><span className="faint xs"><Info size={11} style={{ verticalAlign: -1 }} /> Replies are simulated — nothing is delivered. ⌘/Ctrl + Enter to send.</span><button className="btn btn-primary btn-sm" disabled={!text.trim() || (mode === 'reply' && !elig.ok)}>{mode === 'note' ? <><StickyNote />Add note</> : <><Send />Send reply</>}</button></div>
      </form>
    </>
  );
}

function ContactPanel({ contact, conv }) {
  const o = useOrg();
  const s = getState();
  const recent = o.messages.filter((m) => m.contact_id === contact.id && m.campaign_id).sort((a, b) => b.created_at - a.created_at).slice(0, 4);
  const notes = o.notes.filter((n) => n.contact_id === contact.id).slice(-2);
  return (
    <div style={{ padding: 16 }} className="stack">
      <div className="row-3"><Avatar name={fullName(contact)} size="lg" /><div style={{ minWidth: 0 }}><Link className="strong" to={`/app/contacts/${contact.id}`}>{fullName(contact)}</Link><div className="faint xs">{contact.custom_fields?.building} {contact.custom_fields?.unit && `· ${contact.custom_fields.unit}`}</div></div></div>
      <dl className="kv" style={{ gridTemplateColumns: '70px 1fr', fontSize: '0.8rem' }}><dt>Email</dt><dd>{contact.email || '—'}</dd><dt>Phone</dt><dd>{fmtPhone(contact.phone) || '—'}</dd>{contact.company && <><dt>Company</dt><dd>{contact.company}</dd></>}</dl>
      <div><div className="label" style={{ marginBottom: 6 }}>Consent</div><div className="stack" style={{ gap: 6 }}>{['email', 'sms', 'whatsapp'].map((ch) => <div key={ch} className="between xs"><span className="row" style={{ gap: 6 }}><ChannelIcon channel={ch} size={20} />{CHANNEL_LABEL[ch]}</span><ConsentBadge status={getConsent(s, contact.id, ch)?.status} /></div>)}</div></div>
      {contact.tag_ids.length > 0 && <div><div className="label" style={{ marginBottom: 6 }}>Tags</div><div className="row wrap" style={{ gap: 4 }}>{contact.tag_ids.map((t) => <span key={t} className="tag">{o.tags.find((x) => x.id === t)?.name}</span>)}</div></div>}
      {recent.length > 0 && <div><div className="label" style={{ marginBottom: 6 }}>Recent campaigns</div><div className="stack" style={{ gap: 6 }}>{recent.map((m) => <Link key={m.id} to={`/app/campaigns/${m.campaign_id}`} className="between xs"><span className="truncate">{o.campaigns.find((c) => c.id === m.campaign_id)?.name}</span><StatusBadge map={MESSAGE_STATUS} status={m.status} /></Link>)}</div></div>}
      {notes.length > 0 && <div><div className="label" style={{ marginBottom: 6 }}>Contact notes</div>{notes.map((n) => <p key={n.id} className="muted xs" style={{ marginBottom: 6 }}>{n.body}</p>)}</div>}
      <Link to={`/app/contacts/${contact.id}`} className="btn btn-sm">Open full profile</Link>
    </div>
  );
}

function SimulateModal({ onClose }) {
  const o = useOrg();
  const run = useAction();
  const nav = useNavigate();
  const [cid, setCid] = useState(o.contacts.find((c) => c.phone)?.id || '');
  const contact = o.contacts.find((c) => c.id === cid);
  const [channel, setChannel] = useState('sms');
  const [text, setText] = useState('Thanks. Will the water be restored by 3 PM?');
  const ok = contact && (channel === 'email' ? contact.email : contact.phone);
  return (
    <Modal title="Simulate an incoming message" description="Creates an inbound message as if the contact replied. Nothing is received from a real network." onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!ok || !text.trim()} onClick={() => { const r = run((d, ctx) => receiveMessage(d, ctx, { contactId: cid, channel, content: text.trim() }), { success: 'Simulated message received.' }); onClose(); r?.conversation && nav(`/app/inbox/${r.conversation.id}`); }}>Simulate</button></>}>
      <div className="stack">
        <Field label="From contact"><select className="select" value={cid} onChange={(e) => setCid(e.target.value)}>{o.contacts.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}</select></Field>
        <Field label="Channel" error={contact && !ok ? `This contact has no ${channel === 'email' ? 'email' : 'phone number'}.` : null}><Segmented value={channel} onChange={setChannel} options={[['sms', 'SMS'], ['email', 'Email'], ['whatsapp', 'WhatsApp']]} label="Channel" /></Field>
        <Field label="Message"><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="row wrap" style={{ gap: 6 }}>{['STOP', 'YES', 'START', 'Can someone call me?'].map((t) => <button key={t} type="button" className="btn btn-sm" onClick={() => setText(t)}>{t}</button>)}</div>
        <p className="faint xs">“STOP” by SMS revokes SMS consent and sends an automatic confirmation. Matching active automations (e.g. “Incoming reply received”) will run.</p>
      </div>
    </Modal>
  );
}
