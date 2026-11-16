import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';

import { add, scale } from '../boatModel';
import type { BoatDocument, Revision } from '../cloudModels';
import ModelViewport from '../ModelViewport';
import { createPassiveSearch, passiveHeadingSettings as settings } from './passiveHeading';
import { prepareSailingBoat, sailingParts, waterDensity } from './sailingModel';
import { makeWeather, rotate, weatherPresets } from './sailingPhysics';
import { SailingPose, velocityArrow } from './sailingScene';
import { runTrimStudy, StudyProgress, TrimStudy } from './trimStudyRunner';
import './sailing.css';

const ignore = () => {};
const hidden = new Set<string>();
const weather = makeWeather(weatherPresets['Smooth water · light wind'],1,settings.windSpeed);
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const signed = (v: number) => (v > 0 ? '+' : '') + number.format(v) + '°';
const angle = (v: number) => number.format(v) + '°';
const speed = (v: number) => number.format(v) + ' m/s';

export default function TrimSearchView({ model, revision }: { model: BoatDocument; revision: Revision }) {
  const prepared = useMemo(() => {
    try {
      const boat = prepareSailingBoat(model);
      return { boat, sails: createPassiveSearch(boat).sails };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The trim search could not be prepared.' };
    }
  }, [model]);
  const parts = useMemo(() => sailingParts(model), [model]);
  const [symmetric, setSymmetric] = useState(false);
  const [progress, setProgress] = useState<StudyProgress>();
  const [result, setResult] = useState<TrimStudy>();
  const [bin, setBin] = useState(18);
  const [choice, setChoice] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => { active.current?.abort(); active.current = undefined; }, []);

  async function start() {
    if (!prepared.boat || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setError(''); setNotice(''); setResult(undefined);
    setProgress({phase:'Searching trims',done:0,total:0});
    try {
      const study = await runTrimStudy(prepared.boat,symmetric,controller.signal,setProgress);
      if (active.current !== controller) return;
      setResult(study);
      const first = study.bins.findIndex(item => item.center >= 0 && item.entries.length);
      const fallback = study.bins.findIndex(item => item.entries.length);
      setBin(first >= 0 ? first : Math.max(0,fallback));
      setChoice(0);
    } catch (issue) {
      if (active.current !== controller) return;
      if (controller.signal.aborted) setNotice('Trim search cancelled.');
      else setError(issue instanceof Error ? issue.message : 'The trim search failed.');
    } finally {
      if (active.current === controller) {
        active.current = undefined;
        setProgress(undefined);
      }
    }
  }

  function download() {
    if (!result || !prepared.sails) return;
    const data = { schemaVersion: 1, solver: 'passive-trim-1', revision, settings, symmetric,
      weatherPreset: 'Smooth water · light wind', waterDensity,
      angleConvention: 'Signed clockwise heading relative to true wind; trims in neutral-relative joint degrees',
      sails: prepared.sails.map(({ id,name,joint }) => ({ id,name,joint })),
      ...result };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{ type:'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `dreamer-trim-revision-${revision.number}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  const selectedBin = result?.bins[bin];
  const selected = selectedBin?.entries[choice];
  const pose = useMemo<SailingPose | undefined>(() => {
    if (!selected || !prepared.boat || !prepared.sails) return undefined;
    const state = { ...selected.state, position: [0,0,selected.state.position[2]] as SailingPose['state']['position'] };
    const origin = add(state.position,[0,0,0.25]);
    const arrows: SailingPose['vectors'] = [
      { label: 'True wind · 5 m/s', color: 'forward', start: origin, end: add(origin,scale(weather.wind(state.time),0.22)) },
      { label: 'Bow heading · '+angle(selected.outcome.heading), color: 'up', start: state.position,
        end: add(state.position, scale(rotate(state.orientation,[1,0,0]),0.45)) },
    ];
    const travel = velocityArrow(state);
    if (travel) arrows.push(travel);
    return { state, center: prepared.boat.center, angles: {
      [prepared.sails[0].id]: selected.trim.first, [prepared.sails[1].id]: selected.trim.second,
    }, water: weather.water, vectors: arrows };
  }, [prepared, selected]);

  if (prepared.error) return <p className="dw-meta">{prepared.error}</p>;
  const verifiedBins = result?.bins.filter(item => item.entries.some(trim => trim.evidence === 'simulated')).length ?? 0;
  const covered = result?.bins.filter(item => item.entries.length).length ?? 0;
  const simulated = result?.results.filter(trim => trim.evidence === 'simulated').length ?? 0;
  return <div className="dreamer-sailing">
    <section className="dw-panel" aria-label="Trim search settings">
      <div className="dw-toolbar">
        <span>5 m/s · Smooth water</span>
        <label><input className="form-check-input" type="checkbox" checked={symmetric} disabled={Boolean(progress)}
          onChange={event => { setSymmetric(event.target.checked); setResult(undefined); setError(''); setNotice(''); }} /> Symmetric response</label>
        {progress ? <Button variant="outline-secondary" onClick={() => active.current?.abort()}>Cancel</Button>
          : <Button onClick={() => void start()}>Run trim search</Button>}
        {result && <Button variant="outline-secondary" onClick={download}>Download results</Button>}
      </div>
      {symmetric && <p className="dw-meta">Assumes port and starboard geometry match. Mirrored outcomes are marked in the results.</p>}
      {progress && <p role="status" className="dw-meta">{progress.phase} {progress.done} / {progress.total}</p>}
      {error && <p role="alert" className="dreamer-model-warning">{error}</p>}
      {notice && <p role="status" className="dw-meta">{notice}</p>}
    </section>
    {result && selectedBin && <section className="dw-panel dreamer-trim-results" aria-label="Trim search results">
      <p>{verifiedBins} of {result.bins.length} heading bins verified{covered > verifiedBins &&
        ' · '+(covered-verifiedBins)+' mirrored-only bins'} · {simulated} verified trims{simulated !== result.results.length &&
        ' · '+(result.results.length-simulated)+' mirrored'} · {result.trials} starts simulated</p>
      <div role="group" aria-label="Heading coverage" className="dreamer-trim-coverage">
        {result.bins.map((item,i) => {
          const evidence = item.entries.some(trim => trim.evidence === 'simulated') ? 'verified'
            : item.entries.length ? 'mirrored' : 'gap';
          return <button type="button" key={item.center} aria-pressed={i===bin}
            data-evidence={evidence} title={evidence === 'gap' ? 'No verified trim' : evidence}
            aria-label={signed(item.center)+' '+evidence}
            onClick={() => {setBin(i); setChoice(0);}}>{signed(item.center)}</button>;
        })}
      </div>
      <label>Heading relative to true wind · {signed(selectedBin.center)}
        <input aria-label="Heading relative to true wind" aria-valuetext={signed(selectedBin.center)} className="form-range" type="range"
          min={0} max={result.bins.length-1} step={1} value={bin}
          onChange={event => {setBin(event.currentTarget.valueAsNumber);setChoice(0);}} />
      </label>
      {selected ? <>
        {selectedBin.entries.length > 1 && <label>Trim outcome<select className="form-select" value={choice}
          onChange={event => setChoice(Number(event.currentTarget.value))}>
          {selectedBin.entries.map(({ trim,outcome,evidence },i) => <option key={i} value={i}>
            {signed(trim.first)} / {signed(trim.second)} · {speed(outcome.speed)} · {evidence === 'simulated' ? 'Verified' : 'Mirrored'}
          </option>)}
        </select></label>}
        <dl className="dreamer-sailing-readings">
          <div><dt>Evidence</dt><dd>{selected.evidence === 'simulated' ? 'Verified recovery' : 'Mirrored estimate'}</dd></div>
          <div><dt>Heading</dt><dd>{angle(selected.outcome.heading)} ({signed(selected.outcome.windAngle)} to wind)</dd></div>
          <div><dt>Course</dt><dd>{selected.outcome.course === null ? '—' : angle(selected.outcome.course)}</dd></div>
          <div><dt>Speed</dt><dd>{speed(selected.outcome.speed)}</dd></div>
          <div><dt>Upwind VMG</dt><dd>{speed(selected.outcome.upwindVmg)}</dd></div>
          <div><dt>{prepared.sails?.[0].name}</dt><dd>{signed(selected.trim.first)}</dd></div>
          <div><dt>{prepared.sails?.[1].name}</dt><dd>{signed(selected.trim.second)}</dd></div>
        </dl>
        {pose && <div className="dreamer-sailing-canvas">
          <ModelViewport viewLabel="Settled trim 3D preview." parts={parts} hidden={hidden} forward={model.forward} up={model.up} selectedId=""
            tool="mass" pick={null} previewAngle={null} neutralDraft={null} onMoveAngle={ignore} onMoveHandle={ignore}
            onPickVertex={ignore} sailing={pose} />
        </div>}
      </> : <p role="status">No verified trim in this heading bin.</p>}
    </section>}
  </div>;
}
