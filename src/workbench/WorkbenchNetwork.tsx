import React, { useRef } from 'react';
import NodeNetwork, { useNodeNetwork } from './NodeNetwork';
import NetworkGraph from './NetworkGraph';
import RouteTrace, { useRouteTrace } from './RouteTrace';
import type { TraceRequest } from './RouteTrace';
import { gatewayRouteStatus, networkTopology } from './networkTopology';
import type { NodeNetworkSnapshot } from './NodeNetwork';
import { transportLabel, transports, useWorkbenchFeed } from './useWorkbenchFeed';

function localTime(timestamp: number) {
    const date = new Date(timestamp);
    return <time dateTime={date.toISOString()}>{date.toLocaleTimeString()}</time>;
}

interface WorkbenchNetworkProps {
    feed: ReturnType<typeof useWorkbenchFeed>;
    selectedNode?: number;
    select: (node: number) => boolean;
    selectionDisabled: boolean;
    nodeTransport?: 'wifi' | 'serial';
    inspectedTransport?: 'wifi' | 'serial';
    readNode?: (signal: AbortSignal) => Promise<NodeNetworkSnapshot>;
    traceRoute?: TraceRequest;
}

export default function WorkbenchNetwork({ feed, selectedNode, select, selectionDisabled, nodeTransport, inspectedTransport, readNode, traceRoute }: WorkbenchNetworkProps) {
    const { status, paths, observations, interfaces, diagnostics } = feed;
    const route = selectedNode !== undefined && inspectedTransport ? paths[inspectedTransport][selectedNode] : undefined;
    const routeKey = traceRoute && route?.reachable ? `${interfaces[route.transport]?.address}:${route.nextHop}` : undefined;
    const trace = useRouteTrace(selectedNode, inspectedTransport, routeKey, traceRoute);
    const report = useNodeNetwork(selectedNode, nodeTransport, readNode);
    const gatewayDetails = useRef<HTMLDetailsElement>(null);
    const topology = networkTopology(feed, selectedNode, report.snapshot, report.stale, inspectedTransport, trace.available ? trace.visible : undefined);
    const connected = status === 'connected';
    const configured = transports.filter(transport => interfaces[transport]);
    const nodes = Array.from(new Set([...Object.keys(paths.wifi), ...Object.keys(paths.serial)].map(Number))).sort((a, b) => a - b);
    return <section aria-labelledby="workbench-network" className="dw-workbench-network">
        <h2 id="workbench-network">Gateway network</h2>
        <NetworkGraph topology={topology} selectedNode={selectedNode} snapshot={report.snapshot} stale={report.stale}
            connected={connected} selectionDisabled={selectionDisabled} select={select}
            runTrace={() => void trace.run()} tracing={trace.busy}
            canTrace={trace.available && !trace.cooling}
            traceStatus={trace.error ? 'Trace details · Unavailable' : trace.history[0] ?
                `${trace.visible ? 'Trace details' : 'Previous trace'} · ${trace.history[0].roundTripMs} ms` : undefined}
            refresh={() => void report.refresh()} reading={report.busy} canRead={report.available}
            inspectGateway={() => {
                if (!gatewayDetails.current) return;
                gatewayDetails.current.open = true;
                gatewayDetails.current.querySelector('summary')?.focus();
            }} />
        <RouteTrace trace={trace} connected={connected && trace.available} />
        {selectedNode !== undefined && <NodeNetwork node={selectedNode} report={report}
            unavailable={connected ? 'The selected node needs a direct Wi-Fi route.' : 'The gateway connection is unavailable.'} />}
        <details ref={gatewayDetails} className="dw-panel mb-3 dw-network-gateway-details">
            <summary>Gateway interfaces and routes</summary>
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
                    const focused = id === selectedNode;
                    const selectable = !selectionDisabled || focused;
                    return <tr key={`${id}:${transport}`} data-focused={focused} data-selectable={selectable}
                        onClick={selectable ? () => select(id) : undefined}><th scope="row"><button type="button" className="btn btn-link p-0 text-start text-decoration-none" aria-label={`Inspect node ${id} from ${transportLabel[transport]} route${name ? `: ${name}` : ''}`}
                        aria-pressed={focused} disabled={!selectable} onClick={event => { event.stopPropagation(); select(id); }}>{id}{name ? ` ${name}` : ''}</button></th><td>{transportLabel[transport]}</td><td>{route.nextHop}</td>
                        <td>{route.metric ?? '—'}</td><td>{localTime(route.lastHeardAtMs)}</td><td>{gatewayRouteStatus(feed, transport, id)}</td></tr>;
                }))}</tbody>
            </table></div>}
            {interfaces.serial && <section aria-labelledby="workbench-serial-log">
                <h3 id="workbench-serial-log">Serial diagnostics</h3>
                {diagnostics.length === 0 ? <p>Waiting for framed serial diagnostics.</p> :
                    <ol className="dw-workbench-log list-unstyled" aria-label="Recent serial messages" tabIndex={0}>
                        {diagnostics.map(line => <li key={line.id}>{localTime(line.receivedAtMs)} <code>{line.text}</code></li>)}
                    </ol>}
            </section>}
        </details>
    </section>;
}
