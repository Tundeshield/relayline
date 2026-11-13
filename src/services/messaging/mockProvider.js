// Mock messaging provider. Simulates a provider's acceptance, delivery reports
// and failures deterministically. NOTHING here contacts a real network.
import { hashPct } from '../../lib/util';

const FAILURES = {
  email: ['Mailbox unavailable (simulated hard bounce)', 'Recipient domain not found (simulated)', 'Mailbox full (simulated soft bounce)'],
  sms: ['Carrier rejected message (simulated)', 'Handset unreachable (simulated)', 'Number is a landline (simulated)'],
  whatsapp: ['Number is not on WhatsApp (simulated)', 'Message undeliverable (simulated)'],
};
const RATES = {
  // per-message failure / pending chance, in percent
  email: { fail: 2.5, pending: 1.5 },
  sms: { fail: 3.5, pending: 4 },
  whatsapp: { fail: 3, pending: 2 },
};

export const mockProvider = {
  name: 'Demo simulator',
  id: 'mock',
  // Accept a message and plan its simulated lifecycle.
  send(message) {
    const contactKey = `${message.contact_id}:${message.channel}`;
    const badAddress = hashPct('addr:' + contactKey) < 6; // some contacts consistently fail
    const roll = hashPct('msg:' + message.id);
    const r = RATES[message.channel];
    let outcome = 'delivered';
    if (badAddress || roll < r.fail) outcome = 'failed';
    else if (roll < r.fail + r.pending) outcome = 'pending';
    const list = FAILURES[message.channel];
    const failure_reason = outcome === 'failed' ? list[Math.floor(hashPct('why:' + contactKey) / 100 * list.length)] : null;
    const jitter = (k, min, span) => min + Math.floor((hashPct(k + message.id) / 100) * span);
    return {
      provider: 'mock',
      provider_message_id: 'sim_' + message.id.slice(-10),
      sim: {
        outcome, failure_reason,
        sent_after: jitter('s', 600, 1600),
        final_after: jitter('f', 2200, 4200),
        read_after: message.channel === 'whatsapp' && hashPct('r' + message.id) < 62 ? jitter('rd', 5000, 6000) : null,
        reply: hashPct('reply:' + message.id) < 7,
        click: message.channel === 'email' && /https?:\/\//.test(message.content || '') && hashPct('clk' + message.id) < 18,
      },
    };
  },
};
