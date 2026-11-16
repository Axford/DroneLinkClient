import React, { useEffect, useRef, useState } from 'react';
import { Axis, BoatPart, Vector, axes, direction, jointSweep, meshBounds, placedVertices, replacePartMesh, roles, subtract, uniformDensityCenter } from './boatModel';
import { import3mf, max3mfBytes } from './import3mf';
import ModelViewport, { EditTool, Handle, JointPick } from './ModelViewport';
import './modelEditor.css';

interface VectorFieldsProps { label: string; value: Vector; change: (value: Vector) => void }

function NumberField({ value, label, change }: { value: number; label?: string; change: (value: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = String(Number(value.toFixed(6)));
  }, [value]);
  return <input ref={input} type="number" step="any" aria-label={label} defaultValue={value}
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
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [tool, setTool] = useState<EditTool>('mass');
  const [pick, setPick] = useState<JointPick | null>(null);
  const [animating, setAnimating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState(false);
  const importing = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const part = parts.find(item => item.id === selectedId);
  const joint = part?.joint;
  const jointValid = joint && direction(joint.axis) !== undefined && joint.minimum <= joint.maximum;
  const selectedVisible = Boolean(part && !hidden.has(part.id));
  const previewAngle = animating && joint && jointValid && selectedVisible
    ? jointSweep(joint.minimum, joint.maximum, elapsed) : null;
  const changePart = (changes: Partial<BoatPart>) => setParts(current =>
    current.map(item => item.id === selectedId ? { ...item, ...changes } : item));
  const changeJoint = (changes: Partial<NonNullable<BoatPart['joint']>>) => setParts(current =>
    current.map(item => item.id === selectedId && item.joint ? { ...item, joint: { ...item.joint, ...changes } } : item));

  useEffect(() => {
    if (!animating) return;
    const start = performance.now();
    let frame: number;
    let lastUpdate = 0;
    function animate(now: number) {
      if (now - lastUpdate >= 32) {
        setElapsed((now - start) / 1000);
        lastUpdate = now;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [animating]);

  function stopPreview() {
    setPick(null);
    setAnimating(false);
    setElapsed(0);
  }

  function selectPart(id: string) {
    if (id === selectedId) return;
    stopPreview();
    const selected = parts.find(item => item.id === id);
    setTool(selected?.joint ? 'joint' : 'mass');
    select(id);
  }

  function moveHandle(handle: Handle, value: Vector) {
    if (handle === 'centerOfMass') changePart({ centerOfMass: value });
    else changeJoint({ [handle]: value });
  }

  function pickVertex(vertex: Vector) {
    if (!joint) return;
    if (pick === 'origin') {
      moveHandle('pivot', vertex);
      setPick('direction');
    } else {
      const axis = direction(subtract(vertex, joint.pivot));
      if (!axis) {
        setNotice('Choose a second vertex distinct from the pivot.');
        return;
      }
      moveHandle('axis', axis);
      setPick(null);
      setNotice('Joint pivot and axis placed.');
    }
  }

  async function load(file: File | undefined, replacement?: BoatPart) {
    if (!file || importing.current) return;
    importing.current = true;
    setPending(true);
    setNotice('');
    setError('');
    try {
      if (file.size > max3mfBytes) throw new Error('Choose a 3MF file under 12 MiB.');
      const imported = import3mf(new Uint8Array(await file.arrayBuffer()));
      stopPreview();
      if (replacement) {
        const next = replacePartMesh(replacement, imported);
        setParts(current => current.map(item => item.id === next.id ? { ...item, mesh: next.mesh } : item));
        setNotice('Replaced the mesh for ' + replacement.name + '.');
      } else {
        setName(file.name.replace(/\.3mf$/i, ''));
        setParts(imported);
        setHidden(new Set());
        setTool('mass');
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
        <ModelViewport parts={parts} selectedId={selectedId} hidden={hidden} forward={forward} up={up}
          tool={tool} pick={pick} previewAngle={previewAngle} onMoveHandle={moveHandle} onPickVertex={pickVertex} />
        {parts.length > 0 && <>
          <div className="dreamer-model-overlay-tools" role="group" aria-label="Selected part controls">
            <button type="button" disabled={!selectedVisible} aria-pressed={tool === 'mass'}
              onClick={() => { stopPreview(); setTool('mass'); }}>Edit CG</button>
            <button type="button" disabled={!selectedVisible || !joint} aria-pressed={tool === 'joint'}
              onClick={() => { stopPreview(); setTool('joint'); }}>Edit joint</button>
            <button type="button" disabled={!selectedVisible || !joint} aria-pressed={pick !== null}
              onClick={() => { stopPreview(); setTool('joint'); setPick(pick ? null : 'origin'); }}>
              {pick ? 'Cancel picking' : 'Pick joint vertices'}
            </button>
            <button type="button" disabled={!animating && (!selectedVisible || !jointValid)}
              aria-pressed={animating} onClick={() => {
                if (animating) stopPreview();
                else { setPick(null); setTool('joint'); setElapsed(0); setAnimating(true); }
              }}>{animating ? 'Stop motion' : 'Test joint motion'}</button>
            {previewAngle !== null && <output aria-label="Joint preview angle">{previewAngle.toFixed(1)}°</output>}
          </div>
          <p className="dreamer-model-view-help" role={pick ? 'status' : undefined}>
            {pick === 'origin' ? 'Click a vertex on the selected part for the pivot.' :
              pick === 'direction' ? 'Click a second vertex to point the joint axis.' :
              selectedVisible && tool === 'mass' ? 'Left-drag the CG handle. Middle-drag to pan, right-drag to orbit.' :
              selectedVisible && joint ? 'Left-drag the pivot or axis tip. Middle-drag to pan, right-drag to orbit.' :
              'Middle-drag to pan, right-drag to orbit, or scroll to zoom.'}
          </p>
          <div className="dreamer-model-parts" role="group" aria-label="Parts">
            {parts.map(item => <div className="dreamer-model-part" key={item.id}>
              <button type="button" aria-pressed={item.id === selectedId} onClick={() => selectPart(item.id)}>{item.name}</button>
              <input type="checkbox" checked={!hidden.has(item.id)} aria-label={'Show ' + item.name}
                onChange={event => {
                  const show = event.target.checked;
                  if (!show && item.id === selectedId) stopPreview();
                  setHidden(previous => {
                    const next = new Set(previous);
                    if (show) next.delete(item.id); else next.add(item.id);
                    return next;
                  });
                }} />
            </div>)}
          </div>
        </>}
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
        <button type="button" disabled={!part.mesh.closed} onClick={() => {
          const centerOfMass = uniformDensityCenter(part.mesh);
          if (!centerOfMass) {
            setNotice('Calculate CG needs a mesh with a valid enclosed volume.');
            return;
          }
          changePart({ centerOfMass });
          stopPreview();
          setTool('mass');
          setNotice('Calculated CG for ' + part.name + ' using uniform density.');
        }}>Calculate CG</button>
        <p>{part.mesh.closed ? 'Uses the enclosed volume and assumes uniform density.' : 'Calculate CG requires a closed mesh.'}</p>
        <VectorFields label="Local centre of mass (m)" value={part.centerOfMass} change={centerOfMass => changePart({ centerOfMass })} />
        <label className="dreamer-model-checkbox"><input type="checkbox" checked={Boolean(joint)} onChange={event => {
          const enabled = event.target.checked;
          stopPreview();
          setTool(enabled ? 'joint' : 'mass');
          changePart({ joint: enabled ? { pivot: part.centerOfMass, axis: [0, 0, 1], minimum: -30, maximum: 30 } : null });
        }}
        /> Revolute joint</label>
        {joint && <>
          {!jointValid && <p className="dreamer-model-error">Use a nonzero axis and an ordered joint range.</p>}
          <VectorFields label="Local pivot (m)" value={joint.pivot} change={pivot => changeJoint({ pivot })} />
          <VectorFields label="Local joint axis" value={joint.axis} change={axis => changeJoint({ axis })} />
          <div className="dreamer-model-triple">
            <label>Minimum (°) <NumberField value={joint.minimum} change={minimum => changeJoint({ minimum })} /></label>
            <label>Maximum (°) <NumberField value={joint.maximum} change={maximum => changeJoint({ maximum })} /></label>
          </div>
        </>}
      </section>}
    </div>
  </main>;
}
