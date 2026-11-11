import React, { useEffect, useState } from 'react';
import { Alert, Form } from 'react-bootstrap';
import { ArrowClockwise, CheckLg, ChevronRight, ClockHistory, Pencil, Tag, XLg } from 'react-bootstrap-icons';
import { DRONE_LINK_MSG_TYPE_ADDR, DRONE_LINK_MSG_TYPE_CHAR } from '@dronelink/protocol';
import IconButton from '../components/ui/IconButton';
import SettingsDialog from '../components/ui/SettingsDialog';
import SurfacePanel from '../components/ui/SurfacePanel';
import {
  Address, Command, Query, Target, WriteObservation, addressFields, commandAddress, fieldsFromObservation,
  integer, operationLabel, requestedText, typedPayload
} from './model';
import { CommandError, Scope, commandRequest, message, resolveAttempt, root, submit, useCommandJournal, useCommandScope } from './session';

const busy = (status?: string) => status !== undefined && status !== 'rejected' && status !== 'uncertain';
const sameTarget = (a: Target, b: Target) => a.nodeAddress === b.nodeAddress && a.channel === b.channel && a.param === b.param;
const stamp = (time: string) => new Date(time).toLocaleString();

function CommandSummary({ command }: { command: Command }) {
  return <>
    <strong>{operationLabel(command.operation)} · {command.state}</strong>
    <span className="dw-meta"> · {commandAddress(command.target)} · {command.transport.toUpperCase()}</span>
    {command.requested && <div>Requested <code>{requestedText(command.requested)}</code></div>}
    <div className="dw-meta">Requested by {command.submittedBy.displayName} at {stamp(command.acceptedAt)}</div>
    {command.state === 'pending' && <div className="dw-meta">Expires {stamp(command.expiresAt)}</div>}
    {command.terminalAt && <div className="dw-meta">{stamp(command.terminalAt)}{command.reason && ` · ${command.reason.replace(/-/g, ' ')}`}{command.cancelledBy && ` · ${command.cancelledBy.displayName}`}</div>}
    {command.state === 'retrieved' && <div className="dw-meta">Retrieved by the polling node. Check the observed value for changes.</div>}
  </>;
}

function Acceptance({ command }: { command: Command }) {
  return <div className="dw-meta">
    {operationLabel(command.operation)} accepted at {stamp(command.acceptedAt)} · {commandAddress(command.target)}
    {command.requested && <div>Requested <code>{requestedText(command.requested)}</code></div>}
  </div>;
}

function Recovery({ scope }: { scope: Scope }) {
  const { attempt, notice } = useCommandJournal(scope);
  const [error, setError] = useState('');
  if (!attempt || attempt.status === 'rejected') return notice ? <Alert variant="warning">{notice}</Alert> : null;
  if (busy(attempt.status)) return <p role="status">{attempt.status === 'checking' ? 'Checking submission…' : 'Submitting command…'}</p>;
  const action = (retry: boolean) => {
    setError('');
    void resolveAttempt(scope, retry).catch(problem => setError(message(problem)));
  };
  return <Alert variant="warning">
    {attempt.request && <div>{operationLabel(attempt.request.operation)} · {commandAddress(attempt.request.target)}</div>}
    <p>{attempt.error}</p>
    <div className="dw-row-actions">
      <IconButton label="Check submission" icon={<ArrowClockwise />} onClick={() => action(false)} />
      {scope.canSubmit && <IconButton label="Retry same request" icon={<CheckLg />} onClick={() => action(true)} />}
    </div>
    {error && <p role="status">{error}</p>}
  </Alert>;
}

