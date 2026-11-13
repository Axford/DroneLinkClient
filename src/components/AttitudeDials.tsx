import React from 'react';
import type { ParameterState } from '../dronelink/DroneLinkState';
import { cmps12Attitude } from '../dronelink/moduleVisualizations';
import { sampleWindowMinutes } from '../dronelink/sampledObservations';
import { useProjectedSamples } from './useObservationSamples';
import AttitudeDial from './AttitudeDial';
import './AttitudeDials.css';

const binSize = 15;
const binCount = 360 / binSize;
function countBins(samples: number[]): number[] {
    const bins = Array<number>(binCount).fill(0);
    for (const sample of samples) bins[(Math.floor(sample / binSize) + binCount) % binCount]++;
    return bins;
}

function describeDistribution(label: string, zero: 'right' | 'up', bins: number[]): string {
    const counts = bins.flatMap((count, index) => {
        if (!count) return [];
        const from = (index < binCount / 2 ? index : index - binCount) * binSize;
        return [from === 90 ? `90 degrees: ${count}` : `${from} to under ${from + binSize} degrees: ${count}`];
    });
    const receipts = bins.reduce((total, count) => total + count, 0);
    return `${label} distribution. Last ${sampleWindowMinutes} minutes. ${receipts} receipts. Zero points ${zero}. ${counts.length ? counts.join('; ') : 'No recent samples'}.`;
}

export default function AttitudeDials({ scope, reading, attitude }: {
    scope?: string;
    reading?: ParameterState;
    attitude?: ReturnType<typeof cmps12Attitude>;
}) {
    const samples = useProjectedSamples(scope, reading, cmps12Attitude).flatMap(sample => sample.value ? [sample.value] : []);
    const pitchBins = countBins(samples.map(sample => sample.pitch));
    const rollBins = countBins(samples.map(sample => sample.roll));
    const peak = Math.max(1, ...pitchBins, ...rollBins);
    return <>
        <AttitudeDial label="Pitch" description={describeDistribution('Pitch', 'right', pitchBins)} zero="right" positive="counterclockwise" value={attitude?.pitch} bins={pitchBins} peak={peak} />
        <AttitudeDial label="Roll" description={describeDistribution('Roll', 'up', rollBins)} zero="up" positive="clockwise" value={attitude?.roll} bins={rollBins} peak={peak} />
        {samples.length > 0 && <div className="dw-attitude-scale">
            <dt className="dw-meta">Blue sectors · last {sampleWindowMinutes} min · {binSize}° bins</dt>
            <dd><span className="dw-meta">Shared radial scale</span> <span>0–{peak}</span> <span className="dw-meta">receipts</span></dd>
        </div>}
    </>;
}
