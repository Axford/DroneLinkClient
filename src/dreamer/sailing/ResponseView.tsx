import React, { useMemo, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import type { BoatDocument } from '../cloudModels';
import { SailingBoat, jointAngle, prepareSailingBoat } from './sailingModel';
import { hullResponse, ResponseLoad, sailResponse, sweepLeeway, sweepSpeeds, trimAngles } from './responseSweeps';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface Sample { x: number; loads: ResponseLoad[] }
const format = (value: number) => value.toFixed(3);

export default function ResponseView({ model, mode }: { model: BoatDocument; mode: 'sail' | 'hull' }) {
  const prepared = useMemo(() => {
    try { return { boat: prepareSailingBoat(model) }; }
    catch (error) { return { message: error instanceof Error ? error.message : 'The model could not be prepared.' }; }
  }, [model]);
  if (!prepared.boat) return <p role="alert" className="dreamer-model-warning">{prepared.message} Update Configure and save a revision.</p>;
  return mode === 'sail' ? <SailResponse boat={prepared.boat} /> : <HullResponse boat={prepared.boat} />;
}

function SailResponse({ boat }: { boat: SailingBoat }) {
  const jointed = boat.parts.filter(part => part.sailStrips && part.joint);
  const [windInput, setWindInput] = useState('5');
  const wind = Number(windInput);
  const [primary, setPrimary] = useState(jointed[0]?.id);
  const [secondary, setSecondary] = useState(jointed[1]?.id ?? '');
  const [trimOverrides, setTrimOverrides] = useState<Record<string, number>>({});
  const response = useMemo(() => sailResponse(boat, wind), [boat, wind]);
  const swept = jointed.find(part => part.id === primary);
  const held = jointed.find(part => part.id === secondary && part.id !== primary);
  const heldAngle = held ? jointAngle(held.joint!, trimOverrides[held.id]) : 0;
  const samples = useMemo(() => swept ? trimAngles(swept.joint!).map(x => {
    const result = response.at({ ...trimOverrides, [swept.id]: x });
    return { x, loads: [result.total, ...result.byPart] };
  }) : [], [response, swept, trimOverrides]);
  if (!swept) return <p className="dw-meta">Enable a rigid sail with a joint and save a revision to sweep sail trim.</p>;
  return <div className="dreamer-response">
    <section className="dw-panel" aria-label="Sail response settings">
      <div className="dw-toolbar dreamer-response-controls">
        <label>Wind speed (m/s)<input type="number" min="0" step="any" className="form-control" value={windInput}
          onChange={event => {
            const input = event.currentTarget;
            if (!input.value || (Number.isFinite(input.valueAsNumber) && input.valueAsNumber >= 0)) setWindInput(input.value);
          }} /></label>
        <label>Sail to sweep<select className="form-select" value={primary} onChange={event => {
          setPrimary(event.target.value);
          if (event.target.value === secondary) setSecondary('');
          setTrimOverrides({});
        }}>{jointed.map(part => <option value={part.id} key={part.id}>{part.name}</option>)}</select></label>
        {jointed.length > 1 && <label>Second sail<select className="form-select" value={held?.id ?? ''} onChange={event => {
          setSecondary(event.target.value);
          setTrimOverrides({});
        }}><option value="">Keep all others neutral</option>
          {jointed.filter(part => part.id !== primary).map(part => <option key={part.id} value={part.id}>{part.name}</option>)}
        </select></label>}
        {held && <label>{held.name} angle (°)<select className="form-select" value={heldAngle} onChange={event =>
          setTrimOverrides({ [held.id]: Number(event.target.value) })}>
          {trimAngles(held.joint!).map(angle => <option value={angle} key={angle}>{angle.toFixed(2).replace(/\.?0+$/, '')}°</option>)}
        </select></label>}
      </div>
      <p className="dw-meta">Upright and stationary, heading 000° with wind from 045°. Positive drive is forward. Side force and yaw are positive to port.</p>
    </section>
    <ResponseResults samples={samples} parts={['Total', ...response.parts.map(part => part.name)]}
      axis={swept.name + ' angle (°)'} mode="sail" />
  </div>;
}

function HullResponse({ boat }: { boat: SailingBoat }) {
  const [bySpeed, setBySpeed] = useState(false);
  const [speed, setSpeed] = useState(0.6);
  const [leeway, setLeeway] = useState(10);
  const response = useMemo(() => hullResponse(boat), [boat]);
  const samples = useMemo(() => (bySpeed ? sweepSpeeds : sweepLeeway).map(x => ({
    x, loads: bySpeed ? response.at(x, leeway) : response.at(speed, x),
  })), [bySpeed, response, speed, leeway]);
  return <div className="dreamer-response">
    <section className="dw-panel" aria-label="Hull response settings">
      <div className="dw-toolbar dreamer-response-controls">
        <label>Sweep<select aria-label="Sweep" className="form-select" value={bySpeed ? 'speed' : 'leeway'} onChange={event => setBySpeed(event.target.value === 'speed')}>
          <option value="leeway">Leeway</option><option value="speed">Speed</option>
        </select></label>
        {bySpeed ? <label>Leeway (°)<select className="form-select" value={leeway} onChange={event => setLeeway(Number(event.target.value))}>
          {sweepLeeway.map(angle => <option value={angle} key={angle}>{angle}°</option>)}
        </select></label> : <label>Speed (m/s)<select className="form-select" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          {sweepSpeeds.map(value => <option value={value} key={value}>{value.toFixed(1)}</option>)}
        </select></label>}
      </div>
      <p className="dw-meta">Upright in still salt water with neutral joints. Drag opposes the track. Leeway, side force across the track and yaw are positive to port.</p>
    </section>
    <ResponseResults samples={samples} parts={response.parts.map(part => part.name)}
      axis={bySpeed ? 'Speed (m/s)' : 'Leeway (°)'} mode="hull" />
  </div>;
}

function ResponseResults({ samples, parts, axis, mode }: {
  samples: Sample[]; parts: string[]; axis: string; mode: 'sail' | 'hull';
}) {
  const [selected, setSelected] = useState(0);
  const metrics: { key: keyof ResponseLoad; title: string }[] = [
    { key: 'longitudinal', title: mode === 'sail' ? 'Drive (N)' : 'Drag (N)' },
    { key: 'side', title: 'Side force (N)' },
    { key: 'yaw', title: 'Yaw moment (N·m)' },
  ];
  const extra = mode === 'sail' ? 'Wind shadow (%)' : 'Vertical force (N)';
  const theme = getComputedStyle(document.documentElement);
  const token = (name: string) => theme.getPropertyValue('--dw-color-' + name).trim();
  const label = { color: token('muted') };
  const colors = ['accent','warning','success','workbench','text','navigation-course','danger'].map(token);
  const seriesNames = parts.map((name, index) => parts.indexOf(name) === parts.lastIndexOf(name) ? name : name + ' (' + (index+1) + ')');
  return <>
    <div className="dreamer-response-charts">
      {metrics.map(({ key, title }) => <section className="dw-panel" key={key}>
        <h3>{title}</h3>
        <div role="img" aria-label={title + ' versus ' + axis}>
          <ReactEChartsCore echarts={echarts} notMerge style={{ height: 275 }} option={{
            animation: false, color: colors, textStyle: label,
            legend: { type: 'scroll', textStyle: label, bottom: 0 },
            grid: { top: 16, bottom: 76, left: 64, right: 22 },
            tooltip: { trigger: 'axis', valueFormatter: (value: number) => format(value) },
            xAxis: { type: 'value', name: axis, nameLocation: 'center', nameGap: 29, axisLabel: label },
            yAxis: { type: 'value', axisLabel: label },
            series: seriesNames.map((name, index) => ({ type: 'line', name, showSymbol: samples.length < 3,
              data: samples.map(sample => [sample.x, sample.loads[index][key]]) })),
          }} />
        </div>
      </section>)}
    </div>
    <details className="dw-panel">
      <summary>Sample values</summary>
      <label className="dreamer-response-table-select">Part<select aria-label="Part" className="form-select" value={selected} onChange={event => setSelected(Number(event.target.value))}>
        {seriesNames.map((name,index) => <option value={index} key={index}>{name}</option>)}
      </select></label>
      <div className="table-responsive"><table className="table">
        <thead><tr><th>{axis}</th>{metrics.map(metric => <th key={metric.key}>{metric.title}</th>)}<th>{extra}</th></tr></thead>
        <tbody>{samples.map(({ x, loads }) => <tr key={x}><th scope="row">{x}</th>
          {metrics.map(metric => <td key={metric.key}>{format(loads[selected][metric.key])}</td>)}
          <td>{mode === 'sail' && selected === 0 ? '—' : format(mode === 'sail' ? loads[selected].shadow*100 : loads[selected].vertical)}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </>;
}
