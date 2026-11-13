import React from 'react';
import type { PolarSummary } from '../dronelink/moduleVisualizations';
import { CircularDialGuides, DialHand, dialPoint } from './CircularDialGeometry';
import { mirrorSailingSectors, sailingSectorAngle } from './SailingProfiles';
import './PolarInstrument.css';

const innerRadius = 19;
const outerRadius = 44;

export default function PolarInstrument({ label, summary }: { label: string; summary: PolarSummary }) {
    const { heading, wind, mode, relativeHeading, polarResponse, sampleCounts } = summary;
    const maximum = sampleCounts ? Math.max(...sampleCounts) : 0;
    const counts = sampleCounts ? mirrorSailingSectors(sampleCounts) : [];
    const coverage = maximum > 0 ? counts.map((count, index) =>
        dialPoint(sailingSectorAngle(index), innerRadius * count / maximum)).join(' ') : undefined;
    const response = polarResponse ? mirrorSailingSectors(polarResponse).map((value, index) => counts[index] > 0
        ? dialPoint(sailingSectorAngle(index), innerRadius + (outerRadius - innerRadius) * value / 255)
        : undefined) : [];
    const neighbours = (index: number) => [response[(index + response.length - 1) % response.length], response[(index + 1) % response.length]];
    const path = response.flatMap((point, index) => {
        const [, next] = neighbours(index);
        return point && next ? [`M ${point} L ${next}`] : [];
    }).join(' ');
    const hasResponse = response.some(point => point !== undefined);
    const coverageStatus = !sampleCounts ? 'Unavailable' : maximum ? undefined : 'No samples';
    const relativeText = relativeHeading === undefined ? 'Unavailable' : `${Math.round(relativeHeading) % 360}°`;
    const description = `Polar plot clockwise from wind. Adjusted heading relative to wind: ${relativeText}. ` +
        `Outer speed response relative to peak sector, scale 0 to 255: ${hasResponse ? 'sampled sectors shown' : 'unavailable'}. ` +
        `Inner sample coverage: ${coverageStatus ?? `0 to ${maximum} samples per sector`}. Reading Details lists the sector values.`;

    return <section className="dw-polar" aria-label={label}>
        <div className="dw-polar-dial">
            <svg viewBox="-6 -6 112 112" role="img" aria-label={description}>
                <CircularDialGuides ticks />
                {coverage && <polygon className="dw-polar-coverage" points={coverage} />}
                {path && <path className="dw-polar-response" d={path} />}
                {response.map((point, index) => {
                    if (!point || neighbours(index).some(Boolean)) return null;
                    const [cx, cy] = point.split(' ');
                    return <circle key={index} className="dw-polar-response-point" cx={cx} cy={cy} r="1.8" />;
                })}
                {relativeHeading !== undefined && <DialHand className="dw-polar-heading"
                    bearing={relativeHeading} inner={innerRadius} outer={50} role="adjusted" />}
            </svg>
            <span className="dw-meta dw-polar-wind" aria-hidden="true">Wind 0°</span>
        </div>
        <dl className="dw-polar-readings">
            {[heading, wind, mode].map(reading => <div key={reading.parameterId}>
                <dt className="dw-meta">{reading.label}</dt>
                <dd data-unavailable={reading.unavailable || undefined} data-reset={reading === mode && mode.text === 'Reset' || undefined}>{reading.unavailable ? 'Unavailable' : reading.text}</dd>
            </div>)}
            <div><dt className="dw-meta">Adjusted relative to wind</dt>
                <dd data-unavailable={relativeHeading === undefined || undefined}>{relativeText}</dd></div>
        </dl>
        <dl className="dw-polar-scales">
            <div><dt className="dw-meta">Outer · Speed relative to peak</dt>
                <dd data-unavailable={!hasResponse || undefined}>{hasResponse ? '0–255' : 'Unavailable'}</dd></div>
            <div><dt className="dw-meta">Inner · Sample coverage</dt>
                <dd data-unavailable={coverageStatus !== undefined || undefined}>{coverageStatus ?? `0–${maximum} samples`}</dd></div>
        </dl>
    </section>;
}
