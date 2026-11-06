import React, { useEffect, useState } from 'react';
import { Container, Card, Button, Alert } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { User } from './App';
import { ApiError, authenticatedFetchJson, mutate, logout } from './utils/api';
interface InviteInfo { domainName: string; role: string; inviterDisplayName: string; expiresAt: string }
export default function InvitePage() {
  const { token } = useParams<{ token: string }>(); const navigate = useNavigate();
  const [identity, setIdentity] = useState<User | null>(null); const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true; setInvite(null); setIdentity(null); setError(''); setLoading(true);
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.appendChild(meta);
    (async () => {
      try {
        const person = await authenticatedFetchJson('/api/user', { signal: controller.signal }); if (!active) return; setIdentity(person);
        const result = await authenticatedFetchJson(`/api/invite/${encodeURIComponent(token || '')}`, { signal: controller.signal }); if (active) setInvite(result.data);
      } catch (error) { if (active && !controller.signal.aborted && !(error instanceof ApiError && error.status === 401)) setError(error instanceof Error ? error.message : 'Invitation unavailable'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); meta.remove(); };
  }, [token]);
  const accept = async () => { setBusy(true); try { const result = await mutate(`/api/invite/${encodeURIComponent(token || '')}`); navigate(`/private/domain/${result.data.domainId}`); } catch (error) { setError(error instanceof Error ? error.message : 'Invitation unavailable'); setInvite(null); } finally { setBusy(false); } };
  const returnPath = `/invite/${token || ''}`; const valid = /^[A-Za-z0-9_-]{1,200}\.[A-Za-z0-9_-]{43}$/.test(token || '');
  return <Container className="py-5"><Card className="mx-auto" style={{ maxWidth: 560 }}><Card.Body>
    <h2>Domain invitation</h2>{loading ? <p role="status">Loading invitation…</p> : <>
      {identity ? <p>Signed in as {identity.email}. <Button variant="link" onClick={() => void logout(`/invite/${token || ''}`)}>Sign out to switch accounts</Button></p> : <p>Sign in with the Google account this invitation was sent to.</p>}
      {error && <Alert variant="warning">{error}</Alert>}
      {!identity && valid && <a className="btn btn-primary" href={'/auth/google?returnTo=' + encodeURIComponent(returnPath)}>Sign in with Google</a>}
      {!valid && <Alert variant="warning">Invitation unavailable.</Alert>}
      {invite && <><h3>{invite.domainName}</h3><p>{invite.inviterDisplayName} invited you as {invite.role}. Expires {new Date(invite.expiresAt).toLocaleString()}.</p><Button disabled={busy} onClick={accept}>Accept Invitation</Button></>}
    </>}
  </Card.Body></Card></Container>;
}
