import { useContext, useEffect, useRef, useState } from 'react';
import { CommandRecovery } from '../commands/CommandControls';
import type { Command, Target } from '../commands/model';
import { type Delivery, type ParameterPath, ParameterEditorContext } from '../commands/ParameterEditor';
import { message, useCommandJournal, useCommandScope } from '../commands/session';
import { DRONE_LINK_MSG_TYPE_FLOAT as FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';

type ScalarType = typeof UINT8 | typeof FLOAT;
interface WriteTarget {
    target: Target;
    path: ParameterPath;
    observation: NonNullable<ParameterPath['sample']['observation']>;
    observed: number;
}
interface Request {
    action: string;
    write: WriteTarget;
    value: number;
    readback: (observed: number, requested: number) => string;
    delivery?: Delivery;
    error?: string;
    outcome?: string;
}

function scalar(msgType: number, bytes: Uint8Array): number | undefined {
    if (msgType === UINT8 && bytes.length === 1) return bytes[0];
    if (msgType === FLOAT && bytes.length === 4) {
        const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(0, true);
        if (Number.isFinite(value)) return value;
    }
}

function sameTarget(a: Target, b: Target) {
    return a.nodeAddress === b.nodeAddress && a.channel === b.channel && a.param === b.param;
}

function matchesWrite(request: Request, target: Target, payload: Command['requested']) {
    return sameTarget(request.write.target, target) && !!payload && 'values' in payload &&
        payload.values.length === 1 && payload.values[0] === request.value;
}

export default function useSummaryWrite(nodeId: number, channelId: number) {
    const editor = useContext(ParameterEditorContext);
    const scope = useCommandScope();
    const { attempt } = useCommandJournal(scope);
    const [request, setRequest] = useState<Request>();
    const submitting = useRef(false);

    function resolve(param: number, msgType: ScalarType): WriteTarget | undefined {
        const target = { nodeAddress: nodeId, channel: channelId, param };
        const path = editor?.resolve(target);
        const observation = path?.sample.observation;
        if (!path?.available || !observation?.expected.writable || observation.expected.msgType !== msgType ||
            observation.expected.payloadBytes !== observation.bytes.length) return;
        const observed = scalar(msgType, observation.bytes);
        if (observed !== undefined) return { target, path, observation, observed };
    }
    const delivery = request?.delivery;
    const refresh = delivery?.refresh;
    const waiting = request && !request.outcome && !!delivery?.awaitingObservation;
    const intent = attempt?.request;
    const recovering = !!request?.error && request.write.path.id === 'cloud' && intent?.operation === 'write' &&
        attempt?.status !== 'rejected' && matchesWrite(request, intent.target, intent.payload);
    const inFlight = request && !request.error && (!delivery || refresh || waiting);
    const busy = !!(inFlight || recovering);
    const readbackPath = request && editor?.resolve(request.write.target, request.write.path.id);
    const sample = readbackPath?.id === request?.write.path.id ? readbackPath?.sample : undefined;
    const observed = sample?.value;
    const newer = waiting && delivery.receivedAfterMs !== undefined &&
        (sample?.receivedAt ?? 0) > delivery.receivedAfterMs && observed?.msgType === request.write.observation.expected.msgType ?
        scalar(observed.msgType, observed.bytes) : undefined;
    const outcome = newer !== undefined ? request?.readback(newer, request.value) : undefined;

    useEffect(() => {
        if (!refresh) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const result = await refresh();
                if (!stopped) setRequest(current => current?.delivery === delivery && current ? { ...current, delivery: result } : current);
            } catch {
                if (!stopped) timer = setTimeout(poll, 3000);
            }
        };
        timer = setTimeout(poll, 1500);
        return () => { stopped = true; clearTimeout(timer); };
    }, [delivery, refresh]);

    useEffect(() => {
        if (!waiting) return;
        const finish = (result: string) => setRequest(current =>
            current?.delivery === delivery && current ? { ...current, outcome: result } : current);
        if (outcome) { finish(outcome); return; }
        const timer = setTimeout(() => finish('No newer observation; outcome unknown'), 15000);
        return () => clearTimeout(timer);
    }, [delivery, outcome, waiting]);

    function recovered(command: Command) {
        if (!request || !matchesWrite(request, command.target, command.requested)) return;
        const result = editor?.resolve(request.write.target, 'cloud')?.cloudDelivery?.(command);
        if (result) setRequest({ ...request, error: undefined, delivery: result });
    }

    async function send(action: string, write: WriteTarget | undefined, value: number | undefined, readback: Request['readback']) {
        if (!write || value === undefined || busy || submitting.current) return;
        submitting.current = true;
        const pending = { action, write, value, readback };
        setRequest(pending);
        try {
            setRequest({ ...pending, delivery: await write.path.write(write.observation, { values: [value] }) });
        } catch (error) {
            setRequest({ ...pending, error: message(error) });
        } finally {
            submitting.current = false;
        }
    }

    const feedback = request && (request.error ?? (delivery ?
        [delivery.status, request.outcome ?? (waiting ? 'Waiting for a newer observation' : undefined)].filter(Boolean).join(' · ') : 'Submitting…'));
    const status = <>
        {request && feedback && <p className="dw-meta mb-0" role="status">{request.action}: {feedback}</p>}
        {recovering && scope && <CommandRecovery scope={scope} onRecovered={recovered} />}
    </>;
    return { resolve, send, busy, status };
}
