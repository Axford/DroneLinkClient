import React from 'react';
import { hmc5883lRawVector, type Hmc5883lSummary } from '../dronelink/moduleVisualizations';
import { sampleWindowMinutes } from '../dronelink/sampledObservations';
import ArtificialHorizon from './ArtificialHorizon';
import HeadingCompass from './HeadingCompass';
import { SummaryDetails } from './NodeSummary';
import { useProjectedSamples } from './useObservationSamples';
import DiagnosticScene from './ui/DiagnosticScene';
import './Hmc5883lInstrument.css';

export default function Hmc5883lInstrument({ nodeId, label, summary, scope }: {
    nodeId: number;
    label: string;
    summary: Hmc5883lSummary;
    scope?: string;
}) {
    const { magneticHeading, pitch, roll, pitchDegrees, rollDegrees, quality, vector, calibrated } = summary;
    const samples = useProjectedSamples(scope, summary.rawReading, hmc5883lRawVector)
        .flatMap(sample => sample.value === null ? [] : [sample.value]);
    const horizonAttitude = {
        ...summary,
        pitchDegrees: pitchDegrees !== undefined && Math.abs(pitchDegrees) <= 90 ? pitchDegrees : undefined,
        rollDegrees: rollDegrees !== undefined && Math.abs(rollDegrees) <= 180 ? rollDegrees : undefined
    };
    const vectorScale = calibrated && Math.max(1, Math.abs(calibrated[0]), Math.abs(calibrated[1]));

    return <section className="dw-hmc" aria-label={label}>
        <dl className="dw-channel-summary dw-hmc-readings">
            <div className="dw-hmc-heading">
                <dt className={magneticHeading.unavailable ? 'dw-meta' : 'visually-hidden'}>Heading</dt>
                <dd data-unavailable={magneticHeading.unavailable || undefined}>
                    {magneticHeading.bearing !== undefined && <HeadingCompass bearing={magneticHeading.bearing} />}
                    <strong>{magneticHeading.unavailable ? 'Unavailable' : magneticHeading.text}</strong>
                </dd>
            </div>
            <div className="dw-hmc-attitude">
                <dt className="visually-hidden">Artificial horizon</dt>
                <dd>
                    <ArtificialHorizon attitude={horizonAttitude} />
                </dd>
                <dt className="dw-meta">Pitch</dt><dd data-unavailable={pitch.unavailable || undefined}>{pitch.text}</dd>
                <dt className="dw-meta">Roll</dt><dd data-unavailable={roll.unavailable || undefined}>{roll.text}</dd>
            </div>
            <div className="dw-hmc-vector">
                <dt className="dw-meta">{quality.label}</dt>
                <dd data-unavailable={quality.unavailable || undefined}>{quality.text}{quality.status && !quality.unavailable &&
                    <span className="dw-meta dw-hmc-warning">Low</span>}</dd>
                <dt className="visually-hidden">{vector.label}</dt>
                <dd>
                    {calibrated && vectorScale ? <svg viewBox="0 0 96 66" role="img" aria-label={`Calibrated magnetic vector. ${vector.text}.`}>
                        <path className="dw-hmc-reference" d="M 10 33 H 86 M 48 4 V 62" />
                        <text x="86" y="29">X</text><text x="52" y="9">Y</text>
                        <line className="dw-hmc-vector-line" x1="48" y1="33"
                            x2={48 + 26 * calibrated[0] / vectorScale} y2={33 - 26 * calibrated[1] / vectorScale} />
                        <circle className="dw-hmc-vector-point" cx={48 + 26 * calibrated[0] / vectorScale}
                            cy={33 - 26 * calibrated[1] / vectorScale} r="2.5" />
                    </svg> : <span className="dw-meta">Vector unavailable</span>}
                </dd>
                {calibrated && <dd className="dw-hmc-components">{vector.text}</dd>}
            </div>
        </dl>
        <div className="dw-hmc-actions">
            <DiagnosticScene title="Magnetic calibration" scene={{ ...summary.scene, samples }}
                readings={<>
                    <p className="dw-meta">Raw magnetic samples · last {sampleWindowMinutes} min</p>
                    <SummaryDetails nodeId={nodeId} summaries={summary.diagnosticReadings} now={Date.now()} />
                </>} />
        </div>
    </section>;
}
