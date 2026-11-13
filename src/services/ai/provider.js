// AI provider boundary. Every AI feature calls `run(task, input)`; the active provider
// decides how to fulfil it. Today that is the built-in demo engine (rule-based, runs
// in the browser, no network). A real model can be connected by implementing the same
// tasks in a remote provider — e.g. a Netlify Function that calls an LLM with a
// structured-output schema matching these return shapes.
import * as demo from './demoEngine';

export const AI_TASKS = ['message.generate', 'message.rewrite', 'message.adapt', 'automation.generate', 'automation.modify', 'workspace.answer'];

const demoProvider = {
  id: 'demo',
  label: 'Demo AI (built-in, offline)',
  isDemo: true,
  async run(task, input) {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 450)); // feel of a real call
    const fn = demo.TASKS[task];
    if (!fn) throw new Error(`AI task "${task}" is not supported.`);
    return fn(input);
  },
};

// Placeholder for a future hosted model. Kept here so the contract is explicit.
// const remoteProvider = { id: 'remote', isDemo: false, async run(task, input) {
//   const r = await fetch('/.netlify/functions/ai', { method: 'POST', body: JSON.stringify({ task, input }) });
//   if (!r.ok) throw new Error('AI request failed'); return r.json(); } };

export const aiProvider = demoProvider;
export const runAI = (task, input) => aiProvider.run(task, input);
