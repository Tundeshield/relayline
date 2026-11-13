// Public AI services used by the UI. Each one goes through the provider boundary, so
// swapping the demo engine for a hosted model changes nothing in the product code.
import { runAI, aiProvider } from './provider';
import { tx } from '../../data/store';
import { uid } from '../../lib/util';

export { aiProvider };
export const AI_DEMO = aiProvider.isDemo;

function logAI(type, prompt, result) {
  try {
    tx((d) => {
      const orgId = d.session?.orgId; if (!orgId) return;
      d.aiLog.push({ id: uid('ai'), organisation_id: orgId, user_id: d.session.userId, type, prompt: String(prompt || '').slice(0, 500), status: result?.status || 'ok', created_at: Date.now() });
      const mine = d.aiLog.filter((x) => x.organisation_id === orgId);
      if (mine.length > 200) d.aiLog = d.aiLog.filter((x) => x.organisation_id !== orgId || mine.slice(-200).includes(x));
    });
  } catch { /* logging is best-effort */ }
}
async function call(task, input, prompt) { const r = await runAI(task, input); logAI(task, prompt, r); return r; }

// Message generation, rewriting and channel adaptation
export const generateMessage = (brief, channels) => call('message.generate', { brief, channels }, brief);
export const rewriteMessage = (text, op, channel, subject) => call('message.rewrite', { text, op, channel, subject }, `${op}: ${text?.slice(0, 80)}`);
export const adaptMessage = (from, subject, body, to) => call('message.adapt', { from, subject, body, to }, `adapt ${from} → ${to.join(',')}`);
// Automation generation and modification (outputs use the standard workflow schema)
export const generateAutomation = (text, ctx, answers) => call('automation.generate', { text, ctx, answers }, text);
export const modifyAutomation = (workflow, text, ctx, name) => call('automation.modify', { workflow, text, ctx, name }, text);
// Workspace question answering (reads only the data passed in)
export const askWorkspace = (question, route, data) => call('workspace.answer', { question, route, data }, question);

export const aiContext = (o) => ({ lists: o.lists.map((l) => ({ id: l.id, name: l.name, type: l.type })), tags: o.tags.map((t) => ({ id: t.id, name: t.name })), users: o.members.map((m) => ({ id: m.user_id, name: m.user?.name || '' })), templates: o.templates.map((t) => ({ id: t.id, name: t.name, channel: t.channel, content: t.content })), orgName: o.org?.name });
