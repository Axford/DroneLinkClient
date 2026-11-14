import React, { useEffect, useRef, useState } from 'react';
import { transportLabel } from './useWorkbenchFeed';
import type { Transport } from './useWorkbenchFeed';

export interface TraceHop {
    node: number;
    metric?: number;
}

export interface RouteTraceResult {
    node: number;
    transport: Transport;
    gateway: number;
    receivedAt: number;
    roundTripMs: number;
    complete: boolean;
    recorded: TraceHop[];
    targetIndex: number;
    gatewayArrival?: TraceHop;
}

export type TraceRequest = (signal: AbortSignal) => Promise<RouteTraceResult>;

export function useRouteTrace(node?: number, transport?: Transport, routeKey?: string, request?: TraceRequest) {
    const [history, setHistory] = useState<RouteTraceResult[]>([]);
    const [visible, setVisible] = useState<RouteTraceResult>();
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [cooling, setCooling] = useState(false);
    const pending = useRef<AbortController | undefined>(undefined);
    const pendingTransport = useRef<Transport | undefined>(undefined);
    const cooldown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const available = !!request;
    const routeGeneration = useRef({ key: routeKey, generation: 0 });
    if (routeGeneration.current.key !== routeKey) {
        routeGeneration.current = { key: routeKey, generation: routeGeneration.current.generation + 1 };
    }

    useEffect(() => {
        setBusy(false);
        setError(undefined);
        return () => {
            pending.current?.abort();
            pending.current = undefined;
        };
    }, [node]);
    useEffect(() => {
        if (transport && pending.current && pendingTransport.current !== transport) {
            pending.current.abort();
            pending.current = undefined;
            setBusy(false);
        }
    }, [transport]);
    useEffect(() => setVisible(undefined), [node, transport, routeKey, available]);
    useEffect(() => () => clearTimeout(cooldown.current), []);

    async function run() {
        if (!request || pending.current || cooldown.current) return;
        const controller = new AbortController();
        pending.current = controller;
        pendingTransport.current = transport;
        const generation = routeGeneration.current.generation;
        setVisible(undefined);
        setBusy(true);
        setCooling(true);
        setError(undefined);
        cooldown.current = setTimeout(() => {
            cooldown.current = undefined;
            setCooling(false);
        }, 4000);
        try {
            const result = await request(controller.signal);
            if (!controller.signal.aborted) {
                if (result.node !== node || result.transport !== transport) throw new Error('Unexpected route trace reply.');
                setHistory(prior => [result, ...prior].slice(0, 5));
                if (generation === routeGeneration.current.generation) setVisible(result);
            }
        } catch (error) {
            if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Route trace unavailable.');
        } finally {
            if (pending.current === controller) {
                pending.current = undefined;
                setBusy(false);
            }
        }
    }

    return { history: history.filter(result => result.node === node && (!transport || result.transport === transport)),
        visible, error, busy, cooling, available, run };
}

export function traceLegs(trace: RouteTraceResult) {
    if (trace.targetIndex < 1) return { outbound: trace.recorded, returning: [] };
    return {
        outbound: trace.recorded.slice(0, trace.targetIndex + 1),
        returning: [{ node: trace.node }, ...trace.recorded.slice(trace.targetIndex + 1),
            ...(trace.gatewayArrival ? [trace.gatewayArrival] : [])],
    };
}

function HopList({ hops, gateway }: { hops: TraceHop[]; gateway: number }) {
    return <ol className="dw-trace-hops">
        {hops.map((hop, index) => <li key={index}>
            {hop.node === gateway ? `Gateway ${hop.node}` : `Node ${hop.node}`}
            {hop.metric !== undefined && <small> · metric {hop.metric}</small>}
        </li>)}
    </ol>;
}

export default function RouteTrace({ trace, connected }: { trace: ReturnType<typeof useRouteTrace>; connected: boolean }) {
    const { busy, error, history } = trace;
    const latest = history[0];
    if (!busy && !error && !latest) return null;

    return <section className="dw-panel dw-route-trace mb-3" id="workbench-route-trace" tabIndex={-1} aria-label="Route trace">
        <h3>Route trace</h3>
        {busy && <p role="status">Waiting for the trace reply…</p>}
        {error && <p role="alert">{error}</p>}
        <p className="visually-hidden" role="status">{!busy && !error && latest
            ? `Trace reply received in ${latest.roundTripMs} milliseconds.` : ''}</p>
        {history.map((entry, index) => {
            const { outbound, returning } = traceLegs(entry);
            return <details key={`${entry.receivedAt}:${entry.gateway}`} open={index === 0 || undefined}>
                <summary>{index === 0 && (!connected || entry !== trace.visible || error || busy) ? 'Previous trace · ' : ''}
                    Node {entry.node} · {transportLabel[entry.transport]} · {entry.roundTripMs} ms round trip
                    {' · '}<time dateTime={new Date(entry.receivedAt).toISOString()}>{new Date(entry.receivedAt).toLocaleTimeString()}</time>
                </summary>
                {!entry.complete && <p>Reply received · hop record incomplete</p>}
                <dl className="dw-trace-legs">
                    <div><dt>Outbound</dt><dd><HopList hops={outbound} gateway={entry.gateway} /></dd></div>
                    {returning.length > 1 && <div><dt>Return</dt><dd><HopList hops={returning} gateway={entry.gateway} /></dd></div>}
                </dl>
            </details>;
        })}
    </section>;
}
