import React from 'react';
import type { ObservedSummary, TurnRateSummary } from '../dronelink/moduleVisualizations';
import { CircularDialGuides, DialHand, dialBand } from './CircularDialGeometry';
import './TurnRateInstrument.css';
import './InstrumentStatus.css';

export default function TurnRateInstrument({ label, summary }: { label: string; summary: TurnRateSummary }) {
    const { turnOutput, output, heading, target, threshold, thresholdDegrees, mode, gybing } = summary;
    const targetBearing = target.bearing;
    const readable = (reading: ObservedSummary) => reading.unavailable ? 'Unavailable' : reading.text;
    const direction = output === undefined ? '' : output === 0 ? ' Neutral.' : output > 0 ? ' Clockwise.' : ' Counterclockwise.';
    const description = `Turn output: ${readable(turnOutput)}.${direction} Bearings clockwise from north. ` +
        `Heading: ${readable(heading)}. Target: ${readable(target)}. Gybe threshold: ${readable(threshold)}. Mode: ${readable(mode)}.`;
    return <section className="dw-turn-rate" aria-label={label}>
        <div className="dw-turn-rate-dial">
            <svg viewBox="-4 -4 108 108" role="img" aria-label={description}>
                {targetBearing !== undefined && thresholdDegrees !== undefined && thresholdDegrees > 0 && (thresholdDegrees >= 180
                    ? <circle className="dw-turn-rate-band" cx="50" cy="50" r="33.5" />
                    : <path className="dw-turn-rate-band"
                        d={dialBand(targetBearing - thresholdDegrees, thresholdDegrees * 2, 19, 48)} />)}
                {heading.bearing !== undefined && output !== undefined && output !== 0 &&
                    <path className="dw-turn-rate-arc" data-gybing={gybing || undefined}
                        d={dialBand(heading.bearing, Math.max(-6, Math.min(6, output)) * 180 / Math.PI, 28, 44, 36)} />}
                <CircularDialGuides ticks />
                {heading.bearing !== undefined && <DialHand className="dw-turn-rate-hand" role="heading" bearing={heading.bearing} inner={19} outer={49} />}
                {target.bearing !== undefined && <DialHand className="dw-turn-rate-hand" role="target" bearing={target.bearing} inner={19} outer={49} />}
            </svg>
            <span className="dw-meta dw-turn-rate-north" aria-hidden="true">N</span>
            <div className="dw-turn-rate-centre" aria-hidden="true">
                <span className="dw-meta">Output</span>
                <strong data-unavailable={turnOutput.unavailable || undefined}>{readable(turnOutput)}</strong>
            </div>
        </div>
        <dl>
            {[heading, target, threshold, mode].map(reading => <div key={reading.parameterId}>
                <dt className="dw-meta">{reading.label}</dt>
                <dd className="dw-instrument-status" data-unavailable={reading.unavailable || undefined} data-severity={reading.severity}>{readable(reading)}</dd>
            </div>)}
        </dl>
    </section>;
}
