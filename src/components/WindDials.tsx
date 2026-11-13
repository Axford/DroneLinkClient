import React from 'react';
import { observedBearing, type ObservedSummary, type WindDirectionSummary } from '../dronelink/moduleVisualizations';
import { sampleWindowMinutes } from '../dronelink/sampledObservations';
import { CircularDial } from './AttitudeDial';
import { useProjectedSamples } from './useObservationSamples';
import './WindDials.css';

const binSize = 15;
const binCount = 360 / binSize;

function WindDial({ frame, reading, estimateLabel, bins = [], peak = 1 }: {
    frame: 'World' | 'Local';
    reading: ObservedSummary;
    estimateLabel?: string;
    bins?: number[];
    peak?: number;
}) {
    const zero = frame === 'World' ? 'north' : 'vessel forward';
    const distribution = bins.flatMap((count, index) => count ?
        [`${index * binSize} to under ${(index + 1) * binSize} degrees: ${count}`] : []);
    const description = `${frame} wind: ${reading.unavailable ? 'unavailable' : reading.text}. Zero is ${zero}, angles increase clockwise.` +
        (estimateLabel ? ` ${estimateLabel}.` : '') +
        (distribution.length ? ` Recent World receipts by sector: ${distribution.join('; ')}.` : '');
    return <div className="dw-wind-dial">
        <dt className="dw-meta">{frame} <span>· {zero}{estimateLabel && ` · ${estimateLabel}`}</span></dt>
        <dd data-unavailable={reading.unavailable || undefined}>
            <div className="dw-wind-face">
                <CircularDial description={description} value={reading.bearing} bins={bins} peak={peak} zero="up" positive="clockwise" ticks />
                {!reading.unavailable && <strong aria-hidden="true">{reading.text}</strong>}
            </div>
            {reading.unavailable && <span className="dw-meta">Unavailable</span>}
        </dd>
    </div>;
}

export default function WindDials({ label, summary, scope }: { label: string; summary: WindDirectionSummary; scope?: string }) {
    const samples = useProjectedSamples(scope, summary.worldWind.reading, observedBearing);
    const bins = Array<number>(binCount).fill(0);
    for (const { value } of samples) {
        if (value !== null) bins[Math.floor(value / binSize) % binCount]++;
    }
    const peak = Math.max(...bins);
    return <dl className="dw-channel-summary dw-wind-dials" data-single={summary.localWind === undefined || undefined} aria-label={label}>
        <WindDial frame="World" reading={summary.worldWind} estimateLabel={summary.estimateLabel} bins={bins} peak={Math.max(1, peak)} />
        {summary.localWind && <WindDial frame="Local" reading={summary.localWind} />}
        {peak > 0 && <div className="dw-wind-scale">
            <dt className="dw-meta">Blue sectors · last {sampleWindowMinutes} min · {binSize}° bins</dt>
            <dd><span className="dw-meta">Radial scale</span> <span>0–{peak}</span> <span className="dw-meta">receipts</span></dd>
        </div>}
    </dl>;
}
