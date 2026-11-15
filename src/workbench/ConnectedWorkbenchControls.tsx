import { LastKnownParameterActions } from '../commands/ParameterEditor';
import React, { useState } from 'react';
import SettingsDialog from '../components/ui/SettingsDialog';
import ChannelList from '../components/ChannelList';
import { ObservationNamesContext } from '../components/parameterPresentation';
import type { GlobalState } from '../dronelink/DroneLinkState';
import { CommandScope } from '../commands/session';
import { NodeSource, useConnectedWorkbench } from './connectedWorkbench';

type Connection = ReturnType<typeof useConnectedWorkbench>;

export function GatewayConnection({ workbench, open, onClose }: { workbench: Connection; open: boolean; onClose: () => void }) {
    const [port, setPort] = useState('8002');
    const [key, setKey] = useState('');
    const label = workbench.status === 'connected' ? 'Local gateway connected'
        : workbench.status === 'reconnecting' ? 'Local gateway reconnecting…' : 'Connecting to local gateway…';
    const close = () => {
        onClose();
        setKey('');
        if (!workbench.paired) workbench.disconnect();
    };
    return <SettingsDialog title="Local gateway" compact show={open} onHide={close}>
        {workbench.paired ? <>
            <span role="status">{label}</span>
            <div><button type="button" className="btn btn-outline-secondary" onClick={() => { workbench.disconnect(); onClose(); }}>Disconnect local gateway</button></div>
        </> : <form className="dw-gateway-form" onSubmit={event => {
            event.preventDefault();
            const supplied = key;
            setKey('');
            void workbench.connect(port, supplied);
        }}>
            <label>Gateway port <input className="form-control" inputMode="numeric" maxLength={5} value={port} onChange={event => setPort(event.target.value)} /></label>
            <label>Pairing key <input className="form-control" type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
            <div className="dw-toolbar">
                <button type="submit" className="btn btn-primary" disabled={workbench.busy}>Connect</button>
                <button type="button" className="btn btn-outline-secondary" onClick={close}>Cancel</button>
            </div>
        </form>}
        {workbench.error && <span role="alert">{workbench.error}</span>}
    </SettingsDialog>;
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
    const gateway = workbench.networkSession?.gatewayId;
    const wifi = workbench.network?.paths.wifi[node];
    return <>
            {!transport && <p>The selected local route is unavailable.</p>}
            {observed && <CommandScope.Provider value={null}>
                <ObservationNamesContext.Provider value={state}><ChannelList node={observed} sampleLive={!!transport}
                    motherboard={canQuery && workbench.fileBackups && gateway && transport === 'wifi' && wifi?.nextHop === node ? {
                        scope: JSON.stringify([gateway, observed.observationGeneration]),
                        read: signal => workbench.fileRequest(node, 'motherboard', { signal }),
                    } : undefined} /></ObservationNamesContext.Provider>
            </CommandScope.Provider>}
            {transport && !workbench.network?.observations[transport][node] &&
                <LastKnownParameterActions node={workbench.network?.lastKnown[transport][node]} />}
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
    </>;
}
