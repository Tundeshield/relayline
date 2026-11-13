// Demo authentication. Accounts live in local storage; passwords are hashed with a
// non-cryptographic demo hash. Replace with Firebase Auth for production.
import { tx, find, getState, upd } from '../data/store';
import { uid, demoPasswordHash, isEmail } from '../lib/util';

export function signup({ name, email, password }) {
  const e = email.trim().toLowerCase();
  if (!isEmail(e)) throw new Error('Enter a valid email address.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (getState().users.some((u) => u.email === e)) throw new Error('An account with this email already exists. Try logging in.');
  return tx((d) => {
    const user = { id: uid('usr'), name: name.trim(), email: e, password_hash: demoPasswordHash(password), job_title: '', created_at: Date.now() };
    d.users.push(user);
    d.session = { userId: user.id, orgId: null, at: Date.now() };
    return user;
  });
}

export function login({ email, password }) {
  const e = email.trim().toLowerCase();
  const user = getState().users.find((u) => u.email === e);
  if (!user || user.password_hash !== demoPasswordHash(password)) throw new Error('Email or password is incorrect.');
  return tx((d) => {
    const m = d.memberships.find((x) => x.user_id === user.id && x.status === 'active');
    d.session = { userId: user.id, orgId: m?.organisation_id || null, at: Date.now() };
    upd(d.users, user.id, { last_login_at: Date.now() });
    return user;
  });
}

export const logout = () => tx((d) => { d.session = null; });

export function switchOrg(orgId) {
  tx((d) => { d.session = { ...d.session, orgId }; });
}

export function requestPasswordReset(email) {
  const e = email.trim().toLowerCase();
  const user = getState().users.find((u) => u.email === e);
  if (!user) return null; // don't reveal whether an account exists
  return tx((d) => {
    const token = uid('rst');
    upd(d.users, user.id, { reset_token: token, reset_expires: Date.now() + 3600000 });
    return token;
  });
}

export function resetPassword(token, password) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const user = getState().users.find((u) => u.reset_token === token);
  if (!user || user.reset_expires < Date.now()) throw new Error('This reset link is invalid or has expired. Request a new one.');
  tx((d) => upd(d.users, user.id, { password_hash: demoPasswordHash(password), reset_token: null, reset_expires: null }));
}

export function changePassword(userId, current, next) {
  const user = find(getState().users, userId);
  if (user.password_hash !== demoPasswordHash(current)) throw new Error('Current password is incorrect.');
  if (next.length < 8) throw new Error('New password must be at least 8 characters.');
  tx((d) => upd(d.users, userId, { password_hash: demoPasswordHash(next) }));
}
