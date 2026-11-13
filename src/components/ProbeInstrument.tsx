import React from 'react';
import type { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T } from '../dronelink/DroneLinkMsg';
import { compactReceiptAge, receiptLabel } from '../dronelink/observedPositions';

const pins = [4, 13, 14, 15, 16, 25, 26, 32, 33, 34, 35] as const;
const modes = ['Digital', 'Analog', 'Serial'] as const;
const resultBase = 10;
const baudBase = 46;
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

function unsigned32(parameter: ParameterState | undefined): number | undefined {
    if (parameter?.unavailable?.value || parameter?.msgType !== DRONE_LINK_MSG_TYPE_UINT32_T || parameter.values.length !== 1) return;
    const value = parameter.values[0];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return value;
}

export default function ProbeInstrument({ channel, now, disabled }: {
    channel: ChannelState;
    now: number;
    disabled: boolean;
}) {
    const rows = pins.flatMap((gpio, index) => {
        const result = channel.params[resultBase + gpio];
        if (!result) return [];
        const payload = bytes(result);
        if (payload?.length === 1 && payload[0] === 0) return [];
        const [header, ...data] = payload ?? [0];
        const mode = header >> 4;
        return [{ gpio, result, mode, status: header & 15, data, baud: unsigned32(channel.params[baudBase + index]) }];
    });
    const interval = unsigned32(channel.params[6]);
    const eligibleCount = rows.filter(row => row.mode && row.status !== 5).length;
    const refreshMs = interval && eligibleCount && interval * eligibleCount;
    return <section aria-label="Probe pin results" className="mb-3">
        {disabled && <p className="dw-meta">Probe disabled. Showing last received results.</p>}
        {!disabled && !!refreshMs && <p className="dw-meta">Expected refresh per pin: about {refreshMs / 1000} s</p>}
        {rows.length ? <dl className="mb-0">
            {rows.map(({ gpio, result, mode, status, data, baud }) => <React.Fragment key={gpio}>
                <dt>GPIO {gpio}{modes[mode - 1] && ` · ${modes[mode - 1]}`}
                    {mode === 3 && ` · ${baud ? `${baud} baud` : 'Baud unavailable'} · 8N1`}</dt>
                <dd className="text-break">
                    {mode ? describe(mode, status, data) : 'Result unavailable'}
                    <span className="dw-meta ms-2" title={receiptLabel(result.lastHeard, now)}>
                        <span className="visually-hidden">Received: </span>{compactReceiptAge(result.lastHeard, now)}
                    </span>
                </dd>
            </React.Fragment>)}
        </dl> : <p className="dw-meta mb-0">No Probe pin results received</p>}
    </section>;
}
