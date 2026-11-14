import { useContext, useEffect, useRef, useState } from 'react';
import { PauseFill, PlayFill } from 'react-bootstrap-icons';
import { DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_MODULE_PARAM_STATUS } from '../dronelink/DroneLinkMsg';
import { Delivery, ParameterEditorContext } from '../commands/ParameterEditor';
import { message } from '../commands/session';
import IconButton from './ui/IconButton';

interface Request {
    path: string;
    value: number;
    delivery?: Delivery;
    error?: string;
}

export default function ModuleStatusAction({ node, channel, name, status }: {
    node: number;
    channel: number;
    name: string;
    status?: number;
}) {
    const editor = useContext(ParameterEditorContext);
    const [request, setRequest] = useState<Request>();
    const [elapsed, setElapsed] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [queryError, setQueryError] = useState('');
    const submitting = useRef(false);
    const target = { nodeAddress: node, channel, param: DRONE_MODULE_PARAM_STATUS };
    const path = editor?.resolve(target);
    const observation = path?.sample.observation;
    const observed = path?.sample.value;
    const knownStatus = status === 0 || status === 1 || status === 2;
    const compatible = observation?.expected.msgType === DRONE_LINK_MSG_TYPE_UINT8_T &&
        observation.expected.payloadBytes === 1 && knownStatus && observation.bytes[0] === status;
    const value = status === 0 ? 1 : 0;
    const label = `${value ? 'Enable' : 'Disable'} ${name}`;
    const delivery = request?.delivery;
    const refresh = delivery?.refresh;
    const samePath = !!request && path?.id === request.path;
    const canObserveResult = !!delivery && (delivery.awaitingObservation);
    const received = samePath && canObserveResult && delivery?.receivedAfterMs !== undefined &&
        (path?.sample.receivedAt ?? 0) > delivery.receivedAfterMs &&
        observed?.msgType === DRONE_LINK_MSG_TYPE_UINT8_T && observed.bytes.length === 1;
    const matches = confirmed || (received && (request.value === 1 ? observed.bytes[0] > 0 : observed.bytes[0] === 0));
    const pending = !!request && !request.error && (!delivery || (!matches && !elapsed &&
        (refresh || canObserveResult)));
    const feedback = request && (request.error ?? (!delivery ? 'Submitting…' :
        matches ? 'Newer status observation matches' : refresh ? 'Pending retrieval' :
            !canObserveResult ? delivery.status : !samePath || !path?.available || elapsed ?
                (received ? 'Newer status observation differs' : 'Write outcome unknown') :
                'Waiting for a newer status observation'));

    useEffect(() => { if (matches) setConfirmed(true); }, [matches]);

    useEffect(() => {
        if (matches || !canObserveResult || !delivery) return;
        const timer = setTimeout(() => setElapsed(true), 15000);
        return () => clearTimeout(timer);
    }, [delivery, canObserveResult, matches]);

    useEffect(() => {
        if (!refresh) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const next = await refresh();
                if (!stopped) setRequest(current => current?.delivery === delivery && current ? { ...current, delivery: next } : current);
            } catch {
                if (!stopped) timer = setTimeout(poll, 3000);
            }
        };
        timer = setTimeout(poll, 1500);
        return () => { stopped = true; clearTimeout(timer); };
    }, [refresh]);

    async function write() {
        if (!path?.available || !compatible || pending || submitting.current) return;
        submitting.current = true;
        const next = { path: path.id, value };
        setElapsed(false);
        setConfirmed(false);
        setQueryError('');
        setRequest(next);
        try {
            setRequest({ ...next, delivery: await path.write(observation, { values: [value] }) });
        } catch (error) {
            setRequest({ ...next, error: message(error) });
        } finally {
            submitting.current = false;
        }
    }

    if (!editor || (!request && (!path?.available || !compatible))) return null;
    return <>
        <IconButton className="dw-module-status-action" label={label} type="button" data-inspector-focus={`status-${channel}`}
            aria-disabled={!path?.available || !compatible || !!pending}
            icon={value ? <PlayFill aria-hidden="true" /> : <PauseFill aria-hidden="true" />} onClick={() => void write()} />
        {feedback && <span className="dw-module-status-feedback dw-meta" role="status">{queryError || feedback}</span>}
        {delivery?.local && elapsed && !matches && samePath && path?.available &&
            <button type="button" className="btn btn-link btn-sm" onClick={() => {
                setQueryError('');
                void path.query().catch(error => setQueryError(message(error)));
            }}>Query status</button>}
    </>;
}
