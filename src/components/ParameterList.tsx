import React from 'react';
import { ParameterState } from '../dronelink/DroneLinkState';
import ParameterRow from './ParameterRow';

interface ParameterListProps { nodeId: number; channelId: number; parameters: { [paramId: number]: ParameterState } }
export default function ParameterList({ nodeId, channelId, parameters }: ParameterListProps) {
    const entries = Object.entries(parameters).sort(([a], [b]) => Number(a) - Number(b));
    const rows = (system: boolean) => entries.filter(([id]) => (Number(id) < 8) === system).map(([id, parameter]) =>
        <ParameterRow key={id} nodeId={nodeId} channelId={channelId} parameterId={Number(id)} parameter={parameter} />);
    const systemCount = entries.filter(([id]) => Number(id) < 8).length;
    return <>
        <div className="dw-parameter-grid">{rows(false)}</div>
        {systemCount > 0 && <details className="dw-system-parameters"><summary>System parameters ({systemCount})</summary><div className="dw-parameter-grid">{rows(true)}</div></details>}
    </>;
}
