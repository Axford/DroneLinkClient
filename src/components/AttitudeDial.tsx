import React from 'react';
import { CircularDialGuides, DialHand, dialPoint } from './CircularDialGeometry';
import './AttitudeDial.css';

interface AttitudeDialProps {
    label: string;
    description: string;
    value?: number;
    bins: number[];
    peak: number;
    zero: 'right' | 'up';
    positive: 'clockwise' | 'counterclockwise';
}

type CircularDialProps = Omit<AttitudeDialProps, 'label'> & { ticks?: boolean };

export function CircularDial({ description, value, bins, peak, zero, positive, ticks }: CircularDialProps) {
    const binSize = bins.length ? 360 / bins.length : 0;
    const sweep = positive === 'clockwise' ? 1 : 0;
    const rotation = (degrees: number) => (zero === 'right' ? 90 : 0) + (sweep ? degrees : -degrees);
    const angleAt = (index: number) => index < bins.length / 2 ? index * binSize : (index - bins.length) * binSize;
    return <svg viewBox="0 0 100 100" role="img" aria-label={description}>
        <CircularDialGuides zeroAngle={rotation(0)} ticks={ticks} />
        {bins.map((count, index) => {
            if (!count) return null;
            const start = angleAt(index);
            const end = start + binSize;
            const inner = 19;
            const outer = inner + 22 * count / peak;
            return <path key={index} className="dw-attitude-bin"
                d={`M ${dialPoint(rotation(start), outer)} A ${outer} ${outer} 0 0 ${sweep} ${dialPoint(rotation(end), outer)} L ${dialPoint(rotation(end), inner)} A ${inner} ${inner} 0 0 ${1 - sweep} ${dialPoint(rotation(start), inner)} Z`} />;
        })}
        {value !== undefined && <DialHand className="dw-attitude-needle" bearing={rotation(value)} inner={19} outer={46} />}
    </svg>;
}

export default function AttitudeDial({ label, ...dial }: AttitudeDialProps) {
    const { value } = dial;
    return <div className="dw-attitude-dial">
        <dt className="dw-meta">{label}</dt>
        <dd data-unavailable={value === undefined || undefined}>
            <CircularDial {...dial} />
            {value === undefined ? <span className="dw-meta">Unavailable</span> : <span>{value.toFixed(1)}°</span>}
        </dd>
    </div>;
}
