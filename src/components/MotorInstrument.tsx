import React from 'react';
import type { MotorSummary } from '../dronelink/moduleVisualizations';
import './MotorInstrument.css';

export default function MotorInstrument({ label, summary }: { label: string; summary: MotorSummary }) {
    const { motorSpeed, configuredLimits, deadbandReading, mappedSpeed, limits, deadband } = summary;
    const start = Math.min(0, limits?.min ?? 0);
    const end = Math.max(0, limits?.max ?? 0);
    const position = (value: number) => 100 * (Math.min(end, Math.max(start, value)) - start) / (end - start);

    return <section className="dw-motor" aria-label={label}>
        <dl className="dw-motor-readings">
            <div><dt className="dw-meta">Speed input</dt>
                <dd data-unavailable={motorSpeed.unavailable || undefined}>{motorSpeed.unavailable ? 'Unavailable' : motorSpeed.text}</dd></div>
            <div><dt className="dw-meta">Deadband</dt>
                <dd data-unavailable={deadband === undefined || undefined}>{deadband === undefined ? 'Unavailable' : deadbandReading.text}</dd></div>
        </dl>
        {limits ? <>
            <div className="dw-motor-scale">
                <span className="dw-meta">Mapped speed before deadband</span>
                <span data-unavailable={mappedSpeed === undefined || undefined}>{mappedSpeed?.toFixed(2) ?? 'Unavailable'}</span>
            </div>
            <div className="dw-motor-track" aria-hidden="true">
                {deadband !== undefined && deadband > 0 && <span className="dw-motor-band"
                    style={{ left: `${position(-deadband)}%`, width: `${position(deadband) - position(-deadband)}%` }} />}
                <span className="dw-motor-zero" style={{ left: `${position(0)}%` }} />
                {mappedSpeed !== undefined && <span className="dw-motor-bar" data-zero={mappedSpeed === 0 || undefined}
                    style={{ left: `${Math.min(position(0), position(mappedSpeed))}%`, width: `${Math.abs(position(mappedSpeed) - position(0))}%` }} />}
                {limits.min > 0 && <span className="dw-motor-limit" style={{ left: `${position(limits.min)}%` }} />}
                {limits.max < 0 && <span className="dw-motor-limit" style={{ left: `${position(limits.max)}%` }} />}
            </div>
            <div className="dw-motor-scale">
                <span className="dw-meta">Limits</span>
                <span>{configuredLimits.text}</span>
                <span className="dw-meta">· Zero</span>
                <span>0</span>
            </div>
        </> : <p className="dw-meta mb-0">Configured limits unavailable</p>}
    </section>;
}
