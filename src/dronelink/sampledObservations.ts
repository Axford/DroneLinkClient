import type { ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_FLOAT } from './DroneLinkMsg';

export interface ObservationSample<T = number> {
    readonly receivedAt: number;
    readonly value: T | null;
}

export interface SampleWindow<T = number> {
    /** Host-supplied identity for one Domain, node, channel, module, parameter and stream generation. */
    readonly scope: string;
    readonly source: string | undefined;
    readonly lastReceivedAt: number;
    readonly samples: readonly ObservationSample<T>[];
}

export const sampleWindowMinutes = 5;
export const maxObservationSamples = 100;

/**
 * Advance a renderer's in-memory window from its latest observed FLOAT scalar.
 * Pass no scope while disconnected. Change scope on reset, source path changes or resync.
 * A snapshot can contribute its latest receipt once. It supplies no prior samples.
 */
export function sampleObservation(
    previous: SampleWindow | undefined,
    scope: string | undefined,
    reading: ParameterState | undefined,
    now: number,
    interpret: (value: number) => number | undefined
): SampleWindow | undefined {
    return sampleReading(previous, scope, reading, now, observation => {
        const raw = observation.values[0];
        if (observation.msgType !== DRONE_LINK_MSG_TYPE_FLOAT || observation.numValues !== 1 ||
            observation.values.length !== 1 || typeof raw !== 'number' || !Number.isFinite(raw)) return;
        const value = interpret(raw);
        if (value !== undefined && Number.isFinite(value)) return value;
    });
}

/** Share receipt lifecycle and retention across scalar and vector projections. */
export function sampleReading<T>(
    previous: SampleWindow<T> | undefined,
    scope: string | undefined,
    reading: ParameterState | undefined,
    now: number,
    project: (reading: ParameterState) => T | undefined
): SampleWindow<T> | undefined {
    if (scope === undefined) return;
    let current = previous?.scope === scope ? previous : undefined;
    const receivedAt = reading?.lastHeard;
    if (!reading || receivedAt === undefined || !Number.isFinite(receivedAt) || receivedAt <= 0) {
        if (!current) return;
        // The host has no usable receipt. Drop the trace rather than invent a timestamp.
        return { ...current, samples: [] };
    }

    // Server receipts and the browser clock may differ. Preserve receipt times.
    const cutoff = Math.max(now, receivedAt, current?.lastReceivedAt ?? 0) - sampleWindowMinutes * 60_000;

    // Ignore old projections before comparing sources so late receipts cannot revive an old source.
    if (current && receivedAt < current.lastReceivedAt) {
        return { ...current, samples: current.samples.filter(sample => sample.receivedAt >= cutoff) };
    }
    if (current?.source !== reading.source) current = undefined;
    const samples = current?.samples.filter(sample => sample.receivedAt >= cutoff) ?? [];
    if (receivedAt < cutoff || current?.lastReceivedAt === receivedAt) {
        return { scope, source: reading.source, lastReceivedAt: receivedAt, samples };
    }

    return {
        scope,
        source: reading.source,
        lastReceivedAt: receivedAt,
        samples: [...samples.slice(1 - maxObservationSamples), {
            receivedAt, value: reading.unavailable?.value ? null : project(reading) ?? null
        }]
    };
}

/** Group points without drawing across unavailable values or a gap in receipts. */
export function traceSegments(samples: readonly ObservationSample[], maximumGapMs: number): ObservationSample[][] {
    const segments: ObservationSample[][] = [];
    let segment: ObservationSample[] | undefined;
    for (const sample of samples) {
        if (sample.value === null) {
            segment = undefined;
            continue;
        }
        if (!segment || sample.receivedAt - segment[segment.length - 1].receivedAt > maximumGapMs) {
            segment = [];
            segments.push(segment);
        }
        segment.push(sample);
    }
    return segments;
}
