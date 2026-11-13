# Relayline

**One place to manage who you communicate with, what you send, which channel you use, and what happens afterwards.**

Relayline is a multi-tenant omnichannel communications SaaS prototype: contacts, consent, campaigns across email / SMS / WhatsApp, automations, a shared inbox and analytics. It is **fully functional with simulated messaging**. No provider is connected and no real messages are ever sent.

- Stack: React 18, Vite 5, React Router 6, lucide-react. No UI framework; hand-built design system in `src/styles/app.css`.
- Hosting: Netlify (SPA redirect in `netlify.toml`).
- Persistence: browser `localStorage` behind a swappable adapter (`src/data/adapters`). A Firebase migration plan is in `src/data/adapters/firebaseAdapter.js`.

## Demo access

- Open the site and click **Explore the demo workspace**, or log in with `demo@relayline.app` / `demo1234`.
- Or **Get Started** to create an account, go through onboarding, and pick **Load sample workspace** (or import a CSV / start empty).
- **Reset demo data:** account menu (top right), the demo banner, or Settings → Security.
- Text size (accessibility): account menu or Settings → Your profile.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```

## AI layer (demo mode)

Users describe what they want and the platform builds it, while they stay in control. Nothing is sent and no automation is switched on without explicit confirmation.

| Where | What it does |
|---|---|
| **Write with AI**: campaign composer, templates | Drafts from a short description. Generates email, SMS and WhatsApp versions with the same key facts. Improve / shorter / more detail / fix grammar / personalise / change tone (professional, friendly, persuasive, urgent). Subject-line and call-to-action ideas. Adapt one version to the other channels. You review and edit, then **Use these drafts** fills the normal composer. |
| **Create automation with AI**: Automations, Home | Turns plain language into a real workflow in the *same schema* as the manual builder: triggers, waits, if/otherwise checks, consent checks and channel-specific sends. Asks one short question when something essential is missing (e.g. "How long before the appointment?"). Shows a plain-language summary and the visual workflow, flags missing details (e.g. [bracketed] placeholders). Test on a contact, then activate. |
| **Edit with AI**: any automation | "Change the wait to 2 days", "Add an SMS follow-up if they don't respond", "Remove the second email", "Only send to contacts in Building A", "Pause at weekends". Shows proposed changes with before/after before applying. Nothing is saved until you click Save. |
| **Explain with AI**: automation run history | Reads execution logs and messages to explain failures and skipped steps in plain words, with a suggested fix. |
| **Ask AI**: top bar, every page | Context-aware questions answered **only** from workspace data: contacts not messaged in 30 days, missing email, Building B residents, who hasn't responded, why recipients were excluded, highest failure channel, monthly summary, best campaigns. Says so when it can't answer. |
| **Goal box**: Home | "Help me write a message to all our residents", "Remind customers about their appointments", "Send another message if the first one fails", "Show me who hasn't responded". Routes to the right flow. |

Architecture: `src/services/ai/` has one provider boundary (`provider.js` → `runAI(task, input)`) and six tasks: message generation, rewriting, channel adaptation, automation generation, automation modification, and workspace Q&A. The current provider is a deterministic, offline **demo engine** (`demoEngine.js`, rule-based NLU). A hosted model can replace it by implementing the same tasks (e.g. via a Netlify Function), with no UI changes. AI calls are logged per workspace in `aiLog`. AI-built automations and drafts use the existing automation engine and campaign composer, so there is one system, not two.

## Simplification pass (what changed)

- **Navigation:** went from 15 sidebar items to 8: Home, Inbox, Campaigns, Automations, Contacts, Reports, Settings, Help. Related pages are now tabs: Campaigns / Templates, All contacts / Groups / Import, Performance / Activity log. Team moved into Settings.
- **Plain language:** "Lists & segments" → **Groups** (fixed / smart), "Analytics" → **Reports**, "Dashboard" → **Home**, fallback → "Send once, with a backup", consent → "Permission to contact".
- **Campaigns:** 6 steps → **3**: *Who & how*, *Write*, *Review & send*. The name is optional (auto-generated), "marketing" is a single checkbox, and type, internal note, acknowledgement and backup settings sit behind *More options*. Write with AI is front and centre.
- **Contacts:** fewer table columns (email and phone stacked, "Can receive" channels). Optional fields are tucked under *More details* in the form.
- **Inbox:** opens on **Needs reply** (open conversations where the last message is from the contact), with a clear badge.
- **Reports:** 10 metric tiles → 5. Added a plain-English "Key takeaways" card. Removed a duplicate failure chart.
- **Home:** goal box plus a **Needs your attention** list (waiting replies, failures, paused automations, drafts, scheduled sends).
- **Automations:** every workflow shows "What this automation does" in plain sentences above the canvas.

## Architecture

```
src/
  data/        store.js (central org-scoped store, transactions), seed.js (Northstar demo), adapters/
  services/    domain logic, no UI
    messaging/   index.js — provider-independent interface: sendMessage, scheduleMessage,
                 getMessageStatus, receiveMessage; mockProvider.js — the simulator provider
    automation/  catalog.js (triggers, conditions, actions), engine.js (evaluation, waits, scheduler)
    campaigns.js, consent.js, contacts.js (incl. segments), analytics.js, org.js, auth.js, simulator.js
  components/  ui.jsx (design-system primitives), charts.jsx (SVG charts), Composer.jsx, AppShell.jsx
  pages/       marketing/, auth/ (auth + onboarding), app/ (every application screen)
