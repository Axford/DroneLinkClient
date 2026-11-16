import React, { memo, useMemo } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { JointedSail, sailResponse, sailTrimGrid } from './responseSweeps';

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const metrics = [
  { key: 'longitudinal', label: 'Total drive', unit: 'N' },
  { key: 'side', label: 'Total side force', unit: 'N' },
  { key: 'yaw', label: 'Total yaw moment', unit: 'N·m' },
] as const;
const angleLabel = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const loadLabel = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 });

export default memo(function TrimHeatmaps({ response, first, second }: {
  response: ReturnType<typeof sailResponse>;
  first: JointedSail;
  second: JointedSail;
}) {
  const { xAngles, yAngles, samples } = useMemo(() => sailTrimGrid(response, first, second), [response, first, second]);
  const theme = getComputedStyle(document.documentElement);
  const color = (name: string) => theme.getPropertyValue('--dw-color-' + name).trim();
  const textStyle = { color: color('muted') };
  const axis = (name: string, angles: number[], nameGap: number) => ({
    type: 'category', name: name + ' angle (°)', data: angles, nameLocation: 'center',
    nameGap, nameTextStyle: textStyle, axisTick: { show: false },
    axisLabel: { ...textStyle, showMinLabel: true, showMaxLabel: true,
      formatter: (angle: string) => angleLabel.format(Number(angle)) },
  });

  return <div className="dreamer-response-charts" role="group" aria-label="Two-sail trim heatmaps">
    {metrics.map(({ key, label, unit }) => {
      const values = samples.map(({ x, y, total }) => [x, y, total[key]]);
      const range = values.reduce((maximum, [, , value]) => Math.max(maximum, Math.abs(value)), 0) || 1;
      return <section className="dw-panel" key={key}>
        <h3>{label} ({unit})</h3>
        <div role="img" aria-label={label + ' heatmap by ' + first.name + ' and ' + second.name + ' angle'}>
          <ReactEChartsCore echarts={echarts} notMerge style={{ height: 318 }} option={{
            animation: false,
            textStyle,
            grid: { top: 12, bottom: 88, left: 65, right: 20 },
            tooltip: {
              trigger: 'item', renderMode: 'richText',
              formatter: ({ value: [x, y, load] }: { value: [number, number, number] }) =>
                first.name + ' ' + angleLabel.format(xAngles[x]) + '°\n' +
                second.name + ' ' + angleLabel.format(yAngles[y]) + '°\n' +
                label + '  ' + loadLabel.format(load) + ' ' + unit,
            },
            xAxis: axis(first.name, xAngles, 30),
            yAxis: axis(second.name, yAngles, 46),
            visualMap: {
              min: -range, max: range, calculable: false, orient: 'horizontal', left: 'center', bottom: 4,
              text: [loadLabel.format(range), loadLabel.format(-range)], textStyle,
              itemWidth: 9, itemHeight: 130, inRange: { color: [color('workbench'), color('raised'), color('accent')] },
            },
            series: [{ type: 'heatmap', data: values }],
          }} />
        </div>
      </section>;
    })}
  </div>;
});
