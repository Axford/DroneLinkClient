import React from 'react';
import { Badge } from 'react-bootstrap';
import { ParameterState } from '../dronelink/DroneLinkState';
export interface ParameterRowProps { nodeId: number; channelId: number; parameterId: number; parameter: ParameterState; onParameterEdit?: (value: number[]) => void }
export default function ParameterRow({ parameterId, parameter }: ParameterRowProps) {
  const value = parameter.values?.map(value => typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(4) : String(value)).join(', ') || 'N/A';
  return <div className="parameter-row d-flex justify-content-between gap-2"><div><small className="text-white fw-medium">{parameter.name || `Param ${parameterId}`}</small> <small className="text-secondary">({parameterId})</small>
    {parameter.lastHeard && <Badge bg="secondary" className="ms-2">Received {new Date(parameter.lastHeard).toLocaleTimeString()}</Badge>}
  {parameter.timestamp && <small className="text-secondary ms-2">Value last changed {new Date(parameter.timestamp).toLocaleString()}</small>}
    {parameter.source && <small className="text-secondary ms-2">{parameter.source}</small>}
    {parameter.nameLastHeard && <small className="text-secondary ms-2">Name received {new Date(parameter.nameLastHeard).toLocaleString()} via {parameter.nameSource}</small>}
  </div><div><Badge bg="secondary" className="font-monospace">{value}</Badge><span className="visually-hidden">Parameter commands unavailable until M2</span></div></div>;
}
