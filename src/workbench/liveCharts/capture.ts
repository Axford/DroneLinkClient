import { DRONE_LINK_MSG_HEADER_BYTES, DRONE_LINK_MSG_MAX_PAYLOAD } from '@dronelink/protocol';
import { DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT32_T, DRONE_LINK_MSG_TYPE_UINT8_T } from '../../dronelink/DroneLinkMsg';
import type { DroneLinkMsg } from '../../dronelink/DroneLinkMsg';
import type { Transport } from '../useWorkbenchFeed';

export const captureWindowMs = 15 * 60_000;
export const seriesLimit = 16;
const packetLimit = 120_000;
const packetWidth = DRONE_LINK_MSG_HEADER_BYTES + DRONE_LINK_MSG_MAX_PAYLOAD;
const transports: Transport[] = ['wifi', 'serial'];

export type TimeRange = readonly [number, number];
export interface SignalAddress {
    node: number;
    channel: number;
    parameter: number;
    component: number;
}
export interface ChartSample {
    time: number;
    value: number | null;
    transport: Transport;
    segment: number;
    type: number;
}
export const signalKey = ({ node, channel, parameter, component }: SignalAddress) => `${node}>${channel}.${parameter}.${component}`;
export function isNumeric(type: number) {
    return type === DRONE_LINK_MSG_TYPE_FLOAT || type === DRONE_LINK_MSG_TYPE_UINT32_T || type === DRONE_LINK_MSG_TYPE_UINT8_T;
}

const addressKey = (node: number, channel: number, parameter: number) => (node * 256 + channel) * 64 + parameter;

class Packets {
    private readonly bytes: Uint8Array;
    private readonly payload: DataView;
    private readonly times: Float64Array;
    private readonly segments: Uint32Array;
    private readonly paths: Uint8Array;
    private readonly addresses: Uint32Array;
    private readonly formats: Uint8Array;
    private head = 0;
    private count = 0;
    private cutoff = -Infinity;
    limited = false;

    constructor(private readonly capacity: number) {
        this.bytes = new Uint8Array(capacity * packetWidth);
        this.payload = new DataView(this.bytes.buffer);
        this.times = new Float64Array(capacity);
        this.segments = new Uint32Array(capacity);
        this.paths = new Uint8Array(capacity);
        this.addresses = new Uint32Array(capacity);
        this.formats = new Uint8Array(capacity);
    }

    add(bytes: Uint8Array, time: number, transport: number, segment: number, address: number, format: number) {
        if (time < this.cutoff) return;
        if (this.count === this.capacity) {
            this.evict();
            this.limited = true;
        }
        const tail = this.slot(this.count++);
        this.bytes.set(bytes, tail * packetWidth);
        this.times[tail] = time;
        this.segments[tail] = segment;
        this.paths[tail] = transport;
        this.addresses[tail] = address;
        this.formats[tail] = format;
    }

    private slot(index: number) {
        return (this.head + index) % this.capacity;
    }

    private evict() {
        this.head = this.slot(1);
        this.count--;
    }

    expire(cutoff: number) {
        this.cutoff = Math.max(this.cutoff, cutoff);
        while (this.count && this.times[this.head] < cutoff) this.evict();
    }

    private visit(range: TimeRange, consume: (slot: number, offset: number, time: number) => void) {
        for (let index = 0; index < this.count; index++) {
            const slot = this.slot(index);
            const time = this.times[slot];
            if (time >= Math.max(this.cutoff, range[0]) && time <= range[1]) consume(slot, slot * packetWidth, time);
        }
    }

    earliest(range: TimeRange) {
        let earliest: number | undefined;
        this.visit(range, (_, __, time) => { earliest = Math.min(earliest ?? time, time); });
        return earliest;
    }

    copy(range: TimeRange) {
        const snapshot = new Packets(Math.max(1, this.count));
        snapshot.limited = this.limited;
        this.visit(range, (slot, offset, time) => {
            snapshot.add(this.bytes.subarray(offset, offset + packetWidth), time, this.paths[slot], this.segments[slot], this.addresses[slot], this.formats[slot]);
        });
        return snapshot;
    }

    private read(slot: number, offset: number, time: number, component: number): ChartSample {
        const format = this.formats[slot];
        const type = format >>> 5;
        const width = type === DRONE_LINK_MSG_TYPE_UINT8_T ? 1 : 4;
        const position = offset + DRONE_LINK_MSG_HEADER_BYTES + component * width;
        let value = NaN;
        if ((component + 1) * width <= (format & 31)) {
            value = width === 1 ? this.payload.getUint8(position) : type === DRONE_LINK_MSG_TYPE_FLOAT
                ? this.payload.getFloat32(position, true) : this.payload.getUint32(position, true);
        }
        return { time, value: Number.isFinite(value) ? value : null,
            transport: transports[this.paths[slot]], segment: this.segments[slot], type };
    }

    reading({ node, channel, parameter, component }: SignalAddress, time: number, range: TimeRange): ChartSample | undefined {
        const key = addressKey(node, channel, parameter);
        let before: number | undefined;
        let after: number | undefined;
        this.visit(range, (slot, _, stamp) => {
            if (this.addresses[slot] !== key) return;
            if (stamp <= time && (before === undefined || stamp >= this.times[before])) before = slot;
            if (stamp > time && (after === undefined || stamp < this.times[after])) after = slot;
        });
        if (before === undefined) return;
        const earlier = this.read(before, before * packetWidth, this.times[before], component);
        if (earlier.value === null) return;
        if (earlier.time === time) return earlier;
        if (after === undefined) return;
        const later = this.read(after, after * packetWidth, this.times[after], component);
        if (later.segment !== earlier.segment || later.type !== earlier.type || later.value === null) return;
        return time - earlier.time <= later.time - time ? earlier : later;
    }

