import { useContext, useEffect, useRef, useState } from 'react';
import { CommandRecovery } from '../commands/CommandControls';
import type { Command, Target } from '../commands/model';
import { type Delivery, type ParameterPath, ParameterEditorContext } from '../commands/ParameterEditor';
import { message, useCommandJournal, useCommandScope } from '../commands/session';
import { DRONE_LINK_MSG_TYPE_UINT8_T as UINT8 } from '../dronelink/DroneLinkMsg';
import type { WaypointSummary } from '../dronelink/moduleVisualizations';
import { useMapCamera } from './MapCamera';

const MODE = 8;
const INDEX = 10;

type Action = 'Restart' | 'Next' | 'Reload';
interface Request {
    action: Action;
    target: Target;
    pathId: string;
    value: number;
    delivery?: Delivery;
    error?: string;
    outcome?: string;
}

function writableByte(path?: ParameterPath) {
    const observation = path?.sample.observation;
    if (path?.available && observation?.expected.writable && observation.expected.msgType === UINT8 &&
        observation.expected.payloadBytes === 1 && observation.bytes.length === 1) return observation;
}

function sameTarget(a: Target, b: Target) {
    return a.nodeAddress === b.nodeAddress && a.channel === b.channel && a.param === b.param;
}

export default function WaypointActions({ nodeId, channelId, summary }: {
    nodeId: number; channelId: number; summary: WaypointSummary;
}) {
    const editor = useContext(ParameterEditorContext);
    const center = useMapCamera();
    const scope = useCommandScope();
    const { attempt } = useCommandJournal(scope);
    const [request, setRequest] = useState<Request>();
    const submitting = useRef(false);
    const indexTarget = { nodeAddress: nodeId, channel: channelId, param: INDEX };
    const modeTarget = { ...indexTarget, param: MODE };
    const indexPath = editor?.resolve(indexTarget);
    const modePath = editor?.resolve(modeTarget);
    const indexWrite = writableByte(indexPath);
    const modeWrite = writableByte(modePath);
    const hasRoute = (summary.count ?? 0) > 0;
    const next = summary.index !== undefined && summary.index === indexWrite?.bytes[0] &&
        summary.count !== undefined && summary.index + 1 < summary.count ? summary.index + 1 : undefined;
    const delivery = request?.delivery;
    const refresh = delivery?.refresh;
    const waiting = request && !request.outcome && !!delivery?.awaitingObservation;
    const recovering = !!request?.error && request.pathId === 'cloud' && attempt?.request &&
        attempt.status !== 'rejected' && sameTarget(attempt.request.target, request.target);
    const inFlight = request && !request.error && (!delivery || refresh || waiting);
    const busy = !!(inFlight || recovering);
    const readbackPath = request && editor?.resolve(request.target, request.pathId);
    const sample = readbackPath?.id === request?.pathId ? readbackPath?.sample : undefined;
    const observed = sample?.value;
    const newer = waiting && delivery.receivedAfterMs !== undefined &&
        (sample?.receivedAt ?? 0) > delivery.receivedAfterMs && observed?.msgType === UINT8 && observed.bytes.length === 1;
    const outcome = newer && (request.action === 'Reload' ? 'Newer mode received; file reload unconfirmed' :
        observed.bytes[0] === request.value ? 'Newer waypoint matches' : 'Newer waypoint differs');

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
        if (!request || !sameTarget(command.target, request.target)) return;
        const result = editor?.resolve(request.target, 'cloud')?.cloudDelivery?.(command);
        if (result) setRequest({ ...request, error: undefined, delivery: result });
    }

    async function send(action: Action, target: Target, path: ParameterPath | undefined, value?: number) {
        const observation = writableByte(path);
        if (!path || !observation || value === undefined || busy || submitting.current) return;
        submitting.current = true;
        const pending = { action, target, pathId: path.id, value };
        setRequest(pending);
        try {
            setRequest({ ...pending, delivery: await path.write(observation, { values: [value] }) });
        } catch (error) {
            setRequest({ ...pending, error: message(error) });
        } finally {
            submitting.current = false;
        }
    }

    const { target } = summary;
    const feedback = request && (request.error ?? (delivery ?
        [delivery.status, request.outcome ?? (waiting ? 'Waiting for a newer observation' : undefined)].filter(Boolean).join(' · ') : 'Submitting…'));
    return <div className="dw-summary-actions">
        <div className="dw-summary-action-row" role="group" aria-label="Waypoint actions">
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-disabled={!hasRoute || !indexWrite || busy}
                data-inspector-focus={`waypoint-restart-${channelId}`}
                title="Start the loaded route at waypoint 1" onClick={() => void send('Restart', indexTarget, indexPath, hasRoute ? 0 : undefined)}>Restart</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-disabled={next === undefined || busy}
                data-inspector-focus={`waypoint-next-${channelId}`}
                title="Select the next waypoint in the loaded route" onClick={() => void send('Next', indexTarget, indexPath, next)}>Next</button>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-disabled={!center || !target}
                data-inspector-focus={`waypoint-goto-${channelId}`}
                title="Center the map on the observed waypoint target" onClick={() => target && center?.(target)}>Goto</button>
            <button type="button" className="btn btn-sm btn-outline-warning dw-summary-action-emphasis" aria-disabled={!modeWrite || busy}
                data-inspector-focus={`waypoint-reload-${channelId}`}
                title="Reread waypoint.csv and return to waypoint 1" onClick={() => void send('Reload', modeTarget, modePath, 1)}>Reload</button>
        </div>
        {feedback && <p className="dw-meta mb-0" role="status">{request.action}: {feedback}</p>}
        {recovering && scope && <CommandRecovery scope={scope} onRecovered={recovered} />}
    </div>;
}
