import React from 'react';
import type { HorizonReadings } from '../dronelink/moduleVisualizations';
import './ArtificialHorizon.css';

export default function ArtificialHorizon({ attitude }: { attitude: HorizonReadings }) {
    const { pitch, roll, pitchDegrees, rollDegrees } = attitude;
    if (pitchDegrees === undefined || rollDegrees === undefined) {
        return <span className="dw-meta">Horizon unavailable</span>;
    }

    // A nose-up reading moves the horizon down; positive roll slopes it down to the right.
    const offset = 36 + 72 * Math.sin(pitchDegrees * Math.PI / 180);
    return <svg className="dw-artificial-horizon" viewBox="0 0 160 72" role="img"
        aria-label={`Artificial horizon. Pitch ${pitch.text}, roll ${roll.text}.`}>
        <g className="dw-horizon-plane" transform={`translate(80 ${offset}) rotate(${rollDegrees})`}>
            <rect x="-250" width="500" height="250" />
            <line x1="-250" x2="250" y1="0" y2="0" />
        </g>
        <path className="dw-horizon-reference" d="M 52 36 H 69 M 91 36 H 108 M 75 36 H 85 M 60 24 H 100 M 60 48 H 100" />
    </svg>;
}
