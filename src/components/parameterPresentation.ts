import { createContext } from 'react';
import { GlobalState, ParameterState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_ADDR, DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT } from '../dronelink/DroneLinkMsg';

// Supplied by the current Inspector only; name resolution never consults another Domain or retained history.
export const ObservationNamesContext = createContext<GlobalState>({});
export interface PresentedValue { display: string; exact: string; name?: string }
export interface ParameterPresentation { type: string | null; writable?: boolean; values: PresentedValue[] }

function exactNumber(value: number): string {
    return Object.is(value, -0) ? '-0' : String(value);
}

/** Presentation of decoded observations only; this does not decode packets or infer missing values/units. */
export function presentParameter(parameter: ParameterState, state: GlobalState = {}): ParameterPresentation {
    if (parameter.unavailable?.value || parameter.numValues === 0 || !parameter.values.length) return { type: null, values: [] };
    const type = ['UINT8', 'ADDR', 'UINT32', 'FLOAT', 'CHAR'][parameter.msgType] || 'Unknown';
    const values: PresentedValue[] = [];
    if (parameter.msgType === DRONE_LINK_MSG_TYPE_ADDR) {
        const bytes = parameter.values;
        if (bytes.length % 4 || bytes.some(value => typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255)) return { type: null, values: [] };
        for (let i = 0; i < bytes.length; i += 4) {
            const [source, nodeId, channelId, packed] = bytes.slice(i, i + 4) as number[];
            const paramId = packed & 63;
            const node = state[nodeId], channel = node?.channels[channelId], param = channel?.params[paramId];
            const paramName = param?.unavailable?.name ? undefined : param?.name;
            const name = node?.name || channel?.name || paramName
                ? `${node?.name || `Node ${nodeId}`} > ${channel?.name || `Channel ${channelId}`}.${paramName || `Param ${paramId}`}` : undefined;
            values.push({ display: `${source}:${nodeId}>${channelId}.${paramId}`, exact: `[${bytes.slice(i, i + 4).join(', ')}]`, name });
        }
    } else {
        for (const value of parameter.values) {
            const exact = typeof value === 'number' ? exactNumber(value) : JSON.stringify(value);
            const display = parameter.msgType === DRONE_LINK_MSG_TYPE_CHAR ? String(value) || '""'
                : typeof value !== 'number' ? String(value)
                : parameter.msgType === DRONE_LINK_MSG_TYPE_FLOAT && Number.isFinite(value)
                    ? (Object.is(value, -0) ? '-0.0000' : value.toFixed(4))
                    : parameter.msgType === DRONE_LINK_MSG_TYPE_FLOAT ? exactNumber(value) : value.toLocaleString();
            values.push({ display, exact });
        }
    }
    return { type, writable: parameter.writable, values };
}
