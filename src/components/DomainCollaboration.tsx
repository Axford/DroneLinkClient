import React, { useEffect, useRef, useState } from 'react';
import { Accordion, Alert, Button, Form, Table } from 'react-bootstrap';
import { Domain, DomainRole, User } from '../App';
import { accessEvent, affectsDomain, authenticatedFetchJson, mutate } from '../utils/api';
interface Member { _id: string; displayName: string; email: string; role: DomainRole }
interface Invitation { _id: string; emailCanonical: string; role: DomainRole; revision: number; effectiveState: string; expiresAt: string }
const roles: DomainRole[] = ['owner', 'editor', 'viewer'];
export default function DomainCollaboration({ domain, user, onRefresh }: { domain: Domain; user: User; onRefresh: () => Promise<void> }) {
  const root = `/api/domains/${domain._id}`; const active = domain.status === 'active';
  const manager = domain.canManageMembers || domain.canRestore;
  const viewKey = user.isPlatformAdmin || domain.myRole === 'owner' || domain.myRole === 'editor';
  const [members, setMembers] = useState<Member[]>([]); const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | null>(null); const [inviteCursor, setInviteCursor] = useState<string | null>(null);
  const [email, setEmail] = useState(''); const [role, setRole] = useState<DomainRole>('editor'); const [name, setName] = useState(domain.name);
  const [key, setKey] = useState<string | null>(null); const [share, setShare] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
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
    (async () => { try { await load('members', null, controller.signal); if (manager) await load('invitations', null, controller.signal); } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load collaboration'); } })();
    const invalidate = () => { generation.current++; };
    return () => { invalidate(); controller.abort(); window.removeEventListener(accessEvent, clear); };
    // A role/lifecycle change clears all privileged state and obsolete in-flight results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, domain.myRole, domain.status, manager, viewKey]);
  useEffect(() => {
    if (lastRevision.current === domain.revision) return;
    lastRevision.current = domain.revision;
    const controller = new AbortController();
    (async () => { try { await load('members', null, controller.signal); if (manager) await load('invitations', null, controller.signal); } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to refresh collaboration'); } })();
    return () => controller.abort();
    // Refresh lists on external membership changes without losing a newly issued share link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.revision, root, manager]);
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
  const issue = () => action(() => mutate(root + '/invitations', { email, role }), result => { setShare(result.data.shareUrl); setEmail(''); setMessage('Copy this link now and share it manually with the intended person. It is shown once.'); });
  const rotate = () => action(async () => { if (!window.confirm(`Replace the machine key for "${domain.name}"? Devices using the old key must be reconfigured.`)) return; return mutate(root + '/regenerate-key', { revision: domain.revision }); }, result => { if (result) setKey(result.data.apiKey); });
  return <Accordion className="text-dark"><Accordion.Item eventKey="collaboration"><Accordion.Header>Collaboration · {domain.myRole || 'Platform Admin'} · {domain.status}</Accordion.Header><Accordion.Body>
    {error && <Alert variant="warning">{error}</Alert>}{message && <Alert variant="info">{message}</Alert>}
    {domain.canEdit && <Form onSubmit={event => { event.preventDefault(); void action(() => mutate(root, { name, revision: domain.revision }, 'PUT')); }} className="d-flex gap-2 mb-3"><Form.Control aria-label="Domain name" value={name} maxLength={100} onChange={event => setName(event.target.value)} /><Button type="submit" disabled={busy || !name.trim()}>Save name</Button></Form>}
    {(domain.canArchive || domain.canRestore) && <Button variant="outline-warning" disabled={busy} onClick={() => void lifecycle()}>{active ? 'Archive domain' : 'Restore domain'}</Button>}
    {active && domain.myRole && <Button className="ms-2" variant="outline-secondary" disabled={busy} onClick={() => { if (window.confirm(`Leave "${domain.name}"? Another accepted Owner is required before the final Owner can leave.`)) void action(() => mutate(root + '/leave', { revision: domain.revision })); }}>Leave domain</Button>}
    <h5 className="mt-3">Members</h5><Table size="sm"><thead><tr><th>Collaborator</th><th>Role</th>{domain.canManageMembers && <th>Manage</th>}</tr></thead><tbody>{members.map(member => <tr key={member._id}><td>{member.displayName}<br /><small>{member.email}</small></td><td>{member.role}</td>{domain.canManageMembers && <td><Form.Select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={event => { const next = event.target.value; if (window.confirm(`Change ${member.email} to ${next}?`)) void action(() => mutate(`${root}/members/${member._id}`, { role: next, revision: domain.revision }, 'PATCH')); }}>{roles.map(role => <option key={role}>{role}</option>)}</Form.Select><Button size="sm" variant="outline-danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.email} from "${domain.name}"?`)) void action(() => mutate(`${root}/members/${member._id}`, { revision: domain.revision }, 'DELETE')); }}>Remove member</Button></td>}</tr>)}</tbody></Table>
    {memberCursor && <Button onClick={() => void load('members', memberCursor).catch(error => setError(error.message))}>Next members</Button>}
    {viewKey && <section className="my-3"><h5>Machine key</h5>{key ? <><code>{key}</code><Button size="sm" onClick={() => { setKey(null); }}>Hide key</Button><Button size="sm" onClick={() => void navigator.clipboard.writeText(key).then(() => setMessage('Key copied.'), () => setError('Copy failed.'))}>Copy key</Button></> : <Button disabled={busy} onClick={() => void action(() => authenticatedFetchJson(root + '/key'), result => setKey(result.data.apiKey))}>Show key</Button>}{domain.canManageKeys && <Button className="ms-2" variant="outline-warning" disabled={busy} onClick={() => void rotate()}>Replace key</Button>}</section>}
    {manager && <section className="mt-3"><h5>Invitations</h5>{active && <Form className="d-flex gap-2" onSubmit={event => { event.preventDefault(); void issue(); }}><Form.Control type="email" aria-label="Invitation email" placeholder="Email address" required value={email} onChange={event => setEmail(event.target.value)} /><Form.Select aria-label="Invitation role" value={role} onChange={event => setRole(event.target.value as DomainRole)}>{roles.map(role => <option key={role}>{role}</option>)}</Form.Select><Button type="submit" disabled={busy}>Create invitation</Button></Form>}
      {share && <Alert variant="info" className="mt-2"><Form.Control aria-label="Invitation share link" readOnly value={share} /><Button onClick={() => void navigator.clipboard.writeText(share).then(() => setMessage('Invitation link copied. Share it with the intended email address.'), () => setError('Copy failed. Select the link and copy it manually.'))}>Copy invitation link</Button></Alert>}
      <Table size="sm"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th>{active && <th>Actions</th>}</tr></thead><tbody>{invitations.map(invitation => <tr key={invitation._id}><td>{invitation.emailCanonical}</td><td>{invitation.role}</td><td>{invitation.effectiveState}</td><td>{new Date(invitation.expiresAt).toLocaleString()}</td>{active && <td>{!['accepted', 'revoked'].includes(invitation.effectiveState) && <><Button size="sm" disabled={busy} onClick={() => void action(() => mutate(`${root}/invitations/${invitation._id}/reissue`, { role: invitation.role, revision: invitation.revision }), result => { setShare(result.data.shareUrl); setMessage('Previous link invalidated. Copy the fresh link now.'); })}>Reissue</Button><Button size="sm" variant="outline-danger" disabled={busy} onClick={() => void action(() => mutate(`${root}/invitations/${invitation._id}`, { revision: invitation.revision }, 'DELETE'), () => setShare(''))}>Revoke</Button></>}</td>}</tr>)}</tbody></Table>{inviteCursor && <Button onClick={() => void load('invitations', inviteCursor).catch(error => setError(error.message))}>Next invitations</Button>}
    </section>}
  </Accordion.Body></Accordion.Item></Accordion>;
}
