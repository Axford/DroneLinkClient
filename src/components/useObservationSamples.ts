import { useCallback, useEffect, useState } from 'react';
import type { ParameterState } from '../dronelink/DroneLinkState';
import { sampleObservation, sampleReading, type SampleWindow } from '../dronelink/sampledObservations';

export default function useObservationSamples(
    scope: string | undefined,
    reading: ParameterState | undefined,
    interpret: (value: number) => number | undefined
) {
    const advance = useCallback((previous: SampleWindow | undefined, scope: string, reading: ParameterState | undefined, now: number) =>
        sampleObservation(previous, scope, reading, now, interpret), [interpret]);
    return useSampleWindow(scope, reading, advance);
}

export function useProjectedSamples<T>(scope: string | undefined, reading: ParameterState | undefined,
    project: (reading: ParameterState) => T | undefined) {
    const advance = useCallback((previous: SampleWindow<T> | undefined, scope: string, reading: ParameterState | undefined, now: number) =>
        sampleReading(previous, scope, reading, now, project), [project]);
    return useSampleWindow(scope, reading, advance);
}

function useSampleWindow<T>(scope: string | undefined, reading: ParameterState | undefined,
    advance: (previous: SampleWindow<T> | undefined, scope: string, reading: ParameterState | undefined, now: number) => SampleWindow<T> | undefined) {
    const [window, setWindow] = useState<SampleWindow<T>>();
    // Workbench updates ParameterState in place, so watch receipt metadata too.
    const receivedAt = reading?.lastHeard;
    const source = reading?.source;
    useEffect(() => {
        if (scope === undefined) {
            setWindow(undefined);
            return;
        }
        const sample = () => {
            const now = Date.now();
            setWindow(previous => advance(previous, scope, reading, now));
        };
        sample();
        const timer = setInterval(sample, 1000);
        return () => clearInterval(timer);
    }, [advance, reading, receivedAt, scope, source]);

    return window?.scope === scope && window?.source === source ? window?.samples ?? [] : [];
}
