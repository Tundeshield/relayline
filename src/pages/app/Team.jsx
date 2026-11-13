import { useState } from 'react';
import { UserPlus, Trash2, Mail, Check, X, ShieldCheck, Clock } from 'lucide-react';
import { useOrg, upd } from '../../data/store';
import { PageHead, Modal, Field, Avatar, Badge, Empty, Callout, useConfirm, Switch } from '../../components/ui';
import { inviteMember, acceptInvitation } from '../../services/org';
import { logActivity } from '../../services/core';
import { ROLES, ROLE_LABEL, ROLE_DESC, PERMISSIONS, DEFAULT_PERMISSIONS, PLANS } from '../../lib/constants';
import { isEmail, fmtDate, relTime } from '../../lib/util';
import { useAction, usePerm, useTitle } from '../../lib/hooks';

export default function Team() {
  useTitle('Team members');
  const o = useOrg();
  const run = useAction();
  const confirm = useConfirm();
  const can = usePerm();
  const [invite, setInvite] = useState(false);
  const manage = can('team.manage');
  const pending = o.invitations.filter((i) => i.status === 'pending');
  const seats = PLANS[o.org.plan]?.seats || 5;
  const used = o.members.length + pending.length;
  const changeRole = (m, role) => run((d, ctx) => { upd(d.memberships, m.id, { role }); logActivity(d, ctx, { event_type: 'team.role_changed', entity_type: 'user', entity_id: m.user_id, summary: `${m.user?.name}'s role changed from ${ROLE_LABEL[m.role]} to ${ROLE_LABEL[role]}` }); }, { success: `${m.user?.name} is now ${ROLE_LABEL[role]}.` });
  const remove = async (m) => { if (await confirm({ title: `Remove ${m.user?.name}?`, message: 'They will lose access to this workspace. Conversations assigned to them become unassigned.', confirmLabel: 'Remove member', danger: true })) run((d, ctx) => { upd(d.memberships, m.id, { status: 'removed' }); d.conversations.forEach((c, i) => { if (c.organisation_id === ctx.orgId && c.assigned_to === m.user_id) d.conversations[i] = { ...c, assigned_to: null }; }); logActivity(d, ctx, { event_type: 'team.removed', entity_type: 'user', entity_id: m.user_id, summary: `${m.user?.name} removed from the workspace` }); }, { success: 'Member removed.' }); };
  const owners = o.members.filter((m) => m.role === 'owner').length;
  const perms = o.org.settings.permissions || DEFAULT_PERMISSIONS;
  const togglePerm = (role, key) => run((d, ctx) => {
    const cur = { ...perms, [role]: perms[role].includes(key) ? perms[role].filter((k) => k !== key) : [...perms[role], key] };
    upd(d.organisations, ctx.orgId, (org) => ({ settings: { ...org.settings, permissions: cur } }));
    logActivity(d, ctx, { event_type: 'settings.changed', entity_type: 'organisation', entity_id: ctx.orgId, summary: `Permission “${PERMISSIONS.find((p) => p.key === key).label}” ${cur[role].includes(key) ? 'granted to' : 'removed from'} ${ROLE_LABEL[role]}s` });
  });

  return (
    <>
      <PageHead title="Team members" description={`${used} of ${seats} seats used on the ${PLANS[o.org.plan]?.name} plan (illustrative).`} actions={<button className="btn btn-primary" onClick={() => setInvite(true)} disabled={!manage}><UserPlus />Invite member</button>} />
      {!manage && <div style={{ marginBottom: 16 }}><Callout>You can view the team, but only Owners and Admins can invite or change members.</Callout></div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-wrap"><table className="table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th>Last active</th><th /></tr></thead><tbody>
          {o.members.map((m) => { const me = m.user_id === o.user.id; const lastOwner = m.role === 'owner' && owners === 1; return (
            <tr key={m.id}>
              <td><span className="row-3"><Avatar name={m.user?.name} /><span><span className="strong">{m.user?.name}{me && <span className="faint"> (you)</span>}</span><span className="faint xs" style={{ display: 'block' }}>{m.user?.email}{m.user?.job_title ? ` · ${m.user.job_title}` : ''}</span></span></span></td>
              <td>{manage && !lastOwner && !(m.role === 'owner' && o.role !== 'owner') ? <select className="select input-sm" style={{ width: 140 }} value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Role for ${m.user?.name}`}>{ROLES.filter((r) => r !== 'owner' || o.role === 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select> : <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>}{lastOwner && <div className="faint xs" style={{ marginTop: 3 }}>Only owner</div>}</td>
              <td className="muted small">{fmtDate(m.joined_at)}</td>
              <td className="muted small">{m.user?.last_login_at ? relTime(m.user.last_login_at) : '—'}</td>
              <td className="right">{manage && !me && !lastOwner && <button className="btn btn-ghost btn-sm" onClick={() => remove(m)}><Trash2 />Remove</button>}</td>
            </tr>); })}
        </tbody></table></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><h3>Pending invitations</h3><span className="faint small">Invitations are simulated — no email is sent.</span></div>
        {pending.length === 0 ? <Empty icon={Mail} title="No pending invitations" /> : (
          <div className="table-wrap"><table className="table"><thead><tr><th>Email</th><th>Role</th><th>Invited</th><th /></tr></thead><tbody>
            {pending.map((i) => <tr key={i.id}><td className="row"><Clock size={14} className="warn" />{i.email}</td><td>{ROLE_LABEL[i.role]}</td><td className="muted small">{relTime(i.created_at)} by {o.members.find((m) => m.user_id === i.invited_by)?.user?.name || '—'}</td>
              <td className="right"><div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => run((d, ctx) => acceptInvitation(d, ctx, i.id), { success: `${i.email} joined (simulated acceptance).` })} disabled={!manage} title="Simulate the invitee accepting"><Check />Simulate accept</button>
                <button className="btn btn-ghost btn-sm" onClick={() => run((d, ctx) => { upd(d.invitations, i.id, { status: 'revoked' }); logActivity(d, ctx, { event_type: 'team.invite_revoked', entity_type: 'invitation', entity_id: i.id, summary: `Invitation for ${i.email} revoked` }); }, { success: 'Invitation revoked.' })} disabled={!manage}><X />Revoke</button>
              </div></td></tr>)}
          </tbody></table></div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3 className="row"><ShieldCheck size={16} className="accent" />Roles & permissions</h3><span className="faint small">{o.role === 'owner' || can('settings.manage') ? 'Toggle to customise' : 'Read only'}</span></div>
        <div className="table-wrap"><table className="table perm-table"><thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r} title={ROLE_DESC[r]}>{ROLE_LABEL[r]}</th>)}</tr></thead><tbody>
          {PERMISSIONS.map((p) => <tr key={p.key}><td className="small">{p.label}</td>{ROLES.map((r) => <td key={r}>{r === 'owner' ? <Check size={16} className="accent" aria-label="Always" /> : <span style={{ display: 'inline-flex' }}><Switch checked={(perms[r] || []).includes(p.key)} onChange={() => togglePerm(r, p.key)} label={`${p.label} for ${ROLE_LABEL[r]}`} disabled={!(o.role === 'owner' || can('settings.manage')) || (p.key === 'billing.manage')} /></span>}</td>)}</tr>)}
        </tbody></table></div>
        <div className="card-body grid-4" style={{ borderTop: '1px solid var(--border)' }}>{ROLES.map((r) => <div key={r}><div className="strong small">{ROLE_LABEL[r]}</div><div className="faint xs">{ROLE_DESC[r]}</div></div>)}</div>
      </div>
      {invite && <InviteModal onClose={() => setInvite(false)} />}
    </>
  );
}

function InviteModal({ onClose }) {
  const run = useAction();
  const o = useOrg();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [err, setErr] = useState('');
  const submit = () => {
    if (!isEmail(email)) return setErr('Enter a valid email address.');
    const r = run((d, ctx) => inviteMember(d, ctx, { email, role }), { success: `Invitation created for ${email} (simulated — no email sent).` });
    if (r) onClose();
  };
  return (
    <Modal title="Invite a team member" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Send invitation</button></>}>
      <div className="stack">
        <Field label="Email" error={err}><input type="email" className={`input ${err ? 'invalid' : ''}`} value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} autoFocus onKeyDown={(e) => e.key === 'Enter' && submit()} /></Field>
        <Field label="Role"><div className="stack" style={{ gap: 8 }}>{ROLES.filter((r) => r !== 'owner' || o.role === 'owner').map((r) => <label key={r} className={`choice ${role === r ? 'selected' : ''}`}><input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} /><span><span className="strong small" style={{ display: 'block' }}>{ROLE_LABEL[r]}</span><span className="faint xs">{ROLE_DESC[r]}</span></span></label>)}</div></Field>
      </div>
    </Modal>
  );
}
