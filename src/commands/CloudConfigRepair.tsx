import { useEffect, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { CommandError, commandRequest, message, root, useCommandScope } from './session';

const labels = {
  idle: 'No trial staged', staging: 'Waiting for device readback', staged: 'Staged on device',
  queued: 'Retry queued', activating: 'Retry delivered', probation: 'Trial running',
  ready: 'Trial ready to confirm', confirming: 'Confirmation sent, waiting for device',
  committed: 'Config committed', 'rolled-back': 'Trial rolled back', expired: 'Retry expired',
} as const;

type Repair = {
  id: string | null;
  state: keyof typeof labels;
  candidate: string | null;
  expected: string | null;
  expiresAt: string | null;
  device: { boot: string; mode: number; installed: string | null; fresh: boolean } | null;
};

export default function CloudConfigRepair({ node }: { node: number }) {
  const scope = useCommandScope();
  const userId = scope?.userId;
  const url = scope?.canSubmit && scope.canTarget?.(node) !== false
    ? root(scope.domainId) + '/config-repair/' + node : undefined;
  const [repair, setRepair] = useState<Repair>();
  const [draft, setDraft] = useState<{ file: File; expected: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!url) return;
    const active = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const reply = await commandRequest<{data: Repair}>(url, { userId, signal: active.signal });
        if (!active.signal.aborted) setRepair(reply.data);
      } catch (problem) {
        if (!active.signal.aborted && !(problem instanceof CommandError && problem.status === 404)) {
          setError(message(problem));
        }
      } finally {
        if (!active.signal.aborted) timer = setTimeout(() => void load(), 2000);
      }
    };
    void load();
    return () => { active.abort(); clearTimeout(timer); };
  }, [url, userId]);

  if (!url || !repair) return null;
  const { device, state } = repair;
  const canStage = device?.fresh && device.mode === 3 && !!device.installed &&
    ['idle', 'staging', 'staged', 'committed', 'rolled-back', 'expired'].includes(state);

  const send = async (action: 'stage' | 'activate' | 'confirm') => {
    if (busy || scope?.captureEditAccess?.()() === false) return;
    setBusy(true);
    setError('');
    try {
      let body: object = { id: repair.id, boot: device?.boot };
      if (action === 'stage') {
        if (!draft || draft.file.size < 1 || draft.file.size > 8192) throw new Error('Choose a config file from 1 to 8,192 bytes.');
        const bytes = new Uint8Array(await draft.file.arrayBuffer());
        body = { expected: draft.expected, bytes: btoa(String.fromCharCode(...Array.from(bytes))) };
      }
      const reply = await commandRequest<{data: Repair}>(url + '/' + action, {
        method: 'POST', userId, body: JSON.stringify(body),
      });
      setRepair(reply.data);
      if (action === 'stage') setDraft(undefined);
    } catch (problem) { setError(message(problem)); }
    finally { setBusy(false); }
  };

  return <section className="mt-3" aria-label="Configuration repair">
    <strong>Configuration repair</strong>
    <div role="status" className="dw-meta">{labels[state]}</div>
    {!device?.fresh && <div className="dw-meta">Waiting for a fresh device report.</div>}
    {device?.installed && <div className="dw-meta">Installed SHA-256 <code>{device.installed.slice(0, 12)}</code></div>}
    {repair.candidate && <div className="dw-meta">Trial SHA-256 <code>{repair.candidate.slice(0, 12)}</code></div>}
    {state === 'queued' && repair.expiresAt && <div className="dw-meta">
      Retry expires at {new Date(repair.expiresAt).toLocaleTimeString()}.
    </div>}
    {canStage && <>
      <Form.Control className="mt-2" size="sm" type="file" accept=".ini,text/plain"
        aria-label="Replacement config.ini"
        onChange={event => {
          const file = (event.target as HTMLInputElement).files?.[0];
          setDraft(file && device.installed ? { file, expected: device.installed } : undefined);
        }} />
      <Button className="mt-2 me-2" size="sm" variant="outline-light"
        disabled={busy || !draft} onClick={() => void send('stage')}>Stage replacement</Button>
    </>}
    {state === 'staged' && <Button className="mt-2" size="sm" variant="outline-warning"
      disabled={busy || !device?.fresh || device.mode !== 3}
      onClick={() => void send('activate')}>Retry with staged config</Button>}
    {state === 'ready' && <Button className="mt-2" size="sm" variant="outline-warning"
      disabled={busy || !device?.fresh} onClick={() => void send('confirm')}>Confirm trial</Button>}
    {error && <div role="alert">{error}</div>}
  </section>;
}
