import React from 'react';
import './HeadingCompass.css';

export default function HeadingCompass({ bearing }: { bearing: number }) {
    return <span className="dw-heading-compass" aria-hidden="true">
        <span>N</span><span>E</span><span>S</span><span>W</span>
        <i style={{ transform: `rotate(${bearing % 360}deg)` }} />
    </span>;
}
