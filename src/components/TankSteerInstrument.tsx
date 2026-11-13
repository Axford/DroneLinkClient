import React from 'react';
import type { ObservedSummary, TankSteerSummary } from '../dronelink/moduleVisualizations';
import { CircularDialGuides, DialHand } from './CircularDialGeometry';
import './TankSteerInstrument.css';

const ringMetres = 20;
const ringRadius = 44;

function readout(reading: ObservedSummary) {
    return reading.unavailable ? 'Unavailable' : reading.text;
}

function DriveBar({ reading, output, side }: TankSteerSummary['drives']['left'] & { side: 'left' | 'right' }) {
    return <div className="dw-tank-drive" data-side={side}>
        <dt className="dw-meta">{side === 'left' ? 'Left' : 'Right'}<span className="visually-hidden"> drive</span></dt>
        <dd data-unavailable={reading.unavailable || undefined}>
            <div className="dw-tank-track" aria-hidden="true">
                {output !== undefined && <span data-sign={output < 0 ? 'negative' : 'positive'}
                    data-neutral={output === 0 || undefined} style={{ height: `${Math.abs(output) * 50}%` }} />}
            </div>
            {readout(reading)}
        </dd>
    </div>;
}

export default function TankSteerInstrument({ label, summary }: { label: string; summary: TankSteerSummary }) {
    const { drives, heading, target, distance, distanceMetres, mode } = summary;
    const targetRadius = distanceMetres === undefined ? undefined : ringRadius * Math.min(1, distanceMetres / ringMetres);
    const description = `Heading and target clockwise from north. Heading ${readout(heading)}. Target ${readout(target)}. ` +
        `Distance ${readout(distance)}. Target vector reaches the ring at ${ringMetres} metres.`;
    return <section className="dw-tank" aria-label={label}>
        <dl className="dw-tank-mode">
            <dt className="visually-hidden">Mode</dt>
            <dd data-unavailable={mode.unavailable || undefined}>{mode.unavailable ? 'Mode unavailable' : mode.text}</dd>
        </dl>
        <dl className="dw-tank-main">
            <div className="dw-tank-dial">
                <dt className="visually-hidden">Heading and target</dt>
                <dd>
                    <svg viewBox="0 0 100 100" role="img" aria-label={description}>
                        <CircularDialGuides />
                        <path className="dw-tank-crosshair" d="M6 50H94 M50 6V94" />
                        {heading.bearing !== undefined && <DialHand className="dw-tank-hand" role="heading"
                            bearing={heading.bearing} inner={0} outer={ringRadius} />}
                        {target.bearing !== undefined && targetRadius !== undefined && (targetRadius === 0
                            ? <circle className="dw-tank-target-zero" cx="50" cy="50" r="2.5" />
                            : <DialHand className="dw-tank-hand" role="target" bearing={target.bearing} inner={0} outer={targetRadius} />)}
                    </svg>
                    <span className="dw-meta dw-tank-north" aria-hidden="true">N</span>
                </dd>
            </div>
            <DriveBar {...drives.left} side="left" />
            <DriveBar {...drives.right} side="right" />
        </dl>
        <dl className="dw-tank-readings">
            {[heading, target, distance].map(reading => <div key={reading.parameterId}>
                <dt className="dw-meta">{reading.label}</dt>
                <dd data-unavailable={reading.unavailable || undefined}>{readout(reading)}</dd>
            </div>)}
        </dl>
        <p className="dw-meta mb-0">Target ring · {ringMetres} m · Drive scale ±1</p>
    </section>;
}
