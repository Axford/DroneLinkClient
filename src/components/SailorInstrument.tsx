import React from 'react';
import type { ObservedSummary, SailorSummary } from '../dronelink/moduleVisualizations';
import { CircularDialGuides, DialHand, dialPoint } from './CircularDialGeometry';
import { SailingProfiles, projectSailingProfiles } from './SailingProfiles';
import './SailorInstrument.css';

const hands = [
    { role: 'heading', inner: 19, outer: 49 },
    { role: 'target', inner: 19, outer: 49 },
    { role: 'course', inner: 19, outer: 49 },
    { role: 'wind', inner: 28, outer: 66 },
    { role: 'courseWind', inner: 33, outer: 54 },
    { role: 'wing', inner: 19, outer: 55 }
] as const;

function rudderPath(heading: number, output: number) {
    const end = heading + output * 180 / Math.PI;
    const sweep = output > 0 ? 1 : 0;
    return `M ${dialPoint(heading, 44)} A 44 44 0 0 ${sweep} ${dialPoint(end, 44)} L ${dialPoint(heading + (end - heading) * 1.1, 36)} L ${dialPoint(end, 28)} A 28 28 0 0 ${1 - sweep} ${dialPoint(heading, 28)} Z`;
}

function Readout({ reading, role }: { reading: ObservedSummary; role?: string }) {
    return <div>
        <dt className="dw-meta">{role && <i data-series={role} aria-hidden="true" />}{reading.label}</dt>
        <dd data-unavailable={reading.unavailable || undefined}>{reading.unavailable ? 'Unavailable' : reading.text}</dd>
    </div>;
}

export default function SailorInstrument({ label, summary }: { label: string; summary: SailorSummary }) {
    const { sailBearings, polar, speeds, rudderOutput, gybing, sheet } = summary;
    const orientation = sailBearings.courseWind.bearing;
    const heading = sailBearings.heading.bearing;
    const profiles = projectSailingProfiles({ polar, speeds, bearing: orientation, inner: 19, outer: 44 });
    const { polarStatus, speedStatus } = profiles;
    const description = 'Sailing bearings clockwise from north. ' +
        hands.map(({ role }) => {
            const reading = sailBearings[role];
            return `${reading.label}: ${reading.unavailable ? 'unavailable' : reading.text}.`;
        }).join(' ') +
        ` Sheet: ${sheet.unavailable ? 'unavailable' : sheet.text}. Rudder: ${summary.rudder.unavailable ? 'unavailable' : summary.rudder.text}.` +
        ` Polar profile ${polarStatus || 'shown'}. Estimated speed profile ${speedStatus || 'shown'}. Profiles use course wind and a relative scale. Reading Details lists the observed sector values.`;
    return <section className="dw-sailor" aria-label={label}>
        <div className="dw-sailor-main">
            <div className="dw-sailor-dial">
                <svg viewBox="-20 -20 140 140" role="img" aria-label={description}>
                    <SailingProfiles profiles={profiles} />
                    {heading !== undefined && rudderOutput !== undefined && rudderOutput !== 0 &&
                        <path className="dw-sailor-rudder" data-gybing={gybing || undefined} d={rudderPath(heading, rudderOutput)} />}
                    <CircularDialGuides ticks />
                    {hands.map(({ role, inner, outer }) => {
                        const bearing = sailBearings[role].bearing;
                        return bearing !== undefined && <DialHand key={role} className={`dw-sailor-hand dw-sailor-${role}`}
                            role={role} bearing={bearing} inner={inner} outer={outer} />;
                    })}
                </svg>
                <div className="dw-sailor-north dw-meta" aria-hidden="true">N</div>
                <div className="dw-sailor-sheet" aria-hidden="true">
                    <span className="dw-meta">Sheet</span>
                    <strong data-unavailable={sheet.unavailable || undefined}>{sheet.text}</strong>
                </div>
            </div>
            <dl className="dw-sailor-context">{summary.context.map(reading => <Readout key={reading.label} reading={reading} />)}</dl>
            <dl className="dw-sailor-bearings">
                {hands.map(({ role }) => <Readout key={role} role={role} reading={sailBearings[role]} />)}
                <Readout reading={summary.rudder} />
            </dl>
        </div>
        <div className="dw-sailor-profiles dw-meta">
            <span><i data-series="polar" aria-hidden="true" />Polar{polarStatus && ` · ${polarStatus}`}</span>
            <span><i data-series="speed" aria-hidden="true" />Est. speed{speedStatus && ` · ${speedStatus}`}</span>
            <span>Course wind · relative scale</span>
        </div>
    </section>;
}
