import React, { useState } from 'react';
import { InfoCircle } from 'react-bootstrap-icons';
import { ParameterState } from '../dronelink/DroneLinkState';
import { receiptLabel } from '../dronelink/observedPositions';
import { ParameterCommands } from '../commands/CommandControls';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';
export interface ParameterRowProps { nodeId: number; channelId: number; parameterId: number; parameter: ParameterState; onParameterEdit?: (value: number[]) => void }
export default function ParameterRow({ nodeId, channelId, parameterId, parameter }: ParameterRowProps) {
  const [details, setDetails] = useState(false);
  const name = parameter.name || `Param ${parameterId}`;
  const value = parameter.values?.map(value => typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(4) : String(value)).join(', ') || 'N/A';
  return <div className="parameter-row dw-parameter">
    <div className="dw-parameter-label"><strong>{name}</strong> <span className="dw-meta">{parameterId}</span>
      {parameter.lastHeard && <div className="dw-meta">{parameter.source || 'Unknown source'} · {receiptLabel(parameter.lastHeard)}</div>}
    </div>
    <span className="dw-parameter-value font-monospace">{value}</span>
    <IconButton label={`Parameter details: ${name}`} icon={<InfoCircle />} variant="link" onClick={() => setDetails(true)} />
    <SettingsDialog title={`Parameter details: ${name}`} show={details} onHide={() => setDetails(false)}>
      <SurfacePanel title="Observation"><dl><dt>Address</dt><dd>{nodeId}&gt;{channelId}.{parameterId}</dd><dt>Observed value</dt><dd className="font-monospace">{value}</dd></dl>
      {parameter.lastHeard && <p>Received {new Date(parameter.lastHeard).toLocaleString()} · {parameter.source || 'Unknown source'}</p>}
      </SurfacePanel><SurfacePanel title="Provenance">
      {parameter.timestamp && <p>Value last changed {new Date(parameter.timestamp).toLocaleString()}</p>}
      {parameter.nameLastHeard && <p>Name received {new Date(parameter.nameLastHeard).toLocaleString()} via {parameter.nameSource}</p>}
      </SurfacePanel>
      {details && <ParameterCommands target={{ nodeAddress: nodeId, channel: channelId, param: parameterId }} observation={parameter.writeObservation} />}
    </SettingsDialog>
  </div>;
}
