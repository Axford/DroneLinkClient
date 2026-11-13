import React from 'react';
import { transportLabel, transports, useWorkbenchFeed } from './useWorkbenchFeed';

function localTime(timestamp: number) {
    const date = new Date(timestamp);
    return <time dateTime={date.toISOString()}>{date.toLocaleTimeString()}</time>;
}

export default function WorkbenchNetwork({ feed, selectedNode, select, selectionDisabled }: {
    feed: ReturnType<typeof useWorkbenchFeed>;
    selectedNode?: number;
    select: (node: number) => boolean;
    selectionDisabled: boolean;
}) {
    const { status, routes, paths, observations, interfaces, diagnostics } = feed;
    const connected = status === 'connected';
    const configured = transports.filter(transport => interfaces[transport]);
    const nodes = Array.from(new Set([...Object.keys(paths.wifi), ...Object.keys(paths.serial)].map(Number))).sort((a, b) => a - b);
    return <section aria-labelledby="workbench-network" className="dw-workbench-network">
        <h2 id="workbench-network">Gateway network</h2>
        {!configured.length && <p>Waiting for gateway interfaces.</p>}
        <div className="dw-workbench-interfaces">
            {configured.map(transport => {
                const adapter = interfaces[transport]!;
                return <section className="dw-panel" key={transport} aria-label={`${transportLabel[transport]} interface`}>
                    <h3>{transportLabel[transport]} · {connected ? adapter.up ? 'Up' : 'Down' : 'Last seen'}</h3>
                    <p>Gateway address {adapter.address}{adapter.port && ` · ${adapter.port}`}</p>
                    {adapter.error && <p>{adapter.error}</p>}
                    <p>{adapter.received} received · {adapter.sent} sent · {adapter.rejected} rejected · {adapter.bytesReceived} bytes</p>
                    {transport === 'serial' && <p>{adapter.diagnosticRecords} diagnostic records · {adapter.diagnosticRejected} rejected</p>}
                </section>;
            })}
        </div>
        {nodes.length > 0 && <div className="table-responsive"><table className="table table-sm dw-workbench-routes">
            <caption>Local routes</caption>
            <thead><tr><th>Node</th><th>Transport</th><th>Next hop</th><th>Cost</th><th>Last heard</th><th>Status</th></tr></thead>
            <tbody>{nodes.flatMap(id => configured.map(transport => {
                const route = paths[transport][id];
                if (!route) return null;
                const name = observations[transport][id]?.name || transports.map(source => observations[source][id]?.name).find(Boolean);
                const preferredRoute = routes[id]?.transport === transport && routes[id].reachable;
                const focused = id === selectedNode;
                const selectable = !selectionDisabled || focused;
                return <tr key={`${id}:${transport}`} data-focused={focused} data-selectable={selectable}
                    onClick={selectable ? () => select(id) : undefined}><th scope="row"><button type="button" className="btn btn-link p-0 text-start text-decoration-none" aria-label={`Inspect node ${id} from ${transportLabel[transport]} route${name ? `: ${name}` : ''}`}
                    aria-pressed={focused} disabled={!selectable} onClick={event => { event.stopPropagation(); select(id); }}>{id}{name ? ` ${name}` : ''}</button></th><td>{transportLabel[transport]}</td><td>{route.nextHop}</td>
                    <td>{route.metric ?? '—'}</td><td>{localTime(route.lastHeardAtMs)}</td><td>{!connected ? 'Last seen' : !route.reachable ? 'Expired' : preferredRoute ? 'Selected route' : 'Reachable'}</td></tr>;
            }))}</tbody>
        </table></div>}
        {interfaces.serial && <section aria-labelledby="workbench-serial-log">
            <h3 id="workbench-serial-log">Serial diagnostics</h3>
            {diagnostics.length === 0 ? <p>Waiting for framed serial diagnostics.</p> :
                <ol className="dw-workbench-log list-unstyled" aria-label="Recent serial messages" tabIndex={0}>
                    {diagnostics.map(line => <li key={line.id}>{localTime(line.receivedAtMs)} <code>{line.text}</code></li>)}
                </ol>}
        </section>}
    </section>;
}
