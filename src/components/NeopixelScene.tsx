import React from 'react';
import './NeopixelScene.css';

export default function NeopixelScene({ label, colours }: { label: string; colours: (string | undefined)[] }) {
    const unavailable = colours.every(colour => colour === undefined);
    return <section className="dw-neopixel-scene" aria-label={label}>
        <dl className="dw-neopixel-segments">
            {colours.map((colour, index) => <div key={index}>
                <dt className="visually-hidden">Segment {index + 1}</dt>
                <dd>
                    <span className="dw-neopixel-swatch" aria-hidden="true" data-unavailable={colour === undefined || undefined}
                        style={colour === undefined ? undefined : { backgroundColor: colour }} />
                    {colour ?? <><span aria-hidden="true">—</span><span className="visually-hidden">Unavailable</span></>}
                </dd>
            </div>)}
        </dl>
        {unavailable && <p className="dw-meta mb-0">Scene unavailable</p>}
    </section>;
}