```

- **One source of truth.** Campaign stats, dashboard numbers, analytics and contact timelines are all *derived* from message, conversation and execution records, so they always agree. Nothing is hard-coded.
- **Organisation isolation.** Every org-owned record carries `organisation_id`. The UI reads through `useOrg()`, which scopes every collection to the active workspace.
- **Provider abstraction.** Swapping in a real provider means implementing `send()` like `mockProvider` and replacing the simulator's delivery reports with provider webhooks.
- **Automation engine** runs independently of messaging: triggers come from domain events (`emit()`), conditions read contact/consent data, and send actions go through the messaging service.

## What works (tested end to end in headless Chrome)

AI acceptance criteria 1–12 and the simplified campaign, import and inbox journeys all pass in the automated test suite.


| Journey | Status |
|---|---|
| 1. Marketing site → Get Started → sign up → 5-step onboarding → dashboard → sample data | ✅ |
| 2. Contacts → Import CSV → map → validation errors + duplicates → import → contacts appear and are campaign-ready | ✅ |
| 3. Create campaign → audience → email + SMS → per-channel content → eligibility review → send → live simulated results → recipients → export | ✅ |
| 4. Create automation → trigger → condition → messaging action → save → test on a contact → activate → a real event (tagging a contact) fires it → execution detail | ✅ |
| 5. Simulated incoming reply → notification → inbox → reply → assign → close; STOP opt-out blocks further SMS | ✅ |
| 6. Analytics → date range → channel filter → drill into underlying records → export report | ✅ |

Also verified: every route loads without console errors; data persists across reloads; login/logout and validation; global search (⌘/Ctrl+K); mobile layout (390px).

### Feature summary

- **Marketing site:** Home (all 12 sections), Product, Use cases, Pricing (illustrative), About, Contact (validated form), Privacy, Terms.
- **Auth:** sign up, log in/out, forgot and reset password (the reset link is shown in-app because no email is sent), persistent session.
- **Contacts:** search, filters (tag / list / channel / status), sorting, multi-select bulk actions (tag, add to / remove from list, message, export, delete), add/edit, CSV export, full profile with consent per channel, suppression, tags, lists, notes, and a unified activity timeline.
- **Lists and segments:** static lists plus dynamic segments with AND/OR rules (tags, lists, channel, consent, status, "no campaign in N days", fields) that update live.
- **Templates:** channel-specific templates with categories, variables, preview with real contacts, duplicate and delete.
- **Campaigns:** 6-step builder; per-channel eligibility with reasons; *all channels* vs *primary + fallback* (condition, delay, unavailable handling); channel-aware composer (email formatting, SMS segments/encoding, WhatsApp template placeholder); missing-field warnings; time-zone-aware scheduling with validation; illustrative usage estimate; confirmation; live simulation; details with Overview / Recipients / Messages / Activity; cancel, duplicate, export.
- **Inbox:** folders (all, unassigned, mine, open, closed, per channel), search, assignee filter, threads with campaign context and delivery status, replies, internal notes, assign, close/reopen, contact side panel, consent-aware reply blocking, WhatsApp 24-hour notice, and a simulate-incoming tool.
- **Automations:** visual node builder with branching, 15 triggers, 9 conditions, 12 actions plus wait/end, validation, 5 starter workflows, test runs (no side effects), activation, live execution with waits that resume, scheduler for date-based / recurring / no-response triggers, auto-pause with notification on error, execution history and detail.
- **Analytics:** 7/30/90-day or custom range, channel and campaign filters, 10 metrics, 5 charts (click to open the underlying records), an events table that keeps sent / delivered / read / failed / replied / acknowledged separate (read shown only for WhatsApp), campaign comparison, CSV export.
- **Activity log, notifications, team** (invite, simulated accept, roles, remove, editable permission matrix enforced in the UI), and **settings** (general + logo, channels, communication defaults, notification preferences, consent rules, unsubscribe scope, STOP/START keywords, suppression list, illustrative billing and usage, password, sessions, delete workspace).

## What is simulated

- **All message sending, delivery reports, failures, read receipts, replies and link clicks.** Outcomes are deterministic per message: roughly 2–5% fail with a realistic reason, some never get a delivery report, a few contacts consistently fail, and about 7% of delivered messages get a reply. Some replies are "STOP" or "YES".
- **Fallback delays and automation waits are compressed** (1 minute → 1 second for fallbacks; any wait → about 8 seconds).
- Team invitations, plan changes, the attachment button and "Connect provider" are placeholders. No email or payment is involved.
- Authentication is local and for demo only (non-cryptographic password hash).

## Known limitations

- Data lives in one browser's `localStorage`, so it doesn't sync between devices or users. Clearing site data removes it.
- The simulator, scheduled campaigns and time-based automations only run **while the app is open in a browser tab**. In production they belong in background jobs (Cloud Functions + Scheduler).
- Permissions are enforced in the UI only. Real enforcement needs backend rules.
- "No response within N hours" and date-based triggers only consider events after the automation was activated, so the historical seed doesn't flood new automations.
- The workflow builder supports linear flows with nested if/else branches. Branches don't merge back together.
- The JS bundle is about 540 KB (≈156 KB gzipped). Route-level code splitting would reduce it.
- Consent tooling helps with permission-based messaging. It is **not legal advice** and doesn't certify compliance.
