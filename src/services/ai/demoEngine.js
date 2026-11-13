// Built-in demo AI engine: maps each AI task to a deterministic implementation.
import { generateMessage, rewriteMessage, adaptMessage, suggestSubjects, suggestCtas } from './messageEngine';
import { generateAutomation, modifyAutomation } from './automationEngine';
import { answerQuestion } from './assistantEngine';

export const TASKS = {
  'message.generate': generateMessage,
  'message.rewrite': (i) => (i.op === 'subjects' ? suggestSubjects(i) : i.op === 'cta' ? suggestCtas(i) : rewriteMessage(i)),
  'message.adapt': adaptMessage,
  'automation.generate': generateAutomation,
  'automation.modify': modifyAutomation,
  'workspace.answer': answerQuestion,
};
