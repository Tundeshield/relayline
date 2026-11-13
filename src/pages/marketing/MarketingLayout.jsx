import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from '../../components/Logo';
import { useOrg } from '../../data/store';

export default function MarketingLayout() {
  const { user } = useOrg();
  return (
    <>
      <header className="mk-nav">
        <div className="mk-nav-inner">
          <Link to="/" className="row" style={{ fontWeight: 750, fontSize: '1.1rem', letterSpacing: '-0.02em' }}><Logo />Relayline</Link>
          <nav className="row" style={{ gap: 26 }} aria-label="Primary">
            {[['/product', 'Product'], ['/use-cases', 'Use cases'], ['/pricing', 'Pricing'], ['/about', 'About']].map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => 'navl' + (isActive ? ' active' : '')}>{l}</NavLink>)}
          </nav>
          <div className="grow" />
          {user ? <Link to="/app" className="btn btn-primary">Open app</Link> : <><Link to="/login" className="btn btn-ghost">Log in</Link><Link to="/signup" className="btn btn-primary">Get Started</Link></>}
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="mk-footer">
        <div className="mk-container">
          <div className="grid-4" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <div className="stack" style={{ maxWidth: 320 }}>
              <div className="row strong" style={{ color: 'var(--text)' }}><Logo size={22} />Relayline</div>
              <p>One place to manage who you communicate with, what you send, which channel you use, and what happens afterwards.</p>
              <p className="faint xs">Relayline is a product prototype. Messaging is simulated; no provider integrations are active.</p>
            </div>
            <div><h4>Product</h4><Link to="/product">Overview</Link><Link to="/product#automation">Automation</Link><Link to="/product#inbox">Inbox</Link><Link to="/pricing">Pricing</Link></div>
            <div><h4>Company</h4><Link to="/about">About</Link><Link to="/use-cases">Use cases</Link><Link to="/contact">Contact</Link></div>
            <div><h4>Legal</h4><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms of service</Link></div>
          </div>
          <div className="divider" style={{ margin: '32px 0 20px' }} />
          <div className="between small faint wrap"><span>© {new Date().getFullYear()} Relayline. All rights reserved.</span><span>Made for teams that communicate with care.</span></div>
        </div>
      </footer>
    </>
  );
}
