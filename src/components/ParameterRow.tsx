import React, { useContext, useId, useState } from 'react';
import { ParameterState } from '../dronelink/DroneLinkState';
import { receiptLabel } from '../dronelink/observedPositions';
import { ObservationNamesContext, presentParameter } from './parameterPresentation';
import { ParameterCommands } from '../commands/CommandControls';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';

const shortTypes: Readonly<Partial<Record<string, string>>> = {
    UINT8: 'U8', ADDR: 'A', UINT32: 'U32', FLOAT: 'F', CHAR: 'C'
};

export interface ParameterRowProps { nodeId: number; channelId: number; parameterId: number; parameter: ParameterState; catalogName?: string }
export default function ParameterRow({ nodeId, channelId, parameterId, parameter, catalogName }: ParameterRowProps) {
    const [details, setDetails] = useState(false);
    const descriptionId = useId();
    const names = useContext(ObservationNamesContext);
    const presentation = presentParameter(parameter, names);
    const observedName = !parameter.unavailable?.name && parameter.name?.trim() ? parameter.name : undefined;
    const catalogLabel = observedName ? undefined : catalogName;
    const name = observedName ?? catalogLabel ?? `Param ${parameterId}`;
    const receivedAt = presentation.values.length ? parameter.lastHeard : undefined;
    const address = `${nodeId}>${channelId}.${parameterId}`;
    const writability = presentation.writable === undefined ? 'Writability unavailable' : presentation.writable ? 'Observed writable' : 'Observed read-only';
    const priority = presentation.type ? parameter.priority : undefined;
    return <article className="dw-parameter" aria-label={`Parameter ${address}`}>
        <button className="dw-parameter-tile" type="button" data-writable={presentation.writable}
            data-inspector-focus={`parameter-${channelId}-${parameterId}`} aria-label={`Parameter details: ${name}`}
            aria-describedby={descriptionId} onClick={() => setDetails(true)}>
            <span className="dw-parameter-heading">
                <strong>{name}</strong>
                <span className="dw-meta" aria-hidden="true">{address} · {shortTypes[presentation.type ?? ''] ?? '—'} · P{priority ?? '—'}</span>
            </span>
            <span className="visually-hidden" id={descriptionId}>
                {address} · {presentation.type || 'Type unavailable'} · Priority {priority ?? 'unavailable'} · {writability}
                {' · '}{presentation.values.map(value => value.name ? `${value.display}, ${value.name}` : value.display).join(' · ') || 'Value unavailable'}
                {catalogLabel && ' · Firmware catalog'}
                {receivedAt && <> · {parameter.source || 'Unknown source'} · <time dateTime={new Date(receivedAt).toISOString()}>{receiptLabel(receivedAt)}</time></>}
            </span>
            {presentation.values.length ? <span className="dw-parameter-values">
                {presentation.values.map((value, index) => <span key={index} title={`Exact decoded value: ${value.exact}`}>
                    {value.display}{value.name && <small className="dw-meta dw-address-name">{value.name}</small>}
                </span>)}
            </span> : <span className="dw-meta">Value unavailable</span>}
            {parameter.unavailable?.name && <span className="dw-meta">Name unavailable</span>}
        </button>
        <SettingsDialog title={`Parameter details: ${name}`} show={details} onHide={() => setDetails(false)}>
            <SurfacePanel title="Observation">
                <dl><dt>Address</dt><dd>{address}</dd><dt>Type</dt><dd>{presentation.type || 'Unavailable'}</dd><dt>Priority</dt><dd>{priority ?? 'Unavailable'}</dd><dt>Observed writability</dt><dd>{writability}</dd><dt>Exact decoded values</dt><dd>
                    {presentation.values.length ? <ol className="dw-exact-values">{presentation.values.map((value, index) => <li key={index}><code>{value.exact}</code>{value.name && <div>{value.name}</div>}</li>)}</ol> : 'Value unavailable'}
                </dd></dl>
                {receivedAt ? <p title={`${parameter.source === 'Local' ? 'Gateway' : 'Server'} receipt: ${receiptLabel(receivedAt)}`}>Received {new Date(receivedAt).toLocaleString()} · {parameter.source || 'Unknown source'}</p> : <p>No saved value receipt</p>}
                {parameter.unavailable?.value && <p>Value unavailable: {parameter.unavailable.value}</p>}
            </SurfacePanel>
            <SurfacePanel title="Provenance">
                {receivedAt && parameter.timestamp ? <p>Value last changed {new Date(parameter.timestamp).toLocaleString()}</p> : null}
                {catalogLabel && <p>Label from the firmware catalog.</p>}
                {observedName && parameter.nameLastHeard ? <p>Name received {new Date(parameter.nameLastHeard).toLocaleString()} via {parameter.nameSource || 'Unknown source'}</p> : null}
                {parameter.unavailable?.name && <p>Name unavailable: {parameter.unavailable.name}</p>}
            </SurfacePanel>
            {details && <ParameterCommands target={{ nodeAddress: nodeId, channel: channelId, param: parameterId }} observation={parameter.writeObservation} />}
        </SettingsDialog>
    </article>;
}
