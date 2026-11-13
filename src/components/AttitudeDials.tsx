import React from 'react';
import type { ParameterState } from '../dronelink/DroneLinkState';
import { cmps12Attitude } from '../dronelink/moduleVisualizations';
import { sampleWindowMinutes } from '../dronelink/sampledObservations';
import { useProjectedSamples } from './useObservationSamples';
import './AttitudeDials.css';

const binSize = 15;
const binCount = 360 / binSize;
const centre = 50;

function point(angle: number, radius: number) {
    const radians = angle * Math.PI / 180;
    return `${centre + radius * Math.sin(radians)} ${centre - radius * Math.cos(radians)}`;
}

function countBins(samples: number[]): number[] {
    const bins = Array<number>(binCount).fill(0);
    for (const sample of samples) bins[(Math.floor(sample / binSize) + binCount) % binCount]++;
    return bins;
}

function AttitudeDial({ axis, value, bins, peak }: { axis: 'pitch' | 'roll'; value?: number; bins: number[]; peak: number }) {
    const pitch = axis === 'pitch';
    const label = pitch ? 'Pitch' : 'Roll';
    const rotation = (degrees: number) => pitch ? 90 - degrees : degrees;
    const angleAt = (index: number) => index < binCount / 2 ? index * binSize : (index - binCount) * binSize;
    const counts = bins.flatMap((count, index) => {
        const from = angleAt(index);
        return count ? [from === 90 ? `90 degrees: ${count}` : `${from} to under ${from + binSize} degrees: ${count}`] : [];
    });
    const description = `${label} distribution. Last ${sampleWindowMinutes} minutes. ${bins.reduce((total, count) => total + count, 0)} receipts. Zero points ${pitch ? 'right' : 'up'}. ${counts.length ? counts.join('; ') : 'No recent samples'}.`;

    return <div className="dw-attitude-dial">
        <dt className="dw-meta">{label}</dt>
        <dd data-unavailable={value === undefined || undefined}>
            <svg viewBox="0 0 100 100" role="img" aria-label={description}>
                <circle className="dw-attitude-ring" cx={centre} cy={centre} r="44" />
                <line className="dw-attitude-reference" x1={centre} y1="6" x2={centre} y2="16"
                    transform={`rotate(${rotation(0)} 50 50)`} />
                {bins.map((count, index) => {
                    if (!count) return null;
                    const start = angleAt(index);
                    const end = start + binSize;
                    const inner = 19;
                    const outer = inner + 22 * count / peak;
                    const sweep = pitch ? 0 : 1;
                    return <path key={index} className="dw-attitude-bin"
                        d={`M ${point(rotation(start), outer)} A ${outer} ${outer} 0 0 ${sweep} ${point(rotation(end), outer)} L ${point(rotation(end), inner)} A ${inner} ${inner} 0 0 ${1 - sweep} ${point(rotation(start), inner)} Z`} />;
                })}
                {value !== undefined && <line className="dw-attitude-needle" x1={centre} y1="31" x2={centre} y2="4"
                    transform={`rotate(${rotation(value)} 50 50)`} />}
            </svg>
            {value === undefined ? <span className="dw-meta">Unavailable</span> : <span>{value.toFixed(1)}°</span>}
        </dd>
    </div>;
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
        <AttitudeDial axis="pitch" value={attitude?.pitch} bins={pitchBins} peak={peak} />
        <AttitudeDial axis="roll" value={attitude?.roll} bins={rollBins} peak={peak} />
        {samples.length > 0 && <div className="dw-attitude-scale">
            <dt className="dw-meta">Blue sectors · last {sampleWindowMinutes} min · {binSize}° bins</dt>
            <dd><span className="dw-meta">Shared radial scale</span> <span>0–{peak}</span> <span className="dw-meta">receipts</span></dd>
        </div>}
    </>;
}
