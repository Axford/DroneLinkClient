import type { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T } from '../dronelink/DroneLinkMsg';

export const probePins = [4, 13, 14, 15, 16, 25, 26, 32, 33, 34, 35] as const;
export const probeModeLabels = ['Digital', 'Analog', 'Serial'] as const;
const resultBase = 10;
export const probeBauds = [1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400];
const statuses = ['Waiting for sample', '', 'No transitions observed', 'Transitions seen, no bytes decoded',
    'Incomplete capture', 'Pin unavailable', 'Measurement failed'];

function bytes(parameter: ParameterState | undefined): number[] | undefined {
    if (!parameter || parameter.unavailable?.value || parameter.msgType !== DRONE_LINK_MSG_TYPE_UINT8_T) return;
    const { numValues } = parameter;
    const values: readonly (number | string)[] = parameter.values;
    if (values.length !== numValues || numValues < 1 || numValues > 16) return;
    if (values.every(value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)) {
        return values as number[];
    }
}

function describe(mode: number, status: number, data: number[]): string {
    if (status === 5 && data.length === 1 && data[0]) return `Pin unavailable · owned by channel ${data[0]}`;
    if (status !== 1 && status !== 4) return statuses[status] ?? 'Unknown capture status';
    const incomplete = status === 4;
    const u16 = (offset: number) => data[offset] + 256 * data[offset + 1];
    if (mode === 1 && data.length === 5 && data[0] <= 1 && u16(3) > 0) {
        const count = u16(1);
        return `${data[0] ? 'High' : 'Low'} · ${count} transition${count === 1 ? '' : 's'} in ${u16(3)} ms${incomplete ? ' · incomplete count' : ''}`;
    }
    if (mode === 2 && !incomplete && (data.length === 2 || data.length === 4) && u16(0) <= 4095) {
        return `${u16(0)} ADC counts · ${data.length === 4 ? `estimated ${u16(2)} mV` : 'voltage estimate unavailable'}`;
    }
    if (mode === 3) {
        const hex = data.map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        return [hex, incomplete ? statuses[4] : ''].filter(Boolean).join(' · ') || 'No bytes received';
    }
    return 'Result format unavailable';
}

function describeAnalog(result: ParameterState): string {
    const [minimum, maximum, average, millivolts] = result.values;
    const size = result.values.length;
    if (result.unavailable?.value || result.numValues !== size || (size !== 3 && size !== 4) ||
        typeof minimum !== 'number' || typeof maximum !== 'number' || typeof average !== 'number' ||
        !Number.isInteger(minimum) || !Number.isInteger(maximum) || !Number.isFinite(average) ||
        minimum < 0 || maximum > 4095 || average < minimum || average > maximum ||
        (size === 4 && (typeof millivolts !== 'number' || !Number.isInteger(millivolts) || millivolts < 150 || millivolts > 2450))) {
        return 'Analog statistics unavailable';
    }
    const voltage = millivolts === undefined ? 'voltage estimate unavailable' : `estimated ${millivolts} mV average`;
    return `Min ${minimum} · Max ${maximum} · Avg ${average.toFixed(1)} ADC counts over 20 ms · ${voltage}`;
}

function unsigned32(parameter: ParameterState | undefined): number | undefined {
    if (parameter?.unavailable?.value || parameter?.msgType !== DRONE_LINK_MSG_TYPE_UINT32_T || parameter.values.length !== 1) return;
    const value = parameter.values[0];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return value;
}

export function probeModes(gpio: number): string[] {
    if (!(probePins as readonly number[]).includes(gpio)) return [];
    return ['digital', ...(gpio >= 32 ? ['analog', 'analog,voltage'] : []), ...probeBauds.map(baud => `serial,${baud}`)];
}

export function readProbeResults(channel: ChannelState) {
    const rows = probePins.flatMap<{ gpio: number; result: ParameterState; mode: number; status: number; description: string; baud?: number }>(gpio => {
        const result = channel.params[resultBase + gpio];
        if (!result) return [];
        if (gpio >= 32 && result.msgType === DRONE_LINK_MSG_TYPE_FLOAT) {
            return [{ gpio, result, mode: 2, status: 1, description: describeAnalog(result), baud: undefined }];
        }
        const payload = bytes(result);
        if (payload?.length === 1 && payload[0] === 0) return [];
        const [header, ...data] = payload ?? [0];
        const modeCode = header >> 4;
        const baud = probeBauds[modeCode - 3];
        const mode = baud ? 3 : modeCode;
        return [{ gpio, result, mode, status: header & 15, description: mode ? describe(mode, header & 15, data) : 'Result unavailable', baud }];
    });
    const interval = unsigned32(channel.params[6]);
    const eligibleCount = rows.filter(row => row.mode && row.status !== 5).length;
    const refreshMs = interval && eligibleCount && interval * eligibleCount;
    return { rows, interval, refreshMs };
}
