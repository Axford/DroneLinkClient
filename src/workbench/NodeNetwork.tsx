import React, { useEffect, useRef, useState } from 'react';

export interface NodeNetworkSnapshot {
    schemaVersion: 1;
    node: number;
    receivedAt: number;
    interfaces: { channel: number; type: string; up: boolean; broadcast: boolean; peer?: number }[];
    routes: { destination: number; nextHop: number; channel?: number; cost: number; ageMs: number }[];
    queue: { size: number; utilisation: number; kicked: number; choked: number };
}

export default function NodeNetwork({ node, read, unavailable }: {
    node: number;
    read?: (signal: AbortSignal) => Promise<NodeNetworkSnapshot>;
    unavailable: string;
}) {
    const [snapshot, setSnapshot] = useState<NodeNetworkSnapshot>();
    const [stale, setStale] = useState(false);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const operation = useRef<AbortController | undefined>(undefined);
    useEffect(() => () => operation.current?.abort(), []);
    useEffect(() => {
        if (read) return;
        operation.current?.abort();
        operation.current = undefined;
        setBusy(false);
        setStale(true);
    }, [read]);

    async function refresh() {
        if (!read || operation.current) return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setError(undefined);
        try {
            const result = await read(controller.signal);
            if (controller.signal.aborted) return;
            if (result.node !== node || result.schemaVersion !== 1) throw new Error('Unexpected node network snapshot.');
            setSnapshot(result);
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

    return <section aria-label="Selected node network" className="dw-panel mb-3">
        <div className="dw-toolbar">
            <h3>Node {node} network</h3>
            <button type="button" className="btn btn-outline-secondary" onClick={() => void refresh()}
                disabled={!read || busy}>Refresh node network</button>
        </div>
        {busy && <p role="status">Reading node network…</p>}
        {!read && <p role="status">{unavailable}</p>}
        {error && <p role="alert">{error}</p>}
        {snapshot && <>
            <p className="dw-meta">{!read || stale ? 'Last seen' : 'Received'} from node {node} over direct Wi-Fi at{' '}
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
            </table></div> : <p>No routes reported by node {node}.</p>}
            <p className="mb-0">Transmit queue · {snapshot.queue.utilisation}% utilization · {snapshot.queue.size} slots ·{' '}
                {snapshot.queue.kicked} evicted · {snapshot.queue.choked} rejected</p>
        </>}
    </section>;
}
