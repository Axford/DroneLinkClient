import React from 'react';
import { signedRssi } from '../dronelink/moduleVisualizations';
import type { ObservedSummary } from '../dronelink/moduleVisualizations';
import { traceSegments } from '../dronelink/sampledObservations';
import useObservationSamples from './useObservationSamples';
import './Rfm69Signal.css';

const receiptGapMs = 15_000;
const xStart = 4;
const xEnd = 296;
const yTop = 4;
const yBottom = 96;

export default function Rfm69Signal({ signal, scope }: { signal: ObservedSummary; scope?: string }) {
    const samples = useObservationSamples(scope, signal.reading, signedRssi);
    const segments = traceSegments(samples, receiptGapMs);
    const latest = samples[samples.length - 1];
    const raw = signal.reading?.values[0];
    const currentValue = typeof raw === 'number' ? signedRssi(raw) : undefined;
    const current = !signal.unavailable && latest?.receivedAt === signal.reading?.lastHeard &&
        latest?.value === currentValue ? latest : undefined;
    const end = latest?.receivedAt ?? 0;
    const start = Math.min(end - 10_000, samples[0]?.receivedAt ?? end);
    const x = (time: number) => xStart + (time - start) / (end - start) * (xEnd - xStart);
    const y = (value: number) => yTop - value / 100 * (yBottom - yTop);
    const values = segments.flatMap(points => points.map(point => point.value!));
    const seconds = Math.round((end - start) / 1000);
    const description = values.length
        ? `Recent RSSI by receipt time. ${values.length} readings on a ${seconds}-second axis, ranging from ${Math.round(Math.min(...values))} to ${Math.round(Math.max(...values))} dBm. ${segments.length > 1 || samples.some(point => point.value === null) ? 'Trace has gaps. ' : ''}Latest reported RSSI: ${signal.unavailable ? 'unavailable' : signal.text}.${current && current.value !== null ? ' Current receipt marked.' : ''}`
        : '';

    return <figure className="dw-rssi-signal">
        <figcaption>
            <span className="dw-meta">RSSI</span>
            <strong data-unavailable={signal.unavailable || undefined}>{signal.unavailable ? 'Unavailable' : signal.text}</strong>
        </figcaption>
        {values.length > 0 ? <div className="dw-rssi-chart">
            <div className="dw-rssi-axis dw-meta" aria-hidden="true"><span>0</span><span>−50</span><span>−100</span></div>
            <svg viewBox="0 0 300 100" role="img" aria-label={description}>
                {[0, -50, -100].map(value => <line key={value} x1={xStart} x2={xEnd} y1={y(value)} y2={y(value)} />)}
                {segments.map(points => points.length === 1
                    ? points[0] !== current && <circle key={points[0].receivedAt} cx={x(points[0].receivedAt)} cy={y(points[0].value!)} r="2.5" />
                    : <polyline key={points[0].receivedAt} points={points.map(point => `${x(point.receivedAt)},${y(point.value!)}`).join(' ')} />)}
                {current && current.value !== null && <circle className="dw-rssi-current"
                    cx={x(current.receivedAt)} cy={y(current.value)} r="3.5" />}
            </svg>
            <div className="dw-rssi-time dw-meta" aria-hidden="true"><span>−{seconds} s</span><span>Latest receipt</span></div>
        </div> : <p className="dw-meta mb-0">No recent signal samples</p>}
    </figure>;
}
