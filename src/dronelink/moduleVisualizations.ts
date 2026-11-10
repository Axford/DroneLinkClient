import { ChannelState, NodeState, ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_MODULE_PARAM_TYPE } from './DroneLinkMsg';
import { locationCoordinates, MapBinding, mapBindings } from './mapBindings';

export interface ObservedSummary {
    label: string;
    text: string;
    channelId: number;
    parameterId: number;
    reading?: ParameterState;
    severity?: 'warning' | 'danger';
    status?: string;
    binding?: MapBinding;
}

interface ModuleVisualization {
    summarize: (channel: ChannelState) => ObservedSummary[];
}

function numericValue(reading: ParameterState | undefined, types: number[]): number | undefined {
    if (!reading || reading.unavailable?.value || !reading.lastHeard || !Number.isFinite(reading.lastHeard) ||
        !types.includes(reading.msgType) || reading.numValues !== 1 || reading.values.length !== 1) return;
    const value = reading.values[0];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
}

const visualizations = new Map<string, ModuleVisualization>([
    ['NMEA', {
        summarize(channel) {
            const parameterId = 9;
            const reading = channel.params[parameterId];
            const count = numericValue(reading, [DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T]);
            const summary = { label: 'Satellites', text: '— sats', channelId: channel.channel, parameterId, reading };
            if (count === undefined || count < 0 || !Number.isInteger(count)) return [{ ...summary, status: 'Unavailable' }];
            const observed = { ...summary, text: `${count} sats` };
            if (count < 4) return [{ ...observed, severity: 'danger', status: 'Very low satellite count' }];
            if (count < 9) return [{ ...observed, severity: 'warning', status: 'Low satellite count' }];
            return [observed];
        }
    }],
    ['INA219', {
        summarize(channel) {
            const parameterId = 15;
            const reading = channel.params[parameterId];
            const volts = numericValue(reading, [DRONE_LINK_MSG_TYPE_FLOAT]);
            return [{ label: 'Cell voltage', text: volts === undefined ? 'Cell —' : `Cell ${volts.toFixed(2)} V`,
                channelId: channel.channel, parameterId, reading, status: volts === undefined ? 'Unavailable' : undefined }];
        }
    }]
]);

export function moduleSummaries(node: NodeState): ObservedSummary[] {
    const channelsByType = new Map<string, ChannelState[]>();
    for (const channel of Object.values(node.channels).sort((a, b) => a.channel - b.channel)) {
        const type = channel.params[DRONE_MODULE_PARAM_TYPE];
        if (type?.msgType !== DRONE_LINK_MSG_TYPE_CHAR || type.unavailable?.value || type.values.length !== 1) continue;
        const name = type.values[0];
        if (typeof name !== 'string' || !visualizations.has(name)) continue;
        const channels = channelsByType.get(name) ?? [];
        channels.push(channel);
        channelsByType.set(name, channels);
    }
    return Array.from(visualizations, ([type, plugin]) =>
        (channelsByType.get(type) ?? []).flatMap(channel => plugin.summarize(channel))).flat();
}

export function spatialSummaries(node: NodeState): ObservedSummary[] {
    const { location, heading } = mapBindings(node);
    const summaries: ObservedSummary[] = [];
    if (location) {
        const { reading } = location;
        const validShape = reading.numValues === 3 && reading.values.length === 3 && Number.isFinite(reading.values[2]);
        const coordinates = validShape && !reading.unavailable?.value && Number.isFinite(reading.lastHeard) ? locationCoordinates(location) : undefined;
        const text = coordinates ? `${coordinates[1].toFixed(5)}°, ${coordinates[0].toFixed(5)}°` : 'Position —';
        summaries.push({ ...location, binding: location, label: 'Position', text, status: coordinates ? undefined : 'Unavailable' });
    }
    if (heading) {
        const degrees = numericValue(heading.reading, [DRONE_LINK_MSG_TYPE_FLOAT]);
        summaries.push({ ...heading, binding: heading, label: 'Heading', text: degrees === undefined ? 'Heading —' : `Heading ${degrees.toFixed(1)}°`,
            status: degrees === undefined ? 'Unavailable' : undefined });
    }
    return summaries;
}
