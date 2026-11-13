import { useMemo, useState, Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2, Send, MessageSquareReply, Mail, MessageSquare, MessageCircle, Workflow, StickyNote, ShieldCheck, ShieldOff, Tag, ListChecks, UserPen, Ban, FlaskConical, MousePointerClick, Inbox as InboxIcon, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useOrg, getState } from '../../data/store';
import { PageHead, Avatar, Badge, Empty, Field, Modal, Menu, MenuItem, ChannelIcon, Callout, useConfirm, StatusBadge } from '../../components/ui';
import { ContactForm, ConsentBadge, ContactStatus, TagPicker, resolveTags } from './shared';
import { fullName, fmtDateTime, fmtPhone, relTime, fmtDate } from '../../lib/util';
import { CHANNEL_LABEL, CONSENT_PURPOSE, CONSENT_SOURCES, CONSENT_STATUS, MESSAGE_STATUS } from '../../lib/constants';
import { getConsent, isSuppressed, setConsent, addSuppression, removeSuppression, rulesFor } from '../../services/consent';
import { addNote, contactLists, deleteContacts, addToList, removeFromList, addTag, removeTag } from '../../services/contacts';
import { receiveMessage, simulateUnsubscribe, simulateClick } from '../../services/messaging';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

const CH_ICON = { email: Mail, sms: MessageSquare, whatsapp: MessageCircle };

