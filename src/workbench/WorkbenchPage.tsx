import React, { useState } from 'react';
import ChannelList from '../components/ChannelList';
import { InspectorSessionProvider } from '../components/InspectorSession';
import { ObservationNamesContext } from '../components/parameterPresentation';
import { useWorkbenchFeed } from './useWorkbenchFeed';
import './workbench.css';

export default function WorkbenchPage() {
    const { status, routes, observations } = useWorkbenchFeed();
    const [selectedNode, selectNode] = useState<number>();
    const connected = status === 'connected';
    const route = selectedNode === undefined ? undefined : routes[selectedNode];
    const node = selectedNode === undefined ? undefined : observations[selectedNode];

    return <main className="dw-workbench">
        <header className="dw-toolbar">
            <h1>Workbench</h1>
            <span role="status">{connected ? 'Local gateway connected' : status === 'connecting' ? 'Connecting to local gateway…' : 'Local gateway disconnected. Reconnecting…'}</span>
        </header>
        <div className="dw-workbench-panels">
            <section aria-labelledby="workbench-nodes">
                <h2 id="workbench-nodes">Nodes</h2>
                {Object.keys(routes).length === 0 && <p>Waiting for local routes.</p>}
                <ul className="list-unstyled">
                    {Object.values(routes).map(item => <li key={item.node}>
                        <button type="button" className="btn btn-outline-secondary text-start mb-2 w-100" aria-pressed={item.node === selectedNode} onClick={() => selectNode(item.node)}>
                            {observations[item.node]?.name || `Node ${item.node}`} · {connected ? item.reachable ? 'Reachable' : 'Route expired' : 'Gateway disconnected'}
                            <span className="d-block dw-meta">Address {item.node} · Next hop {item.nextHop}</span>
                        </button>
                    </li>)}
                </ul>
            </section>
            <section aria-labelledby="workbench-inspector">
                <h2 id="workbench-inspector">Inspector</h2>
                {selectedNode === undefined ? <p>Select a node to inspect its observations.</p> : <>
                    <p>Node {selectedNode} · Local{node && (!connected || !route?.reachable) ? ' · Last seen' : ''}</p>
                    {!node && <p>{connected && route?.reachable ? 'Waiting for publications.' : 'Local route unavailable.'}</p>}
                    {node && <InspectorSessionProvider nodes={observations} inventoryComplete={false}>
                        <ObservationNamesContext.Provider value={observations}>
                            <ChannelList key={node.id} node={node} />
                        </ObservationNamesContext.Provider>
                    </InspectorSessionProvider>}
                </>}
            </section>
        </div>
    </main>;
}
