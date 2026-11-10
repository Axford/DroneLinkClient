import React, { useEffect, useRef, useState } from 'react';
import { Alert, Form, Table } from 'react-bootstrap';
import { Gear, CheckLg, Archive, ArrowCounterclockwise, BoxArrowRight, PersonDash, Eye, EyeSlash, Clipboard, ArrowRepeat, PersonPlus, XLg, ChevronRight } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';
import DangerAction from './ui/DangerAction';
import { Domain, DomainRole, User } from '../App';
import { accessEvent, affectsDomain, authenticatedFetchJson, mutate } from '../utils/api';
interface Member { _id: string; displayName: string; email: string; role: DomainRole }
interface Invitation { _id: string; emailCanonical: string; role: DomainRole; revision: number; effectiveState: string; expiresAt: string }
const roles: DomainRole[] = ['owner', 'editor', 'viewer'];
export default function DomainCollaboration({ domain, user, onRefresh }: { domain: Domain; user: User; onRefresh: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const root = `/api/domains/${domain._id}`; const active = domain.status === 'active';
  const manager = domain.canManageMembers || domain.canRestore;
  const viewKey = user.isPlatformAdmin || domain.myRole === 'owner' || domain.myRole === 'editor';
  const [members, setMembers] = useState<Member[]>([]); const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | null>(null); const [inviteCursor, setInviteCursor] = useState<string | null>(null);
  const [email, setEmail] = useState(''); const [role, setRole] = useState<DomainRole>('editor'); const [name, setName] = useState(domain.name);
  const [key, setKey] = useState<string | null>(null); const [share, setShare] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => setName(domain.name), [domain.name]);
  const generation = useRef(0);
  const lastRevision = useRef(domain.revision);
  const readGeneration = useRef({ members: 0, invitations: 0 });
  const load = async (kind: 'members' | 'invitations', cursor?: string | null, signal?: AbortSignal) => {
    const requestGeneration = generation.current; const read = ++readGeneration.current[kind];
    const result = await authenticatedFetchJson(`${root}/${kind}?limit=20${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { signal });
    if (requestGeneration !== generation.current || read !== readGeneration.current[kind]) return;
    if (kind === 'members') { setMembers(result.data); setMemberCursor(result.pagination.nextCursor); }
    else { setInvitations(result.data); setInviteCursor(result.pagination.nextCursor); }
  };
  useEffect(() => {
    const controller = new AbortController(); generation.current++; setKey(null); setShare(''); setMembers([]); setInvitations([]); setError('');
    const clear = (event: Event) => { if (!affectsDomain(event, domain._id)) return; generation.current++; setKey(null); setShare(''); setInvitations([]); setMembers([]); setError((event as CustomEvent).detail?.status === 401 ? 'Sign in again to continue.' : 'Access changed. Refresh permissions before continuing.'); };
    window.addEventListener(accessEvent, clear);
    if (expanded) (async () => { try { await load('members', null, controller.signal); if (manager) await load('invitations', null, controller.signal); } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load collaboration'); } })();
    const invalidate = () => { generation.current++; };
    return () => { invalidate(); controller.abort(); window.removeEventListener(accessEvent, clear); };
    // A role/lifecycle change clears all privileged state and obsolete in-flight results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, domain.myRole, domain.status, manager, viewKey, expanded]);
  useEffect(() => {
    if (!expanded || lastRevision.current === domain.revision) return;
    lastRevision.current = domain.revision;
    const controller = new AbortController();
    (async () => { try { await load('members', null, controller.signal); if (manager) await load('invitations', null, controller.signal); } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to refresh collaboration'); } })();
    return () => controller.abort();
    // Refresh lists on external membership changes without losing a newly issued share link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.revision, root, manager, expanded]);
  const action = async (run: () => Promise<any>, applyResult?: (result: any) => void) => {
    const currentGeneration = generation.current; setBusy(true); setError(''); setMessage('');
    try { const result = await run(); if (generation.current !== currentGeneration) return; applyResult?.(result); await onRefresh(); if (generation.current !== currentGeneration) return; await load('members'); if (manager) await load('invitations'); }
    catch (error) { if (generation.current === currentGeneration) { setKey(null); setShare(''); setError(error instanceof Error ? error.message : 'Action failed'); await onRefresh().catch(() => {}); } }
    finally { setBusy(false); }
  };
  const lifecycle = () => action(async () => {
    const verb = active ? 'Archive' : 'Restore';
    if (!window.confirm(`${verb} "${domain.name}"? ${active ? 'History and memberships are retained. Telemetry stops and pending invitations become invalid.' : 'The current machine key accepts newly received traffic again. Old invitations stay invalid.'}`)) return;
    await mutate(`${root}/${active ? 'archive' : 'restore'}`, { revision: domain.revision });
  });
  const issue = () => action(() => mutate(root + '/invitations', { email, role }), result => { setShare(result.data.shareUrl); setEmail(''); setMessage('Link shown once. Share with the invited account.'); });
  const rotate = () => action(async () => { if (!window.confirm(`Replace the machine key for "${domain.name}"? Devices using the old key must be reconfigured.`)) return; return mutate(root + '/regenerate-key', { revision: domain.revision }); }, result => { if (result) setKey(result.data.apiKey); });
  return <><IconButton label="Domain settings" icon={<Gear />} aria-haspopup="dialog" onClick={() => setExpanded(true)} />
    <SettingsDialog title="Domain settings" show={expanded} onHide={() => setExpanded(false)}>
      {error && <Alert variant="warning">{error}</Alert>}{message && <Alert variant="info">{message}</Alert>}
      <SurfacePanel title={domain.name}>
        {domain.canEdit && <Form onSubmit={event => { event.preventDefault(); void action(() => mutate(root, { name, revision: domain.revision }, 'PUT')); }} className="dw-inline-form">
          <Form.Control aria-label="Domain name" value={name} maxLength={100} onChange={event => setName(event.target.value)} />
          <IconButton label="Save name" icon={<CheckLg />} type="submit" disabled={busy || !name.trim()} />
        </Form>}
        {domain.canRestore && <div className="dw-item-row"><span>Archived</span><div className="dw-row-actions"><IconButton label="Restore domain" icon={<ArrowCounterclockwise />} disabled={busy} onClick={() => void lifecycle()} /></div></div>}
      </SurfacePanel>
      <SurfacePanel title="Members">
        <Table size="sm" responsive><thead><tr><th>Collaborator</th><th className="text-end">{domain.canManageMembers ? 'Role / actions' : 'Role'}</th></tr></thead>
          <tbody>{members.map(member => <tr key={member._id}>
            <td>{member.displayName}<br /><small>{member.email}</small></td>
            <td className="dw-actions-cell">{domain.canManageMembers ? <div className="dw-row-actions" role="group" aria-label={`Actions for ${member.email}`}>
              <Form.Select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={event => { const next = event.target.value; if (window.confirm(`Change ${member.email} to ${next}?`)) void action(() => mutate(`${root}/members/${member._id}`, { role: next, revision: domain.revision }, 'PATCH')); }}>{roles.map(role => <option key={role}>{role}</option>)}</Form.Select>
              <DangerAction label="Remove member" warning="Removes membership." compact><IconButton label="Remove member" icon={<PersonDash />} variant="outline-danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.email} from "${domain.name}"?`)) void action(() => mutate(`${root}/members/${member._id}`, { revision: domain.revision }, 'DELETE')); }} /></DangerAction>
            </div> : member.role}</td>
          </tr>)}</tbody>
        </Table>
        {memberCursor && <IconButton label="Next members" icon={<ChevronRight />} onClick={() => void load('members', memberCursor).catch(error => setError(error.message))} />}
      </SurfacePanel>
      {viewKey && <SurfacePanel title="Machine key">
        <div className="dw-item-row"><div className="dw-item-content">{key ? <code className="dw-secret">{key}</code> : <span className="dw-meta">Hidden</span>}</div>
          <div className="dw-row-actions">{key ? <>
            <IconButton label="Hide key" icon={<EyeSlash />} onClick={() => setKey(null)} />
            <IconButton label="Copy key" icon={<Clipboard />} onClick={() => void navigator.clipboard.writeText(key).then(() => setMessage('Key copied.'), () => setError('Copy failed.'))} />
          </> : <IconButton label="Show key" icon={<Eye />} disabled={busy} onClick={() => void action(() => authenticatedFetchJson(root + '/key'), result => setKey(result.data.apiKey))} />}</div>
        </div>
        {domain.canManageKeys && <div className="mt-3"><DangerAction label="Replace key" warning="Devices using this key must be reconfigured."><IconButton label="Replace key" icon={<ArrowRepeat />} variant="outline-danger" disabled={busy} onClick={() => void rotate()} /></DangerAction></div>}
      </SurfacePanel>}
      {manager && <SurfacePanel title="Invitations">
        {active && <Form className="dw-inline-form mb-3" onSubmit={event => { event.preventDefault(); void issue(); }}>
          <Form.Control type="email" aria-label="Invitation email" placeholder="Email address" required value={email} onChange={event => setEmail(event.target.value)} />
          <Form.Select aria-label="Invitation role" value={role} onChange={event => setRole(event.target.value as DomainRole)}>{roles.map(role => <option key={role}>{role}</option>)}</Form.Select>
          <IconButton label="Create invitation" icon={<PersonPlus />} type="submit" disabled={busy} />
        </Form>}
        {share && <Alert variant="info" className="mt-2"><div className="dw-item-row"><div className="dw-item-content"><Form.Control aria-label="Invitation share link" readOnly value={share} /></div><div className="dw-row-actions"><IconButton label="Copy invitation link" icon={<Clipboard />} onClick={() => void navigator.clipboard.writeText(share).then(() => setMessage('Invitation link copied. Share it with the intended email address.'), () => setError('Copy failed. Select the link and copy it manually.'))} /></div></div></Alert>}
        <Table size="sm" responsive><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th>{active && <th className="text-end">Actions</th>}</tr></thead>
          <tbody>{invitations.map(invitation => <tr key={invitation._id}>
            <td>{invitation.emailCanonical}</td><td>{invitation.role}</td><td>{invitation.effectiveState}</td><td>{new Date(invitation.expiresAt).toLocaleString()}</td>
            {active && <td className="dw-actions-cell">{!['accepted', 'revoked'].includes(invitation.effectiveState) && <div className="dw-row-actions" role="group" aria-label={`Actions for ${invitation.emailCanonical}`}>
              <IconButton label="Reissue" icon={<ArrowRepeat />} disabled={busy} onClick={() => void action(() => mutate(`${root}/invitations/${invitation._id}/reissue`, { role: invitation.role, revision: invitation.revision }), result => { setShare(result.data.shareUrl); setMessage('Previous link invalidated. Copy the fresh link now.'); })} />
              <DangerAction label="Revoke invitation" warning="Invalidates this link." compact><IconButton label="Revoke" icon={<XLg />} variant="outline-danger" disabled={busy} onClick={() => void action(() => mutate(`${root}/invitations/${invitation._id}`, { revision: invitation.revision }, 'DELETE'), () => setShare(''))} /></DangerAction>
            </div>}</td>}
          </tr>)}</tbody>
        </Table>
        {inviteCursor && <IconButton label="Next invitations" icon={<ChevronRight />} onClick={() => void load('invitations', inviteCursor).catch(error => setError(error.message))} />}
      </SurfacePanel>}
      {domain.canArchive && <DangerAction label="Archive domain" warning="Stops telemetry for everyone and invalidates pending invitations."><IconButton label="Archive domain" icon={<Archive />} variant="outline-danger" disabled={busy} onClick={() => void lifecycle()} /></DangerAction>}
      {active && domain.myRole && <DangerAction label="Leave domain" warning="Removes your Domain membership."><IconButton label="Leave domain" icon={<BoxArrowRight />} variant="outline-danger" disabled={busy} onClick={() => { if (window.confirm(`Leave "${domain.name}"? Another accepted Owner is required before the final Owner can leave.`)) void action(() => mutate(root + '/leave', { revision: domain.revision })); }} /></DangerAction>}
    </SettingsDialog>
  </>;
}