function WriteForm({ scope, target, observation, latest, onClose }: {
  scope: Scope; target: Target; observation: WriteObservation; latest?: WriteObservation; onClose: () => void;
}) {
  const [fields, setFields] = useState(() => fieldsFromObservation(observation));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const { attempt } = useCommandJournal(scope);
  const expected = observation.expected;
  const mismatch = !latest || Object.entries(expected).some(([key, value]) => latest.expected[key as keyof typeof expected] !== value);
  const stale = conflict || mismatch;
  useEffect(() => { if (mismatch) setConflict(true); }, [mismatch]);
  const setField = (index: number, value: string) => setFields(old => old.map((field, i) => i === index ? value : field));
  const send = async () => {
    setError('');
    try {
      await submit(scope, { operation: 'write', target, expected, payload: typedPayload(expected, fields) });
      onClose();
    } catch (problem) {
      if (problem instanceof CommandError && problem.code === 'metadata-conflict') setConflict(true);
      setError(message(problem));
    }
  };
  return <Form onSubmit={event => { event.preventDefault(); if (!stale && scope.canSubmit) void send(); }}>
    {stale && <Alert variant="warning">Observation metadata changed. Close and reopen the editor to review it.</Alert>}
    {error && <Alert variant="warning">{error}</Alert>}
    {expected.msgType === DRONE_LINK_MSG_TYPE_ADDR ? Array.from({ length: fields.length / 5 }, (_, row) =>
      <fieldset key={row} className="mb-2">
        <legend className="fs-6">Address {row + 1}</legend>
        <div className="d-flex flex-wrap gap-2">{addressFields.map((name: keyof Address, i) =>
          <label key={name}>{name}<Form.Control aria-label={`Address ${row + 1} ${name}`} inputMode="numeric" size="sm"
            value={fields[row * 5 + i]} onChange={event => setField(row * 5 + i, event.target.value)} /></label>)}</div>
      </fieldset>) : fields.map((value, index) => {
        const text = expected.msgType === DRONE_LINK_MSG_TYPE_CHAR;
        const label = text ? 'Requested text' : `Value ${index + 1}`;
        return <label key={index} className="d-block mb-2">{label}
          <Form.Control aria-label={label} value={value} inputMode={text ? 'text' : 'decimal'}
            maxLength={text ? expected.payloadBytes * 4 : 40} onChange={event => setField(index, event.target.value)} />
          {text && <small className="dw-meta">{'Use \\n for a line break and \\\\ for a backslash.'}</small>}
        </label>;
      })}
    <div className="dw-row-actions">
      <IconButton label="Close editor" icon={<XLg />} onClick={onClose} />
      <IconButton label="Submit write" icon={<CheckLg />} type="submit" disabled={!scope.canSubmit || stale || Boolean(attempt && attempt.status !== 'rejected')} />
    </div>
  </Form>;
}

export function ParameterCommands({ target, observation }: { target: Target; observation?: WriteObservation }) {
  const scope = useCommandScope();
  const journal = useCommandJournal(scope);
  const [draft, setDraft] = useState<WriteObservation>();
  const [error, setError] = useState('');
  const canSubmit = scope?.canSubmit === true;
  useEffect(() => { if (!canSubmit) setDraft(undefined); }, [canSubmit]);
  const { last, attempt } = journal;
  const { nodeAddress, channel, param } = target;
  useEffect(() => {
    if (last?.operation === 'write' && sameTarget(last.target, { nodeAddress, channel, param })) setDraft(undefined);
  }, [last, nodeAddress, channel, param]);
  if (!scope) return null;
  const blocked = Boolean(attempt && attempt.status !== 'rejected');
  const query = (operation: Query) => {
    setError('');
    void submit(scope, { target, operation }).catch(problem => setError(message(problem)));
  };
  return <SurfacePanel title="Commands">
    {last && sameTarget(last.target, target) && <Acceptance command={last} />}
    <Recovery scope={scope} />
    {error && <Alert variant="warning">{error}</Alert>}
    {scope.canSubmit && <div className="dw-row-actions">
      {observation && !draft && <IconButton label="Edit parameter value" icon={<Pencil />} disabled={blocked} onClick={() => setDraft(observation)} />}
      <IconButton label="Query value" icon={<ArrowClockwise />} disabled={blocked} onClick={() => query('query-value')} />
      <IconButton label="Query name" icon={<Tag />} disabled={blocked} onClick={() => query('query-name')} />
    </div>}
    {draft && scope.canSubmit && <WriteForm scope={scope} target={target} observation={draft} latest={observation} onClose={() => setDraft(undefined)} />}
    <CommandHistory scope={scope} target={target} />
  </SurfacePanel>;
}

