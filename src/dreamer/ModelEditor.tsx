import React, { useRef, useState } from 'react';
import { Axis, BoatPart, Vector, axes, meshBounds, placedVertices, replacePartMesh, roles } from './boatModel';
import { import3mf, max3mfBytes } from './import3mf';
import ModelViewport from './ModelViewport';
import './modelEditor.css';

interface VectorFieldsProps { label: string; value: Vector; change: (value: Vector) => void }

function NumberField({ value, label, change }: { value: number; label?: string; change: (value: number) => void }) {
  return <input type="number" step="any" aria-label={label} defaultValue={value}
    onBlur={event => {
      const input = event.currentTarget;
      const next = input.valueAsNumber;
      if (Number.isFinite(next)) change(next);
      else input.value = String(value);
    }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

function VectorFields({ label, value, change }: VectorFieldsProps) {
  return <fieldset>
    <legend>{label}</legend>
    <div className="dreamer-model-triple">
      {(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis}>{axis}
        <NumberField label={label + ' ' + axis} value={value[index]} change={number => {
          const next: Vector = [...value];
          next[index] = number;
          change(next);
        }} />
      </label>)}
    </div>
  </fieldset>;
}

export default function ModelEditor() {
  const [parts, setParts] = useState<BoatPart[]>([]);
  const [name, setName] = useState('');
  const [assemblyVersion, setAssemblyVersion] = useState(0);
  const [selectedId, select] = useState('');
  const [forward, setForward] = useState<Axis>('+X');
  const [up, setUp] = useState<Axis>('+Z');
  const [pending, setPending] = useState(false);
  const importing = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const part = parts.find(item => item.id === selectedId);
  const changePart = (changes: Partial<BoatPart>) => setParts(current =>
    current.map(item => item.id === selectedId ? { ...item, ...changes } : item));

  async function load(file: File | undefined, replacement?: BoatPart) {
    if (!file || importing.current) return;
    importing.current = true;
    setPending(true);
    setNotice('');
    setError('');
    try {
      if (file.size > max3mfBytes) throw new Error('Choose a 3MF file under 12 MiB.');
      const imported = import3mf(new Uint8Array(await file.arrayBuffer()));
      if (replacement) {
        const next = replacePartMesh(replacement, imported);
        setParts(current => current.map(item => item.id === next.id ? { ...item, mesh: next.mesh } : item));
        setNotice('Replaced the mesh for ' + replacement.name + '.');
      } else {
        setName(file.name.replace(/\.3mf$/i, ''));
        setParts(imported);
        setAssemblyVersion(version => version + 1);
        select(imported[0].id);
        setNotice('Imported ' + imported.length + ' parts.');
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'The 3MF could not be imported.');
    } finally {
      importing.current = false;
      setPending(false);
    }
  }

  const { min, max } = part ? meshBounds(placedVertices(part, forward, up)) : { min: [], max: [] };
  const joint = part?.joint;
  return <main className="dreamer-model">
    <header className="dreamer-model-heading">
      <h1>Dreamer model editor</h1>
      <p>{name || 'Import an Onshape assembly to get started.'} <span>· Local preview</span></p>
    </header>
    <div className="dreamer-model-toolbar">
      <label>Import assembly <input type="file" accept=".3mf" disabled={pending} onChange={event => {
        void load(event.currentTarget.files?.[0]);
        event.currentTarget.value = '';
      }} /></label>
      <label>Source forward <select value={forward} onChange={event => setForward(event.target.value as Axis)}>
        {axes.filter(axis => axis[1] !== up[1]).map(axis => <option key={axis}>{axis}</option>)}
      </select></label>
      <label>Source up <select value={up} onChange={event => setUp(event.target.value as Axis)}>
        {axes.filter(axis => axis[1] !== forward[1]).map(axis => <option key={axis}>{axis}</option>)}
      </select></label>
    </div>
    <p className="dreamer-model-status" role="status">{pending ? 'Reading the 3MF…' : notice}</p>
    {error && <p className="dreamer-model-error" role="alert">{error}</p>}
    <div className="dreamer-model-workspace">
      <section className="dreamer-model-scene" aria-label="Assembly preview">
        <ModelViewport parts={parts} selectedId={selectedId} forward={forward} up={up} />
        <p className="dreamer-model-hint">Drag or use arrow keys to orbit</p>
        {parts.length > 0 && <div className="dreamer-model-parts" role="group" aria-label="Parts">
          {parts.map(item => <button type="button" key={item.id} aria-pressed={item.id === selectedId}
            onClick={() => select(item.id)}>{item.name}</button>)}
        </div>}
      </section>
      {part && <section className="dreamer-model-properties" aria-label="Selected part settings" key={assemblyVersion + ':' + part.id}>
        <h2>{part.name}</h2>
        <p>{max.map((value, i) => ((value-min[i])*1000).toFixed(1)).join(' × ')} mm (X × Y × Z)</p>
        <p>{part.mesh.triangles.length.toLocaleString()} faces · {part.mesh.closed ? 'Closed edges' : 'Open or inconsistent edges'}</p>
        {(part.mesh.duplicateVertices > 0 || part.mesh.degenerateFaces > 0) &&
          <p>Merged {part.mesh.duplicateVertices} duplicate vertices and removed {part.mesh.degenerateFaces} zero-area faces.</p>}
        <label>Replace mesh <input type="file" accept=".3mf" disabled={pending} onChange={event => {
          void load(event.currentTarget.files?.[0], part);
          event.currentTarget.value = '';
        }} /></label>
        <p>Use a single-part 3MF with the same CAD origin and axes.</p>
        <label>Physics role <select value={part.role} onChange={event => changePart({ role: event.target.value as BoatPart['role'] })}>
          {roles.map(role => <option key={role}>{role}</option>)}
        </select></label>
        {part.role === 'Displacement hull' && !part.mesh.closed && <p className="dreamer-model-error">A displacement hull needs a closed mesh.</p>}
        <label>Mass (kg) <input type="number" min="0" step="any" value={part.mass ?? ''}
          onChange={event => changePart({ mass: event.currentTarget.value === '' ? null : Math.max(0, event.currentTarget.valueAsNumber) })} /></label>
        <VectorFields label="Placement offset (m)" value={part.translation} change={translation => changePart({ translation })} />
        <VectorFields label="Placement rotation (°)" value={part.rotation} change={rotation => changePart({ rotation })} />
        <VectorFields label="Local centre of mass (m)" value={part.centerOfMass} change={centerOfMass => changePart({ centerOfMass })} />
        <label className="dreamer-model-checkbox"><input type="checkbox" checked={Boolean(joint)} onChange={event =>
          changePart({ joint: event.target.checked ? { pivot: [0, 0, 0], axis: [0, 0, 1], minimum: -30, maximum: 30 } : null })}
        /> Revolute joint</label>
        {joint && <>
          {(!joint.axis.some(Boolean) || joint.minimum > joint.maximum) && <p className="dreamer-model-error">Use a nonzero axis and an ordered joint range.</p>}
          <VectorFields label="Local pivot (m)" value={joint.pivot} change={pivot => changePart({ joint: { ...joint, pivot } })} />
          <VectorFields label="Local joint axis" value={joint.axis} change={axis => changePart({ joint: { ...joint, axis } })} />
          <div className="dreamer-model-triple">
            <label>Minimum (°) <NumberField value={joint.minimum} change={minimum => changePart({ joint: { ...joint, minimum } })} /></label>
            <label>Maximum (°) <NumberField value={joint.maximum} change={maximum => changePart({ joint: { ...joint, maximum } })} /></label>
          </div>
        </>}
      </section>}
    </div>
  </main>;
}
