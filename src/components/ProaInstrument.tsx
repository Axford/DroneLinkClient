import React from 'react';
import type { ObservedSummary, ProaSummary } from '../dronelink/moduleVisualizations';
import { CircularDialGuides, DialHand } from './CircularDialGeometry';
import { projectSailingProfiles, SailingProfiles } from './SailingProfiles';
import './ProaInstrument.css';

const hands = [
    { role: 'heading', inner: 30, outer: 48 },
    { role: 'target', inner: 30, outer: 48 },
    { role: 'course', inner: 24, outer: 48 },
    { role: 'wind', inner: 7, outer: 57 },
    { role: 'frame', inner: 5, outer: 30 }
] as const;

function Vessel({ heading, steering }: { heading: number; steering: ProaSummary['steering'] }) {
    const { bow, left, right, wing } = steering;
    return <g className="dw-proa-vessel" transform={`rotate(${heading} 50 50)`}>
        <path className="dw-proa-hull" d="M 50 29 V 60 M 32 60 H 68" />
        {bow.bearing !== undefined && <g data-steering="bow" transform={`rotate(${bow.bearing} 50 29)`}>
            <line x1="50" y1="24" x2="50" y2="36" /><circle cx="50" cy="24" r="1.7" />
        </g>}
        {left.bearing !== undefined && <line data-steering="left" x1="32" y1="54" x2="32" y2="66" transform={`rotate(${left.bearing} 32 60)`} />}
        {right.bearing !== undefined && <line data-steering="right" x1="68" y1="54" x2="68" y2="66" transform={`rotate(${right.bearing} 68 60)`} />}
        {wing.bearing !== undefined && <path data-steering="wing" d="M 50 21 L 53 34 L 50 39 L 47 34 Z" transform={`rotate(${wing.bearing} 50 34)`} />}
    </g>;
}

function Readout({ reading, keyColour }: { reading: ObservedSummary; keyColour?: string }) {
    return <div>
        <dt className="dw-meta">{keyColour && <i data-series={keyColour} aria-hidden="true" />}{reading.label}</dt>
        <dd data-unavailable={reading.unavailable || undefined}>{reading.unavailable ? 'Unavailable' : reading.text}</dd>
    </div>;
}

export default function ProaInstrument({ label, summary }: { label: string; summary: ProaSummary }) {
    const { proaBearings, steering, polar, speeds, context } = summary;
    const heading = proaBearings.heading.bearing;
    const profiles = projectSailingProfiles({ polar, speeds, bearing: proaBearings.wind.bearing, inner: 30, outer: 44 });
    const describe = (readings: ObservedSummary[]) => readings.map(reading =>
        `${reading.label}: ${reading.unavailable ? 'unavailable' : reading.text}.`).join(' ');
    const description = `Proa bearings clockwise from north. ${describe(Object.values(proaBearings))} ` +
        `Steering angles relative to the vessel. ${describe(Object.values(steering))} ` +
        `Polar profile ${profiles.polarStatus || 'shown'}. Estimated speed profile ${profiles.speedStatus || 'shown'}. Profiles run clockwise from live wind on a relative 0 to 255 scale. Reading Details lists the sector values.`;
    return <section className="dw-proa" aria-label={label}>
        <div className="dw-proa-main">
            <div className="dw-proa-dial">
                <svg viewBox="-12 -12 124 124" role="img" aria-label={description}>
                    <SailingProfiles profiles={profiles} />
                    <CircularDialGuides ticks innerRadius={30} />
                    {hands.map(({ role, inner, outer }) => {
                        const bearing = proaBearings[role].bearing;
                        return bearing !== undefined && <DialHand key={role} className="dw-proa-hand"
                            role={role} bearing={bearing} inner={inner} outer={outer} />;
                    })}
                    {heading !== undefined && <Vessel heading={heading} steering={steering} />}
                </svg>
                <span className="dw-meta dw-proa-north" aria-hidden="true">N</span>
            </div>
            <dl className="dw-proa-context">{context.map(reading => <Readout key={reading.label} reading={reading} />)}</dl>
            <dl className="dw-proa-bearings">{hands.map(({ role }) =>
                <Readout key={role} reading={proaBearings[role]} keyColour={role} />)}</dl>
        </div>
        <dl className="dw-proa-steering">
            {Object.entries(steering).map(([role, reading]) => <Readout key={role} reading={reading} keyColour={role} />)}
        </dl>
        <div className="dw-proa-profiles dw-meta">
            <span><i data-series="polar" aria-hidden="true" />Polar{profiles.polarStatus && ` · ${profiles.polarStatus}`}</span>
            <span><i data-series="speed" aria-hidden="true" />Est. speed{profiles.speedStatus && ` · ${profiles.speedStatus}`}</span>
            <span>Live wind · relative scale</span>
        </div>
    </section>;
}
