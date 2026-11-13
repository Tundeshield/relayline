export const CHANNELS = ['email', 'sms', 'whatsapp'];
export const CHANNEL_LABEL = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };

// Simulated provider capabilities. Read receipts are only modelled where the channel supports them.
export const CHANNEL_CAPS = {
  email: { read: false, note: 'Email open tracking is unreliable, so reads are not reported.' },
  sms: { read: false, note: 'SMS has no read receipts; delivery reports depend on the carrier.' },
  whatsapp: { read: true, note: 'WhatsApp can report reads when the recipient has read receipts enabled.' },
};

export const MESSAGE_STATUS = {
  queued: { label: 'Queued', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'ok' },
  read: { label: 'Read', tone: 'ok' },
  failed: { label: 'Failed', tone: 'err' },
  skipped: { label: 'Not sent', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const CAMPAIGN_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  processing: { label: 'Processing', tone: 'accent' },
  completed: { label: 'Completed', tone: 'ok' },
  partially_failed: { label: 'Partially failed', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const CAMPAIGN_CATEGORIES = {
  operational: 'Operational update',
  announcement: 'Announcement',
  reminder: 'Reminder',
  marketing: 'Marketing',
  emergency: 'Emergency notification',
  other: 'Other',
};
// Marketing campaigns need explicit marketing consent; everything else is treated as operational.
export const categoryPurpose = (cat) => (cat === 'marketing' ? 'marketing' : 'operational');

export const TEMPLATE_CATEGORIES = ['Welcome', 'Announcement', 'Reminder', 'Appointment', 'Maintenance', 'Follow-up', 'Marketing', 'Emergency'];

export const AUTOMATION_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const CONSENT_STATUS = {
  granted: { label: 'Opted in', tone: 'ok' },
  pending: { label: 'Pending', tone: 'warn' },
  revoked: { label: 'Opted out', tone: 'err' },
  none: { label: 'No consent', tone: 'neutral' },
};
export const CONSENT_PURPOSE = { operational: 'Operational only', marketing: 'Marketing only', all: 'Operational & marketing' };
export const CONSENT_SOURCES = ['Lease application form', 'Resident portal', 'Web form', 'Paper form', 'Verbal (recorded)', 'CSV import', 'Keyword opt-in', 'WhatsApp opt-in prompt', 'Staff entry'];

export const ROLES = ['owner', 'admin', 'manager', 'member'];
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', manager: 'Manager', member: 'Member' };
export const ROLE_DESC = {
  owner: 'Full workspace control, billing and team management.',
  admin: 'Manage contacts, campaigns, automations and team members.',
  manager: 'Manage communications, contacts, conversations and view analytics.',
  member: 'View contacts and manage assigned conversations.',
};
export const PERMISSIONS = [
  { key: 'contacts.manage', label: 'Create & edit contacts' },
  { key: 'contacts.delete', label: 'Delete & export contacts' },
  { key: 'campaigns.send', label: 'Create & send campaigns' },
  { key: 'automations.manage', label: 'Manage automations' },
  { key: 'templates.manage', label: 'Manage templates' },
  { key: 'inbox.all', label: 'Access all conversations' },
  { key: 'analytics.view', label: 'View analytics' },
  { key: 'team.manage', label: 'Manage team members' },
  { key: 'settings.manage', label: 'Change workspace settings' },
  { key: 'billing.manage', label: 'Billing & plan' },
];
export const DEFAULT_PERMISSIONS = {
  owner: PERMISSIONS.map((p) => p.key),
  admin: ['contacts.manage', 'contacts.delete', 'campaigns.send', 'automations.manage', 'templates.manage', 'inbox.all', 'analytics.view', 'team.manage', 'settings.manage'],
  manager: ['contacts.manage', 'campaigns.send', 'templates.manage', 'inbox.all', 'analytics.view'],
  member: [],
};

export const PLANS = {
  starter: { name: 'Starter', price: 29, contacts: 1000, campaigns: 10, seats: 2, features: ['Contact management', 'Up to 10 campaigns / month', 'Basic templates', 'Basic reporting', 'Email + SMS'] },
  growth: { name: 'Growth', price: 99, contacts: 10000, campaigns: null, seats: 5, features: ['Up to 10,000 contacts', 'Multi-channel campaigns', 'Automation workflows', 'Dynamic segments', 'Advanced reporting', 'Email, SMS & WhatsApp'] },
  business: { name: 'Business', price: 299, contacts: 50000, campaigns: null, seats: 25, features: ['Up to 50,000 contacts', 'Advanced automation & branching', 'Up to 25 team members', 'Roles & permissions', 'Advanced reporting & exports', 'Priority support'] },
};

// Illustrative unit costs used for "estimated usage" — not real provider pricing.
export const USAGE_RATES = { email: 0.001, sms: 0.0079, whatsapp: 0.025 };

export const INDUSTRIES = ['Property management', 'Field services', 'Membership organisation', 'Nonprofit', 'Education', 'Religious organisation', 'Professional association', 'Small business', 'Customer support / operations', 'Other'];
export const GOALS = ['Customer updates', 'Operational announcements', 'Appointment reminders', 'Membership communications', 'Marketing campaigns', 'Internal team communications', 'Other'];
export const ORG_SIZES = ['1–10', '11–50', '51–200', '201–1,000', '1,000+'];
export const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'South Africa', 'Nigeria', "Côte d'Ivoire", 'Ghana', 'Kenya', 'Germany', 'France', 'Netherlands', 'Spain', 'India', 'Singapore', 'Other'];
export const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Africa/Lagos', 'Africa/Abidjan', 'Africa/Johannesburg', 'Africa/Nairobi', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney', 'UTC'];
export const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NGN', 'XOF', 'ZAR', 'KES', 'INR'];
export const LANGUAGES = ['English (US)', 'English (UK)', 'Spanish', 'French', 'Portuguese', 'German'];

// Fields that contacts expose to segments, conditions and imports.
export const CONTACT_FIELDS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'job_title', label: 'Job title' },
  { key: 'building', label: 'Building', custom: true },
  { key: 'unit', label: 'Unit', custom: true },
  { key: 'lease_end', label: 'Lease end date', custom: true, type: 'date' },
  { key: 'renewal_date', label: 'Renewal date', custom: true, type: 'date' },
  { key: 'renewal_status', label: 'Renewal status', custom: true },
  { key: 'appointment_confirmed', label: 'Appointment confirmed', custom: true },
  { key: 'appointment_at', label: 'Appointment date', custom: true, type: 'date' },
];
