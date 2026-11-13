import React, { useId, useState } from 'react';
import SettingsDialog from './SettingsDialog';
import './DiagnosticScene.css';

export type DiagnosticVector = readonly [number, number, number];

export interface DiagnosticSceneData {
  /** Half-width of the reference axes, in the same units as the vectors. */
  extent: number;
  samples?: readonly DiagnosticVector[];
  vector?: { from: DiagnosticVector; to: DiagnosticVector };
  calibration?: { centre: DiagnosticVector; radii: DiagnosticVector };
}

interface DiagnosticSceneProps {
  title: string;
  scene: DiagnosticSceneData;
  readings: React.ReactNode;
}

const initialView = { azimuth: -35, elevation: 25 };
const axes = ['X', 'Y', 'Z'] as const;

function isFiniteVector(vector: DiagnosticVector): boolean {
  return vector.every(Number.isFinite);
}

function SceneView({ scene, title }: Pick<DiagnosticSceneProps, 'scene' | 'title'>) {
  const [view, setView] = useState(initialView);
  const [flat, setFlat] = useState(false);
  const azimuth = view.azimuth * Math.PI / 180;
  const elevation = view.elevation * Math.PI / 180;
  const { extent, vector, calibration } = scene;
  const samples = (scene.samples ?? []).filter(isFiniteVector);
  const live = vector && isFiniteVector(vector.from) && isFiniteVector(vector.to) ? vector : undefined;
  const bounds = calibration && isFiniteVector(calibration.centre) &&
    calibration.radii.every((radius, index) => radius > 0 && Number.isFinite(Math.abs(calibration.centre[index]) + radius)) ? calibration : undefined;
  const scale = Math.max(Number.isFinite(extent) && extent > 0 ? extent : 1,
    ...samples.flatMap(point => point.map(Math.abs)), ...(live ? [...live.from, ...live.to].map(Math.abs) : []),
    ...(bounds ? bounds.centre.map((value, index) => Math.abs(value) + bounds.radii[index]) : []));
  const project = ([x, y, z]: DiagnosticVector): [number, number] => {
    const u = x / scale;
    const v = y / scale;
    const w = z / scale;
    const right = flat ? u : u * Math.cos(azimuth) - v * Math.sin(azimuth);
    const up = flat ? v : w * Math.cos(elevation) - (u * Math.sin(azimuth) + v * Math.cos(azimuth)) * Math.sin(elevation);
    return [150 + 60 * right, 108 - 60 * up];
  };
  const line = (from: DiagnosticVector, to: DiagnosticVector) => {
    const [x1, y1] = project(from);
    const [x2, y2] = project(to);
    return { x1, y1, x2, y2 };
  };
  const endpoint = live && project(live.to);
  const orbit = (horizontal: number, vertical: number) => {
    setView(current => ({
      azimuth: (current.azimuth + horizontal) % 360,
      elevation: Math.max(-80, Math.min(80, current.elevation + vertical))
    }));
  };

  return <div className="dw-diagnostic-view">
    <div role="group" aria-label="Diagnostic view" className="dw-diagnostic-controls">
      <button type="button" aria-pressed={!flat} onClick={() => setFlat(false)}>3D</button>
      <button type="button" aria-pressed={flat} onClick={() => setFlat(true)}>XY view</button>
      {!flat && <>
        <button type="button" aria-label="Rotate left" onClick={() => orbit(-15, 0)}>←</button>
        <button type="button" aria-label="Rotate right" onClick={() => orbit(15, 0)}>→</button>
        <button type="button" aria-label="Tilt up" onClick={() => orbit(0, 15)}>↑</button>
        <button type="button" aria-label="Tilt down" onClick={() => orbit(0, -15)}>↓</button>
        <button type="button" onClick={() => setView(initialView)}>Reset view</button>
      </>}
    </div>
    <svg viewBox="0 0 300 216" role="img" aria-label={`${title}. ${flat ? 'XY projection' : 'Rotatable X, Y and Z projection'}.`}>
      {axes.slice(0, flat ? 2 : 3).map((axis, index) => {
        const positive: DiagnosticVector = [index === 0 ? scale : 0, index === 1 ? scale : 0, index === 2 ? scale : 0];
        const negative: DiagnosticVector = [-positive[0], -positive[1], -positive[2]];
        const [x, y] = project(positive);
        const [negativeX, negativeY] = project(negative);
        return <g key={axis} className="dw-diagnostic-axis">
          <line {...line(negative, positive)} />
          <text x={x} y={y - 5} textAnchor="middle">+{axis}</text>
          <text x={negativeX} y={negativeY - 5} textAnchor="middle">−{axis}</text>
        </g>;
      })}
      {bounds && (flat ? [2] : [0, 1, 2]).map(normal => {
        const points = Array.from({ length: 37 }, (_, step) => {
          const angle = step * Math.PI / 18;
          const offset = (axis: number) => axis === normal ? 0 : axis === (normal + 1) % 3 ? Math.cos(angle) : Math.sin(angle);
          return project([
            bounds.centre[0] + bounds.radii[0] * offset(0),
            bounds.centre[1] + bounds.radii[1] * offset(1),
            bounds.centre[2] + bounds.radii[2] * offset(2)
          ]).join(',');
        }).join(' ');
        return <polyline key={normal} className="dw-diagnostic-calibration" points={points} />;
      })}
      {samples.map((sample, index) => {
        const [cx, cy] = project(sample);
        return <circle key={index} className="dw-diagnostic-sample" cx={cx} cy={cy} r="2" />;
      })}
      {live && endpoint && <>
        <line className="dw-diagnostic-vector" {...line(live.from, live.to)} />
        <rect className="dw-diagnostic-latest" x={endpoint[0] - 3} y={endpoint[1] - 3} width="6" height="6" />
      </>}
    </svg>
    <div className="dw-diagnostic-key dw-meta">
      {samples.length > 0 && <span>● Recent samples</span>}
      {live && <span>■ Latest vector</span>}
      {bounds && <span>◌ Calibration bounds</span>}
    </div>
  </div>;
}

export default function DiagnosticScene({ title, scene, readings }: DiagnosticSceneProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <button type="button" className="btn btn-sm dw-diagnostic-trigger" aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)}>
      Show 3D
    </button>
    <SettingsDialog title={title} show={open} onHide={() => setOpen(false)}>
      {open && <div id={id}>
        <SceneView title={title} scene={scene} />
        {readings}
      </div>}
    </SettingsDialog>
  </>;
}
