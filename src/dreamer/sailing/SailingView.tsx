import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';

import { Vector, add, scale } from '../boatModel';
import type { BoatDocument } from '../cloudModels';
import ModelViewport from '../ModelViewport';
import { Controls, SailingBoat, jointAngle, prepareSailingBoat } from './sailingModel';
import { WeatherPreset, instruments, loads, stepSeconds, weatherPresets, windVectors } from './sailingPhysics';
import { SailingRun, SailingTrace, neutralControls } from './sailingRun';
import { SailingPose, sailingForces, velocityArrow } from './sailingScene';
import './sailing.css';

const noOp = () => {};
const hidden = new Set<string>();
const defaultWeather: WeatherPreset = 'Smooth water · light wind';
const digits = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export default function SailingView({ model }: { model: BoatDocument }) {
  const prepared = useMemo(() => {
    try { return { boat: prepareSailingBoat(model) }; }
    catch (error) { return { message: error instanceof Error ? error.message : 'The model could not be prepared.' }; }
  }, [model]);
  if (!prepared.boat) return <p role="alert" className="dreamer-model-warning">{prepared.message} Update Configure and save a revision before sailing.</p>;
  return <ManualSailing model={model} boat={prepared.boat} />;
}

function ManualSailing({ model, boat }: { model: BoatDocument; boat: SailingBoat }) {
  const [run, setRun] = useState(() => new SailingRun(boat, defaultWeather, 1));
  const [state, setState] = useState(run.state);
  const [controls, setControls] = useState(() => neutralControls(boat));
  const requested = useRef<Controls>(controls);
  const [running, setRunning] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [lastTrace, setLastTrace] = useState<SailingTrace>();
  const [error, setError] = useState('');
  const [vectors, setVectors] = useState({ wind: true, apparent: true, water: true, air: true, velocity: true });

  function reset(weather = run.weather, seed = run.seed, playback?: SailingTrace, wind = { speed: run.windSpeed }) {
    if (run.tick) setLastTrace(run.trace());
    const next = new SailingRun(boat, weather, seed, playback, wind.speed);
    requested.current = next.angles;
    setControls(next.angles);
    setRun(next);
    setState(next.state);
    setReplaying(Boolean(playback));
    setRunning(Boolean(playback));
    setError('');
  }

  useEffect(() => {
    if (!running) return;
    let handle: number;
    let previous: number | undefined;
    let remainder = 0, lastPaint = 0;
    function animate(now: number) {
      if (previous !== undefined) remainder += Math.min((now - previous)/1000, 0.1);
      previous = now;
      try {
        const steps = Math.floor(remainder/stepSeconds);
        if (steps > 0) {
          remainder -= steps*stepSeconds;
          run.advance(steps, requested.current);
        }
        if (now - lastPaint >= 40 || run.finished) {
          lastPaint = now;
          setState(run.state);
          if (replaying) setControls(run.angles);
        }
        if (run.finished) { setRunning(false); return; }
        handle = requestAnimationFrame(animate);
      } catch (issue) {
        setState(run.state);
        setRunning(false);
        if (run.tick) setLastTrace(run.trace());
        setError(issue instanceof Error ? issue.message : 'The simulation stopped unexpectedly.');
      }
    }
    handle = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(handle);
  }, [run, running, replaying]);

  const numbers = instruments(state, run.conditions);
  const pose = useMemo(() => {
    const arrows: SailingPose['vectors'] = [];
    const { trueWind, apparentWind } = windVectors(state, run.conditions);
    const start = add(state.position, [0, 0, Math.max(0.15, (boat.waterlineBounds[1] - boat.waterlineBounds[0])*0.8)]);
    function windArrow(label: string, wind: Vector, color: 'forward' | 'up', origin: Vector) {
      const speed = Math.hypot(...wind);
      if (speed >= 0.01) arrows.push({ label: label + ' · ' + speed.toFixed(1) + ' m/s', color, start: origin, end: add(origin, scale(wind, 0.22)) });
    }
    if (vectors.wind) windArrow('Wind', trueWind, 'forward', start);
    if (vectors.apparent) windArrow('Apparent wind', apparentWind, 'up', add(start, [0,0,0.12]));
    const travel = vectors.velocity && velocityArrow(state);
    if (travel) arrows.push(travel);
    if (vectors.air || vectors.water) {
      const reported = loads(boat, state, controls, run.conditions, true);
      const selected = reported.components.filter(part => vectors[part.medium]);
      const extent = Math.max(0.2, ...boat.inertia.map(value => Math.sqrt(value/boat.mass)*3.5));
      arrows.push(...sailingForces(selected, boat.mass, extent));
    }
    return { state, center: boat.center, angles: controls, water: run.conditions.water, vectors: arrows };
  }, [boat, run, state, controls, vectors]);

  const visibleParts = useMemo(() => model.parts.filter(part => part.simulationEnabled !== false), [model]);
  const jointed = boat.parts.filter(part => part.joint);
  const traceToPlay = lastTrace ?? (run.tick ? run.trace() : undefined);
  return <div className="dreamer-sailing">
    <section className="dw-panel" aria-label="Sailing controls">
      <div className="dw-toolbar dreamer-sailing-weather">
        <label>Conditions <select className="form-select" value={run.weather} disabled={running} onChange={event => reset(event.target.value as WeatherPreset)}>
          {Object.keys(weatherPresets).map(name => <option key={name}>{name}</option>)}
        </select></label>
        <label>Weather seed <input className="form-control" type="number" min="0" max={4294967295} value={run.seed} disabled={running}
          onChange={event => {
            const value = event.currentTarget.valueAsNumber;
            if (Number.isSafeInteger(value) && value >= 0 && value <= 4294967295) reset(run.weather,value);
          }} /></label>
        <label><input className="form-check-input" type="checkbox" checked={run.windSpeed !== undefined} disabled={running}
          onChange={event => reset(run.weather, run.seed, undefined, { speed: event.target.checked ? weatherPresets[run.weather].wind : undefined })} />
          Override wind speed</label>
        {run.windSpeed !== undefined && <label>Wind speed (m/s)
          <input className="form-control" type="number" min="0" step="any" key={run.windSpeed}
            defaultValue={run.windSpeed} disabled={running} onBlur={event => {
              const input = event.currentTarget;
              const speed = input.valueAsNumber;
              if (!Number.isFinite(speed) || speed < 0) input.value = String(run.windSpeed);
              else if (speed !== run.windSpeed) reset(run.weather, run.seed, undefined, { speed });
            }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        </label>}
        <Button disabled={Boolean(error) || run.finished} onClick={() => {
          if (running) {
            setState(run.state);
            if (run.tick) setLastTrace(run.trace());
          }
          setRunning(!running);
        }}>{running ? 'Pause' : 'Run'}</Button>
        <Button variant="outline-secondary" onClick={() => reset()}>Reset</Button>
        <Button variant="outline-secondary" disabled={running || !traceToPlay} onClick={() => {
          const trace = traceToPlay;
          if (trace) reset(trace.weather, trace.seed, trace, { speed: trace.windSpeed });
        }}>Replay inputs</Button>
      </div>
      {error && <p className="dreamer-model-error" role="alert">{error}</p>}
      {replaying && <p className="dw-meta" role="status">{run.finished ? 'Replay complete.' : 'Replaying recorded inputs.'}</p>}
      {jointed.length ? <div className="dreamer-sailing-joints">
        {jointed.map(part => {
          const joint = part.joint!;
          return <label key={part.id}><span>{part.name} <output>{digits.format(controls[part.id])}°</output></span>
            <input aria-label={part.name + ' angle'} className="form-range" type="range" min={joint.minimum} max={joint.maximum}
              step="any" value={controls[part.id]} disabled={replaying || joint.minimum === joint.maximum}
              onChange={event => {
                const next = { ...requested.current, [part.id]: jointAngle(joint, event.currentTarget.valueAsNumber) };
                requested.current = next;
                setControls(next);
              }} />
            <span className="dw-meta">{digits.format(joint.minimum)}° to {digits.format(joint.maximum)}° from neutral</span>
          </label>;
        })}
      </div> : <p className="dw-meta">Define a joint on a water foil or rigid sail to control it here.</p>}
    </section>
    <section className="dw-panel" aria-label="Sailing instruments">
      <dl className="dreamer-sailing-readings">
        <div><dt>Time</dt><dd>{state.time.toFixed(1)} s</dd></div>
        <div><dt>Speed</dt><dd>{numbers.speed.toFixed(2)} m/s</dd></div>
        <div><dt>Heading</dt><dd>{digits.format(numbers.heading)}°</dd></div>
        <div><dt>Heel</dt><dd>{digits.format(numbers.heel)}°</dd></div>
        <div><dt>Pitch</dt><dd>{digits.format(numbers.pitch)}°</dd></div>
        <div><dt>Apparent wind</dt><dd>{digits.format(numbers.windSpeed)} m/s{numbers.wind !== null && ' from ' + digits.format(numbers.wind) + '°'}</dd></div>
        <div><dt>Course</dt><dd>{numbers.course === null ? '—' : digits.format(numbers.course) + '°'}</dd></div>
        <div><dt>Fore/aft speed</dt><dd>{Math.abs(numbers.foreAftSpeed).toFixed(2)} m/s{Math.abs(numbers.foreAftSpeed) >= 0.005 &&
          (numbers.foreAftSpeed < 0 ? ' astern' : ' ahead')}</dd></div>
      </dl>
      {state.time > 6 && numbers.speed < 0.05 && <p className="dw-meta">Boat speed below 0.05 m/s.</p>}
    </section>
    <section className="dw-panel" aria-label="Sailing simulation">
      <div className="dw-toolbar dreamer-sailing-vectors" role="group" aria-label="Vectors">
        {([
          ['wind','True wind','forward'], ['apparent','Apparent wind','up'],
          ['velocity','Velocity','course'], ['water','Water forces','highlight'], ['air','Air forces','cg'],
        ] as const).map(([key,label,color]) => <label className={'dreamer-sailing-vector ' + color} key={key}>
          <input className="form-check-input" type="checkbox" checked={vectors[key]}
            onChange={event => setVectors({ ...vectors, [key]: event.target.checked })} /> {label}
        </label>)}
        <span className="dw-meta">Sea grid · 1 m</span>
        <span className="dreamer-sailing-vector highlight">Hull waterline</span>
      </div>
      <div className="dreamer-sailing-canvas">
        <ModelViewport parts={visibleParts} selectedId="" hidden={hidden} forward={model.forward} up={model.up}
          tool="mass" pick={null} previewAngle={null} neutralDraft={null} onMoveAngle={noOp} onMoveHandle={noOp}
          onPickVertex={noOp} sailing={pose} />
      </div>
    </section>
  </div>;
}
