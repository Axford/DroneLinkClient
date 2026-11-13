import React from 'react';
import type { WaypointSummary } from '../dronelink/moduleVisualizations';
import './WaypointInstrument.css';

function Readout({ label, value }: { label: string; value?: string }) {
    return <div>
        <dt className="dw-meta">{label}</dt>
        <dd data-unavailable={value === undefined || undefined}>{value ?? 'Unavailable'}</dd>
    </div>;
}

export default function WaypointInstrument({ label, summary }: { label: string; summary: WaypointSummary }) {
    const { waypoint, total, speed, eta, loop, covered, remaining, leg, routeProgress } = summary;
    const value = (reading: typeof waypoint) => reading.unavailable ? undefined : reading.text;
    return <section className="dw-waypoint" aria-label={label}>
        <dl className="dw-waypoint-status">
            <Readout label={waypoint.label} value={value(waypoint)} />
            <Readout label={speed.label} value={value(speed)} />
            <Readout label="ETA" value={eta} />
            <Readout label={loop.label} value={value(loop)} />
        </dl>
        {routeProgress ? <div className="dw-waypoint-track" role="img"
            aria-label={`Route progress. ${covered.text} estimated covered, ${remaining.text} remaining, ${total.text} total. ${leg.text} to next waypoint.`}>
            <span className="dw-waypoint-completed" style={{ width: `${routeProgress.completed * 100}%` }} />
            <span className="dw-waypoint-next" style={{ left: `${routeProgress.next * 100}%` }} />
        </div> : <p className="dw-meta dw-waypoint-empty">Route progress unavailable</p>}
        <dl className="dw-waypoint-distances">
            <Readout label={covered.label} value={value(covered)} />
            <div>
                <dt className="dw-meta"><span className="dw-waypoint-key" aria-hidden="true" />{leg.label}</dt>
                <dd data-unavailable={leg.unavailable || undefined}>{value(leg) ?? 'Unavailable'}</dd>
            </div>
            <Readout label={remaining.label} value={value(remaining)} />
            <Readout label={total.label} value={value(total)} />
        </dl>
    </section>;
}
