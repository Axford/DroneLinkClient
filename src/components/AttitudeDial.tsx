import React from 'react';
import './AttitudeDial.css';

const centre = 50;

export function dialPoint(angle: number, radius: number) {
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

type CircularDialProps = Omit<AttitudeDialProps, 'label'> & { ticks?: boolean };

export function DialHand({ bearing, inner, outer, className, role }: {
    bearing: number;
    inner: number;
    outer: number;
    className?: string;
    role?: string;
}) {
    return <line className={className} data-hand={role} x1={centre} x2={centre}
        y1={centre - inner} y2={centre - outer} transform={`rotate(${bearing} 50 50)`} />;
}

export function CircularDialGuides({ zeroAngle = 0, ticks }: { zeroAngle?: number; ticks?: boolean }) {
    return <>
        <circle className="dw-attitude-ring" cx={centre} cy={centre} r="44" />
        <line className="dw-attitude-reference" x1={centre} y1="6" x2={centre} y2="16"
            transform={`rotate(${zeroAngle} 50 50)`} />
        {ticks && <>
            <circle className="dw-attitude-ring" cx={centre} cy={centre} r="19" />
            {Array.from({ length: 12 }, (_, index) => <line key={index} className="dw-attitude-ring"
                x1={centre} y1="2" x2={centre} y2="6" transform={`rotate(${index * 30} 50 50)`} />)}
        </>}
    </>;
}

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
        {value !== undefined && <line className="dw-attitude-needle" x1={centre} y1="31" x2={centre} y2="4"
            transform={`rotate(${rotation(value)} 50 50)`} />}
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
