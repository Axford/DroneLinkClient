import { useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { CommandError, commandRequest, message, root, useCommandScope } from './session';

type Enrollment = { enrollmentId: string | null; enrolledAt: string | null; revokedAt: string | null };
type Claim = { claim: string; expiresAt: string };

export default function NodeCredentials({ node, now }: { node: number; now: number }) {
  const scope = useCommandScope();
  const userId = scope?.userId;
  const url = scope?.canSettings ? root(scope.domainId) + '/node-credentials/' + node : undefined;
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [claim, setClaim] = useState<Claim>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!url) return;
    const active = new AbortController();
    const load = async () => {
      try {
        const { data } = await commandRequest<{ data: Enrollment }>(url, { signal: active.signal, userId });
        if (!active.signal.aborted) setEnrollment(data);
      } catch (error) {
        if (!active.signal.aborted && !(error instanceof CommandError && error.status === 404)) setFeedback(message(error));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => { active.abort(); clearInterval(timer); };
  }, [url, userId, refresh]);

  if (!url || !enrollment) return null;
  const enrolled = enrollment.enrollmentId !== null && enrollment.revokedAt === null;
  const currentClaim = claim && now < Date.parse(claim.expiresAt) && !enrolled ? claim : undefined;

  const act = async (operation: 'claim' | 'revoke') => {
    if (busy || scope?.captureEditAccess?.()() === false) return;
    setBusy(true);
    setFeedback('');
    try {
      const body = operation === 'claim' ? {} : { enrollmentId: enrollment.enrollmentId };
      const options = { method: 'POST', body: JSON.stringify(body), userId };
      if (operation === 'claim') {
        const { data } = await commandRequest<{ data: Claim }>(url + '/claim', options);
        setClaim(data);
      } else {
        const { data } = await commandRequest<{ data: Enrollment }>(url + '/revoke', options);
        setEnrollment(data);
        setClaim(undefined);
        setConfirm(false);
      }
      setRefresh(value => value + 1);
    } catch (error) { setFeedback(message(error)); }
    finally { setBusy(false); }
  };

  return <div className="mt-3">
    <strong>Recovery credential</strong>
    <div className="dw-meta">{enrolled ? 'Enrolled' : enrollment.revokedAt ? 'Revoked' : 'Unpaired'}</div>
    {!enrolled && !currentClaim && <Button size="sm" variant="outline-light" disabled={busy}
      onClick={() => void act('claim')}>Create USB enrollment claim</Button>}
    {currentClaim && <div>
      <p className="dw-meta">Use this claim in the USB enrollment tool before {new Date(currentClaim.expiresAt).toLocaleTimeString()}.</p>
      <Form.Control aria-label="USB enrollment claim" readOnly value={currentClaim.claim} />
      <Button size="sm" variant="outline-light" onClick={() => void navigator.clipboard.writeText(currentClaim.claim)
        .then(() => setFeedback('Claim copied.'), () => setFeedback('Select the claim and copy it manually.'))}>Copy claim</Button>
    </div>}
    {enrolled && (confirm ? <>
      <p className="dw-meta">Revoking blocks recovery access immediately. Pair the node over USB to restore access.</p>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => void act('revoke')}>Revoke now</Button>{' '}
      <Button size="sm" variant="outline-light" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
    </> : <Button size="sm" variant="outline-danger" onClick={() => setConfirm(true)}>Revoke credential</Button>)}
    {feedback && <p role="status" className="dw-meta">{feedback}</p>}
  </div>;
}
