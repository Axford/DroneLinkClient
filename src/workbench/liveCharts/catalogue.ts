import { createContext } from 'react';
import type { GlobalState } from '../../dronelink/DroneLinkState';
import { observedModuleType } from '../../dronelink/moduleVisualizations';
import names from '../../dronelink/parameterNames.json';
import { isNumeric, SignalAddress, signalKey } from './capture';

export interface Signal extends SignalAddress {
    id: string;
    name: string;
    location: string;
    unit?: string;
}

const modules: Record<string, Record<number, string>> = names.modules;
// Units verified against the firmware and existing instrument definitions.
const units: Record<string, Record<number, string>> = {
    Management: { 11: 'B', 13: 's' },
    INA219: { 10: 'V', 11: 'V', 12: 'A', 13: 'W', 14: 'V', 15: 'V', 19: 'Ah' },
    INA3221: { 10: 'V', 12: 'A', 13: 'W', 14: 'V', 15: 'V', 20: 'Ah' },
    Servo: { 12: '°', 13: '°', 14: '°' },
};

export function signalCatalogue(nodes: GlobalState): Signal[] {
    return Object.keys(nodes).map(id => nodes[Number(id)]).flatMap(node => Object.keys(node.channels).map(id => node.channels[Number(id)]).flatMap(channel => {
        const type = observedModuleType(channel);
        const catalog = type && Object.prototype.hasOwnProperty.call(modules, type) ? modules[type] : modules.Drone;
        return Object.keys(channel.params).map(id => channel.params[Number(id)]).flatMap(parameter => {
            if (parameter.unavailable?.value || !isNumeric(parameter.msgType)) return [];
            const name = (!parameter.unavailable?.name && parameter.name?.trim()) || catalog[parameter.param] || `Param ${parameter.param}`;
            return Array.from({ length: parameter.numValues }, (_, component) => {
                const address = { node: node.id, channel: channel.channel, parameter: parameter.param, component };
                return { ...address, id: signalKey(address), name: parameter.numValues > 1 ? `${name} [${component + 1}]` : name,
                    location: `${node.name || 'Node ' + node.id} › ${channel.name || type || 'Channel ' + channel.channel}`,
                    unit: type && Object.prototype.hasOwnProperty.call(units, type) ? units[type][parameter.param] : undefined };
            });
        });
    }));
}

export const SignalPlotContext = createContext<((node: number, channel: number, parameter: number) => void) | undefined>(undefined);
