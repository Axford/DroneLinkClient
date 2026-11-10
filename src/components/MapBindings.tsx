import React, { useState } from 'react';
import { Compass } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import { NodeState } from '../dronelink/DroneLinkState';
import { mapBindings, locationCoordinates } from '../dronelink/mapBindings';
import { receiptLabel } from '../dronelink/observedPositions';

export interface MapBindingsProps { node: NodeState }
export default function MapBindings({ node }: MapBindingsProps) {
  const [show, setShow] = useState(false);
  const bindings = mapBindings(node);
  return <><IconButton label="Map source bindings" icon={<Compass />} onClick={() => setShow(true)} /><SettingsDialog title="Map source bindings" show={show} onHide={() => setShow(false)}>
    <p>Higher mapping priority wins, then lower channel number. Receipt age does not change the selected source.</p>
    {Object.keys(bindings).length === 0 ? <p>No recognised map bindings received.</p> :
      <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Role</th><th>Priority</th><th>Address / path</th><th>Observation</th></tr></thead>
        <tbody>{Object.values(bindings).map(binding => <tr key={binding.role}>
          <td>{binding.role}{binding.role !== 'location' && ' (visualisation deferred)'}</td>
          <td>{binding.priority}</td><td>{node.id}&gt;{binding.channelId}.{binding.parameterId}<br />{binding.path}</td>
          <td>{binding.reading.source || 'Unknown source'}<br />Received {receiptLabel(binding.reading.lastHeard)}</td>
        </tr>)}</tbody></table></div>}
    {bindings.location && !locationCoordinates(bindings.location) && <p>Selected location cannot be plotted. No lower-priority source is substituted.</p>}
  </SettingsDialog></>;
}
