import { ChannelState, NodeState, ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T, DRONE_MODULE_PARAM_TYPE } from './DroneLinkMsg';
import { locationCoordinates, MapBinding, mapBindings } from './mapBindings';
import type { VisualizationSetting, VisualizationSettingsDefinition, VisualizationTarget, VoltageThresholds } from './visualizationSettings';

export interface ObservedSummary {
    label: string;
    text: string;
    channelId: number;
    parameterId: number;
    reading?: ParameterState;
    severity?: 'warning' | 'danger';
    status?: string;
    binding?: MapBinding;
    bearing?: number;
    lines?: string[];
}

export interface InspectorSummary {
    primary: ObservedSummary[];
    supporting: ObservedSummary[];
}

interface ModuleVisualization {
    overlay?: (channel: ChannelState, thresholds?: VoltageThresholds | null) => ObservedSummary;
    inspector?: (channel: ChannelState, thresholds?: VoltageThresholds | null) => InspectorSummary;
    settings?: VisualizationSettingsDefinition;
}

function hasReading(reading: ParameterState | undefined): reading is ParameterState {
    return !!reading?.lastHeard && Number.isFinite(reading.lastHeard) && !reading.unavailable?.value;
}

function numericValue(reading: ParameterState | undefined, types: number[]): number | undefined {
    if (!hasReading(reading) || !types.includes(reading.msgType) || reading.numValues !== 1 || reading.values.length !== 1) return;
    const value = reading.values[0];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
}

function field(channel: ChannelState, parameterId: number, label: string, text?: string): ObservedSummary {
    return { label, text: text ?? '—', channelId: channel.channel, parameterId, reading: channel.params[parameterId],
        status: text === undefined ? 'Unavailable' : undefined };
}

function satelliteCount(channel: ChannelState): ObservedSummary {
    const count = numericValue(channel.params[9], [DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T]);
    if (count === undefined || count < 0 || !Number.isInteger(count)) return { ...field(channel, 9, 'Satellites'), text: '— sats' };
    const summary = field(channel, 9, 'Satellites', `${count} sats`);
    if (count < 4) return { ...summary, severity: 'danger', status: 'Very low satellite count' };
    if (count < 9) return { ...summary, severity: 'warning', status: 'Low satellite count' };
    return summary;
}

function quantity(channel: ChannelState, parameterId: number, label: string, unit: string, decimals: number): ObservedSummary {
    const value = numericValue(channel.params[parameterId], [DRONE_LINK_MSG_TYPE_FLOAT]);
    return field(channel, parameterId, label, value === undefined ? undefined : `${value.toFixed(decimals)} ${unit}`);
}

function cellVoltage(channel: ChannelState, thresholds?: VoltageThresholds | null): ObservedSummary {
    const volts = numericValue(channel.params[15], [DRONE_LINK_MSG_TYPE_FLOAT]);
    const summary = field(channel, 15, 'Cell voltage', volts === undefined ? undefined : `${volts.toFixed(2)} V`);
    if (volts === undefined || !thresholds) return summary;
    if (volts < thresholds.redBelow) return { ...summary, severity: 'danger', status: `Below red threshold (${thresholds.redBelow} V)` };
    if (volts < thresholds.amberBelow) return { ...summary, severity: 'warning', status: `Below amber threshold (${thresholds.amberBelow} V)` };
    return summary;
}

function positionText(reading: ParameterState | undefined): string | undefined {
    if (!hasReading(reading) || reading.msgType !== DRONE_LINK_MSG_TYPE_FLOAT || reading.numValues !== 3 ||
        reading.values.length !== 3 || !Number.isFinite(reading.values[2])) return;
    const coordinates = locationCoordinates({ reading });
    if (coordinates) return `${coordinates[1].toFixed(5)}°, ${coordinates[0].toFixed(5)}°`;
}

