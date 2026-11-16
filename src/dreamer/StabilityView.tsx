import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';

import { ApiError } from '../utils/api';
import { BoatDocument, Revision, StabilityMetadata, StabilityResult, WaterPreset, cloudModels } from './cloudModels';
import StabilityChart from './StabilityChart';
import StabilityPreview from './StabilityPreview';
import './stability.css';

const waters: Record<WaterPreset, string> = {
  'salt-water': 'Salt water · 1,025 kg/m³',
  freshwater: 'Freshwater · 1,000 kg/m³',
};

const diagnosticLabels: Record<string, string> = {
  'unassigned-role': 'Assign a physics role.',
  'missing-or-invalid-mass': 'Set the mass, or enter zero.',
  'missing-or-invalid-cg': 'Set the centre of mass.',
  'invalid-displacement-shell': 'Use a sealed displacement mesh.',
  'no-displacement-hull': 'Assign the Displacement hull role to a sealed part.',
  'insufficient-displacement': 'The loaded boat is too heavy for its displacement volume.',
  'invalid-total-mass': 'Give the boat a positive total mass.',
  'invalid-model': 'Review the saved assembly and its orientation.',
  'overlapping-displacement-bounds': 'The displacement parts have overlapping bounds.',
  'invalid-neutral-joint': 'Review the joint axis and neutral position.',
  'geometry-limit': 'The displacement geometry exceeds the solver limit.',
  'equilibrium-unresolved': 'The solver could not find a still-water equilibrium near the configured upright orientation.',
  'vertical-balance-unresolved': 'Vertical balance could not be resolved.',
};

interface Props {
  domainId: string;
  revision: Revision;
  model: BoatDocument;
  editable: boolean;
  signal: AbortSignal;
}

const format = (value: number, digits = 3) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

function Results({ result, model }: { result: StabilityResult; model: BoatDocument }) {
  const [sample, setSample] = useState<{ axis: 'heel' | 'pitch'; index: number | null }>({ axis: 'heel', index: null });
  const scrub = useCallback((axis: 'heel' | 'pitch', index: number) => {
    setSample(previous => previous.axis === axis && previous.index === index ? previous : { axis, index });
  }, []);
  const equilibrium = result.equilibrium;
  const gaps = [...result.heel, ...result.pitch].filter(point => 'diagnostic' in point).length;

  return <>
    {!!result.diagnostics.length && <div role="alert" className="dreamer-model-warning">
      <ul>{result.diagnostics.map(({ code, partId, otherPartId, partName, otherPartName }, index) =>
        <li key={index}>{partId ? (partName ?? 'Part ' + partId) + (otherPartId ? ' and ' + (otherPartName ?? 'part ' + otherPartId) : '') + ' · ' : ''}
          {diagnosticLabels[code] ?? code}</li>)}</ul>
    </div>}
    {equilibrium && <>
      <section className="dw-panel dreamer-stability-summary" aria-labelledby="dreamer-equilibrium">
        <h2 id="dreamer-equilibrium">Still-water equilibrium</h2>
        <dl>
          <div><dt>Draft</dt><dd>{format(equilibrium.draft * 1000, 1)} mm</dd></div>
          <div><dt>Displaced volume</dt><dd>{format(equilibrium.displacedVolume * 1000)} L</dd></div>
          <div><dt>Loaded mass</dt><dd>{format(result.mass ?? 0)} kg</dd></div>
          <div><dt>Heel</dt><dd>{format(equilibrium.heel, 2)}°</dd></div>
          <div><dt>Trim</dt><dd>{format(equilibrium.pitch, 2)}°</dd></div>
          <div><dt>Equilibrium</dt><dd>{equilibrium.stability}</dd></div>
        </dl>
        <p className="dw-meta">Draft is measured from the lowest displacement point. Positive heel is starboard-down and positive pitch is bow-up.</p>
      </section>
      <p className="dw-meta">Positive moment increases the plotted angle. Each sweep holds the other angle at equilibrium.</p>
      {gaps > 0 && <p role="status" className="dreamer-model-warning">{gaps} samples have no resolved vertical balance. Gaps mark those angles.</p>}
      <div className="dreamer-stability-charts">
        <StabilityChart axis="heel" points={result.heel} equilibrium={equilibrium} onScrub={scrub} />
        <StabilityChart axis="pitch" points={result.pitch} equilibrium={equilibrium} onScrub={scrub} />
      </div>
      <StabilityPreview model={model} result={result} equilibrium={equilibrium} sample={sample}
        scrub={scrub} reset={() => setSample(previous => ({ ...previous, index: null }))} />
    </>}
  </>;
}

