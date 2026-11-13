import React from 'react';
import { depthLogSample, depthText, type DepthSummary } from '../dronelink/moduleVisualizations';
import { sampleWindowMinutes } from '../dronelink/sampledObservations';
import { useProjectedSamples } from './useObservationSamples';
import './DepthTrace.css';

const chartWidth = 300;
const chartHeight = 80;
const inset = 3;

export default function DepthTrace({ label, summary, scope }: { label: string; summary: DepthSummary; scope?: string }) {
    const { measuredDepth, logReading } = summary;
    const samples = useProjectedSamples(scope, logReading, depthLogSample);
    const points = samples.flatMap(({ value }, index) => value === null ? [] : [{ depth: value, index }]);
    const maximumDepth = Math.max(...points.map(point => point.depth));
    const scale = Math.ceil(Math.max(10, maximumDepth) / 10) * 10;
    const x = (index: number) => inset + index / Math.max(1, samples.length - 1) * (chartWidth - 2 * inset);
    // The legacy trace has the surface at the top and greater depths below it.
    const y = (depth: number) => inset + depth / scale * (chartHeight - 2 * inset);
    const path = points.map(({ depth, index }, position) => {
        const connected = position > 0 && points[position - 1].index === index - 1;
        return `${connected ? 'L' : 'M'} ${x(index)} ${y(depth)}`;
    }).join(' ');
    const axisLabel = (value: number) => value < 1000 ? `${value}` : value.toExponential(1);
    const last = points[points.length - 1];
    const range = points.length ? `Observed range ${depthText(Math.min(...points.map(point => point.depth)))} to ${depthText(maximumDepth)}. ` : '';
    const latest = last?.index === samples.length - 1 ? depthText(last.depth) : 'unavailable';
    const gaps = samples.length > points.length ? 'Trace has gaps. ' : '';
    const count = points.length === 1 ? '1 valid sample' : `${points.length} valid samples`;
    const description = `Depth by log sample order. ${count}. Scale 0 to ${axisLabel(scale)} metres, increasing downwards. ${range}${gaps}Latest logged sample: ${latest}.`;

    return <figure className="dw-depth-trace" aria-label={label}>
        <figcaption>
            <span className="dw-meta">Depth</span>
            <strong data-unavailable={measuredDepth.unavailable || undefined}>
                {measuredDepth.text === '—' ? 'Unavailable' : measuredDepth.text}
            </strong>
        </figcaption>
        {points.length > 0 ? <div className="dw-depth-chart">
            <div className="dw-depth-axis dw-meta" aria-hidden="true">
                <span>0 m</span><span>{axisLabel(scale / 2)}</span><span>{axisLabel(scale)}</span>
            </div>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={description}>
                {[0, scale / 2, scale].map(value => <line key={value} x1={inset} x2={chartWidth - inset} y1={y(value)} y2={y(value)} />)}
                <path d={path} />
                {points.filter(({ index }) => index === samples.length - 1 ||
                    (samples[index - 1]?.value == null && samples[index + 1]?.value == null)).map(({ index, depth }) =>
                    <circle key={index} cx={x(index)} cy={y(depth)} r="2.5" />)}
            </svg>
            <div className="dw-depth-order dw-meta">Log sample order · last {sampleWindowMinutes} min</div>
        </div> : <p className="dw-meta mb-0">No recent depth samples</p>}
    </figure>;
}
