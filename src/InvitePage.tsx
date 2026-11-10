import React, { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { BoxArrowRight } from 'react-bootstrap-icons';
import IconButton from './components/ui/IconButton';
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
  return <main className="dw-auth"><section className="dw-auth-card">
    <h2>Domain invitation</h2>{loading ? <p role="status">Loading invitation…</p> : <>
      {identity ? <div className="dw-toolbar mb-3"><span>{identity.email}</span><IconButton label="Sign out to switch accounts" icon={<BoxArrowRight />} variant="link" onClick={() => void logout(`/invite/${token || ''}`)} /></div> : <p>Use the invited Google account.</p>}
      {error && <Alert variant="warning">{error}</Alert>}
      {!identity && valid && <a className="btn btn-primary" href={'/auth/google?returnTo=' + encodeURIComponent(returnPath)}>Sign in with Google</a>}
      {!valid && <Alert variant="warning">Invitation unavailable.</Alert>}
      {invite && <><h3>{invite.domainName}</h3><p>{invite.inviterDisplayName} invited you as {invite.role}. Expires {new Date(invite.expiresAt).toLocaleString()}.</p><button className="btn btn-primary" disabled={busy} onClick={accept}>Accept Invitation</button></>}
    </>}
  </section></main>;
}
