import React from 'react';
import './AttitudeDial.css';

const centre = 50;

function point(angle: number, radius: number) {
    const radians = angle * Math.PI / 180;
    return `${centre + radius * Math.sin(radians)} ${centre - radius * Math.cos(radians)}`;
}

interface AttitudeDialProps {
    label: string;
    description: string;
    value?: number;
    bins: number[];
    peak: number;
    zero: 'right' | 'up';
    positive: 'clockwise' | 'counterclockwise';
}

export default function AttitudeDial({ label, description, value, bins, peak, zero, positive }: AttitudeDialProps) {
    const binSize = 360 / bins.length;
    const sweep = positive === 'clockwise' ? 1 : 0;
    const rotation = (degrees: number) => (zero === 'right' ? 90 : 0) + (sweep ? degrees : -degrees);
    const angleAt = (index: number) => index < bins.length / 2 ? index * binSize : (index - bins.length) * binSize;
    return <div className="dw-attitude-dial">
        <dt className="dw-meta">{label}</dt>
        <dd data-unavailable={value === undefined || undefined}>
            <svg viewBox="0 0 100 100" role="img" aria-label={description}>
                <circle className="dw-attitude-ring" cx={centre} cy={centre} r="44" />
                <line className="dw-attitude-reference" x1={centre} y1="6" x2={centre} y2="16"
                    transform={`rotate(${rotation(0)} 50 50)`} />
                {bins.map((count, index) => {
                    if (!count) return null;
                    const start = angleAt(index);
                    const end = start + binSize;
                    const inner = 19;
                    const outer = inner + 22 * count / peak;
                    return <path key={index} className="dw-attitude-bin"
                        d={`M ${point(rotation(start), outer)} A ${outer} ${outer} 0 0 ${sweep} ${point(rotation(end), outer)} L ${point(rotation(end), inner)} A ${inner} ${inner} 0 0 ${1 - sweep} ${point(rotation(start), inner)} Z`} />;
                })}
                {value !== undefined && <line className="dw-attitude-needle" x1={centre} y1="31" x2={centre} y2="4"
                    transform={`rotate(${rotation(value)} 50 50)`} />}
            </svg>
            {value === undefined ? <span className="dw-meta">Unavailable</span> : <span>{value.toFixed(1)}°</span>}
        </dd>
    </div>;
}
