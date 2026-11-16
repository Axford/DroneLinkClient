import React from 'react';
import { ExclamationOctagon, ExclamationTriangle } from 'react-bootstrap-icons';
import type { Mpu6050Summary } from '../dronelink/moduleVisualizations';
import ArtificialHorizon from './ArtificialHorizon';
import { SummaryDetails } from './NodeSummary';
import DiagnosticScene from './ui/DiagnosticScene';
import './Mpu6050Instrument.css';

export default function Mpu6050Instrument({ nodeId, label, summary }: {
    nodeId: number;
    label: string;
    summary: Mpu6050Summary;
}) {
    const { pitch, roll, temperature, calibrationMode } = summary;
    return <section aria-label={label}>
        <dl className="dw-channel-summary dw-mpu-readings">
            <div className="dw-mpu-graphic">
                <dt className="visually-hidden">Artificial horizon</dt>
                <dd><ArtificialHorizon attitude={summary} /></dd>
            </div>
            <div className="dw-mpu-values">
                {[pitch, roll, temperature, calibrationMode].map(reading => <React.Fragment key={reading.parameterId}>
                    <dt className="dw-meta">{reading.label}</dt>
                    <dd data-unavailable={reading.unavailable || undefined} data-severity={reading.severity}>
                        {reading.text}
                        {reading.severity === 'warning' && <ExclamationTriangle aria-hidden="true" />}
                        {reading.severity === 'danger' && <ExclamationOctagon aria-hidden="true" />}
                        {reading.status && <span className="visually-hidden"> · {reading.status}</span>}
                    </dd>
                </React.Fragment>)}
            </div>
        </dl>
        <div className="dw-mpu-actions">
            <DiagnosticScene title="Accelerometer diagnostic" scene={summary.scene}
                readings={<SummaryDetails nodeId={nodeId} summaries={summary.diagnosticReadings} now={Date.now()} />} />
        </div>
    </section>;
}
