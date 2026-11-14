import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ParameterFields from './ParameterFields';
import { Form } from 'react-bootstrap';
import { DRONE_LINK_MSG_TYPE_CHAR as CHAR,
    DRONE_LINK_MSG_TYPE_FLOAT as FLOAT } from '@dronelink/protocol';
import { Command, commandAddress, fieldsFromObservation, Payload, requestedText, Target, typedPayload, ValueObservation, WriteObservation } from './model';
import { message, useCommandScope } from './session';
import { receiptLabel } from '../dronelink/observedPositions';
import { CommandRecovery } from './CommandControls';
import IconButton from '../components/ui/IconButton';
import { Pencil } from 'react-bootstrap-icons';
import type { NodeState } from '../dronelink/DroneLinkState';

export interface Sample { observation?: WriteObservation; value?: ValueObservation; receivedAt?: number; writable?: boolean }
export interface ParameterPath {
    id: string;
    label: string;
    available: boolean;
    sample: Sample;
    write: (observation: WriteObservation, payload: Payload) => Promise<Delivery>;
    query: () => Promise<unknown>;
    cloudDelivery?: (command: Command) => Delivery;
}
export interface Delivery {
    status: string;
    receivedAfterMs?: number;
    local?: boolean;
    refresh?: () => Promise<Delivery>;
}
type ResolvePath = (target: Target, pinned?: string) => ParameterPath | undefined;
interface EditorContext { canOpen: (target: Target) => boolean; open: (target: Target, name: string, opener: HTMLElement) => void }
export const ParameterEditorContext = createContext<EditorContext | null>(null);

export function LastKnownParameterActions({ node }: { node?: NodeState }) {
    const editor = useContext(ParameterEditorContext);
    if (!node || !editor) return null;
    const items = Object.values(node.channels).flatMap(channel => Object.values(channel.params).flatMap(parameter => {
        const target = { nodeAddress: node.id, channel: channel.channel, param: parameter.param };
        return editor.canOpen(target) ? [{ target, name: parameter.name || `Param ${parameter.param}` }] : [];
    }));
    if (!items.length) return null;
    return <details><summary>Last-known writable parameters</summary>
        <ul>{items.map(({ target, name }) => <li key={commandAddress(target)}>
            {name} · {commandAddress(target)} <IconButton label={`Edit parameter value: ${name}`} icon={<Pencil aria-hidden="true" />}
                onClick={event => editor.open(target, name, event.currentTarget)} />
        </li>)}</ul>
    </details>;
}

interface Draft { target: Target; name: string; path: ParameterPath; observation: WriteObservation; opener: HTMLElement; offset: number }
const waitMs = 15000;

function matches(observation: ValueObservation, payload: Payload) {
    const reported = fieldsFromObservation(observation);
    const comparable = typedPayload({ msgType: observation.msgType, payloadBytes: observation.bytes.length }, reported);
    if ('values' in payload && 'values' in comparable && observation.msgType === FLOAT)
        return comparable.values.every((value, i) => value === Math.fround(payload.values[i]));
    return JSON.stringify(comparable) === JSON.stringify(payload);
}

