import React, { useEffect, useRef, useState } from 'react';

export interface NodeNetworkSnapshot {
    schemaVersion: 1;
    node: number;
    receivedAt: number;
    interfaces: { channel: number; type: string; up: boolean; broadcast: boolean; peer?: number }[];
    routes: { destination: number; nextHop: number; channel?: number; cost: number; ageMs: number }[];
    queue: { size: number; utilisation: number; kicked: number; choked: number };
}

export function useNodeNetwork(node: number | undefined, transport: string | undefined,
    read?: (signal: AbortSignal) => Promise<NodeNetworkSnapshot>) {
    const [samples, setSamples] = useState<{ current: NodeNetworkSnapshot; previous?: NodeNetworkSnapshot; transport?: string }>();
    const [stale, setStale] = useState(false);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const operation = useRef<AbortController | undefined>(undefined);
    const available = !!read;

    useEffect(() => {
        setSamples(undefined);
        setError(undefined);
        setStale(false);
    }, [node, transport]);

    useEffect(() => {
        setBusy(false);
        if (!available) setStale(true);
        return () => {
            operation.current?.abort();
            operation.current = undefined;
        };
    }, [node, transport, available]);

    async function refresh() {
        if (node === undefined || !read || operation.current) return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setError(undefined);
        try {
            const result = await read(controller.signal);
            if (controller.signal.aborted) return;
            if (result.node !== node || result.schemaVersion !== 1) throw new Error('Unexpected node network snapshot.');
            setSamples(prior => ({ current: result, previous: prior?.current, transport }));
            setStale(false);
        } catch (error) {
            if (!controller.signal.aborted) {
                setStale(true);
                setError(error instanceof Error ? error.message : 'Network snapshot unavailable.');
            }
        } finally {
            if (operation.current === controller) {
                operation.current = undefined;
                setBusy(false);
            }
        }
    }

    const snapshot = samples?.current.node === node && samples?.transport === transport ? samples?.current : undefined;
    return { snapshot, previous: snapshot ? samples?.previous : undefined, stale: !available || stale, error, busy, available, refresh };
}

export default function NodeNetwork({ node, report, unavailable }: {
    node: number;
    report: ReturnType<typeof useNodeNetwork>;
    unavailable: string;
}) {
    const { snapshot, previous, stale, error, busy, available } = report;
    const queue = snapshot?.queue;
    const prior = previous?.queue;
    const comparable = !stale && queue && prior && queue.size === prior.size &&
        queue.kicked >= prior.kicked && queue.choked >= prior.choked;

    return <section aria-label="Selected node network" className="dw-panel mb-3">
        <h3>Node {node} network</h3>
        {busy && <p role="status">Reading node network…</p>}
        {!available && <p role="status">{unavailable}</p>}
        {error && <p role="alert">{error}</p>}
        {!snapshot && available && !busy && !error && <p>Read node network to see its reported routes.</p>}
        {snapshot && <>
            <p className="dw-meta">{stale ? 'Last seen' : 'Received'} from node {node} over direct Wi-Fi at{' '}
                <time dateTime={new Date(snapshot.receivedAt).toISOString()}>{new Date(snapshot.receivedAt).toLocaleTimeString()}</time>.</p>
            <div className="dw-workbench-interfaces">
                {snapshot.interfaces.length ? snapshot.interfaces.map(item => <div className="dw-panel" key={item.channel}>
                    <strong>{item.type} · {item.up ? 'Up' : 'Down'}</strong>
                    <div>Module channel {item.channel} · {item.broadcast ? 'Broadcast' : item.peer ? `Peer ${item.peer}` : 'No peer'}</div>
                </div>) : <p>No mesh interfaces reported.</p>}
            </div>
            {snapshot.routes.length ? <div className="table-responsive"><table className="table table-sm">
                <caption>Routes reported by node {node}</caption>
                <thead><tr><th>Destination</th><th>Next hop</th><th>Interface channel</th><th>Cost</th><th>Age at snapshot</th></tr></thead>
                <tbody>{snapshot.routes.map(route => <tr key={route.destination}>
                    <th scope="row">{route.destination}</th><td>{route.nextHop}</td><td>{route.channel ?? '—'}</td>
                    <td>{route.cost}</td><td>{(route.ageMs / 1000).toFixed(1)} s</td>
                </tr>)}</tbody>
            </table></div> : <p>{stale ? 'No routes at last read from' : 'No routes reported by'} node {node}.</p>}
            <p className="mb-0">Transmit queue · {snapshot.queue.utilisation}% utilization · {snapshot.queue.size} slots ·{' '}
                {snapshot.queue.kicked} evicted · {snapshot.queue.choked} rejected</p>
            {comparable && previous && <p className="dw-meta mb-0">
                Counter change since read at <time dateTime={new Date(previous.receivedAt).toISOString()}>{new Date(previous.receivedAt).toLocaleTimeString()}</time>
                {' · '}+{queue.kicked - prior.kicked} evicted · +{queue.choked - prior.choked} rejected
            </p>}
        </>}
    </section>;
}
