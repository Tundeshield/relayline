import { useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Eye, EyeOff, FlaskConical, ArrowLeft, Check } from 'lucide-react';
import Logo from '../../components/Logo';
import { Field, Callout, useToast } from '../../components/ui';
import { login, signup, requestPasswordReset, resetPassword } from '../../services/auth';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../data/seed';
import { isEmail } from '../../lib/util';
import { useTitle } from '../../lib/hooks';

function AuthLayout({ children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <Link to="/" className="row" style={{ fontWeight: 750, fontSize: '1.1rem', marginBottom: 40 }}><Logo />Relayline</Link>
        {children}
      </div>
      <div className="auth-side">
        <div className="mk-eyebrow">One place for every conversation</div>
        <h2 className="mk-h2" style={{ fontSize: '2.2rem' }}>Know who you reached, how, and what happened next.</h2>
        <ul className="stack muted" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {['Contacts with consent tracked per channel', 'Campaigns across email, SMS and WhatsApp', 'Automations, a shared inbox and analytics'].map((t) => <li key={t} className="row"><Check size={16} className="accent" />{t}</li>)}
        </ul>
        <Callout icon={FlaskConical}>Messaging in this prototype is simulated — nothing is sent to real people.</Callout>
      </div>
    </div>
  );
}

function PasswordInput({ id, value, onChange, invalid, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input id={id} type={show ? 'text' : 'password'} className={`input ${invalid ? 'invalid' : ''}`} value={value} onChange={onChange} autoComplete={autoComplete} style={{ paddingRight: 40 }} />
      <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button>
    </div>
  );
}

export function Login() {
  useTitle('Log in');
  const [sp] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [email, setEmail] = useState(sp.get('demo') ? DEMO_EMAIL : '');
  const [password, setPassword] = useState(sp.get('demo') ? DEMO_PASSWORD : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = (e, p) => {
    setError(''); setBusy(true);
    setTimeout(() => {
      try { login({ email: e, password: p }); nav(loc.state?.from?.startsWith('/app') ? loc.state.from : '/app'); }
      catch (err) { setError(err.message); setBusy(false); }
    }, 350);
  };
  const submit = (ev) => { ev.preventDefault(); if (!isEmail(email) || !password) return setError('Enter your email and password.'); go(email, password); };
  return (
    <AuthLayout>
      <h1 style={{ fontSize: '1.7rem', fontWeight: 700 }}>Welcome back</h1>
      <p className="muted" style={{ margin: '6px 0 28px' }}>Log in to your Relayline workspace.</p>
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Callout tone="err">{error}</Callout>}
        <Field label="Email" htmlFor="l-email"><input id="l-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label={<span className="between">Password<Link to="/forgot-password" className="accent small" style={{ fontWeight: 500 }}>Forgot password?</Link></span>} htmlFor="l-pw"><PasswordInput id="l-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <div className="divider" style={{ margin: '24px 0' }} />
      <button className="btn btn-lg btn-block" onClick={() => go(DEMO_EMAIL, DEMO_PASSWORD)} disabled={busy}><FlaskConical />Explore the demo workspace</button>
      <p className="faint small" style={{ marginTop: 8 }}>Demo login: <span className="mono">{DEMO_EMAIL}</span> / <span className="mono">{DEMO_PASSWORD}</span></p>
      <p className="muted small" style={{ marginTop: 24 }}>New to Relayline? <Link to="/signup" className="accent">Create an account</Link></p>
    </AuthLayout>
  );
}

export function Signup() {
  useTitle('Sign up');
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '', agree: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.name.trim()) er.name = 'Enter your full name.';
    if (!isEmail(f.email)) er.email = 'Enter a valid email address.';
    if (f.password.length < 8) er.password = 'Use at least 8 characters.';
    if (!f.agree) er.agree = 'Please accept the terms to continue.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setTimeout(() => {
      try { signup(f); nav('/onboarding'); } catch (err) { setErrors({ form: err.message }); setBusy(false); }
    }, 350);
  };
  const strength = f.password.length >= 12 && /\d/.test(f.password) && /[A-Za-z]/.test(f.password) ? 'Strong' : f.password.length >= 8 ? 'Good' : f.password ? 'Too short' : '';
  return (
    <AuthLayout>
      <h1 style={{ fontSize: '1.7rem', fontWeight: 700 }}>Create your account</h1>
      <p className="muted" style={{ margin: '6px 0 28px' }}>Set up your workspace in a couple of minutes.</p>
      <form className="stack" onSubmit={submit} noValidate>
        {errors.form && <Callout tone="err">{errors.form} {errors.form.includes('exists') && <Link to="/login" className="accent">Log in</Link>}</Callout>}
        <Field label="Full name" error={errors.name} htmlFor="s-name"><input id="s-name" className={`input ${errors.name ? 'invalid' : ''}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
        <Field label="Work email" error={errors.email} htmlFor="s-email"><input id="s-email" type="email" className={`input ${errors.email ? 'invalid' : ''}`} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
        <Field label="Password" error={errors.password} hint={strength && `Strength: ${strength}`} htmlFor="s-pw"><PasswordInput id="s-pw" value={f.password} invalid={errors.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <label className="check"><input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />I agree to the <Link to="/terms" className="accent">Terms</Link> and <Link to="/privacy" className="accent">Privacy policy</Link></label>
        {errors.agree && <span className="error-text">{errors.agree}</span>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="muted small" style={{ marginTop: 24 }}>Already have an account? <Link to="/login" className="accent">Log in</Link></p>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  useTitle('Reset password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setError('Enter a valid email address.');
    setDone({ token: requestPasswordReset(email) });
  };
  return (
    <AuthLayout>
      <Link to="/login" className="muted small row" style={{ marginBottom: 20 }}><ArrowLeft size={14} />Back to login</Link>
      <h1 style={{ fontSize: '1.7rem', fontWeight: 700 }}>Forgot your password?</h1>
      <p className="muted" style={{ margin: '6px 0 28px' }}>Enter your email and we’ll send you a reset link.</p>
      {done ? (
        <div className="stack">
          <Callout tone="info">If an account exists for <strong>{email}</strong>, a reset link has been prepared. In this prototype no email is sent.</Callout>
          {done.token && <Link className="btn btn-primary" to={`/reset-password?token=${done.token}`}>Open the reset link (demo)</Link>}
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <Field label="Email" error={error} htmlFor="f-email"><input id="f-email" type="email" className={`input ${error ? 'invalid' : ''}`} value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} /></Field>
          <button className="btn btn-primary btn-lg">Send reset link</button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  useTitle('Choose a new password');
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (pw !== pw2) return setError('Passwords do not match.');
    try { resetPassword(sp.get('token'), pw); toast.success('Password updated. You can now log in.'); nav('/login'); } catch (err) { setError(err.message); }
  };
  return (
    <AuthLayout>
      <h1 style={{ fontSize: '1.7rem', fontWeight: 700 }}>Choose a new password</h1>
      <p className="muted" style={{ margin: '6px 0 28px' }}>Use at least 8 characters.</p>
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Callout tone="err">{error}</Callout>}
        <Field label="New password" htmlFor="r-1"><PasswordInput id="r-1" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Confirm password" htmlFor="r-2"><PasswordInput id="r-2" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn btn-primary btn-lg">Update password</button>
      </form>
    </AuthLayout>
  );
}
