import React from 'react';
import { windSpeedKnots } from '../dronelink/moduleVisualizations';
import type { AnemometerSummary } from '../dronelink/moduleVisualizations';
import { maxObservationSamples, sampleWindowMinutes } from '../dronelink/sampledObservations';
import useObservationSamples from './useObservationSamples';
import './AnemometerInstrument.css';

const lastBin = 30;
const plotHeight = 64;
const binWidth = 10;
const ticks = [0, 10, 20, 30];

export default function AnemometerInstrument({ label, summary, scope }: {
    label: string;
    summary: AnemometerSummary;
    scope?: string;
}) {
    const samples = useObservationSamples(scope, summary.windSpeed.reading, windSpeedKnots);
    const bins = Array<number>(lastBin + 1).fill(0);
    let aboveRange = 0;
    for (const { value } of samples) {
        if (value === null) continue;
        const bin = Math.round(value);
        if (bin > lastBin) aboveRange++;
        else bins[bin]++;
    }
    const currentBin = summary.knots === undefined ? undefined : Math.round(summary.knots);
    const peak = Math.max(...bins);
    const counts = bins.flatMap((count, bin) => count ? [`${bin} kn: ${count}`] : []);
    const current = currentBin === undefined ? 'Current wind speed unavailable.'
        : currentBin > lastBin ? 'Current wind speed is above the plot range.' : `Current bin: ${currentBin} kn.`;

    return <section className="dw-anemometer" aria-label={label}>
        <dl className="dw-anemometer-speed mb-0" data-unavailable={summary.windSpeed.unavailable || undefined}>
            <dt className={summary.windSpeed.unavailable ? 'dw-meta' : 'visually-hidden'}>Wind speed</dt>
            <dd className="dw-anemometer-knots">{summary.windSpeed.unavailable ? 'Unavailable' : summary.windSpeed.text}</dd>
            {summary.metresPerSecond && <>
                <dt className="visually-hidden">Wind speed converted to metres per second</dt>
                <dd>{summary.metresPerSecond}</dd>
            </>}
        </dl>
        <figure className="dw-anemometer-histogram mb-0">
            <figcaption className="dw-meta">
                Samples per knot · last {sampleWindowMinutes} min
                <span className="visually-hidden"> · up to {maxObservationSamples} receipts</span>
            </figcaption>
            {peak > 0 ? <>
                <div className="dw-anemometer-plot">
                    <div className="dw-anemometer-counts dw-meta" aria-hidden="true"><span>{peak}</span><span>0</span></div>
                    <svg viewBox={`0 0 ${bins.length * binWidth} ${plotHeight}`} preserveAspectRatio="none" role="img"
                        aria-label={`Recent wind speed histogram. Sample counts by rounded speed: ${counts.join(', ')}. ${current}`}>
                        {ticks.slice(1, -1).map(tick => <line key={tick} className="dw-anemometer-grid"
                            x1={(tick + 0.5) * binWidth} x2={(tick + 0.5) * binWidth} y1="0" y2={plotHeight} />)}
                        {bins.map((count, bin) => count > 0 && <rect key={bin} x={bin * binWidth + 0.5}
                            width={binWidth - 1} y={plotHeight * (1 - count / peak)} height={plotHeight * count / peak}
                            data-current={bin === currentBin || undefined} />)}
                        {currentBin !== undefined && currentBin <= lastBin &&
                            <path className="dw-anemometer-marker" d={`M ${currentBin * binWidth} 0 h ${binWidth} l ${-binWidth / 2} 7 Z`} />}
                    </svg>
                    <div className="dw-anemometer-ticks dw-meta" aria-hidden="true">{ticks.map(tick => <span key={tick} style={tick > 0 && tick < lastBin
                        ? { left: `${100 * (tick + 0.5) / bins.length}%` } : undefined}>{tick === lastBin ? '30 kn' : tick}</span>)}</div>
                </div>
            </> : <p className="dw-meta mb-0">{aboveRange ? 'No samples in the 0–30 kn bins' : 'No recent samples'}</p>}
            {aboveRange > 0 && <p className="dw-meta mb-0">Above plot range: <strong>{aboveRange}</strong></p>}
        </figure>
    </section>;
}
