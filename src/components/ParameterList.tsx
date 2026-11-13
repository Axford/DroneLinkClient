import React from 'react';
import { ParameterState } from '../dronelink/DroneLinkState';
import ParameterRow from './ParameterRow';
import parameterNames from '../dronelink/parameterNames.json';

interface ParameterListProps { nodeId: number; channelId: number; parameters: { [paramId: number]: ParameterState }; moduleType?: string; systemOpen: boolean; onToggleSystem: (open: boolean) => void }
export default function ParameterList({ nodeId, channelId, parameters, moduleType, systemOpen, onToggleSystem }: ParameterListProps) {
    const modules: Record<string, Record<number, string>> = parameterNames.modules;
    const catalog = moduleType && Object.prototype.hasOwnProperty.call(modules, moduleType)
        ? modules[moduleType] : modules.Drone;
    const entries = Object.entries(parameters).sort(([a], [b]) => Number(a) - Number(b));
    const rows = (system: boolean) => entries.filter(([id]) => (Number(id) < 8) === system).map(([id, parameter]) =>
        <ParameterRow key={id} nodeId={nodeId} channelId={channelId} parameterId={Number(id)} parameter={parameter} catalogName={catalog[Number(id)]} />);
    const systemCount = entries.filter(([id]) => Number(id) < 8).length;
    return <>
        <div className="dw-parameter-grid">{rows(false)}</div>
        {systemCount > 0 && <details className="dw-system-parameters" open={systemOpen}><summary data-inspector-focus={`system-${channelId}`} onClick={event => { event.preventDefault(); onToggleSystem(!systemOpen); }}>System parameters ({systemCount})</summary><div className="dw-parameter-grid">{rows(true)}</div></details>}
    </>;
}
