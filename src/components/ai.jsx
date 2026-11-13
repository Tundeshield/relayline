import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Wand2, RefreshCw, ArrowRight, Check, X, Send, ChevronDown, Lightbulb, MessageSquareText, Loader2 } from 'lucide-react';
import { Modal, Drawer, Tabs, Field, Callout, ChannelIcon, Menu, MenuItem, useToast } from './ui';
import { MessagePreview, SmsMeter } from './Composer';
import { generateMessage, rewriteMessage, adaptMessage, askWorkspace, AI_DEMO } from '../services/ai';
import { suggestionsFor } from '../services/ai/assistantEngine';
import { useOrg, getState } from '../data/store';
import { CHANNEL_LABEL } from '../lib/constants';
import { cx } from '../lib/util';

export const AIBadge = ({ label = 'AI' }) => (
  <span className="ai-badge" title={AI_DEMO ? 'Demo AI: runs on this device with built-in rules. No AI provider is connected yet.' : 'AI'}><Sparkles size={12} />{label}{AI_DEMO && <span className="ai-badge-demo">demo</span>}</span>
);
export const AIButton = ({ children, className, ...p }) => <button type="button" className={cx('btn btn-ai', className)} {...p}><Sparkles />{children}</button>;
export const Thinking = ({ label = 'Thinking…' }) => <span className="row muted small"><Loader2 size={15} className="spin" />{label}</span>;

const TONES = [['professional', 'Professional'], ['friendly', 'Friendly'], ['urgent', 'Urgent'], ['apologetic', 'Apologetic']];
const EXAMPLES = [
  'Tell residents of Building A that the water supply will be interrupted tomorrow between 10 AM and 2 PM because of scheduled maintenance. Keep it professional, clear and apologetic.',
  'Remind all residents that rent is due on the 1st and can be paid in the resident portal.',
  'Invite everyone to the community BBQ this Saturday at noon in the courtyard. Keep it friendly.',
];

