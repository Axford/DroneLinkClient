import React from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { StabilityEquilibrium, StabilityPoint } from './cloudModels';

echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent, CanvasRenderer]);

export default function StabilityChart({ axis, points, equilibrium }: {
  axis: 'heel' | 'pitch';
  points: StabilityPoint[];
  equilibrium: StabilityEquilibrium;
}) {
  const heel = axis === 'heel';
  const title = heel ? 'Righting moment' : 'Pitch restoring moment';
  const moment = heel ? 'heelMoment' : 'pitchMoment';
  const series = points.map(point => [point.angle, 'diagnostic' in point ? null : point[moment]]);
  const angleLabel = heel ? 'Heel (°)' : 'Pitch (°)';
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue('--dw-color-' + name).trim();
  const labelStyle = { color: color('muted') };
  const option = {
    animation: false,
    textStyle: { color: color('text') },
    grid: { top: 20, bottom: 55, left: 75, right: 24 },
    tooltip: { trigger: 'axis', backgroundColor: color('raised'), textStyle: { color: color('text') } },
    xAxis: { type: 'value', name: angleLabel, nameLocation: 'center', nameGap: 32, nameTextStyle: labelStyle, axisLabel: { ...labelStyle, showMinLabel: true, showMaxLabel: true } },
    yAxis: { type: 'value', name: 'Moment (N·m)', nameLocation: 'center', nameGap: 52, nameTextStyle: labelStyle, axisLabel: labelStyle },
    series: [
      { type: 'line', name: title, data: series, showSymbol: false, connectNulls: false, lineStyle: { color: color('accent'), width: 2 } },
      { type: 'scatter', name: 'Equilibrium', data: [[equilibrium[axis], equilibrium[moment]]], itemStyle: { color: color('warning') }, symbolSize: 9 },
    ],
  };
  return <section className="dw-panel dreamer-stability-chart">
    <h3>{title}</h3>
    <div role="img" aria-label={title + ' chart. ' + angleLabel + ' versus moment in newton metres.'}>
      <ReactEChartsCore echarts={echarts} option={option} notMerge style={{ height: 280 }} />
    </div>
    <details>
      <summary>Sample values</summary>
      <table className="table">
        <thead><tr><th>{angleLabel}</th><th>Moment (N·m)</th></tr></thead>
        <tbody>{series.map(([angle, value], index) => <tr key={index}><td>{angle}</td>
          <td>{value === null ? 'Unresolved' : value?.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td></tr>)}</tbody>
      </table>
    </details>
  </section>;
}
