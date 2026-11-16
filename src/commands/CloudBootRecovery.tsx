import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { NodeState } from '../dronelink/DroneLinkState';
import { receiptLabel } from '../dronelink/observedPositions';
import { CommandRecovery } from './CommandControls';
import { Command } from './model';
import { commandRequest, message, root, submit, useCommandJournal, useCommandScope } from './session';

const modes = ['Starting', 'Normal', 'Quarantined', 'Communications only'];
const phases = ['Storage', 'Hardware', 'Wi-Fi', 'Configuration', 'Module construction', 'Module setup', 'Web', 'Startup check', 'Ready'];

export default function CloudBootRecovery({ node, now }: { node: NodeState; now: number }) {
  const scope = useCommandScope();
  const journal = useCommandJournal(scope);
  const [tracked, setTracked] = useState<Command>();
  const [error, setError] = useState('');
  const last = journal.last;
  const lastRetry = last?.operation === 'retry-normal' && last.target.nodeAddress === node.id ? last : undefined;
  const id = tracked?.id ?? lastRetry?.id;
  const command = tracked ?? lastRetry;
  const commandState = command?.state;
  const domainId = scope?.domainId;
  const userId = scope?.userId;
  useEffect(() => {
    if (!id || !domainId || commandState !== 'pending') return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const { data } = await commandRequest<{ data: Command }>(root(domainId) + '/commands/' + id,
          { signal: controller.signal, userId });
        if (!controller.signal.aborted) { setTracked(data); setError(''); }
      } catch (problem) {
        if (!controller.signal.aborted) setError(message(problem));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void check(), 3000);
      }
    };
    timer = setTimeout(() => void check(), 3000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, domainId, userId, commandState]);

  const reading = node.channels[1]?.params[23];
  const bytes = reading?.observationBytes;
  if (!reading?.directHttpObservation || reading.msgType !== 0 || reading.writable ||
      !reading.lastHeard || !bytes || bytes.length !== 14 || bytes[0] !== 1 || !modes[bytes[1]]) return null;
  const mode = bytes[1];
  const bootId = Array.from(bytes.subarray(6), byte => byte.toString(16).padStart(2, '0')).join('');
  const requested = command?.requested;
  const previousBoot = requested && 'bootId' in requested ? requested.bootId : undefined;
  const newBoot = previousBoot && previousBoot !== bootId && reading.lastHeard >= Date.parse(command!.acceptedAt);
  const send = async () => {
    if (!scope) return;
    setError('');
    try {
      setTracked(await submit(scope, { operation: 'retry-normal', bootId, target: { nodeAddress: node.id, channel: 1, param: 24 } }));
    } catch (problem) { setError(message(problem)); }
  };
  const canRetry = scope?.canSubmit && scope.canTarget?.(node.id) !== false &&
    (mode === 2 || mode === 3) && now - reading.lastHeard <= 45000;
  return <div className="mt-3">
    <div><strong>{newBoot ? 'New boot reported' : 'Reported boot mode'}</strong> · {modes[mode]}</div>
    <div className="dw-meta">{receiptLabel(reading.lastHeard, now)}</div>
    {bytes[2] !== 0 && <div className="dw-meta">Previous reset code {bytes[2]} · {phases[bytes[3]] ?? 'Unknown phase'}{bytes[4] !== 0 && ` · Channel ${bytes[4]}`}</div>}
    {bytes[5] !== 0 && <div className="dw-meta">Quarantined channel {bytes[5]}</div>}
    {command && <div role="status" className="dw-meta">Retry {command.state === 'pending' ? 'queued' : command.state}</div>}
    {error && <div role="status">{error}</div>}
    {scope && journal.attempt?.request?.operation === 'retry-normal' &&
      journal.attempt.request.target.nodeAddress === node.id && <CommandRecovery scope={scope} onRecovered={setTracked} />}
    {canRetry && <Button variant="outline-warning" size="sm" className="mt-2"
      disabled={commandState === 'pending' || Boolean(journal.attempt && journal.attempt.status !== 'rejected') ||
        (commandState === 'retrieved' && previousBoot === bootId)}
      onClick={() => void send()}>Retry normal startup</Button>}
  </div>;
}
