import React from 'react';
import type { ReceiverSummary } from '../dronelink/moduleVisualizations';
import './ReceiverInstrument.css';

export default function ReceiverInstrument({ label, summary }: { label: string; summary: ReceiverSummary }) {
    const { mode, receiverOutputs, rawPwm } = summary;
    return <section className="dw-receiver" aria-label={label}
        data-mode={mode.kind}>
        <p className="dw-receiver-mode mb-0" data-unavailable={mode.unavailable || undefined}>
            {mode.unavailable ? 'Mode unavailable' : <><span className="visually-hidden">Mode </span>{mode.text}</>}
        </p>
        <dl className="dw-receiver-outputs">
            {receiverOutputs.map(({ value, reading }, index) => {
                const outside = value !== undefined && Math.abs(value) > 1;
                return <div key={reading.parameterId}>
                    <dt className="dw-meta"><span className="visually-hidden">Channel </span>{index + 1}</dt>
                    <dd data-unavailable={reading.unavailable || undefined}>
                        <div className="dw-receiver-track" aria-hidden="true" data-unavailable={reading.unavailable || undefined}>
                            {value !== undefined && <span className="dw-receiver-bar"
                                data-direction={value < 0 ? 'negative' : 'positive'} data-zero={value === 0 || undefined}
                                style={{ height: `${50 * Math.min(1, Math.abs(value))}%` }} />}
                        </div>
                        <span>{reading.unavailable ? '—' : reading.text}</span>
                        {reading.unavailable && <span className="visually-hidden"> Unavailable</span>}
                        {outside && <span className="dw-meta dw-receiver-range">{value < 0 ? 'Below range' : 'Above range'}</span>}
                    </dd>
                </div>;
            })}
        </dl>
        <div className="dw-receiver-pwm">
            <span className="dw-meta">Raw PWM{rawPwm && ' (µs)'}</span>
            {rawPwm ? <ol role="list" aria-label="Raw PWM in microseconds">
                {rawPwm.map((value, index) => <li key={index}><span className="visually-hidden">Channel {index + 1} </span>{value}</li>)}
            </ol> : <span className="dw-meta">Unavailable</span>}
        </div>
    </section>;
}
