import React from 'react';
import './CircularDialGeometry.css';

const dialCentre = 50;

export function dialPoint(angle: number, radius: number) {
    const radians = angle * Math.PI / 180;
    return `${dialCentre + radius * Math.sin(radians)} ${dialCentre - radius * Math.cos(radians)}`;
}

export function DialHand({ bearing, inner, outer, className, role }: {
    bearing: number;
    inner: number;
    outer: number;
    className?: string;
    role?: string;
}) {
    return <line className={className} data-hand={role} x1={dialCentre} x2={dialCentre}
        y1={dialCentre - inner} y2={dialCentre - outer} transform={`rotate(${bearing} ${dialCentre} ${dialCentre})`} />;
}

export function CircularDialGuides({ zeroAngle = 0, ticks }: { zeroAngle?: number; ticks?: boolean }) {
    return <>
        <circle className="dw-circular-dial-ring" cx={dialCentre} cy={dialCentre} r="44" />
        <line className="dw-circular-dial-reference" x1={dialCentre} y1="6" x2={dialCentre} y2="16"
            transform={`rotate(${zeroAngle} ${dialCentre} ${dialCentre})`} />
        {ticks && <>
            <circle className="dw-circular-dial-ring" cx={dialCentre} cy={dialCentre} r="19" />
            {Array.from({ length: 12 }, (_, index) => <line key={index} className="dw-circular-dial-ring"
                x1={dialCentre} y1="2" x2={dialCentre} y2="6" transform={`rotate(${index * 30} ${dialCentre} ${dialCentre})`} />)}
        </>}
    </>;
}
