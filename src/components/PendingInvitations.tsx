import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { DomainRole } from '../App';
import { ApiError, authenticatedFetchJson } from '../utils/api';

interface Invitation {
  invitationId: string;
  domainName: string;
  role: DomainRole;
  revision: number;
  expiresAt: string;
}

export default function PendingInvitations({ onAccepted }: { onAccepted: () => void }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState('');
  const [joined, setJoined] = useState<{ domainId: string; name: string } | null>(null);
  const lifetime = useRef<AbortController | null>(null);

  const load = useCallback(async (signal: AbortSignal, startCursor: string | null = null) => {
    setLoading(true);
    setLoadError(false);
    let cursor = startCursor;
    try {
      // An archive can leave a storage page with no displayable invitations.
      do {
        const query = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
        const result = await authenticatedFetchJson('/api/user/invitations' + query, { signal });
        if (signal.aborted) return;
        const page: Invitation[] = result.data;
        cursor = result.pagination.nextCursor;
        if (page.length || !cursor) {
          setInvitations(previous => startCursor
            ? [...previous, ...page.filter(item => !previous.some(old => old.invitationId === item.invitationId))]
            : page);
          setNextCursor(cursor);
          break;
        }
      } while (cursor);
    } catch (error) {
      if (!signal.aborted && !(error instanceof ApiError && [401, 404].includes(error.status))) setLoadError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const accept = async (invitation: Invitation) => {
    const signal = lifetime.current?.signal;
    if (!signal || accepting) return;
    setAccepting(invitation.invitationId);
    setAcceptError('');
    try {
      const result = await authenticatedFetchJson(
        '/api/user/invitations/' + encodeURIComponent(invitation.invitationId) + '/accept',
        { method: 'POST', body: JSON.stringify({ revision: invitation.revision }), signal }
      );
      if (signal.aborted) return;
      setInvitations(previous => previous.filter(item => item.invitationId !== invitation.invitationId));
      setJoined({ domainId: result.data.domainId, name: invitation.domainName });
      onAccepted();
    } catch (error) {
      if (signal.aborted) return;
      setAcceptError(error instanceof ApiError && [409, 410].includes(error.status)
        ? 'This invitation changed or is no longer available. Review the updated invitations.'
        : 'Could not accept the invitation. Try again.');
      if (error instanceof ApiError && [409, 410].includes(error.status)) {
        setInvitations(previous => previous.filter(item => item.invitationId !== invitation.invitationId));
        await load(signal);
      }
    } finally {
      if (!signal.aborted) setAccepting(null);
    }
  };

  if (!invitations.length && !nextCursor && !loadError && !acceptError && !joined) return null;

  return <section className="dw-home-invitations p-3 mb-3" aria-labelledby="pending-invitations-heading">
    <h2 id="pending-invitations-heading" className="h5">Pending invitations</h2>
    {joined && <Alert variant="success" role="status">
      You joined {joined.name}. <Link to={`/private/domain/${encodeURIComponent(joined.domainId)}`}>Open {joined.name}</Link>
    </Alert>}
    {acceptError && <Alert variant="warning">{acceptError}</Alert>}
    {invitations.length > 0 && <ul className="list-unstyled mb-0">
      {invitations.map(invitation => <li key={invitation.invitationId} className="dw-home-invitation py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <strong>{invitation.domainName}</strong>
          <div className="text-muted"><span className="text-capitalize">{invitation.role}</span> · Expires <time dateTime={invitation.expiresAt}>{new Date(invitation.expiresAt).toLocaleString()}</time></div>
        </div>
        <Button variant="primary" disabled={accepting !== null || loading}
          aria-label={`Accept invitation to ${invitation.domainName}`} onClick={() => void accept(invitation)}>
          {accepting === invitation.invitationId ? 'Accepting…' : 'Accept invitation'}
        </Button>
      </li>)}
    </ul>}
    {loadError && <Alert variant="warning" className="mb-2">Could not load pending invitations.</Alert>}
    {(nextCursor || loadError) && <Button variant="outline-secondary" size="sm" disabled={loading || accepting !== null}
      onClick={() => { if (lifetime.current) void load(lifetime.current.signal, nextCursor); }}>
      {loading ? 'Loading…' : loadError ? 'Retry' : 'Load more invitations'}
    </Button>}
  </section>;
}
