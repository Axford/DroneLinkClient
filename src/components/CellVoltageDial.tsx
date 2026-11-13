import React from 'react';
import './CellVoltageDial.css';

const maxVolts = 5;
const arc = 'M 16 65 A 38 38 0 1 1 84 65';

export default function CellVoltageDial({ volts, text }: { volts: number; text: string }) {
    return <span className="dw-voltage-dial">
        <svg viewBox="0 0 100 77" aria-hidden="true">
            <path className="dw-voltage-dial-track" d={arc} pathLength="100" />
            {volts > 0 && <path className="dw-voltage-dial-reading" d={arc} pathLength="100"
                strokeDasharray={`${Math.min(volts, maxVolts) / maxVolts * 100} 100`} />}
        </svg>
        <span className="dw-voltage-dial-value">{text}</span>
        <span className="dw-voltage-dial-scale dw-meta" aria-hidden="true"><span>0</span><span>{maxVolts} V</span></span>
        {volts > maxVolts && <span className="dw-voltage-dial-note dw-meta">Above scale</span>}
        <span className="visually-hidden"> · Voltage scale from 0 to {maxVolts} volts</span>
    </span>;
}