// ---------- Write with AI ----------
// Workflow: describe → AI drafts → review & edit → accept into the composer. Never sends.
export function WriteWithAI({ channels, current = {}, initialBrief = '', onAccept, onClose, contact, autoGenerate }) {
  const { org } = useOrg();
  const toast = useToast();
  const hasExisting = channels.some((ch) => current[ch]?.body?.trim());
  const [brief, setBrief] = useState(initialBrief);
  const [tone, setTone] = useState('');
  const [busy, setBusy] = useState('');
  const [versions, setVersions] = useState(hasExisting && !initialBrief ? Object.fromEntries(channels.map((ch) => [ch, { subject: current[ch]?.subject || '', body: current[ch]?.body || '' }])) : null);
  const [tab, setTab] = useState(channels[0]);
  const [view, setView] = useState('edit');
  const [notes, setNotes] = useState([]);
  const [lastNote, setLastNote] = useState('');
  const [ideas, setIdeas] = useState(null);
  const ran = useRef(false);

  const gen = async () => {
    if (brief.trim().length < 8) { toast.error('Describe what you want to say in a sentence or two.'); return; }
    setBusy('generate'); setIdeas(null); setLastNote('');
    try {
      const r = await generateMessage(tone && !brief.toLowerCase().includes(tone) ? `${brief} Keep it ${tone}.` : brief, channels);
      if (r.status !== 'ok') { toast.info(r.question); return; }
      setVersions((v) => ({ ...(v || {}), ...r.versions })); setNotes(r.notes || []); setTab(channels[0]);
    } finally { setBusy(''); }
  };
  useEffect(() => { if (autoGenerate && initialBrief && !ran.current) { ran.current = true; gen(); } }, []); // eslint-disable-line

  const v = versions?.[tab] || { subject: '', body: '' };
  const setV = (patch) => setVersions((x) => ({ ...x, [tab]: { ...x[tab], ...patch } }));
  const rewrite = async (op) => {
    if (!v.body?.trim()) return;
    setBusy(op); setIdeas(null);
    try {
      const r = await rewriteMessage(v.body, op, tab, v.subject);
      if (r.options) setIdeas({ op, options: r.options });
      else { setV({ body: r.text }); setLastNote(r.note); }
    } finally { setBusy(''); }
  };
  const adaptOthers = async () => {
    const others = channels.filter((c) => c !== tab);
    setBusy('adapt');
    try { const r = await adaptMessage(tab, v.subject, v.body, others); setVersions((x) => ({ ...x, ...r.versions })); setLastNote(r.note); } finally { setBusy(''); }
  };
  const accept = () => {
    const missing = channels.filter((ch) => !versions?.[ch]?.body?.trim());
    if (missing.length) { toast.error(`Generate or write the ${missing.map((m) => CHANNEL_LABEL[m]).join(' and ')} version first.`); return; }
    onAccept(versions); onClose();
  };
  const placeholders = versions ? channels.filter((ch) => /\[[^\]]+\]/.test(`${versions[ch]?.subject || ''} ${versions[ch]?.body || ''}`)) : [];

  return (
    <Modal size="xl" onClose={onClose} title={<span className="row">Write with AI <AIBadge label="Assistant" /></span>} description="Describe what you want to say. You’ll review and edit the draft before it goes into your campaign — nothing is sent from here."
      footer={<><span className="faint xs" style={{ marginRight: 'auto' }}>{AI_DEMO ? 'Demo AI runs on built-in rules. Always review drafts before sending.' : 'Always review AI drafts before sending.'}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!versions || !!busy} onClick={accept}><Check />Use {channels.length > 1 ? 'these drafts' : 'this draft'}</button></>}>
      <div className="stack">
        <div className="ai-prompt">
          <textarea className="textarea" style={{ minHeight: 84, border: 0, boxShadow: 'none', background: 'transparent' }} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Tell Building A residents the water will be off tomorrow 10 AM–2 PM for maintenance. Professional and apologetic." aria-label="Describe your message" autoFocus={!initialBrief} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) gen(); }} />
          <div className="between wrap" style={{ padding: '0 10px 10px', gap: 8 }}>
            <div className="row wrap" style={{ gap: 6 }}><span className="faint xs">Tone</span>{TONES.map(([k, l]) => <button key={k} type="button" className={cx('chip', tone === k && 'on')} onClick={() => setTone(tone === k ? '' : k)}>{l}</button>)}</div>
            <div className="row" style={{ gap: 6 }}><span className="faint xs">For</span>{channels.map((ch) => <ChannelIcon key={ch} channel={ch} />)}<AIButton className="btn-sm" onClick={gen} disabled={!!busy}>{versions ? 'Regenerate' : 'Generate draft'}</AIButton></div>
          </div>
        </div>
        {!versions && !busy && <div className="stack" style={{ gap: 6 }}><span className="faint xs">Try an example</span>{EXAMPLES.map((e) => <button key={e} type="button" className="example" onClick={() => setBrief(e)}><Lightbulb size={14} />{e}</button>)}</div>}
        {busy === 'generate' && <div className="ai-skeleton"><Thinking label="Drafting channel-specific versions…" /><div className="skeleton" style={{ height: 12, width: '80%' }} /><div className="skeleton" style={{ height: 12, width: '92%' }} /><div className="skeleton" style={{ height: 12, width: '60%' }} /></div>}
        {versions && busy !== 'generate' && (
          <>
            {notes.map((n) => <Callout key={n} tone="warn">{n}</Callout>)}
            {placeholders.length > 0 && <Callout tone="warn">Replace the [bracketed] details before using this draft.</Callout>}
            <div className="between wrap" style={{ gap: 8 }}>
              {channels.length > 1 ? <Tabs value={tab} onChange={(t) => { setTab(t); setIdeas(null); setLastNote(''); }} tabs={channels.map((ch) => ({ value: ch, label: <span className="row" style={{ gap: 6 }}><ChannelIcon channel={ch} />{CHANNEL_LABEL[ch]}</span> }))} /> : <span className="row strong small"><ChannelIcon channel={tab} />{CHANNEL_LABEL[tab]} draft</span>}
              <div className="segmented" role="group" aria-label="View"><button aria-pressed={view === 'edit'} onClick={() => setView('edit')}>Edit</button><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview</button></div>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {[['improve', 'Improve'], ['shorter', 'Shorter'], ['longer', 'More detail'], ['grammar', 'Fix grammar'], ['personalise', 'Personalise']].map(([op, l]) => <button key={op} type="button" className="chip" disabled={!!busy} onClick={() => rewrite(op)}>{busy === op ? <Loader2 size={12} className="spin" /> : <Wand2 size={12} />}{l}</button>)}
              <Menu align="left" trigger={({ toggle }) => <button type="button" className="chip" onClick={toggle} disabled={!!busy}><Wand2 size={12} />Change tone<ChevronDown size={12} /></button>}>
                {[['professional', 'More professional'], ['friendly', 'More friendly'], ['persuasive', 'More persuasive'], ['urgent', 'More urgent']].map(([op, l]) => <MenuItem key={op} onClick={() => rewrite(op)}>{l}</MenuItem>)}
              </Menu>
              {tab === 'email' && <button type="button" className="chip" disabled={!!busy} onClick={() => rewrite('subjects')}><Lightbulb size={12} />Subject ideas</button>}
              <button type="button" className="chip" disabled={!!busy} onClick={() => rewrite('cta')}><Lightbulb size={12} />Call-to-action ideas</button>
              {channels.length > 1 && <button type="button" className="chip" disabled={!!busy} onClick={adaptOthers}>{busy === 'adapt' ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}Adapt to {channels.filter((c) => c !== tab).map((c) => CHANNEL_LABEL[c]).join(' & ')}</button>}
            </div>
            {lastNote && <p className="xs accent row" style={{ gap: 4 }}><Sparkles size={12} />{lastNote}</p>}
            {ideas && (
              <div className="card card-body stack" style={{ gap: 6, background: 'var(--accent-soft)' }}>
                <span className="xs strong">{ideas.op === 'subjects' ? 'Subject line ideas — click to use' : 'Call-to-action ideas — click to add'}</span>
                {ideas.options.map((o) => <button key={o} type="button" className="example" onClick={() => { if (ideas.op === 'subjects') setV({ subject: o }); else setV({ body: tab === 'email' ? v.body.replace(/\n\n(Thank you,[\s\S]*)$/, `\n\n${o}\n\n$1`) : v.body.replace(/( Reply STOP[^]*)?$/, (m) => ` ${o}${m || ''}`) }); setIdeas(null); }}>{o}</button>)}
              </div>
            )}
            {view === 'edit' ? (
              <div className="stack" style={{ gap: 10 }}>
                {tab === 'email' && <Field label="Subject"><input className="input" value={v.subject || ''} onChange={(e) => setV({ subject: e.target.value })} /></Field>}
                <Field label="Message"><textarea className="textarea" style={{ minHeight: tab === 'email' ? 240 : 140 }} value={v.body || ''} onChange={(e) => setV({ body: e.target.value })} aria-label={`${tab} draft`} /></Field>
                {tab === 'sms' && <SmsMeter text={v.body || ''} />}
              </div>
            ) : <MessagePreview channel={tab} subject={v.subject} body={v.body || ''} contact={contact} org={org} />}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------- Ask AI (context-aware workspace assistant) ----------
const AssistantCtx = createContext({ open: () => {} });
export const useAssistant = () => useContext(AssistantCtx);

export function AssistantProvider({ children }) {
  const [state, setState] = useState(null); // { initial }
  const open = useCallback((initial = '') => setState({ initial, key: Date.now() }), []);
  return (
    <AssistantCtx.Provider value={{ open }}>
      {children}
      {state && <AssistantDrawer key={state.key} initial={state.initial} onClose={() => setState(null)} />}
    </AssistantCtx.Provider>
  );
}

function AssistantDrawer({ initial, onClose }) {
  const o = useOrg();
  const loc = useLocation();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const ask = async (question) => {
    const text = question.trim(); if (!text || busy) return;
    setThread((t) => [...t, { role: 'user', text }]); setQ(''); setBusy(true);
    try { const r = await askWorkspace(text, loc.pathname, { ...o, users: getState().users }); setThread((t) => [...t, { role: 'ai', ...r }]); }
    catch (e) { setThread((t) => [...t, { role: 'ai', text: `Something went wrong: ${e.message}` }]); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (initial) ask(initial); }, []); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread.length, busy]);
  const go = (a) => { onClose(); nav(a.to, a.state ? { state: a.state } : undefined); };
  return (
    <Drawer title={<span className="row">Ask AI <AIBadge label="Workspace" /></span>} onClose={onClose} width={460}
      footer={<form className="row" style={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); ask(q); }}><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your contacts, campaigns, automations…" aria-label="Ask AI" autoFocus /><button className="btn btn-primary btn-icon" aria-label="Ask" disabled={!q.trim() || busy}><Send /></button></form>}>
      <div className="stack">
        {!thread.length && <p className="muted small">I answer using only the data in <strong>{o.org.name}</strong>. If something isn’t in your workspace, I’ll say so rather than guess. I never send messages or switch on automations by myself.</p>}
        {thread.map((m, i) => m.role === 'user' ? <div key={i} className="bubble-wrap out"><div className="bubble out">{m.text}</div></div> : (
          <div key={i} className="ai-answer">
            <div className="row xs accent" style={{ gap: 4, marginBottom: 6 }}><Sparkles size={12} />AI</div>
            <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            {m.items?.length > 0 && <div className="stack" style={{ gap: 2, marginTop: 8 }}>{m.items.map((it, j) => <button key={j} className="search-item" onClick={() => go(it)}><span className="grow" style={{ minWidth: 0 }}><span className="small strong" style={{ display: 'block' }}>{it.label}</span>{it.sub && <span className="faint xs truncate" style={{ display: 'block' }}>{it.sub}</span>}</span><ArrowRight size={14} className="faint" /></button>)}</div>}
            {m.actions?.length > 0 && <div className="row wrap" style={{ marginTop: 10 }}>{m.actions.map((a) => <button key={a.label} className="btn btn-sm" onClick={() => go(a)}>{a.label}<ArrowRight /></button>)}</div>}
          </div>
        ))}
        {busy && <Thinking label="Looking through your workspace…" />}
        <div ref={endRef} />
        {!busy && (!thread.length || thread[thread.length - 1]?.unknown) && (
          <div className="stack" style={{ gap: 6 }}><span className="faint xs">Suggestions for this page</span>{suggestionsFor(loc.pathname).map((s) => <button key={s} className="example" onClick={() => ask(s)}><MessageSquareText size={14} />{s}</button>)}</div>
        )}
      </div>
    </Drawer>
  );
}

