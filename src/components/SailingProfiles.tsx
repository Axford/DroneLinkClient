import React from 'react';
import { dialPoint } from './CircularDialGeometry';

interface ProfileInput {
    bearing?: number;
    polar?: readonly number[];
    speeds: readonly [readonly number[] | undefined, readonly number[] | undefined];
    inner: number;
    outer: number;
}

const sectorsPerHalf = 16;
const sectorDegrees = 360 / (2 * sectorsPerHalf);

export function projectSailingProfiles({ bearing, polar, speeds, inner, outer }: ProfileInput) {
    const points = (samples: readonly number[], offset = 0) => samples.map((value, index) =>
        dialPoint((bearing ?? 0) + (offset + index + 0.5) * sectorDegrees, inner + (outer - inner) * value / 255));

    const polarPoints = polar && bearing !== undefined
        ? points([...polar, ...polar.slice().reverse()]).join(' ') : undefined;
    const halves = bearing === undefined ? [] : speeds.flatMap((half, index) =>
        half ? [points(half, index * sectorsPerHalf)] : []);
    // Only a full profile may connect its two halves and close the loop.
    const completeSpeed = halves.length === 2;
    return {
        polarPoints,
        speedPoints: halves.flat().join(' '),
        completeSpeed,
        polarStatus: polarPoints ? '' : 'unavailable',
        speedStatus: completeSpeed ? '' : halves.length ? 'partial' : 'unavailable'
    };
}

export function SailingProfiles({ profiles }: { profiles: ReturnType<typeof projectSailingProfiles> }) {
    return <>
        {profiles.polarPoints && <polygon data-series="polar" points={profiles.polarPoints} />}
        {profiles.speedPoints && (profiles.completeSpeed
            ? <polygon data-series="speed" points={profiles.speedPoints} />
            : <polyline data-series="speed" points={profiles.speedPoints} />)}
    </>;
}