    samples(addresses: readonly SignalAddress[], range: TimeRange, compact: boolean) {
        const byParameter = new Map<number, { index: number; component: number }[]>();
        const results: ChartSample[][] = addresses.map(() => []);
        const buckets = addresses.map(() => new Map<number, { first: ChartSample; last: ChartSample; low: ChartSample; high: ChartSample; gap: boolean }>());
        const bucketWidth = Math.max(1, (range[1] - range[0]) / 640);
        addresses.forEach(({ node, channel, parameter, component }, index) => {
            const parameterKey = addressKey(node, channel, parameter);
            const entries = byParameter.get(parameterKey) ?? [];
            entries.push({ index, component });
            byParameter.set(parameterKey, entries);
        });
        if (!addresses.length) return results;
        this.visit(range, (slot, offset, time) => {
            const entries = byParameter.get(this.addresses[slot]);
            if (!entries) return;
            for (const { index, component } of entries) {
                const sample = this.read(slot, offset, time, component);
                if (!compact) {
                    results[index].push(sample);
                    continue;
                }
                const bucket = Math.floor((time - range[0]) / bucketWidth);
                const summary = buckets[index].get(bucket);
                if (!summary) {
                    buckets[index].set(bucket, { first: sample, last: sample, low: sample, high: sample, gap: sample.value === null });
                    continue;
                }
                summary.gap ||= sample.value === null || summary.last.segment !== sample.segment || summary.last.type !== sample.type;
                if (time < summary.first.time) summary.first = sample;
                if (time >= summary.last.time) summary.last = sample;
                if (sample.value !== null && (summary.low.value === null || sample.value < summary.low.value)) summary.low = sample;
                if (sample.value !== null && (summary.high.value === null || sample.value > summary.high.value)) summary.high = sample;
            }
        });
        if (compact) buckets.forEach((series, index) => series.forEach(({ first, last, low, high, gap }) => {
            if (gap) results[index].push(first, { ...last, value: null }, last);
            else results[index].push(...Array.from(new Set([first, low, high, last])));
        }));
        // Sort only across local reordering (for example, delayed event processing).
        for (const samples of results) {
            if (samples.some((sample, index) => index > 0 && sample.time < samples[index - 1].time)) {
                samples.sort((first, second) => first.time - second.time);
            }
        }
        return results;
    }
}

/** Owns one rolling capture and an optional frozen copy within two fixed-size packet stores. */
export class LiveCapture {
    private live?: Packets;
    private frozen?: { packets: Packets; range: TimeRange };
    private startedAt = 0;
    private stoppedAt: number | undefined;
    private readonly sources: (Transport | undefined)[] = [];
    private readonly segments = new Uint32Array(256);

    constructor(private readonly capacity = packetLimit, private readonly windowMs = captureWindowMs) {}

    get running() { return !!this.live && this.stoppedAt === undefined; }
    get isFrozen() { return !!this.frozen; }

    start(now: number) {
        this.live = new Packets(this.capacity);
        this.frozen = undefined;
        this.startedAt = now;
        this.stoppedAt = undefined;
    }

    stop(now: number) {
        if (!this.running) return;
        this.advance(now);
        this.stoppedAt = now;
    }

    source(node: number, transport?: Transport) {
        if (transport === this.sources[node]) return;
        this.sources[node] = transport;
        this.segments[node]++;
    }

    disconnect() {
        this.sources.forEach((_, node) => this.source(node));
    }

    record(bytes: Uint8Array, { node, channel, param, msgType, msgLength }: Pick<DroneLinkMsg, 'node' | 'channel' | 'param' | 'msgType' | 'msgLength'>, time: number, transport: Transport) {
        if (!this.running || this.sources[node] !== transport || !isNumeric(msgType) || time < this.startedAt) return;
        this.live!.add(bytes, time, transports.indexOf(transport), this.segments[node], addressKey(node, channel, param), (msgType << 5) | msgLength);
    }

    advance(now: number) {
        if (this.running) this.live!.expire(now - this.windowMs);
    }

    freeze(now: number) {
        if (!this.running || this.frozen) return;
        this.advance(now);
        const range = this.range(now)!;
        this.frozen = { packets: this.live!.copy(range), range };
    }

    follow() {
        this.frozen = undefined;
    }

    range(now: number): TimeRange | undefined {
        if (this.frozen) return this.frozen.range;
        if (!this.live) return;
        const end = this.stoppedAt ?? now;
        return [Math.min(end, Math.max(this.startedAt, end - this.windowMs)), end];
    }

    availability(range: TimeRange) {
        const packets = this.frozen?.packets ?? this.live;
        return { earliest: packets?.earliest(range), limited: !!packets?.limited };
    }

    currentSource(node: number) {
        return { transport: this.sources[node], segment: this.segments[node] };
    }

    reading(address: SignalAddress, time: number, range: TimeRange): ChartSample | undefined {
        // Resolve the cursor against exact receipts, including segment and missing-component boundaries.
        const packets = this.frozen?.packets ?? this.live;
        return packets?.reading(address, time, range);
    }

    samples(addresses: readonly SignalAddress[], range: TimeRange, compact = false) {
        return (this.frozen?.packets ?? this.live)?.samples(addresses, range, compact) ?? addresses.map(() => []);
    }
}