function Popup({ draft, current, close }: { draft: Draft; current?: ParameterPath; close: () => void }) {
    const [fields, setFields] = useState(() => fieldsFromObservation(draft.observation));
    const [position, setPosition] = useState({ x: Math.max(0, window.innerWidth - 490), y: 80 + draft.offset });
    const [request, setRequest] = useState<{ payload: Payload; since?: number }>();
    const [delivery, setDelivery] = useState<Delivery>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [elapsed, setElapsed] = useState(false);
    const latestReceipt = useRef<Sample>(draft.path.sample);
    const box = useRef<HTMLElement>(null);
    useEffect(() => {
        const clamp = () => setPosition(current => ({
            x: Math.max(0, Math.min(current.x, window.innerWidth - (box.current?.offsetWidth ?? 0))),
            y: Math.max(0, Math.min(current.y, window.innerHeight - 50)),
        }));
        window.addEventListener('resize', clamp);
        return () => window.removeEventListener('resize', clamp);
    }, []);
    const drag = useRef<{ x: number; y: number } | undefined>(undefined);
    const scope = useCommandScope();
    const expected = draft.observation.expected;
    if (current?.id === draft.path.id && current.sample.receivedAt !== undefined) latestReceipt.current = current.sample;
    const sample = latestReceipt.current;
    const latest = sample.observation;
    const comparableSample = latest && Object.entries(expected).every(([key, value]) => latest.expected[key as keyof typeof expected] === value);
    const compatible = comparableSample && sample.writable !== false;
    const available = current?.id === draft.path.id && current.available;
    const refresh = delivery?.refresh;
    const baseline = delivery?.receivedAfterMs ?? request?.since;
    const readback = sample.value;
    let result: string | undefined;
    if (request && delivery && current?.id === draft.path.id && baseline !== undefined && (current?.sample.receivedAt ?? 0) > baseline && readback) {
        try { result = readback.msgType !== expected.msgType ||
            (expected.msgType !== CHAR && readback.bytes.length !== expected.payloadBytes) ? 'Newer observation has different metadata' : matches(readback, request.payload) ? 'Newer observation matches' : 'Newer observation differs'; }
        catch { result = 'Newer observation cannot be compared'; }
    }

    useEffect(() => { box.current?.querySelector('input')?.focus(); }, []);
    useEffect(() => {
        if (!request || busy || delivery?.status === 'Pending retrieval') return;
        const timer = setTimeout(() => setElapsed(true), waitMs);
        return () => clearTimeout(timer);
    }, [request, busy, delivery?.status]);
    useEffect(() => {
        if (!refresh) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const next = await refresh();
                if (!stopped) setDelivery(next);
            } catch {
                if (!stopped) timer = setTimeout(poll, 3000);
            }
        };
        timer = setTimeout(poll, 1500);
        return () => { stopped = true; clearTimeout(timer); };
    }, [refresh]);

    function move(x: number, y: number) {
        setPosition({ x: Math.max(0, Math.min(x, window.innerWidth - (box.current?.offsetWidth ?? 0))),
            y: Math.max(0, Math.min(y, window.innerHeight - 50)) });
    }
    const change = (i: number, value: string) => setFields(previous => previous.map((field, index) => index === i ? value : field));
    async function send() {
        if (!available || !current || !compatible || busy) return;
        setError('');
        let payload: Payload;
        try { payload = typedPayload(draft.path.id !== 'cloud' && expected.msgType === CHAR ? { ...expected, payloadBytes: 16 } : expected, fields); }
        catch (problem) { setError(message(problem)); return; }
        setBusy(true);
        setElapsed(false);
        setDelivery(undefined);
        setRequest({ payload, since: Date.now() });
        try { setDelivery(await current.write(draft.observation, payload)); }
        catch (problem) { setError(message(problem)); }
        finally { setBusy(false); }
    }

    return createPortal(<section ref={box} role="dialog" aria-label={`Edit value: ${draft.name}`}
        className="dw-parameter-editor" data-bs-theme="dark" style={{ left: position.x, top: position.y }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
        <header>
            <div className="dw-parameter-editor-handle" tabIndex={0} aria-label="Move editor with arrow keys"
                onKeyDown={event => {
                    const offsets: Record<string, number[]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
                    const offset = offsets[event.key];
                    if (offset) { event.preventDefault(); move(position.x + offset[0], position.y + offset[1]); }
                }}
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    drag.current = { x: event.clientX - position.x, y: event.clientY - position.y };
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event => { if (drag.current) move(event.clientX - drag.current.x, event.clientY - drag.current.y); }}
                onLostPointerCapture={() => { drag.current = undefined; }}>
                <strong>Edit value · {draft.name}</strong>
                <div className="dw-meta">{commandAddress(draft.target)} · {draft.path.label}</div>
            </div>
            <button className="btn-close" type="button" aria-label="Close editor" onClick={close} />
        </header>
        <Form onSubmit={event => { event.preventDefault(); void send(); }}>
            <p className="dw-meta">Observed {sample.value ? fieldsFromObservation(sample.value).join(', ') : '—'}
                {sample.receivedAt !== undefined ? ` · ${receiptLabel(sample.receivedAt)}` : ''}</p>
            <ParameterFields msgType={expected.msgType} fields={fields} onChange={change} />
            {!available && <p role="status">Original connection unavailable. Select it again or reopen on another connection.</p>}
            {available && !compatible && <p role="status">Observation metadata changed. Reopen the editor to review it.</p>}
            {error && <p role="alert">{error}</p>}
            {draft.path.id === 'cloud' && scope && <CommandRecovery scope={scope}
                onRecovered={command => {
                    if (command.operation === 'write' && commandAddress(command.target) === commandAddress(draft.target))
                        setDelivery(current?.cloudDelivery?.(command));
                }} />}
            {request && <div role="status" className="dw-parameter-result">
                <div>Requested <code>{requestedText(request.payload)}</code></div>
                <div>{busy ? 'Submitting…' : delivery?.status ?? 'Submission could not be confirmed'}</div>
                {delivery?.local && !result && (!available || elapsed) && <div>Write outcome unknown</div>}
                <div>{result ?? (delivery && (delivery.local || delivery.status === 'Pending retrieval' ||
                    delivery.status === 'Retrieved by polling node')
                    ? elapsed ? 'No newer observation' : 'Waiting for a newer observation' : '')}</div>
            </div>}
            <div className="dw-row-actions">
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!available || busy}
                    onClick={() => { setError(''); void current?.query().catch(problem => setError(message(problem))); }}>Query value</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!available || !compatible || busy}>Submit write</button>
            </div>
        </Form>
    </section>, document.body);
}

export function ParameterEditorProvider({ resolve, children }: React.PropsWithChildren<{ resolve: ResolvePath }>) {
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const draftKey = (draft: Draft) => `${draft.path.id}:${commandAddress(draft.target)}`;
    const controller: EditorContext = {
        canOpen: target => {
            const path = resolve(target);
            return !!(path?.available && path.sample.observation);
        },
        open: (target, name, opener) => {
            const path = resolve(target);
            if (!path?.available || !path.sample.observation) return;
            const draft = { target, name, path, observation: path.sample.observation, opener, offset: (drafts.length % 6) * 32 };
            setDrafts(current => current.some(item => draftKey(item) === draftKey(draft)) ? current : [...current, draft]);
        },
    };
    return <ParameterEditorContext.Provider value={controller}>
        {children}
        {drafts.map(draft => <Popup key={draftKey(draft)} draft={draft}
            current={resolve(draft.target, draft.path.id)} close={() => {
                setDrafts(current => current.filter(item => item !== draft));
                if (draft.opener.isConnected) draft.opener.focus();
            }} />)}
    </ParameterEditorContext.Provider>;
}
