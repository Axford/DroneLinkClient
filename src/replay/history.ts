import { encodeLinkPacket } from '@dronelink/protocol';
import { DroneLinkMsg, DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_NAME, DRONE_MODULE_PARAM_TYPE, DRONE_MODULE_PARAM_NAME } from '../dronelink/DroneLinkMsg';
import type { ChannelState, GlobalState, NodeState, ParameterState } from '../dronelink/DroneLinkState';
import { isNumeric } from '../workbench/liveCharts/capture';
import type { ChartSample, TimeRange } from '../workbench/liveCharts/capture';
import type { Signal } from '../workbench/liveCharts/catalogue';

type Facets = { name?: { payload: string }; value?: { msgType: number; payload: string } };
export interface ReplayChannel { nodeAddress: number; channel: number; moduleType?: string; params: Record<number, Facets> }
export interface ReplayFrame { until: number; channels: ReplayChannel[] }
export interface ReplaySample { at: number; node: number; channel: number; param: number; msgType: number; payload: string }
export interface ReplayWindow { from: number; until: number; frame: ReplayFrame; samples: ReplaySample[] }
export const replayWindowMs = 5 * 60000;
const text = (payload: string) => atob(payload).split('\0', 1)[0];

function reading(param: number, msgType: number, payload: string, at?: number): ParameterState {
    const bytes = Uint8Array.from(atob(payload), letter => letter.charCodeAt(0));
    const packet = new DroneLinkMsg(encodeLinkPacket({ node: 1, source: 0, channel: 1, param, msgType,
        priority: 0, writable: false, msgLength: bytes.length }, bytes));
    return { param, msgType, values: packet.valueArray(), bytesPerValue: packet.bytesPerValue(),
        numValues: packet.numValues(), writable: false, lastHeard: at, source: 'Replay', observationBytes: bytes };
}
const nameOnly = (param: number): ParameterState => ({ param, msgType: -1, values: [], bytesPerValue: 0, numValues: 0, writable: false });

export function replayState(window: ReplayWindow, at: number): GlobalState {
    const nodes: GlobalState = {};
    for (const row of window.frame.channels) {
        const node: NodeState = nodes[row.nodeAddress] ||= { id: row.nodeAddress, lastHeard: 0, channels: {}, interface: 'Replay' };
        const channel: ChannelState = node.channels[row.channel] = { channel: row.channel, params: {}, lastHeard: 0, type: row.moduleType };
        for (const [key, facets] of Object.entries(row.params)) {
            const param = Number(key);
            const value = facets.value;
            const parameter = value ? reading(param, value.msgType, value.payload) : nameOnly(param);
            if (facets.name) parameter.name = text(facets.name.payload);
            channel.params[param] = parameter;
        }
    }
    const latest = new Map<string, ReplaySample>();
    const flush = () => {
        for (const sample of Array.from(latest.values())) {
            const channel = nodes[sample.node].channels[sample.channel];
            const previous = channel.params[sample.param];
            if (sample.msgType === DRONE_LINK_MSG_TYPE_NAME) {
                const parameter = previous || nameOnly(sample.param);
                parameter.name = text(sample.payload);
                parameter.nameLastHeard = sample.at;
                channel.params[sample.param] = parameter;
            } else {
                const parameter = reading(sample.param, sample.msgType, sample.payload, sample.at);
                parameter.name = previous?.name;
                parameter.nameLastHeard = previous?.nameLastHeard;
                channel.params[sample.param] = parameter;
            }
        }
        latest.clear();
    };
    for (const sample of window.samples) {
        if (sample.at > at) break;
        const id = sample.node, number = sample.channel;
        const node: NodeState = nodes[id] ||= { id, lastHeard: 0, channels: {}, interface: 'Replay' };
        let channel: ChannelState = node.channels[number] ||= { channel: number, params: {}, lastHeard: 0 };
        if (sample.param === DRONE_MODULE_PARAM_TYPE && sample.msgType === DRONE_LINK_MSG_TYPE_CHAR) {
            const moduleType = text(sample.payload);
            if (moduleType && channel.type && channel.type !== moduleType) {
                flush();
                channel = node.channels[number] = { channel: number, params: {}, lastHeard: 0 };
            }
            if (moduleType) channel.type = moduleType;
        }
        channel.lastHeard = node.lastHeard = sample.at;
        latest.set(`${id}/${number}/${sample.param}/${sample.msgType === DRONE_LINK_MSG_TYPE_NAME ? 'name' : 'value'}`, sample);
    }
    flush();
    for (const node of Object.values(nodes)) {
        for (const channel of Object.values<ChannelState>(node.channels)) {
            const values = channel.params[DRONE_MODULE_PARAM_NAME]?.values;
            if (typeof values?.[0] === 'string') channel.name = values[0];
        }
        const name = node.channels[1]?.params[8]?.values[0];
        if (typeof name === 'string') node.name = name;
    }
    return nodes;
}

