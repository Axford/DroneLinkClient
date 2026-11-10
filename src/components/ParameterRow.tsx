import React, { useContext, useState } from 'react';
import { InfoCircle, Lock, Unlock } from 'react-bootstrap-icons';
import { ParameterState } from '../dronelink/DroneLinkState';
import { receiptLabel } from '../dronelink/observedPositions';
import { ObservationNamesContext, presentParameter } from './parameterPresentation';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';

export interface ParameterRowProps { nodeId: number; channelId: number; parameterId: number; parameter: ParameterState }
export default function ParameterRow({ nodeId, channelId, parameterId, parameter }: ParameterRowProps) {
    const [details, setDetails] = useState(false);
    const names = useContext(ObservationNamesContext);
    const presentation = presentParameter(parameter, names);
    const name = (!parameter.unavailable?.name && parameter.name) || `Param ${parameterId}`;
    const receivedAt = presentation.values.length ? parameter.lastHeard : undefined;
    const address = `${nodeId}>${channelId}.${parameterId}`;
    const writability = presentation.writable === undefined ? 'Writability unavailable' : presentation.writable ? 'Observed writable' : 'Observed read-only';
    return <article className="parameter-row dw-parameter" aria-label={`Parameter ${address}`}>
        <header className="dw-parameter-header">
            <div className="dw-parameter-label"><strong>{name}</strong><div className="dw-meta">{address} · {presentation.type || 'Type unavailable'}</div></div>
            <span className="dw-parameter-writable" title={`${writability}. Packet metadata does not grant cloud permissions.`}>
                {presentation.writable !== undefined && (presentation.writable ? <Unlock aria-hidden="true" /> : <Lock aria-hidden="true" />)}
                <span className="visually-hidden">{writability}</span>
            </span>
            <IconButton label={`Parameter details: ${name}`} icon={<InfoCircle />} variant="link" onClick={() => setDetails(true)} />
        </header>
        {presentation.values.length ? <ul className="dw-parameter-values" aria-label={`Observed values for ${name}`}>
            {presentation.values.map((value, index) => <li key={index} aria-label={`Value ${index + 1}`}>
                <span className="font-monospace" title={`Exact decoded value: ${value.exact}`}>{value.display}</span>
                {value.name && <span className="dw-meta dw-address-name">{value.name}</span>}
            </li>)}
        </ul> : <p className="dw-meta mb-0">Value unavailable</p>}
        {parameter.unavailable?.name && <span className="dw-meta">Name unavailable</span>}
        {receivedAt ? <div className="dw-meta dw-parameter-receipt" title={`Server receipt: ${receiptLabel(receivedAt)}`}>{parameter.source || 'Unknown source'} · <time dateTime={new Date(receivedAt).toISOString()}>{new Date(receivedAt).toLocaleTimeString()}</time></div> : null}
        <SettingsDialog title={`Parameter details: ${name}`} show={details} onHide={() => setDetails(false)}>
            <SurfacePanel title="Observation">
                <dl><dt>Address</dt><dd>{address}</dd><dt>Type</dt><dd>{presentation.type || 'Unavailable'}</dd><dt>Observed writability</dt><dd>{writability}</dd><dt>Exact decoded values</dt><dd>
                    {presentation.values.length ? <ol className="dw-exact-values">{presentation.values.map((value, index) => <li key={index}><code>{value.exact}</code>{value.name && <div>{value.name}</div>}</li>)}</ol> : 'Value unavailable'}
                </dd></dl>
                {receivedAt ? <p>Received {new Date(receivedAt).toLocaleString()} · {parameter.source || 'Unknown source'}</p> : <p>No saved value receipt</p>}
                {parameter.unavailable?.value && <p>Value unavailable: {parameter.unavailable.value}</p>}
            </SurfacePanel>
            <SurfacePanel title="Provenance">
                {receivedAt && parameter.timestamp ? <p>Value last changed {new Date(parameter.timestamp).toLocaleString()}</p> : null}
                {parameter.nameLastHeard ? <p>Name received {new Date(parameter.nameLastHeard).toLocaleString()} via {parameter.nameSource || 'Unknown source'}</p> : null}
                {parameter.unavailable?.name && <p>Name unavailable: {parameter.unavailable.name}</p>}
                <p className="dw-meta">Observation only · Parameter commands unavailable until M2.</p>
            </SurfacePanel>
        </SettingsDialog>
    </article>;
}
