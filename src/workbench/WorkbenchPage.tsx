import React, { useMemo, useState } from 'react';
import ChannelList from '../components/ChannelList';
import { InspectorSessionProvider } from '../components/InspectorSession';
import { ObservationNamesContext } from '../components/parameterPresentation';
import { Transport, transportLabel, transports, useWorkbenchFeed } from './useWorkbenchFeed';
import './workbench.css';

type Selection = 'auto' | Transport;

function readChoice(key: string): Selection {
    try {
        const choice = window.localStorage.getItem(key);
        if (choice === 'wifi' || choice === 'serial') return choice;
    } catch { /* The current page still works with browser storage disabled. */ }
    return 'auto';
}

function localTime(timestamp: number) {
    const date = new Date(timestamp);
    return <time dateTime={date.toISOString()}>{date.toLocaleTimeString()}</time>;
}

export default function WorkbenchPage() {
    const { status, routes, paths, observations, interfaces, diagnostics } = useWorkbenchFeed();
    const [selectedNode, selectNode] = useState<number>();
    const [choices, setChoices] = useState<Record<string, Selection>>({});
    const connected = status === 'connected';
    const gateway = transports.map(transport => interfaces[transport]?.address ?? '-').join('/');
    const key = `workbench-transport:${gateway}:${selectedNode}`;
    const savedChoice = useMemo(() => readChoice(key), [key]);
    const choice = choices[key] ?? savedChoice;
    const autoRoute = selectedNode === undefined ? undefined : routes[selectedNode];
    const active = choice === 'auto' ? autoRoute?.transport : choice;
    const path = active && selectedNode !== undefined ? paths[active][selectedNode] : undefined;
    const node = active && selectedNode !== undefined ? observations[active][selectedNode] : undefined;
    const configured = transports.filter(transport => interfaces[transport]);
    const nodes = Array.from(new Set([...Object.keys(routes), ...Object.keys(paths.wifi), ...Object.keys(paths.serial)].map(Number))).sort((a, b) => a - b);
    const showTransport = configured.length > 0;

    function setChoice(value: Selection) {
        setChoices(previous => ({ ...previous, [key]: value }));
        try { window.localStorage.setItem(key, value); }
        catch { /* The selection is retained for this page. */ }
    }

    return <main className="dw-workbench">
        <header className="dw-toolbar">
            <h1>Workbench</h1>
            <span role="status">{connected ? 'Local gateway connected' : status === 'connecting' ? 'Connecting to local gateway…' : 'Local gateway disconnected. Reconnecting…'}</span>
        </header>
        <div className="dw-workbench-panels">
            <section aria-labelledby="workbench-nodes">
                <h2 id="workbench-nodes">Nodes</h2>
                {nodes.length === 0 && <p>Waiting for local routes.</p>}
                <ul className="list-unstyled">
                    {nodes.map(id => {
                        const route = routes[id];
                        const name = (route && observations[route.transport][id]?.name) || `Node ${id}`;
                        return <li key={id}>
                            <button type="button" className="btn btn-outline-secondary text-start mb-2 w-100" aria-pressed={id === selectedNode} onClick={() => selectNode(id)}>
                                {name} · {connected ? route?.reachable ? 'Reachable' : 'Route expired' : 'Gateway disconnected'}
                                <span className="d-block dw-meta">Address {id}{route && ` · Next hop ${route.nextHop}`}</span>
                            </button>
                        </li>;
                    })}
                </ul>
            </section>
            <section aria-labelledby="workbench-inspector">
                <h2 id="workbench-inspector">Inspector</h2>
                {selectedNode === undefined ? <p>Select a node to inspect its observations.</p> : <>
                    {showTransport && <label className="dw-workbench-transport">Transport
                        <select className="form-select" value={choice} onChange={event => setChoice(event.target.value as Selection)}>
                            <option value="auto">Auto</option>
                            {transports.map(transport => <option key={transport} value={transport} disabled={!interfaces[transport]}>{transportLabel[transport]}</option>)}
                        </select>
                    </label>}
                    <p>Node {selectedNode} · Local{showTransport && active ? ` · ${transportLabel[active]}` : ''}{node && (!connected || !path?.reachable) ? ' · Last seen' : ''}</p>
                    {choice !== 'auto' && transports.filter(transport => transport !== choice).map(transport => {
                        const reading = observations[transport][selectedNode];
                        return reading && <p className="dw-meta" key={transport}>{transportLabel[transport]} last received {localTime(reading.lastHeard)}. Hidden by transport selection.</p>;
                    })}
                    {!node && <p>{connected && path?.reachable ? 'Waiting for publications.' : 'Local route unavailable.'}</p>}
                    {node && active && <InspectorSessionProvider key={active} nodes={observations[active]} inventoryComplete={false}>
                        <ObservationNamesContext.Provider value={observations[active]}>
                            <ChannelList key={node.id} node={node} sampleLive={connected && !!path?.reachable} />
                        </ObservationNamesContext.Provider>
                    </InspectorSessionProvider>}
                </>}
            </section>
        </div>
        {showTransport && <section aria-labelledby="workbench-network" className="dw-workbench-network">
            <h2 id="workbench-network">Network</h2>
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
            {nodes.length > 0 && <div className="table-responsive"><table className="table table-sm">
                <caption>Local routes</caption>
                <thead><tr><th>Node</th><th>Transport</th><th>Next hop</th><th>Cost</th><th>Last heard</th><th>Status</th></tr></thead>
                <tbody>{nodes.flatMap(id => configured.map(transport => {
                    const route = paths[transport][id];
                    if (!route) return null;
                    const selected = routes[id]?.transport === transport && routes[id].reachable;
                    return <tr key={`${id}:${transport}`}><th scope="row">{id}</th><td>{transportLabel[transport]}</td><td>{route.nextHop}</td>
                        <td>{route.metric ?? '—'}</td><td>{localTime(route.lastHeardAtMs)}</td><td>{!connected ? 'Last seen' : !route.reachable ? 'Expired' : selected ? 'Selected route' : 'Reachable'}</td></tr>;
                }))}</tbody>
            </table></div>}
            {interfaces.serial && <section aria-labelledby="workbench-serial-log">
                <h3 id="workbench-serial-log">Serial diagnostics</h3>
                {diagnostics.length === 0 ? <p>Waiting for framed serial diagnostics.</p> :
                    <ol className="dw-workbench-log list-unstyled" aria-label="Recent serial messages" tabIndex={0}>
                        {diagnostics.map(line => <li key={line.id}>{localTime(line.receivedAtMs)} <code>{line.text}</code></li>)}
                    </ol>}
            </section>}
        </section>}
    </main>;
}
