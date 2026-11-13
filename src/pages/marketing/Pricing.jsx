import { PricingCards, FAQ } from './Home';
import { useTitle } from '../../lib/hooks';
import { Check, Minus } from 'lucide-react';

const ROWS = [['Contacts', '1,000', '10,000', '50,000'], ['Team members', '2', '5', '25'], ['Campaigns per month', '10', 'Unlimited', 'Unlimited'], ['Email & SMS', true, true, true], ['WhatsApp', false, true, true], ['Dynamic segments', false, true, true], ['Automation workflows', false, true, true], ['Branching & advanced automation', false, false, true], ['Roles & permissions', false, false, true], ['Reporting', 'Basic', 'Advanced', 'Advanced + exports'], ['Support', 'Email', 'Email', 'Priority']];
export default function Pricing() {
  useTitle('Pricing');
  return (
    <>
      <section className="mk-hero" style={{ paddingBottom: 48 }}><div className="mk-container"><div className="mk-eyebrow">Pricing</div><h1 className="mk-h1" style={{ fontSize: 'clamp(2.2rem,5vw,3.8rem)' }}>Plans for every stage.</h1><p className="mk-lead">Illustrative pricing for this prototype — no payments are taken. Messaging usage (for example SMS segments or WhatsApp conversations) will eventually be billed separately or according to the selected plan.</p></div></section>
      <section className="mk-section"><div className="mk-container"><PricingCards /></div></section>
      <section className="mk-section"><div className="mk-container"><h2 className="mk-h2" style={{ marginBottom: 24 }}>Compare plans</h2>
        <div className="card table-wrap"><table className="table"><thead><tr><th>Feature</th><th>Starter</th><th>Growth</th><th>Business</th></tr></thead><tbody>{ROWS.map(([f, ...v]) => <tr key={f}><td className="strong">{f}</td>{v.map((x, i) => <td key={i}>{x === true ? <Check size={16} className="accent" aria-label="Included" /> : x === false ? <Minus size={16} className="faint" aria-label="Not included" /> : x}</td>)}</tr>)}</tbody></table></div>
      </div></section>
      <section className="mk-section" style={{ borderBottom: 0 }}><div className="mk-container faq" style={{ maxWidth: 860 }}><h2 className="mk-h2" style={{ marginBottom: 16 }}>FAQ</h2>{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
    </>
  );
}