// "What would you like to do?" — routes plain-language goals to the right flow.
export function GoalBox({ placeholder = 'What would you like to do? e.g. “Help me write a message to all our residents”' }) {
  const { open } = useAssistant();
  const nav = useNavigate();
  const o = useOrg();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (text) => {
    const t = (text ?? q).trim(); if (!t) return;
    setBusy(true);
    try {
      const r = await askWorkspace(t, loc.pathname, { ...o, users: getState().users });
      const flow = r.actions?.find((a) => /\?ai=/.test(a.to));
      if (flow && (r.actions.length === 1)) nav(flow.to); else open(t);
    } finally { setBusy(false); setQ(''); }
  };
  return (
    <div className="goal-box">
      <form className="row" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Sparkles size={18} className="accent" style={{ flex: 'none' }} />
        <input className="goal-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Describe what you want to do" />
        <button className="btn btn-primary btn-sm" disabled={!q.trim() || busy}>{busy ? 'Working…' : 'Go'}</button>
      </form>
      <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
        {['Help me write a message to all our residents', 'Remind customers about their appointments', 'Follow up with members who haven’t renewed', 'Send another message if the first one fails', 'Show me who hasn’t responded'].map((s) => <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={busy}>{s}</button>)}
      </div>
    </div>
  );
}