function byteArray(reading: ParameterState | undefined, length: number): number[] | undefined {
    if (!hasReading(reading) || reading.msgType !== DRONE_LINK_MSG_TYPE_UINT8_T ||
        reading.numValues !== length || reading.values.length !== length) return;
    const bytes = Array.from<number | string>(reading.values);
    if (bytes.every((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)) return bytes;
}

const resetReasons: Record<number, string> = {
    1: 'Power on', 3: 'Software reset', 4: 'Legacy watchdog', 5: 'Deep sleep', 6: 'SDIO reset',
    7: 'Timer group 0 watchdog', 8: 'Timer group 1 watchdog', 9: 'RTC watchdog', 10: 'Intrusion reset',
    11: 'Timer group CPU watchdog', 12: 'Software CPU reset', 13: 'RTC CPU watchdog',
    14: 'CPU reset by other core', 15: 'Brownout', 16: 'RTC module watchdog'
};

function uptimeText(seconds: number | undefined): string | undefined {
    if (seconds === undefined || !Number.isInteger(seconds) || seconds < 0 || seconds > 0xffffffff) return;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor(seconds / 60) % 60;
    return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds % 60}s`].filter(Boolean).join(' ');
}

const visualizations = new Map<string, ModuleVisualization>([
    ['NMEA', {
        overlay: satelliteCount,
        inspector(channel) {
            const heading = numericValue(channel.params[10], [DRONE_LINK_MSG_TYPE_FLOAT]);
            const bearing = heading !== undefined && heading >= 0 && heading <= 360 ? heading : undefined;
            const speed = numericValue(channel.params[11], [DRONE_LINK_MSG_TYPE_FLOAT]);
            return {
                primary: [{ ...field(channel, 10, 'Heading', bearing === undefined ? undefined : `${bearing.toFixed(1)}°`), bearing }],
                supporting: [field(channel, 8, 'Position', positionText(channel.params[8])), satelliteCount(channel),
                    field(channel, 11, 'Speed', speed !== undefined && speed >= 0 ? `${speed.toFixed(1)} kn` : undefined)]
            };
        }
    }],
    ['INA219', {
        settings: {
            moduleType: 'INA219',
            description: 'Shared cell-voltage colours for this channel.',
            invalidMessage: 'Enter two positive voltage thresholds. The red threshold must be lower than amber.',
            fields: [{ key: 'redBelow', label: 'Red below (V)' }, { key: 'amberBelow', label: 'Amber below (V)' }],
            parse(draft) {
                const redBelow = Number(draft.redBelow), amberBelow = Number(draft.amberBelow);
                return Number.isFinite(redBelow) && Number.isFinite(amberBelow) && redBelow > 0 && amberBelow > redBelow ? { redBelow, amberBelow } : null;
            }
        },
        overlay(channel, thresholds) {
            const cell = cellVoltage(channel, thresholds);
            return { ...cell, text: `Cell ${cell.text}` };
        },
        inspector(channel, thresholds) {
            return {
                primary: [cellVoltage(channel, thresholds)],
                supporting: [quantity(channel, 14, 'Load voltage', 'V', 2), quantity(channel, 12, 'Current', 'A', 2),
                    quantity(channel, 13, 'Power', 'W', 2)]
            };
        }
    }],
    ['Management', {
        inspector(channel) {
            const reset = byteArray(channel.params[10], 3);
            const reasons = reset?.slice(1).map((code, core) => `Core ${core}: ${resetReasons[code] ?? `Code ${code}`}`);
            const ip = byteArray(channel.params[12], 4);
            return {
                primary: [field(channel, 13, 'Last reported uptime', uptimeText(numericValue(channel.params[13], [DRONE_LINK_MSG_TYPE_UINT32_T]))),
                    field(channel, 12, 'IP address', ip?.join('.'))],
                supporting: [{ ...field(channel, 10, 'Reset reasons', reasons?.join(' · ')), lines: reasons }]
            };
        }
    }]
]);

export function observedModuleType(channel: ChannelState | undefined): string | undefined {
    const type = channel?.params[DRONE_MODULE_PARAM_TYPE];
    if (type?.msgType !== DRONE_LINK_MSG_TYPE_CHAR || type.unavailable?.value || type.values.length !== 1) return;
    const name = type.values[0];
    if (typeof name === 'string') return name;
}

export function channelVisualization(channel: ChannelState): ModuleVisualization | undefined {
    const type = observedModuleType(channel);
    if (type) return visualizations.get(type);
}

export function moduleSummaries(node: NodeState, getSettings?: (target: VisualizationTarget) => VisualizationSetting | undefined): ObservedSummary[] {
    const channels = Object.values(node.channels).sort((a, b) => a.channel - b.channel);
    return Array.from(visualizations).flatMap(([type, plugin]) => {
        const overlay = plugin.overlay;
        if (!overlay) return [];
        return channels.filter(channel => observedModuleType(channel) === type).map(channel =>
            overlay(channel, getSettings?.({ nodeAddress: node.id, channel: channel.channel, moduleType: type })?.thresholds));
    });
}

export function spatialSummaries(node: NodeState): ObservedSummary[] {
    const { location, heading } = mapBindings(node);
    const summaries: ObservedSummary[] = [];
    if (location) {
        const text = positionText(location.reading);
        summaries.push({ ...location, binding: location, label: 'Position', text: text ?? 'Position —', status: text ? undefined : 'Unavailable' });
    }
    if (heading) {
        const degrees = numericValue(heading.reading, [DRONE_LINK_MSG_TYPE_FLOAT]);
        summaries.push({ ...heading, binding: heading, label: 'Heading', text: degrees === undefined ? 'Heading —' : `Heading ${degrees.toFixed(1)}°`,
            status: degrees === undefined ? 'Unavailable' : undefined });
    }
    return summaries;
}
