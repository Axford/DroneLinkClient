import React from 'react';
import type { ParameterState } from '../dronelink/DroneLinkState';
import { magneticVector, type MagneticCalibration, type MagneticVector } from '../dronelink/magneticCalibration';
import { maxObservationSamples, sampleWindowMinutes, type ObservationSample } from '../dronelink/sampledObservations';
import { useProjectedSamples } from './useObservationSamples';
import './MagneticScatter.css';

export function useMagneticSamples(scope?: string, reading?: ParameterState) {
    return useProjectedSamples(scope, reading, magneticVector);
}

export default function MagneticScatter({ calibration, samples }: {
    calibration: MagneticCalibration;
    samples: readonly ObservationSample<MagneticVector>[];
}) {
    const { vector, xAxis, yAxis, limits } = calibration;
    const history = samples.flatMap(sample => sample.value === null ? [] : [{ ...sample, value: sample.value }]);
    const bounds = xAxis && yAxis ? { minX: xAxis.min, maxX: xAxis.max, minY: yAxis.min, maxY: yAxis.max } : undefined;
    const extent = Math.max(1,
        ...history.flatMap(({ value }) => [Math.abs(value.x), Math.abs(value.y)]),
        Math.abs(vector?.x ?? 0), Math.abs(vector?.y ?? 0),
        ...[bounds, limits].flatMap(range => range ? Object.values(range).map(Math.abs) : [])
    );
    const x = (value: number) => 80 + 72 * (value / extent);
    const y = (value: number) => 80 - 72 * (value / extent);
    const description = [
        'Magnetic samples on equal X and Y axes in microteslas.',
        `${history.length} valid samples from the last ${sampleWindowMinutes} minutes, up to ${maxObservationSamples} receipts.`,
        vector ? `Latest X ${vector.x.toFixed(2)}, Y ${vector.y.toFixed(2)} microteslas.` : 'Latest vector unavailable.',
        bounds ? 'Calibration bounds shown.' : 'Calibration bounds unavailable.',
        limits ? 'Quadrant limits shown.' : 'Quadrant limits unavailable.'
    ].join(' ');

    return <figure className="dw-magnetic-scatter">
        <figcaption className="dw-meta">Magnetic samples (µT) · last {sampleWindowMinutes} min</figcaption>
        <svg viewBox="0 0 160 160" role="img" aria-label={description}>
            <path className="dw-magnetic-axis" d="M 0 80 H 160 M 80 0 V 160" />
            {bounds && xAxis && yAxis && <g className="dw-magnetic-bounds">
                <rect x={x(bounds.minX)} y={y(bounds.maxY)} width={x(bounds.maxX) - x(bounds.minX)} height={y(bounds.minY) - y(bounds.maxY)} />
                <line x1={x(xAxis.centre)} x2={x(xAxis.centre)} y1={y(bounds.maxY)} y2={y(bounds.minY)} />
                <line x1={x(bounds.minX)} x2={x(bounds.maxX)} y1={y(yAxis.centre)} y2={y(yAxis.centre)} />
            </g>}
            {limits && <ellipse className="dw-magnetic-limits"
                cx={(x(limits.minX) + x(limits.maxX)) / 2} cy={(y(limits.minY) + y(limits.maxY)) / 2}
                rx={(x(limits.maxX) - x(limits.minX)) / 2} ry={(y(limits.minY) - y(limits.maxY)) / 2} />}
            {history.map(({ receivedAt, value }) => <circle key={receivedAt} className="dw-magnetic-sample" cx={x(value.x)} cy={y(value.y)} r="2" />)}
            {vector && <g className="dw-magnetic-latest">
                {bounds && xAxis && yAxis && <line x1={x(xAxis.centre)} y1={y(yAxis.centre)} x2={x(vector.x)} y2={y(vector.y)} />}
                <rect x={x(vector.x) - 2.5} y={y(vector.y) - 2.5} width="5" height="5"
                    transform={`rotate(45 ${x(vector.x)} ${y(vector.y)})`} />
            </g>}
            <text x="155" y="76" textAnchor="end">X</text>
            <text x="84" y="10">Y</text>
        </svg>
        <div className="dw-magnetic-key dw-meta">
            <span><i className="dw-magnetic-sample" />Recent</span>
            <span><i className="dw-magnetic-latest" />Latest</span>
            {bounds && <span><i className="dw-magnetic-bounds" />Calibration</span>}
            {limits && <span><i className="dw-magnetic-limits" />Quadrant limits</span>}
        </div>
        {history.length === 0 && <p className="dw-meta mb-0">No recent samples</p>}
    </figure>;
}
