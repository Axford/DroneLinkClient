import type { ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_FLOAT } from './DroneLinkMsg';

export interface ObservationSample {
    readonly receivedAt: number;
    readonly value: number | null;
}

interface SampleWindow {
    /** Host-supplied identity for one Domain, node, channel, module, parameter and stream generation. */
    readonly scope: string;
    readonly source: string | undefined;
    readonly lastReceivedAt: number;
    readonly samples: readonly ObservationSample[];
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

    const raw = reading.values[0];
    const value = reading.msgType === DRONE_LINK_MSG_TYPE_FLOAT && !reading.unavailable?.value &&
        reading.numValues === 1 && reading.values.length === 1 && typeof raw === 'number' && Number.isFinite(raw)
        ? interpret(raw) : undefined;
    return {
        scope,
        source: reading.source,
        lastReceivedAt: receivedAt,
        samples: [...samples.slice(1 - maxObservationSamples), {
            receivedAt, value: value !== undefined && Number.isFinite(value) ? value : null
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
