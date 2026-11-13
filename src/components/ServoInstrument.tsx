import React from 'react';
import type { ServoSummary } from '../dronelink/moduleVisualizations';
import './ServoInstrument.css';

const plotWidth = 240;
const plotHeight = 100;
const x = (angle: number) => angle / 180 * plotWidth;
const y = (position: number) => (1 - position) / 2 * plotHeight;

export default function ServoInstrument({ label, summary }: { label: string; summary: ServoSummary }) {
    const { servoPosition, pwmAngle, position, angle, curve, controlPoints } = summary;
    const inputY = position !== undefined && position >= -1 && position <= 1 ? y(position) : undefined;
    const outputX = angle !== undefined && angle >= 0 && angle <= 180 ? x(angle) : undefined;

    const curveDescription = curve
        ? `Configured angles at inputs minus 1, zero and plus 1 are ${curve[0]}, ${curve[(curve.length - 1) / 2]} and ${curve[curve.length - 1]} degrees.`
        : 'Configured curve unavailable.';
    const controlDescription = controlPoints ? ` Map control points before centre adjustment: ${controlPoints.map(point => point.toFixed(1)).join(', ')} degrees.` : '';

    return <section className="dw-servo" aria-label={label}>
        <dl className="dw-servo-readings">
            {[servoPosition, pwmAngle].map(reading => <div key={reading.parameterId}>
                <dt className="dw-meta">{reading.label}</dt>
                <dd data-unavailable={reading.unavailable || undefined}>{reading.unavailable ? 'Unavailable' : reading.text}</dd>
            </div>)}
        </dl>
        <figure className="dw-servo-figure mb-0">
            <figcaption className="dw-meta">
                <span>{curve ? <><i className="dw-servo-key" aria-hidden="true" />Configured curve</> : 'Configured curve unavailable'}</span>
                {controlPoints && <span><i className="dw-servo-point-key" aria-hidden="true" />Map control points</span>}
            </figcaption>
            <div className="dw-servo-chart">
                <div className="dw-servo-input dw-meta" aria-hidden="true">
                    <span>Normalized input</span>
                    <div><span>+1</span><span>0</span><span>−1</span></div>
                </div>
                <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} preserveAspectRatio="none" role="img"
                    aria-label={`Normalized input from minus 1 to plus 1 versus output angle from 0 to 180 degrees. ${curveDescription}${controlDescription}`}>
                    <path className="dw-servo-grid" d={`M ${plotWidth / 2} 0 V ${plotHeight} M 0 ${plotHeight / 2} H ${plotWidth}`} />
                    {curve && <polyline className="dw-servo-curve"
                        points={curve.map((value, index) => `${x(value)},${plotHeight * (1 - index / (curve.length - 1))}`).join(' ')} />}
                    {controlPoints?.map((point, index) => point >= 0 && point <= 180 &&
                        <circle key={index} className="dw-servo-point" cx={x(point)}
                            cy={y(2 * index / (controlPoints.length - 1) - 1)} r="2.5" />)}
                    {inputY !== undefined && <line className="dw-servo-guide" x1="0" x2={outputX ?? plotWidth} y1={inputY} y2={inputY} />}
                    {outputX !== undefined && <line className="dw-servo-guide" x1={outputX} x2={outputX} y1={inputY ?? 0} y2={plotHeight} />}
                    {inputY !== undefined && outputX !== undefined &&
                        <circle className="dw-servo-observed" cx={outputX} cy={inputY} r="2" />}
                </svg>
                <div className="dw-servo-output dw-meta" aria-hidden="true">
                    <div><span>0°</span><span>90°</span><span>180°</span></div>
                    <span>Output angle</span>
                </div>
            </div>
            {((position !== undefined && inputY === undefined) || (angle !== undefined && outputX === undefined)) &&
                <p className="dw-meta mb-0">Reported reading outside plot range</p>}
        </figure>
    </section>;
}