interface Page { data: { items: Command[] }; pagination: { nextCursor: string | null } }
function CommandHistory({ scope, target }: { scope: Scope; target?: Target }) {
  const [view, setView] = useState<'pending' | 'history'>('pending');
  const [cursor, setCursor] = useState<string>();
  const [revision, refresh] = useState(0);
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState<string>();
  const [outcome, setOutcome] = useState<Command>();
  const { last } = useCommandJournal(scope);
  const params = new URLSearchParams({ view });
  if (target) for (const [key, value] of Object.entries(target)) params.set(key, String(value));
  if (cursor) params.set('cursor', cursor);
  const url = root(scope.domainId) + '/commands?' + params.toString();

  useEffect(() => {
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      request?.abort();
      request = undefined;
    };
    const read = async () => {
      if (document.hidden || request) return;
      const active = new AbortController();
      request = active;
      try {
        const result = await commandRequest<Page>(url, { signal: active.signal, userId: scope.userId });
        if (request === active) { setPage(result); setError(''); }
      } catch (problem) {
        if (request === active) setError(message(problem));
      } finally {
        if (request === active) {
          request = undefined;
          timer = setTimeout(() => void read(), 10000);
        }
      }
    };
    const visibility = () => {
      if (document.hidden) stop();
      else { clearTimeout(timer); void read(); }
    };
    setPage(undefined); setError('');
    document.addEventListener('visibilitychange', visibility);
    void read();
    return () => { stop(); document.removeEventListener('visibilitychange', visibility); };
  }, [url, revision, last, scope.userId]);
  const cancel = async (command: Command) => {
    setCancelling(command.id);
    try {
      const { data } = await commandRequest<{ data: { command: Command } }>(root(scope.domainId) + '/commands/' + command.id + '/cancel', { method: 'POST', body: '{}', userId: scope.userId });
      setOutcome(data.command);
    } catch (problem) {
      if (problem instanceof CommandError && problem.command) {
        setOutcome(problem.command);
      }
      setError(message(problem));
    } finally { setCancelling(undefined); setCursor(undefined); refresh(n => n + 1); }
  };

  return <div className="mt-2">
    <div className="dw-inline-form">
      <Form.Select aria-label="Command view" value={view} onChange={event => { setCursor(undefined); setView(event.target.value === 'history' ? 'history' : 'pending'); }}>
        <option value="pending">Pending commands</option><option value="history">Command history</option>
      </Form.Select>
      <IconButton label="Refresh commands" icon={<ArrowClockwise />} onClick={() => { setCursor(undefined); refresh(n => n + 1); }} />
    </div>
    {outcome && <div className="mt-2" role="status"><CommandSummary command={outcome} /></div>}
    {error && <Alert variant="warning" className="mt-2">{error}</Alert>}
    {!page && !error && <p role="status">Loading commands…</p>}
    {page?.data.items.length === 0 && <p className="dw-meta">No {view === 'pending' ? 'pending commands' : 'command history'}.</p>}
    {page?.data.items.map(command => <div key={command.id} className="dw-item-row">
      <div className="dw-item-content"><CommandSummary command={command} /></div>
      {scope.canSubmit && command.state === 'pending' && <IconButton label={`Cancel ${operationLabel(command.operation)} at ${commandAddress(command.target)}`}
        icon={<XLg />} disabled={Boolean(cancelling)} onClick={() => void cancel(command)} />}
    </div>)}
    {page?.pagination.nextCursor && <IconButton label="Next commands" icon={<ChevronRight />} onClick={() => setCursor(page.pagination.nextCursor!)} />}
  </div>;
}

