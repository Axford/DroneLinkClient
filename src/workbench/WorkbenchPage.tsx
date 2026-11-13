import React, { useCallback, useMemo, useState } from 'react';
import { DomainLensPanels, DomainWorkspace } from '../components/DomainWorkspace';
import NodeInspector from '../components/NodeInspector';
import NodeSelector from '../components/NodeSelector';
import NodeFiles from './NodeFiles';
import ChannelList from '../components/ChannelList';
import { InspectorSessionProvider } from '../components/InspectorSession';
import { ObservationNamesContext } from '../components/parameterPresentation';
import { Transport, transportLabel, transports, useWorkbenchFeed } from './useWorkbenchFeed';
import './workbench.css';

type Selection = 'auto' | Transport;
const lenses = [{ id: 'nodes', label: 'Nodes' }, { id: 'network', label: 'Network' }] as const;

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
    const [lens, setLens] = useState<string>('nodes');
    const [selectedNode, selectNode] = useState<number>();
    const [files, setFiles] = useState({ busy: false, dirty: false });
    const reportFiles = useCallback((busy: boolean, dirty: boolean) => setFiles({ busy, dirty }), []);
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

    function select(id: number) {
        if (id === selectedNode) return true;
        if (files.busy || (files.dirty && !window.confirm('Discard the unsaved node file draft?'))) return false;
        selectNode(id);
        return true;
    }

    const selector = <NodeSelector inline nodes={nodes.map(id => {
        const route = routes[id];
        return (route && observations[route.transport][id]) ?? {
            id, channels: {}, lastHeard: route?.lastHeardAtMs ?? 0, interface: 'Local',
        };
    })} selectedNodeId={selectedNode ?? null} onNodeSelect={select} selectionDisabled={files.busy} now={Date.now()}
        status={id => connected ? routes[id]?.reachable ? 'Reachable' : 'Route expired' : 'Gateway disconnected'} />;
    const transportChoice = selectedNode !== undefined && showTransport && <label className="dw-workbench-transport">Transport
        <select className="form-select" value={choice} disabled={files.busy} onChange={event => setChoice(event.target.value as Selection)}>
            <option value="auto">Auto</option>
            {transports.map(transport => <option key={transport} value={transport} disabled={!interfaces[transport]}>{transportLabel[transport]}</option>)}
        </select>
    </label>;
    const modules = selectedNode === undefined ? <p>Select a node to inspect its observations.</p> : <>
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
    </>;
    const network = <section aria-labelledby="workbench-network" className="dw-workbench-network">
        <h2 id="workbench-network">Gateway network</h2>
        {!showTransport && <p>Waiting for gateway interfaces.</p>}
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
                return <tr key={`${id}:${transport}`}><th scope="row"><button type="button" className="btn btn-link p-0" aria-label={`Inspect node ${id} from ${transportLabel[transport]} route`}
                    aria-pressed={id === selectedNode} disabled={files.busy && id !== selectedNode} onClick={() => select(id)}>{id}</button></th><td>{transportLabel[transport]}</td><td>{route.nextHop}</td>
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
    </section>;


    return <div className="dw-workspace" data-bs-theme="dark"><main className="content-wrapper workspace-operations">
        <DomainWorkspace name="Workbench" lenses={lenses} activeLens={lens} onLensChange={setLens}
            status={<span className="dw-status" role="status">{connected ? 'Local gateway connected' : status === 'connecting' ?
                'Connecting to local gateway…' : 'Local gateway disconnected. Reconnecting…'}</span>}>
            <DomainLensPanels lens={<div className={`dw-workbench-lens dw-workbench-lens-${lens}`}>
                {selector}
                {lens === 'network' && network}
            </div>} inspector={<NodeInspector key={selectedNode} selected={selectedNode !== undefined}
                context={transportChoice} modules={modules}
                files={selectedNode !== undefined && <NodeFiles node={selectedNode} transport={active}
                    available={connected && !!path?.reachable} uptimeMs={path?.uptimeMs} activity={reportFiles} />} />} />
        </DomainWorkspace>
    </main></div>;
}
