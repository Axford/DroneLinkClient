import React, { useState } from 'react';
import ChannelList from '../components/ChannelList';
import { NodeMapSettings } from '../components/NodeMapSettings';
import { ObservationNamesContext } from '../components/parameterPresentation';
import type { GlobalState } from '../dronelink/DroneLinkState';
import { CommandScope } from '../commands/session';
import { NodeSource, useConnectedWorkbench } from './connectedWorkbench';
import { transportLabel } from './useWorkbenchFeed';

type Connection = ReturnType<typeof useConnectedWorkbench>;

export function GatewayConnection({ workbench }: { workbench: Connection }) {
    const [port, setPort] = useState('8002');
    const [key, setKey] = useState('');
    const [editing, setEditing] = useState(false);
    return <section aria-label="Local Workbench connection" className="dw-toolbar mb-2">
        {workbench.paired ? <>
            <span role="status">{workbench.status === 'connected' ? 'Local gateway connected' : 'Connecting to local gateway…'}</span>
            <button type="button" className="btn btn-outline-secondary" onClick={() => { setEditing(false); workbench.disconnect(); }}>Disconnect local gateway</button>
        </> : editing ? <form className="dw-toolbar" onSubmit={event => {
            event.preventDefault();
            const supplied = key;
            setKey('');
            void workbench.connect(port, supplied);
        }}>
            <label>Gateway port <input className="form-control" inputMode="numeric" maxLength={5} value={port} onChange={event => setPort(event.target.value)} /></label>
            <label>Pairing key <input className="form-control" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
            <button type="submit" className="btn btn-primary" disabled={workbench.busy}>Connect</button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => { setKey(''); setEditing(false); workbench.disconnect(); }}>Cancel</button>
        </form> : <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(true)}>Connect local gateway</button>}
        {workbench.error && <span role="alert">{workbench.error}</span>}
    </section>;
}

export function SourceChoice({ node, workbench }: { node: number; workbench: Connection }) {
    return <label className="dw-workbench-transport">Node source
        <select className="form-select" value={workbench.choice(node)} onChange={event => workbench.choose(node, event.target.value as NodeSource)}>
            <option value="auto">Auto</option><option value="local">Local</option><option value="cloud">Cloud</option>
        </select>
    </label>;
}

export function ConnectedLocalInspector({ node, workbench, state, canQuery }: { node: number; workbench: Connection; state: GlobalState; canQuery: boolean }) {
    const [channel, setChannel] = useState('1');
    const [param, setParam] = useState('13');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
    const transport = workbench.transport(node);
    const observed = state[node];
    return <div className="inspector-panel text-white">
        <header className="inspector-header"><h2>Inspector</h2><NodeMapSettings nodeId={node} /></header>
        <div className="inspector-content">
            <p>Node {node} · Local{transport ? ` · ${transportLabel[transport]}` : ' · Last seen'}</p>
            {!transport && <p>The selected local route is unavailable.</p>}
            {observed && <CommandScope.Provider value={null}>
                <ObservationNamesContext.Provider value={state}><ChannelList node={observed} /></ObservationNamesContext.Provider>
            </CommandScope.Provider>}
            {canQuery && <form className="dw-toolbar" onSubmit={event => {
                event.preventDefault();
                if (busy || !transport) return;
                setBusy(true); setFeedback(undefined);
                void workbench.query(node, Number(channel), Number(param)).then(
                    () => setFeedback({ error: false, text: 'Local query queued. Watch for a fresh observation.' }),
                    error => setFeedback({ error: true, text: error.message }),
                ).finally(() => setBusy(false));
            }}>
                <label>Query channel <input className="form-control" type="number" required min={1} max={254} value={channel} onChange={event => setChannel(event.target.value)} /></label>
                <label>Query parameter <input className="form-control" type="number" required min={1} max={63} value={param} onChange={event => setParam(event.target.value)} /></label>
                <button type="submit" className="btn btn-primary" disabled={busy || !transport}>Query local value</button>
            </form>}
            {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
        </div>
    </div>;
}
