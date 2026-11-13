import React from 'react';
import { kiteVector, type KiteControllerSummary } from '../dronelink/moduleVisualizations';
import { sampleWindowMinutes, traceSegments } from '../dronelink/sampledObservations';
import { useProjectedSamples } from './useObservationSamples';
import './KiteControllerInstrument.css';

export default function KiteControllerInstrument({ label, summary, scope }: {
    label: string;
    summary: KiteControllerSummary;
    scope?: string;
}) {
    const { kiteVector: current, kiteWaypoint: waypoint, vectorReading, readings } = summary;
    const samples = useProjectedSamples(scope, vectorReading, kiteVector);
    const positions = samples.flatMap(({ value }) => value ? [value] : []);
    const radius = waypoint?.radius ?? 0;
    const yawRange = Math.max(75, current ? Math.abs(current.yaw) : 0,
        waypoint ? Math.abs(waypoint.yaw) + radius : 0, ...positions.map(value => Math.abs(value.yaw)));
    const pitchTop = Math.max(90, current?.pitch ?? 0, waypoint ? waypoint.pitch + radius : 0, ...positions.map(value => value.pitch));
    const pitchBottom = Math.min(0, current?.pitch ?? 0, waypoint ? waypoint.pitch - radius : 0, ...positions.map(value => value.pitch));
    const scale = Math.min(138 / yawRange, 100 / (pitchTop - pitchBottom));
    const x = (yaw: number) => 150 - yaw * scale;
    const y = (pitch: number) => 14 + (pitchTop - pitch) * scale;
    const segments = traceSegments(samples, 15_000);
    const trail = segments.map(segment => segment.flatMap(({ value }, index) => value
        ? [`${index === 0 ? 'M' : 'L'} ${x(value.yaw)} ${y(value.pitch)}`] : []).join(' ')).join(' ');
    const isolated = segments.flatMap(segment => segment.length === 1 ? segment : []);
    const roll = (current?.roll ?? 0) * Math.PI / 180;
    const description = 'Kite yaw and pitch. Positive yaw points left and positive pitch points up. ' +
        (current ? `Yaw ${current.yaw.toFixed(0)} degrees, pitch ${current.pitch.toFixed(0)} degrees, roll ${current.roll.toFixed(0)} degrees estimated from motion. ` : 'Flight vector unavailable. ') +
        (waypoint ? `Waypoint yaw ${waypoint.yaw.toFixed(0)}, pitch ${waypoint.pitch.toFixed(0)}, radius ${waypoint.radius.toFixed(0)} degrees. ` : 'Waypoint unavailable. ') +
        `Recent trail: ${positions.length} readings.`;
    return <section className="dw-kite" aria-label={label}>
        <div className="dw-kite-plot">
            <svg viewBox="0 0 300 128" role="img" aria-label={description}>
                <path className="dw-kite-axes" d={`M 12 ${y(0)} H 288 M 150 14 V ${y(pitchBottom)}`} />
                {waypoint && <circle className="dw-kite-waypoint" cx={x(waypoint.yaw)} cy={y(waypoint.pitch)} r={Math.max(1.5, radius * scale)} />}
                {trail && <path className="dw-kite-trail" d={trail} />}
                {isolated.map(({ receivedAt, value }) => value &&
                    <circle key={receivedAt} className="dw-kite-trail-point" cx={x(value.yaw)} cy={y(value.pitch)} r="1.6" />)}
                {current && <>
                    <line className="dw-kite-vector" x1="150" y1={y(0)} x2={x(current.yaw)} y2={y(current.pitch)} />
                    <circle className="dw-kite-current" cx={x(current.yaw)} cy={y(current.pitch)} r="2.5" />
                    <line className="dw-kite-roll" x1={x(current.yaw)} y1={y(current.pitch)}
                        x2={x(current.yaw) - 11 * Math.sin(roll)} y2={y(current.pitch) - 11 * Math.cos(roll)} />
                </>}
            </svg>
            <div className="dw-kite-legend dw-meta">
                <span>+Yaw left · +Pitch up</span>
                <span className="dw-kite-waypoint-key">Waypoint{!waypoint && ' unavailable'}</span>
                {(segments.some(segment => segment.length > 1) || isolated.length > 0 && !current) && <span>Trail · last {sampleWindowMinutes} min</span>}
            </div>
        </div>
        <dl className="dw-kite-readings">
            {readings.map(reading => <div key={reading.label}>
                <dt className="dw-meta">{reading.label}</dt>
                <dd data-unavailable={reading.text === undefined || undefined}>{reading.text ?? 'Unavailable'}</dd>
            </div>)}
        </dl>
    </section>;
}