export default function ContactProfile() {
  const { id } = useParams();
  const o = useOrg();
  const nav = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const c = o.contacts.find((x) => x.id === id);
  useTitle(c ? fullName(c) : 'Contact');
  const [edit, setEdit] = useState(false);
  const [consentEdit, setConsentEdit] = useState(null);
  const [note, setNote] = useState('');
  const [sim, setSim] = useState(null);
  const [tlFilter, setTlFilter] = useState('all');

  const timeline = useMemo(() => {
    if (!c) return [];
    const items = [];
    const camp = Object.fromEntries(o.campaigns.map((x) => [x.id, x]));
    const auto = Object.fromEntries(o.automations.map((x) => [x.id, x]));
    o.messages.filter((m) => m.contact_id === c.id).forEach((m) => {
      const src = m.campaign_id ? `Campaign “${camp[m.campaign_id]?.name}”` : m.automation_id ? `Automation “${auto[m.automation_id]?.name}”` : m.role === 'reply' ? 'Inbox reply' : m.role === 'system' ? 'Automatic keyword response' : 'Message';
      const t = m.status === 'skipped' ? m.created_at : m.attempted_at || m.send_at || m.created_at;
      items.push({ at: t, kind: m.status === 'failed' ? 'failed' : 'message', icon: CH_ICON[m.channel], tone: m.status === 'failed' ? 'err' : m.status === 'skipped' ? 'warn' : 'ok', title: <>{CHANNEL_LABEL[m.channel]} {m.status === 'skipped' ? 'not sent' : m.status === 'failed' ? 'failed' : 'message'} — {m.campaign_id ? <Link className="accent" to={`/app/campaigns/${m.campaign_id}`}>{src}</Link> : src}</>, body: m.status === 'skipped' ? m.failure_reason : m.status === 'failed' ? m.failure_reason : (m.subject ? m.subject + ' — ' : '') + (m.content || '').slice(0, 140), badge: <StatusBadge map={MESSAGE_STATUS} status={m.status} />, extra: [m.role === 'fallback' && 'Fallback', m.replied_at && 'Replied', m.acknowledged_at && 'Acknowledged', m.clicked_at && 'Clicked link'].filter(Boolean) });
    });
    const convIds = new Set(o.conversations.filter((x) => x.contact_id === c.id).map((x) => x.id));
    o.conversationMessages.filter((m) => convIds.has(m.conversation_id) && m.direction === 'in').forEach((m) => items.push({ at: m.created_at, kind: 'reply', icon: MessageSquareReply, tone: 'info', title: <>Incoming {CHANNEL_LABEL[m.channel]} reply — <Link className="accent" to={`/app/inbox/${m.conversation_id}`}>open conversation</Link></>, body: m.content }));
    o.executions.filter((e) => e.contact_id === c.id && !e.test).forEach((e) => items.push({ at: e.started_at, kind: 'automation', icon: Workflow, tone: e.status === 'failed' ? 'err' : 'neutral', title: <>Automation <Link className="accent" to={`/app/automations/executions/${e.id}`}>“{auto[e.automation_id]?.name}”</Link> {e.status === 'waiting' ? 'waiting' : e.status}</>, body: e.log.filter((l) => l.kind === 'action').map((l) => l.detail).join(' · ') }));
    o.activity.filter((a) => a.contact_id === c.id && !['reply.received', 'automation.executed', 'reply.sent'].includes(a.event_type)).forEach((a) => items.push({ at: a.created_at, kind: a.event_type.startsWith('consent') || a.event_type.startsWith('suppression') ? 'consent' : 'change', icon: a.event_type.startsWith('consent') || a.event_type.startsWith('suppression') ? ShieldCheck : a.event_type.includes('tag') ? Tag : a.event_type.startsWith('list') ? ListChecks : UserPen, tone: a.event_type === 'consent.revoked' ? 'err' : 'neutral', title: a.summary, body: a.details?.changes ? a.details.changes.map((ch) => `${ch.field}: “${ch.from || '—'}” → “${ch.to || '—'}”`).join(', ') : a.details?.source ? `Source: ${a.details.source}${a.details.purpose ? ' · ' + CONSENT_PURPOSE[a.details.purpose] : ''}` : null, who: a.user_id ? o.members.find((m) => m.user_id === a.user_id)?.user?.name : 'System' }));
    o.notes.filter((n) => n.contact_id === c.id).forEach((n) => items.push({ at: n.created_at, kind: 'note', icon: StickyNote, tone: 'warn', title: 'Note', body: n.body, who: n.user_id ? o.members.find((m) => m.user_id === n.user_id)?.user?.name || 'Team member' : 'Automation' }));
    items.push({ at: c.created_at, kind: 'change', icon: UserPen, title: `Contact created (${c.source || 'Manual'})` });
    return items.sort((a, b) => b.at - a.at);
  }, [c, o]);

  if (!c) return <Empty title="Contact not found" action={<Link className="btn" to="/app/contacts">Back to contacts</Link>}>It may have been deleted.</Empty>;

  const s = getState();
  const lists = contactLists(s, c, o.lists);
  const suppressed = isSuppressed(s, c);
  const sup = o.suppressions.find((x) => x.contact_id === c.id);
  const convs = o.conversations.filter((x) => x.contact_id === c.id);
  const lastMsg = o.messages.filter((m) => m.contact_id === c.id && m.status !== 'skipped').sort((a, b) => b.created_at - a.created_at);
  const counts = { messages: lastMsg.length, delivered: lastMsg.filter((m) => ['delivered', 'read'].includes(m.status)).length, failed: lastMsg.filter((m) => m.status === 'failed').length, replies: timeline.filter((t) => t.kind === 'reply').length };
  const shown = tlFilter === 'all' ? timeline : timeline.filter((t) => (tlFilter === 'messages' ? ['message', 'failed'].includes(t.kind) : t.kind === tlFilter));

  return (
    <>
      <PageHead crumbs={[{ label: 'Contacts', to: '/app/contacts' }, { label: fullName(c) }]} title={<span className="row-3"><Avatar name={fullName(c)} size="lg" /><span>{fullName(c)}<span className="row" style={{ marginTop: 6, gap: 6 }}><ContactStatus status={c.status} />{suppressed && <Badge tone="err">Suppressed</Badge>}{c.custom_fields?.unit && <span className="faint small" style={{ fontWeight: 400 }}>{c.custom_fields.building} · Unit {c.custom_fields.unit}</span>}</span></span></span>}
        actions={<>
          <Menu trigger={({ toggle }) => <button className="btn" onClick={toggle}><FlaskConical />Simulate event</button>}>
            <div className="menu-label">Simulated inbound events</div>
            {c.phone && <MenuItem icon={MessageSquare} onClick={() => setSim({ channel: 'sms' })}>Incoming SMS reply…</MenuItem>}
            {c.phone && <MenuItem icon={MessageCircle} onClick={() => setSim({ channel: 'whatsapp' })}>Incoming WhatsApp message…</MenuItem>}
            {c.email && <MenuItem icon={Mail} onClick={() => setSim({ channel: 'email' })}>Incoming email…</MenuItem>}
            {c.phone && <MenuItem icon={Ban} onClick={() => run((d, ctx) => receiveMessage(d, ctx, { contactId: c.id, channel: 'sms', content: 'STOP' }), { success: 'Simulated “STOP” received — SMS consent revoked.' })}>Reply “STOP” by SMS</MenuItem>}
            {c.email && <MenuItem icon={ShieldOff} onClick={() => run((d, ctx) => simulateUnsubscribe(d, ctx, c.id), { success: 'Simulated email unsubscribe recorded.' })}>Click email unsubscribe link</MenuItem>}
            {lastMsg.find((m) => m.channel === 'email' && !m.clicked_at) && <MenuItem icon={MousePointerClick} onClick={() => run((d, ctx) => simulateClick(d, ctx, lastMsg.find((m) => m.channel === 'email' && !m.clicked_at).id), { success: 'Simulated link click recorded.' })}>Click a link in last email</MenuItem>}
          </Menu>
          <button className="btn" onClick={() => nav('/app/campaigns/new', { state: { contactIds: [c.id] } })} disabled={!can('campaigns.send')}><Send />Message</button>
          <button className="btn" onClick={() => setEdit(true)} disabled={!can('contacts.manage')}><Pencil />Edit</button>
          <button className="btn btn-danger btn-icon" aria-label="Delete contact" disabled={!can('contacts.delete')} onClick={async () => { if (await confirm({ title: `Delete ${fullName(c)}?`, message: 'This permanently removes the contact, their consent records, list memberships and notes.', confirmLabel: 'Delete', danger: true })) { run((d, ctx) => deleteContacts(d, ctx, [c.id]), { success: 'Contact deleted.' }); nav('/app/contacts'); } }}><Trash2 /></button>
        </>} />

      <div className="grid-4" style={{ marginBottom: 16 }}>
        {[['Messages attempted', counts.messages], ['Delivered', counts.delivered], ['Failed', counts.failed], ['Replies', counts.replies]].map(([l, v]) => <div key={l} className="card stat"><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 16, alignItems: 'start' }} className="profile-grid">
        <div className="stack">
          <div className="card"><div className="card-head"><h3>Contact information</h3></div><div className="card-body">
            <dl className="kv">
              <dt>First name</dt><dd>{c.first_name || '—'}</dd><dt>Last name</dt><dd>{c.last_name || '—'}</dd>
              <dt>Email</dt><dd>{c.email || <span className="warn">Missing</span>}</dd><dt>Phone</dt><dd>{fmtPhone(c.phone) || <span className="warn">Missing</span>}</dd>
              <dt>Company</dt><dd>{c.company || '—'}</dd><dt>Job title</dt><dd>{c.job_title || '—'}</dd>
              {Object.entries(c.custom_fields || {}).filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt className="row" style={{ gap: 4 }}>{k.replace(/_/g, ' ')}<span className="tag" style={{ height: 16, fontSize: '0.62rem' }}>custom</span></dt><dd>{v}</dd></Fragment>)}
              <dt>Source</dt><dd>{c.source || 'Manual'}</dd><dt>Created</dt><dd>{fmtDateTime(c.created_at)}</dd><dt>Updated</dt><dd>{fmtDateTime(c.updated_at)}</dd>
            </dl>
          </div></div>

          <div className="card"><div className="card-head"><h3>Communication preferences</h3><span className="faint small">Preferred: {CHANNEL_LABEL[c.preferred_channel] || 'None'}</span></div><div className="card-body stack">
            {['email', 'sms', 'whatsapp'].map((ch) => {
              const cs = getConsent(s, c.id, ch);
              const has = ch === 'email' ? c.email : c.phone;
              return (
                <div key={ch} className="between" style={{ alignItems: 'flex-start' }}>
                  <div className="row-3" style={{ alignItems: 'flex-start' }}><ChannelIcon channel={ch} off={!has} /><div><div className="strong small">{CHANNEL_LABEL[ch]}</div><div className="faint xs">{!has ? `No ${ch === 'email' ? 'email address' : 'phone number'}` : cs ? `${CONSENT_PURPOSE[cs.purpose] || ''} · ${cs.status === 'revoked' ? `Opted out ${fmtDate(cs.revoked_at)} via ${cs.revoke_source || cs.source}` : `${cs.source} · ${fmtDate(cs.consented_at || cs.updated_at)}`}` : 'No consent recorded'}</div></div></div>
                  <div className="row"><ConsentBadge status={cs?.status} />{has && can('contacts.manage') && <button className="btn btn-ghost btn-sm" onClick={() => setConsentEdit(ch)}>Change</button>}</div>
                </div>
              );
            })}
            <div className="divider" style={{ margin: '4px 0' }} />
            <div className="between">
              <div><div className="strong small">Global suppression</div><div className="faint xs">{suppressed ? `${sup?.reason || 'Suppressed'} · ${sup?.source || ''} · ${fmtDate(sup?.created_at)}` : 'Not suppressed. Suppressed contacts receive nothing on any channel.'}</div></div>
              {can('contacts.manage') && (suppressed
                ? <button className="btn btn-sm" onClick={() => sup && run((d, ctx) => removeSuppression(d, ctx, sup.id), { success: 'Removed from suppression list.' })}>Remove</button>
                : <button className="btn btn-sm btn-danger" onClick={async () => { if (await confirm({ title: 'Suppress this contact?', message: 'They will be excluded from every campaign and automation on all channels until removed from the suppression list.', confirmLabel: 'Suppress', danger: true })) run((d, ctx) => addSuppression(d, ctx, c, 'Manually suppressed', 'Staff entry'), { success: 'Contact suppressed.' }); }}>Suppress</button>)}
            </div>
          </div></div>

          <div className="card"><div className="card-head"><h3>Tags</h3></div><div className="card-body">
            <TagPicker value={c.tag_ids} onChange={(v) => can('contacts.manage') && run((d, ctx) => { const next = resolveTags(d, ctx, v); next.filter((t) => !c.tag_ids.includes(t)).forEach((t) => addTag(d, ctx, c.id, t)); c.tag_ids.filter((t) => !next.includes(t)).forEach((t) => removeTag(d, ctx, c.id, t)); })} />
          </div></div>

          <div className="card"><div className="card-head"><h3>Lists & segments</h3>
            {can('contacts.manage') && <select className="select input-sm" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && run((d, ctx) => addToList(d, ctx, e.target.value, [c.id]), { success: 'Added to list.' })} aria-label="Add to list"><option value="">Add to list…</option>{o.lists.filter((l) => l.type === 'static' && !lists.some((x) => x.id === l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
          </div><div className="card-body stack" style={{ gap: 8 }}>
            {lists.length === 0 && <span className="faint small">Not in any lists or segments.</span>}
            {lists.map((l) => <div key={l.id} className="between small"><Link to={`/app/lists/${l.id}`} className="row" style={{ gap: 8 }}>{l.name}<Badge tone={l.type === 'segment' ? 'accent' : 'neutral'}>{l.type === 'segment' ? 'Segment' : 'List'}</Badge></Link>{l.type === 'static' && can('contacts.manage') && <button className="btn btn-ghost btn-sm" onClick={() => run((d, ctx) => removeFromList(d, ctx, l.id, [c.id]), { success: 'Removed from list.' })}>Remove</button>}</div>)}
          </div></div>

          {convs.length > 0 && <div className="card"><div className="card-head"><h3>Conversations</h3></div><div className="card-body stack" style={{ gap: 8 }}>
            {convs.map((cv) => <Link key={cv.id} to={`/app/inbox/${cv.id}`} className="between small"><span className="row"><ChannelIcon channel={cv.channel} />{CHANNEL_LABEL[cv.channel]} conversation</span><span className="row"><Badge tone={cv.status === 'open' ? 'accent' : 'neutral'}>{cv.status}</Badge><span className="faint">{relTime(cv.last_message_at)}</span></span></Link>)}
          </div></div>}
        </div>

        <div className="card">
          <div className="card-head"><h3>Activity timeline</h3>
            <select className="select input-sm" style={{ width: 'auto' }} value={tlFilter} onChange={(e) => setTlFilter(e.target.value)} aria-label="Filter timeline"><option value="all">All activity</option><option value="messages">Messages</option><option value="failed">Failed messages</option><option value="reply">Replies</option><option value="automation">Automations</option><option value="consent">Consent</option><option value="change">Changes</option><option value="note">Notes</option></select>
          </div>
          <div className="card-body">
            <form className="stack" style={{ gap: 8, marginBottom: 20 }} onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; run((d, ctx) => addNote(d, ctx, c.id, note), { success: 'Note added.' }); setNote(''); }}>
              <textarea className="textarea" style={{ minHeight: 64 }} placeholder="Add an internal note about this contact…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="New note" />
              <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-sm btn-primary" disabled={!note.trim()}><StickyNote />Add note</button></div>
            </form>
            {shown.length === 0 ? <Empty icon={Clock} title="Nothing here yet">No activity matches this filter.</Empty> : (
              <div className="timeline">
                {shown.map((t, i) => { const I = t.icon || InboxIcon; return (
                  <div key={i} className="tl-item">
                    <span className="tl-icon" style={t.tone === 'err' ? { color: 'var(--err)' } : t.tone === 'ok' ? { color: 'var(--ok)' } : t.tone === 'warn' ? { color: 'var(--warn)' } : undefined}><I /></span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="between" style={{ alignItems: 'flex-start' }}><div className="small strong" style={{ fontWeight: 500 }}>{t.title}</div><span className="faint xs nowrap" title={fmtDateTime(t.at)}>{relTime(t.at)}</span></div>
                      {t.body && <div className="muted small" style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{t.body}</div>}
                      <div className="row wrap" style={{ marginTop: 4, gap: 6 }}>{t.badge}{t.extra?.map((x) => <Badge key={x} tone="info">{x}</Badge>)}{t.who && <span className="faint xs">by {t.who}</span>}</div>
                    </div>
                  </div>); })}
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 1000px){ .profile-grid{ grid-template-columns: 1fr !important; } }`}</style>

      {edit && <ContactForm contact={c} onClose={() => setEdit(false)} />}
      {consentEdit && <ConsentModal contact={c} channel={consentEdit} onClose={() => setConsentEdit(null)} />}
      {sim && <SimInbound contact={c} channel={sim.channel} onClose={() => setSim(null)} />}
    </>
  );
}

function ConsentModal({ contact, channel, onClose }) {
  const run = useAction();
  const o = useOrg();
  const cur = getConsent(getState(), contact.id, channel);
  const [f, setF] = useState({ status: cur?.status || 'granted', purpose: cur?.purpose || 'operational', source: CONSENT_SOURCES.includes(cur?.source) ? cur.source : 'Staff entry', note: '' });
  const rules = rulesFor(o.org);
  return (
    <Modal title={`${CHANNEL_LABEL[channel]} consent for ${fullName(contact)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { run((d, ctx) => setConsent(d, ctx, contact.id, channel, f), { success: 'Consent updated and logged.' }); onClose(); }}>Save consent</button></>}>
      <div className="stack">
        <Field label="Status"><select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(CONSENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Purpose" hint="Marketing campaigns require marketing consent. Operational updates follow your workspace rules."><select className="select" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>{Object.entries(CONSENT_PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Source"><select className="select" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{CONSENT_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Note (optional)"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Confirmed by phone with resident" /></Field>
        {channel === 'whatsapp' && <Callout>WhatsApp requires an explicit opt-in before any business-initiated message.</Callout>}
        {channel === 'sms' && rules.operationalSmsRequiresOptIn && <Callout>Your workspace requires an SMS opt-in even for operational messages.</Callout>}
        <p className="faint xs">The change is recorded with a timestamp and your name in the activity log.</p>
      </div>
    </Modal>
  );
}

function SimInbound({ contact, channel, onClose }) {
  const run = useAction();
  const nav = useNavigate();
  const [text, setText] = useState(channel === 'sms' ? 'Thanks. Will the water be restored by 3 PM?' : 'Hi, I have a question about my unit.');
  return (
    <Modal title={`Simulate incoming ${CHANNEL_LABEL[channel]}`} description={`As if ${fullName(contact)} sent a message. Nothing is received from a real network.`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!text.trim()} onClick={() => { const r = run((d, ctx) => receiveMessage(d, ctx, { contactId: contact.id, channel, content: text.trim() }), { success: 'Simulated message received in the inbox.' }); onClose(); if (r?.conversation) nav(`/app/inbox/${r.conversation.id}`); }}>Simulate message</button></>}>
      <Field label="Message"><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <p className="faint xs" style={{ marginTop: 8 }}>Tip: send “STOP” by SMS to see opt-out handling, or “YES” to acknowledge a campaign that requests it.</p>
    </Modal>
  );
}
