import { useEffect, useState } from 'react';
import type { ParameterState } from '../dronelink/DroneLinkState';
import { sampleObservation } from '../dronelink/sampledObservations';

export default function useObservationSamples(
    scope: string | undefined,
    reading: ParameterState | undefined,
    interpret: (value: number) => number | undefined
) {
    const [window, setWindow] = useState<ReturnType<typeof sampleObservation>>();
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
            setWindow(previous => sampleObservation(previous, scope, reading, now, interpret));
        };
        sample();
        const timer = setInterval(sample, 1000);
        return () => clearInterval(timer);
    }, [interpret, reading, receivedAt, scope, source]);

    return window?.scope === scope && window?.source === source ? window?.samples ?? [] : [];
}
