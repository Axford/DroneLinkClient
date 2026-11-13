import React, { useContext } from 'react';
import type { NavSummary, ObservedSummary } from '../dronelink/moduleVisualizations';
import { CircularDialGuides, DialHand } from './AttitudeDial';
import { ObservationNamesContext } from './parameterPresentation';
import './NavInstrument.css';

const hands = [
    { role: 'heading', inner: 19, outer: 47 },
    { role: 'adjusted', inner: 19, outer: 47 },
    { role: 'wind', inner: 32, outer: 53 }
] as const;

function Readout({ reading, role }: { reading: ObservedSummary; role?: string }) {
    return <div className="dw-nav-reading">
        <dt className="dw-meta">{role && <span aria-hidden="true" className="dw-nav-key" data-hand={role} />}{reading.label}</dt>
        <dd data-unavailable={reading.unavailable || undefined}>{reading.unavailable ? 'Unavailable' : reading.text}</dd>
    </div>;
}

export default function NavInstrument({ nodeId, label, summary }: {
    nodeId: number;
    label: string;
    summary: NavSummary;
}) {
    const { navigationBearings, crossTrack, distance, following, followingNode } = summary;
    const nodes = useContext(ObservationNamesContext);
    const external = followingNode !== undefined && followingNode !== nodeId;
    const name = external ? nodes[followingNode]?.name : undefined;
    const source = external ? { ...following, label: 'Following', text: name || `Node ${followingNode}` } : following;
    const description = 'Navigation bearings clockwise from north. ' +
        Object.values(navigationBearings).map(reading => `${reading.label}: ${reading.unavailable ? 'unavailable' : reading.text}`).join('. ') + '.';

    return <dl className="dw-channel-summary dw-nav-summary" aria-label={label}>
        <div className="dw-nav-dial">
            <dt className="visually-hidden">Navigation bearings</dt>
            <dd>
                <svg viewBox="-6 -6 112 112" role="img" aria-label={description}>
                    <CircularDialGuides ticks />
                    {hands.map(({ role, inner, outer }) => {
                        const { bearing, parameterId } = navigationBearings[role];
                        return bearing !== undefined && <DialHand key={parameterId} className="dw-nav-hand" role={role} bearing={bearing} inner={inner} outer={outer} />;
                    })}
                </svg>
                <span className="dw-meta dw-nav-north" aria-hidden="true">N ↑</span>
            </dd>
        </div>
        <div className="dw-nav-readings">
            {hands.map(({ role }) => <Readout key={role} reading={navigationBearings[role]} role={role} />)}
            <Readout reading={crossTrack} />
            <Readout reading={distance} />
            <Readout reading={source} />
        </div>
    </dl>;
}
