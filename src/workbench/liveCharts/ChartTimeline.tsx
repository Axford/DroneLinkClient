import React, { useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSample, TimeRange } from './capture';
import type { Signal } from './catalogue';

echarts.use([LineChart, GridComponent, CanvasRenderer]);

const palette = ['#70bfff', '#ffbf70', '#73d8ae', '#ed99dc', '#f0dd72', '#a99dff', '#f58f91', '#88dbdc'];
export function seriesColor(index: number) { return palette[index % palette.length]; }

export function timeLabel(time: number) {
    const date = new Date(time);
    return `${date.toLocaleTimeString(undefined, { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

type Point = [number, number | null];

function chartPoints(samples: ChartSample[]): Point[] {
    const points: Point[] = [];
    samples.forEach((sample, index) => {
        const previous = samples[index - 1];
        if (previous && (previous.segment !== sample.segment || previous.type !== sample.type)) points.push([sample.time, null]);
        points.push([sample.time, sample.value]);
    });
    return points;
}

export interface TimelineSeries { signal: Signal; samples: ChartSample[]; color: string }

export default function ChartTimeline({ groups, range, cursor, pinned, onCursor, onPin }: {
    groups: TimelineSeries[][];
    range: TimeRange;
    cursor?: number;
    pinned?: number;
    onCursor: (time: number) => void;
    onPin: (time: number) => void;
}) {
    const top = 12, height = 145, step = 183, left = 68, right = 22;
    const totalHeight = groups.length * step + 2;
    const options = useMemo(() => ({
        animation: false,
        grid: groups.map((_, index) => ({ left, right, top: top + index * step, height })),
        xAxis: groups.map((_, gridIndex) => ({
            type: 'time', gridIndex, min: range[0], max: Math.max(range[0] + 1, range[1]),
            axisLabel: { color: '#aebacd', hideOverlap: true, formatter: (time: number) => timeLabel(time).split('.')[0] },
            axisLine: { lineStyle: { color: '#556176' } },
            splitLine: { show: true, lineStyle: { color: '#334057' } },
        })),
        yAxis: groups.map((group, gridIndex) => ({
            type: 'value', gridIndex, scale: true, splitNumber: 4,
            name: group[0].signal.unit || '',
            nameTextStyle: { color: '#aebacd' },
            nameGap: 4,
            axisLabel: { color: '#aebacd', hideOverlap: true },
            splitLine: { lineStyle: { color: '#334057' } },
        })),
        series: groups.flatMap((group, index) => group.map(({ signal, samples, color }) => ({
            id: signal.id, name: signal.name, type: 'line', xAxisIndex: index, yAxisIndex: index,
            showSymbol: samples.length < 100, symbolSize: 4, connectNulls: false, silent: true, clip: true,
            lineStyle: { color, width: 1.7 }, itemStyle: { color },
            data: chartPoints(samples),
        }))),
    }), [groups, range]);
    function timeAt(event: React.MouseEvent<HTMLDivElement>) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = event.clientX - bounds.left - left;
        const width = bounds.width - left - right;
        if (position >= 0 && position <= width && width > 0) return Math.round(range[0] + position / width * (range[1] - range[0]));
    }
    function marker(time: number | undefined, className: string) {
        if (time === undefined || time < range[0] || time > range[1]) return;
        const ratio = (time - range[0]) / Math.max(1, range[1] - range[0]);
        return <span aria-hidden="true" className={className} style={{
            top, bottom: step - height - top + 2,
            left: `calc(${(ratio * 100).toFixed(5)}% + ${left - (left + right) * ratio}px)`,
        }} />;
    }
    return <div className="dw-chart-timeline" role="img" aria-label="Time plots sharing one gateway receipt timeline"
        onMouseMove={event => { const time = timeAt(event); if (time !== undefined) onCursor(time); }}
        onClick={event => { const time = timeAt(event); if (time !== undefined) onPin(time); }}>
        <ReactEChartsCore echarts={echarts} option={options} notMerge lazyUpdate style={{ height: totalHeight }} />
        {marker(pinned, 'dw-chart-marker dw-chart-marker-pinned')}
        {marker(cursor, 'dw-chart-marker')}
    </div>;
}
