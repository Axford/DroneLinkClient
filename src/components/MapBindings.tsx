import React from 'react';
import { NodeState } from '../dronelink/DroneLinkState';
import { mapBindings, locationCoordinates } from '../dronelink/mapBindings';
import { receiptLabel } from '../dronelink/observedPositions';

export interface MapBindingsProps { node: NodeState }
export default function MapBindings({ node }: MapBindingsProps) {
  const bindings = mapBindings(node);
  return <details className="small mb-3"><summary>Map source bindings</summary>
    <p>Higher mapping priority wins, then lower channel number. Receipt age does not change the selected source.</p>
    {Object.keys(bindings).length === 0 ? <p>No recognised map bindings received.</p> :
      <table className="table table-dark table-sm"><thead><tr><th>Role</th><th>Priority</th><th>Address / path</th><th>Observation</th></tr></thead>
        <tbody>{Object.values(bindings).map(binding => <tr key={binding.role}>
          <td>{binding.role}{binding.role !== 'location' && ' (visualisation deferred)'}</td>
          <td>{binding.priority}</td><td>{node.id}&gt;{binding.channelId}.{binding.parameterId}<br />{binding.path}</td>
          <td>{binding.reading.source || 'Unknown source'}<br />Received {receiptLabel(binding.reading.lastHeard)}</td>
        </tr>)}</tbody></table>}
    {bindings.location && !locationCoordinates(bindings.location) && <p>Selected location cannot be plotted. No lower-priority source is substituted.</p>}
  </details>;
}