export default function StabilityView({ domainId, revision, model, editable, signal }: Props) {
  const [water, setWater] = useState<WaterPreset>('salt-water');
  const [saved, setSaved] = useState<StabilityMetadata[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [display, setDisplay] = useState<{ result: StabilityResult; record?: StabilityMetadata }>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const retry = useRef<{ id: string; water: WaterPreset } | undefined>(undefined);
  const { modelId, revisionId } = revision;

  useEffect(() => {
    const requests = new AbortController();
    setBusy('Loading analyses…');
    void cloudModels(domainId, requests.signal).stability.list(modelId, revisionId).then(page => {
      if (!requests.signal.aborted) { setSaved(page.data); setNext(page.nextCursor); }
    }).catch(issue => {
      if (!requests.signal.aborted) setError(issue instanceof Error ? issue.message : 'Could not load saved analyses.');
    }).finally(() => { if (!requests.signal.aborted) setBusy(''); });
    return () => requests.abort();
  }, [domainId, modelId, revisionId]);

  const api = cloudModels(domainId, signal).stability;

  async function action(label: string, work: () => Promise<void>) {
    setBusy(label); setError(''); setNotice('');
    try { await work(); }
    catch (issue) {
      if (!signal.aborted) {
        setError(issue instanceof ApiError && issue.status === 503
          ? 'The solver is busy or took too long. Try again.'
          : issue instanceof Error ? issue.message : 'The analysis request failed.');
      }
    } finally { if (!signal.aborted) setBusy(''); }
  }

  function run() {
    const attempt = retry.current?.water === water ? retry.current : { id: crypto.randomUUID(), water };
    retry.current = attempt;
    void action('Calculating and saving…', async () => {
      try {
        const reply = await api.run(modelId, revisionId, attempt.id, water);
        retry.current = undefined;
        if (reply.data) {
          const record = reply.data;
          setDisplay({ result: record.result, record });
          setSaved(previous => [record, ...previous.filter(item => item.analysisId !== record.analysisId)]);
          setNotice('Analysis saved to revision ' + revision.number + '.');
        } else {
          setDisplay({ result: reply.result });
          setNotice('Review the model settings before running again.');
        }
      } catch (issue) {
        if (issue instanceof ApiError && [400, 401, 403, 404, 409].includes(issue.status)) retry.current = undefined;
        throw issue;
      }
    });
  }

  return <section className="dreamer-stability">
    <header className="dw-panel">
      {editable && <div className="dw-toolbar">
        <label htmlFor="dreamer-water-preset">Water density</label>
        <select id="dreamer-water-preset" className="form-select" value={water}
          onChange={event => setWater(event.target.value as WaterPreset)} disabled={!!busy}>
          {Object.entries(waters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button onClick={run} disabled={!!busy}>Run and save</Button>
      </div>}
    </header>
    {error && <p className="dreamer-model-error" role="alert">{error}</p>}
    {(busy || notice) && <p role="status">{busy || notice}</p>}
    <section className="dw-panel" aria-labelledby="dreamer-stability-history">
      <h2 id="dreamer-stability-history">Saved analyses</h2>
      {saved.length === 0 && !busy && <p>No saved analyses for this revision.</p>}
      <ul className="dreamer-library-list">
        {saved.map(item => <li className="dreamer-library-row" key={item.analysisId}>
          <span>{waters[item.water]} · {new Date(item.savedAt).toLocaleString()}</span>
          <Button variant="outline-secondary" disabled={!!busy} onClick={() => void action('Opening analysis…', async () => {
            const record = await api.open(modelId, revisionId, item.analysisId);
            setDisplay({ result: record.result, record });
          })}>Open analysis</Button>
        </li>)}
      </ul>
      {next && <Button variant="outline-secondary" disabled={!!busy} onClick={() => void action('Loading analyses…', async () => {
        const page = await api.list(modelId, revisionId, next);
        setSaved(previous => [...previous, ...page.data.filter(item => !previous.some(row => row.analysisId === item.analysisId))]);
        setNext(page.nextCursor);
      })}>More analyses</Button>}
    </section>
    {display && <section className="dreamer-stability" aria-label="Analysis result">
      <h2>{waters[display.result.settings.water]}{display.record ? ' · Saved' : ''}</h2>
      <Results key={display.record?.analysisId ?? 'preflight'} result={display.result} model={model} />
    </section>}
  </section>;
}