function NumericQuery({ scope, node }: { scope: Scope; node: number }) {
  const [channel, setChannel] = useState('');
  const [param, setParam] = useState('');
  const [error, setError] = useState('');
  const { attempt } = useCommandJournal(scope);
  const run = async (operation: Query) => {
    setError('');
    try {
      const target = { nodeAddress: node, channel: integer(channel, 1, 254, 'Channel'), param: integer(param, 1, 63, 'Parameter') };
      await submit(scope, { target, operation });
    } catch (problem) { setError(message(problem)); }
  };
  const blocked = Boolean(attempt && attempt.status !== 'rejected');
  return <SurfacePanel title={`Query Node ${node}`}>
    <div className="dw-inline-form">
      <Form.Control aria-label="Query channel" placeholder="Channel" inputMode="numeric" maxLength={3} value={channel} onChange={event => setChannel(event.target.value)} />
      <Form.Control aria-label="Query parameter" placeholder="Parameter" inputMode="numeric" maxLength={2} value={param} onChange={event => setParam(event.target.value)} />
      <IconButton label="Query addressed value" icon={<ArrowClockwise />} disabled={blocked} onClick={() => void run('query-value')} />
      <IconButton label="Query addressed name" icon={<Tag />} disabled={blocked} onClick={() => void run('query-name')} />
    </div>
    {error && <Alert variant="warning">{error}</Alert>}
  </SurfacePanel>;
}
function CommandSettings({ scope }: { scope: Scope }) {
  const [settings, setSettings] = useState<{ revision: number; httpLifetimeSeconds: number }>();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [load, refresh] = useState(0);
  const url = root(scope.domainId) + '/command-settings';
  useEffect(() => {
    const controller = new AbortController();
    setSettings(undefined); setError('');
    void commandRequest<{ data: { revision: number; httpLifetimeSeconds: number } }>(url, { signal: controller.signal, userId: scope.userId }).then(({ data }) => {
      if (!controller.signal.aborted) { setSettings(data); setValue(String(data.httpLifetimeSeconds)); }
    }, problem => { if (!controller.signal.aborted) setError(message(problem)); });
    return () => controller.abort();
  }, [url, load, scope.userId]);
  const save = async () => {
    if (!settings || !scope.canSettings || loading) return;
    setLoading(true); setError('');
    try {
      const httpLifetimeSeconds = integer(value, 60, 86400, 'Lifetime');
      const { data } = await commandRequest<{ data: typeof settings }>(url, {
        method: 'PATCH', userId: scope.userId, body: JSON.stringify({ revision: settings.revision, httpLifetimeSeconds })
      });
      setSettings(data); setValue(String(data.httpLifetimeSeconds));
    } catch (problem) {
      setError(message(problem));
      if (problem instanceof CommandError && problem.status === 409) setSettings(undefined);
    } finally { setLoading(false); }
  };
  return <SurfacePanel title="HTTP command lifetime">
    {settings && <Form className="dw-inline-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>Seconds<Form.Control aria-label="Command lifetime seconds" value={value} readOnly={!scope.canSettings}
        inputMode="numeric" maxLength={5} onChange={event => setValue(event.target.value)} /></label>
      {scope.canSettings && <IconButton label="Save command lifetime" icon={<CheckLg />} type="submit" disabled={loading || value === String(settings.httpLifetimeSeconds)} />}
    </Form>}
    <IconButton label="Refresh command lifetime" icon={<ArrowClockwise />} onClick={() => refresh(n => n + 1)} />
    {error && <Alert variant="warning">{error}</Alert>}
  </SurfacePanel>;
}
export function DomainCommands({ node }: { node?: number }) {
  const scope = useCommandScope();
  const { last } = useCommandJournal(scope);
  const [show, setShow] = useState(false);
  if (!scope) return null;
  return <>
    <IconButton label="Domain commands" icon={<ClockHistory />} onClick={() => setShow(true)} />
    <SettingsDialog title="Domain commands" show={show} onHide={() => setShow(false)}>
      {show && <>
        <Recovery scope={scope} />
        {last && <SurfacePanel title="Latest request"><Acceptance command={last} /></SurfacePanel>}
        {scope.canSubmit && node !== undefined && <NumericQuery key={node} scope={scope} node={node} />}
        <SurfacePanel title="Command queue"><CommandHistory scope={scope} /></SurfacePanel>
        <CommandSettings scope={scope} />
      </>}
    </SettingsDialog>
  </>;
}
