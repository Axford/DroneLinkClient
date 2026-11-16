import React, { useMemo } from 'react';
import { Button } from 'react-bootstrap';

import { BoatDocument, StabilityEquilibrium, StabilityResult } from './cloudModels';
import { HydrostaticPose, nearestSampleIndex } from './hydrostaticScene';
import ModelViewport from './ModelViewport';

const none = () => {};
const visibleParts = new Set<string>();
const degrees = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const force = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });
type Axis = 'heel' | 'pitch';

interface Props {
  model: BoatDocument;
  result: StabilityResult;
  equilibrium: StabilityEquilibrium;
  sample: { axis: Axis; index: number | null };
  scrub: (axis: Axis, index: number) => void;
  reset: () => void;
}

const axisName = (axis: Axis) => axis === 'heel' ? 'Heel' : 'Pitch';

export default function StabilityPreview({ model, result, equilibrium, sample, scrub, reset }: Props) {
  const { axis, index } = sample;
  const points = result[axis];
  const point = index === null ? undefined : points[index];
  const balance = point ? 'diagnostic' in point ? null : point : equilibrium;
  const pose = useMemo<HydrostaticPose>(() => ({
    heel: balance?.heel ?? (axis === 'heel' ? point?.angle : undefined) ?? equilibrium.heel,
    pitch: balance?.pitch ?? (axis === 'pitch' ? point?.angle : undefined) ?? equilibrium.pitch,
    water: balance?.centerOfBuoyancy && balance.centerOfGravity ? {
      waterline: balance.waterline, cg: balance.centerOfGravity, cp: balance.centerOfBuoyancy,
      displacementIds: result.contributors.map(item => item.partId),
    } : undefined,
  }), [axis, balance, point, equilibrium, result.contributors]);

  const angleText = (angle: number) => degrees.format(Math.abs(angle) < 0.005 ? 0 : angle) + '°';
  const moment = balance && (axis === 'heel' ? balance.heelMoment : balance.pitchMoment);
  return <section className="dw-panel dreamer-hydrostatic-preview" aria-label="Hydrostatic preview">
    <h3>Hydrostatic preview</h3>
    <div className="dw-toolbar dreamer-hydrostatic-controls">
      <label>Curve <select className="form-select" value={axis} onChange={event => {
        const selected = event.target.value as Axis;
        scrub(selected, nearestSampleIndex(result[selected], equilibrium[selected]));
      }}>
        <option value="heel">Heel</option>
        <option value="pitch">Pitch</option>
      </select></label>
      <label className="dreamer-hydrostatic-scrub">Sample angle
        <input className="form-range" type="range" min={0} max={points.length - 1} step={1}
          value={index ?? nearestSampleIndex(points, equilibrium[axis])} aria-valuetext={point ? angleText(point.angle) : 'Equilibrium'}
          onChange={event => scrub(axis, event.currentTarget.valueAsNumber)} />
      </label>
      <Button variant="outline-secondary" onClick={reset} disabled={!point}>Equilibrium</Button>
    </div>
    <p className="dw-meta" aria-label="Preview attitude">
      {point ? axisName(axis) + ' sample' : 'Equilibrium'} · Heel {angleText(pose.heel)} · Pitch {angleText(pose.pitch)}
      {point && moment !== null ? ' · Moment ' + force.format(moment) + ' N·m' : ''}
    </p>
    <div className="dreamer-hydrostatic-canvas">
      <ModelViewport parts={model.parts} selectedId="" hidden={visibleParts} forward={model.forward} up={model.up}
        tool="mass" pick={null} previewAngle={null} neutralDraft={null} onMoveAngle={none} onMoveHandle={none}
        onPickVertex={none} hydrostatic={pose} />
    </div>
    {pose.water && balance ? <ul className="dreamer-hydrostatic-legend" aria-label="Forces in the preview">
      <li className="dreamer-hydrostatic-cg"><b>CG</b> · Weight ↓ {force.format(balance.buoyancy - balance.verticalResidual)} N</li>
      <li className="dreamer-hydrostatic-cp"><b>CP</b> · Buoyancy ↑ {force.format(balance.buoyancy)} N</li>
      <li>Waterline {degrees.format(balance.waterline * 1000)} mm from the model datum</li>
    </ul> : <p className="dw-meta">This sample has no resolved waterline or buoyancy centre.</p>}
  </section>;
}
