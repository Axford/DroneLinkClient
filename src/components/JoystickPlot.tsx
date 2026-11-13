import React from 'react';
import './JoystickPlot.css';

const centre = 50;
const extent = 36;
const markerRadius = 9;

export default function JoystickPlot({ x, y, z, pressed }: {
    x?: number;
    y?: number;
    z?: number;
    pressed?: boolean;
}) {
    const position = x === undefined || y === undefined ? undefined : {
        x: centre + x * extent,
        y: centre - y * extent
    };
    const rotation = (z ?? 0) * Math.PI;
    const arcEndX = markerRadius * Math.sin(rotation);
    const arcEndY = -markerRadius * Math.cos(rotation);

    return <div className="dw-joystick-graphic">
        <svg viewBox="0 0 100 100" role="img" aria-label={position ? 'Joystick position on centred X and Y axes' : 'Joystick position unavailable'}>
            <path className="dw-joystick-crosshair" d="M 14 50 H 86 M 50 14 V 86" />
            {position && <g transform={`translate(${position.x}, ${position.y})`} className="dw-joystick-marker">
                <circle r={markerRadius} data-pressed={pressed || undefined} />
                {rotation !== 0 && <path className="dw-joystick-arc"
                    d={`M 0 ${-markerRadius} A ${markerRadius} ${markerRadius} 0 0 ${rotation > 0 ? 1 : 0} ${arcEndX} ${arcEndY}`} />}
            </g>}
        </svg>
        {!position && <span className="dw-meta">Position unavailable</span>}
    </div>;
}