export class ReplayCache {
    private readonly windows = new Map<number, { window: ReplayWindow; bytes: number }>();
    private bytes = 0;
    constructor(private readonly budget = 500_000_000) {}
    at(time: number) {
        return Array.from(this.windows.values()).find(({ window }) => window.from <= time && time < window.until)?.window;
    }
    add(window: ReplayWindow, near: number) {
        // Account for retained strings and objects as well as encoded packet bytes.
        const bytes = window.samples.reduce((sum, sample) => sum + 192 + sample.payload.length * 2, 0) +
            JSON.stringify(window.frame).length * 4;
        if (bytes > this.budget) throw new Error('This telemetry window exceeds the Replay cache budget.');
        this.bytes -= this.windows.get(window.from)?.bytes ?? 0;
        this.windows.set(window.from, { window, bytes });
        this.bytes += bytes;
        while (this.bytes > this.budget) {
            const distant = Array.from(this.windows.values()).filter(item => item.window !== window)
                .sort((a, b) => Math.abs(b.window.from - near) - Math.abs(a.window.from - near))[0];
            if (!distant) {
                this.windows.delete(window.from);
                this.bytes -= bytes;
                throw new Error('This telemetry window exceeds the Replay cache. Try a different time.');
            }
            this.windows.delete(distant.window.from);
            this.bytes -= distant.bytes;
        }
    }
    inRange([from, until]: TimeRange) {
        return Array.from(this.windows.values()).map(item => item.window)
            .filter(window => window.from < until && window.until > from).sort((a, b) => a.from - b.from);
    }
    clear() { this.windows.clear(); this.bytes = 0; }
}

type ReplayPoint = Pick<ChartSample, 'time' | 'value' | 'type' | 'segment'>;

export function replaySeries(windows: ReplayWindow[], range: TimeRange, signal: Signal): ReplayPoint[] {
    const result: ReplayPoint[] = [];
    let segment = 0, previousUntil: number | undefined, moduleType: string | undefined;
    const columns = 640;
    const buckets = new Map<number, { low: ReplayPoint; high: ReplayPoint }>();
    const flush = () => {
        for (const { low, high } of Array.from(buckets.values())) {
            if (low === high) result.push(low);
            else result.push(...(low.time <= high.time ? [low, high] : [high, low]));
        }
        buckets.clear();
    };
    for (const window of windows) {
        if (previousUntil !== window.from) { flush(); segment++; }
        const initialType = window.frame.channels.find(channel => channel.nodeAddress === signal.node && channel.channel === signal.channel)?.moduleType;
        if (moduleType && initialType && moduleType !== initialType) { flush(); segment++; }
        moduleType = initialType;
        for (const sample of window.samples) {
            if (sample.node !== signal.node || sample.channel !== signal.channel) continue;
            if (sample.param === DRONE_MODULE_PARAM_TYPE && sample.msgType === DRONE_LINK_MSG_TYPE_CHAR) {
                const next = text(sample.payload);
                if (next && moduleType && next !== moduleType) { flush(); segment++; }
                if (next) moduleType = next;
            }
            if (sample.param !== signal.parameter || !isNumeric(sample.msgType) || sample.at < range[0] || sample.at > range[1]) continue;
            const value = reading(sample.param, sample.msgType, sample.payload).values[signal.component];
            if (typeof value !== 'number' || !Number.isFinite(value)) { flush(); segment++; continue; }
            const point: ReplayPoint = { time: sample.at, value, type: sample.msgType, segment };
            const bucket = Math.floor((sample.at - range[0]) * columns / Math.max(1, range[1] - range[0]));
            const current = buckets.get(bucket);
            if (!current || point.type !== current.low.type) {
                if (current) { flush(); segment++; point.segment = segment; }
                buckets.set(bucket, { low: point, high: point });
            } else {
                if (value < current.low.value!) current.low = point;
                if (value > current.high.value!) current.high = point;
            }
        }
        previousUntil = window.until;
    }
    flush();
    return result;
}
