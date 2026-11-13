// Catalog of triggers, conditions and actions the workflow builder exposes.
// `fields` describe the config form for each item.
export const TRIGGERS = [
  { type: 'contact.created', group: 'Contact events', label: 'Contact created', fields: [] },
  { type: 'contact.added_to_list', group: 'Contact events', label: 'Contact added to a list', fields: [{ key: 'listId', label: 'List', type: 'list', required: true }] },
  { type: 'contact.tagged', group: 'Contact events', label: 'Contact receives a tag', fields: [{ key: 'tagId', label: 'Tag', type: 'tag', required: true }] },
  { type: 'contact.updated', group: 'Contact events', label: 'Contact attribute updated', fields: [{ key: 'field', label: 'Attribute (optional)', type: 'field' }] },
  { type: 'message.delivered', group: 'Communication events', label: 'Message delivered', fields: [{ key: 'channel', label: 'Channel (optional)', type: 'channel' }] },
  { type: 'message.failed', group: 'Communication events', label: 'Message failed', fields: [{ key: 'channel', label: 'Channel (optional)', type: 'channel' }] },
  { type: 'reply.received', group: 'Communication events', label: 'Incoming reply received', fields: [{ key: 'channel', label: 'Channel (optional)', type: 'channel' }, { key: 'keyword', label: 'Contains keyword (optional)', type: 'text' }] },
  { type: 'link.clicked', group: 'Communication events', label: 'Contact clicks a simulated link', fields: [] },
  { type: 'no_response', group: 'Communication events', label: 'No response within a period', fields: [{ key: 'hours', label: 'Hours after delivery', type: 'number', required: true }, { key: 'channel', label: 'Channel (optional)', type: 'channel' }] },
  { type: 'time.specific', group: 'Time-based', label: 'Specific date and time', fields: [{ key: 'at', label: 'Date & time', type: 'datetime', required: true }, { key: 'listId', label: 'Audience list (optional)', type: 'list' }] },
  { type: 'time.before_date', group: 'Time-based', label: 'Before a contact date', fields: [{ key: 'field', label: 'Date field', type: 'datefield', required: true }, { key: 'days', label: 'Days before', type: 'number', required: true }] },
  { type: 'time.after_date', group: 'Time-based', label: 'After a contact date', fields: [{ key: 'field', label: 'Date field', type: 'datefield', required: true }, { key: 'days', label: 'Days after', type: 'number', required: true }] },
  { type: 'time.recurring', group: 'Time-based', label: 'Recurring schedule', fields: [{ key: 'every', label: 'Repeat', type: 'select', options: [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']], required: true }, { key: 'listId', label: 'Audience list (optional)', type: 'list' }] },
  { type: 'campaign.completed', group: 'Campaign events', label: 'Campaign completed', fields: [{ key: 'campaignId', label: 'Campaign (optional)', type: 'campaign' }] },
  { type: 'campaign.failure_threshold', group: 'Campaign events', label: 'Campaign failure threshold reached', fields: [{ key: 'percent', label: 'Failure rate at least (%)', type: 'number', required: true }] },
];

export const CONDITIONS = [
  { type: 'attribute', label: 'Contact attribute', fields: [{ key: 'field', label: 'Attribute', type: 'field', required: true }, { key: 'op', label: 'Operator', type: 'select', options: [['is_set', 'is set'], ['is_not_set', 'is empty'], ['equals', 'equals'], ['contains', 'contains']], required: true }, { key: 'value', label: 'Value', type: 'text' }] },
  { type: 'tag', label: 'Has tag', fields: [{ key: 'tagId', label: 'Tag', type: 'tag', required: true }] },
  { type: 'list', label: 'In list', fields: [{ key: 'listId', label: 'List or segment', type: 'list', required: true }] },
  { type: 'channel', label: 'Channel available', fields: [{ key: 'channel', label: 'Channel', type: 'channel', required: true }] },
  { type: 'consent', label: 'Consent status', fields: [{ key: 'channel', label: 'Channel', type: 'channel', required: true }, { key: 'purpose', label: 'Purpose', type: 'purpose', required: true }] },
  { type: 'alt_channel', label: 'Alternative channel available & consented', fields: [] },
  { type: 'delivery_status', label: 'Triggering message status', fields: [{ key: 'status', label: 'Status is', type: 'select', options: [['delivered', 'Delivered'], ['failed', 'Failed'], ['sent', 'Sent (no report)']], required: true }] },
  { type: 'responded', label: 'Has responded', fields: [] },
  { type: 'datetime', label: 'Date & time', fields: [{ key: 'window', label: 'Current time is', type: 'select', options: [['business_hours', 'Within business hours (9–5, Mon–Fri)'], ['weekday', 'A weekday'], ['weekend', 'A weekend']], required: true }] },
];

export const ACTIONS = [
  { type: 'send_email', group: 'Messaging', label: 'Send email', channel: 'email', fields: [{ key: 'templateId', label: 'Template (optional)', type: 'template', channel: 'email' }, { key: 'subject', label: 'Subject', type: 'text' }, { key: 'body', label: 'Message', type: 'textarea' }, { key: 'purpose', label: 'Purpose', type: 'purpose' }] },
  { type: 'send_sms', group: 'Messaging', label: 'Send SMS', channel: 'sms', fields: [{ key: 'templateId', label: 'Template (optional)', type: 'template', channel: 'sms' }, { key: 'body', label: 'Message', type: 'textarea' }, { key: 'purpose', label: 'Purpose', type: 'purpose' }] },
  { type: 'send_whatsapp', group: 'Messaging', label: 'Send WhatsApp message', channel: 'whatsapp', fields: [{ key: 'templateId', label: 'Template (optional)', type: 'template', channel: 'whatsapp' }, { key: 'body', label: 'Message', type: 'textarea' }, { key: 'purpose', label: 'Purpose', type: 'purpose' }] },
  { type: 'send_alternative', group: 'Messaging', label: 'Send via alternative channel', fields: [{ key: 'body', label: 'Message (blank = reuse original)', type: 'textarea' }] },
  { type: 'add_to_list', group: 'Contact', label: 'Add to list', fields: [{ key: 'listId', label: 'List', type: 'staticlist', required: true }] },
  { type: 'remove_from_list', group: 'Contact', label: 'Remove from list', fields: [{ key: 'listId', label: 'List', type: 'staticlist', required: true }] },
  { type: 'add_tag', group: 'Contact', label: 'Add tag', fields: [{ key: 'tagId', label: 'Tag', type: 'tag', required: true }] },
  { type: 'remove_tag', group: 'Contact', label: 'Remove tag', fields: [{ key: 'tagId', label: 'Tag', type: 'tag', required: true }] },
  { type: 'update_field', group: 'Contact', label: 'Update contact field', fields: [{ key: 'field', label: 'Field', type: 'field', required: true }, { key: 'value', label: 'New value', type: 'text' }] },
  { type: 'add_note', group: 'Contact', label: 'Log note on contact', fields: [{ key: 'text', label: 'Note', type: 'textarea', required: true }] },
  { type: 'assign_conversation', group: 'Team', label: 'Assign conversation', fields: [{ key: 'userId', label: 'Assign to', type: 'user', required: true }] },
  { type: 'notify', group: 'Team', label: 'Create internal notification', fields: [{ key: 'message', label: 'Notification text', type: 'text', required: true }] },
];

export const DELAY = { type: 'delay', label: 'Wait / delay', fields: [{ key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'unit', label: 'Unit', type: 'select', options: [['minutes', 'Minutes'], ['hours', 'Hours'], ['days', 'Days']], required: true }] };
export const END = { type: 'end', label: 'End workflow', fields: [] };

export const catalogItem = (kind, type) =>
  kind === 'trigger' ? TRIGGERS.find((t) => t.type === type)
    : kind === 'condition' ? CONDITIONS.find((t) => t.type === type)
      : kind === 'action' ? ACTIONS.find((t) => t.type === type)
        : kind === 'delay' ? DELAY : END;

export function validateNode(kind, node) {
  const item = catalogItem(kind, node?.type);
  if (!item) return ['Choose a type'];
  const errs = [];
  item.fields.forEach((f) => {
    const v = node.config?.[f.key];
    if (f.required && (v === undefined || v === null || v === '')) errs.push(`${f.label} is required`);
  });
  if (kind === 'action' && item.channel && !node.config?.templateId && !node.config?.body) errs.push('Message or template is required');
  return errs;
}

export function walkSteps(steps, fn, path = []) {
  steps.forEach((n, i) => {
    fn(n, [...path, i]);
    if (n.kind === 'condition') { walkSteps(n.yes || [], fn, [...path, i, 'yes']); walkSteps(n.no || [], fn, [...path, i, 'no']); }
  });
}
export function validateWorkflow(wf) {
  const errors = [];
  const tErr = validateNode('trigger', wf.trigger);
  if (tErr.length) errors.push({ id: 'trigger', errors: tErr });
  walkSteps(wf.steps || [], (n) => { const e = validateNode(n.kind, n); if (e.length) errors.push({ id: n.id, errors: e }); });
  if (!(wf.steps || []).length) errors.push({ id: 'steps', errors: ['Add at least one step'] });
  return errors;
}
