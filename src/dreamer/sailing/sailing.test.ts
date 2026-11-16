import { Vector, add, scale } from '../boatModel';
import type { BoatDocument } from '../cloudModels';
import fixture from './__fixtures__/sloop.json';
import { jointAngle, prepareSailingBoat, sailingParts } from './sailingModel';
import { initialState, instruments, loads, makeWeather, weatherPresets } from './sailingPhysics';
import { SailingRun, neutralControls } from './sailingRun';
import { JointedSail, sailResponse, sailTrimGrid } from './responseSweeps';
import { velocityArrow, waterGrid } from './sailingScene';

const model = fixture as BoatDocument;
const boat = () => prepareSailingBoat(model);

test('a sealed CAD hull determines flotation while ballast lowers overall CG', () => {
  const sloop = boat();
  const run = new SailingRun(sloop, 'Flat calm', 1);
  const calm = loads(sloop, run.state, run.angles, run.conditions, true);
  expect(sloop.center[2]).toBeLessThan(-0.15);
  expect(sloop.cells.reduce((sum, cell) => sum + cell.volume, 0)).toBeCloseTo(1.4*0.32*0.25, 8);
  expect(calm.force[2]).toBeCloseTo(0, 4);
  expect(calm.components.map(({ name, medium }) => [name, medium])).toEqual([['Hull', 'water']]);
  expect(() => prepareSailingBoat({ ...model, parts: model.parts.map(part =>
    part.id === '1' ? { ...part, mesh: { ...part.mesh, closed: false } } : part) })).toThrow('sealed');
});

test('sail loads produce forward motion and the submerged rudder changes heading within asymmetric limits', () => {
  const sloop = boat();
  const run = new SailingRun(sloop, 'Smooth water · light wind', 1);
  const neutral = neutralControls(sloop);
  expect(jointAngle(sloop.parts[3].joint!, -90)).toBe(-28);
  expect(jointAngle(sloop.parts[3].joint!, 90)).toBe(35);
  run.advance(8*120, neutral);
  const position = run.state.position;
  const speed = instruments(run.state, run.conditions).speed;
  expect(position[0]).toBeGreaterThan(0.1);
  expect(speed).toBeGreaterThan(0.05);
  const centered = new SailingRun(sloop, run.weather, run.seed, run.trace());
  centered.advance(8*120, neutral);
  const turned = new SailingRun(sloop, run.weather, run.seed);
  turned.advance(8*120, neutral);
  turned.advance(4*120, { ...neutral, '4': 35 });
  run.advance(4*120, neutral);
  expect(centered.state.position).toEqual(position);
  const heading = (value: SailingRun) => instruments(value.state, value.conditions).heading;
  const turn = Math.abs((heading(turned) - heading(run) + 540) % 360 - 180);
  expect(turn).toBeGreaterThan(2);
  expect(loads(sloop, turned.state, turned.angles, turned.conditions, true).components
    .some(part => part.name === 'Rudder' && part.medium === 'water')).toBe(true);
});

test('seeded weather and replay reproduce the exact result across frame sizes', () => {
  const sloop = boat();
  const run = new SailingRun(sloop, 'Chop · gusting wind', 40);
  const neutral = neutralControls(sloop);
  run.advance(500, neutral);
  run.advance(700, { ...neutral, '4': -12, '5': -20 });
  run.advance(750, { ...neutral, '4': 19, '5': 8 });
  const reset = new SailingRun(sloop, run.weather, run.seed);
  expect(reset.tick).toBe(0);
  const replay = new SailingRun(sloop, run.weather, run.seed, run.trace());
  while (!replay.finished) replay.advance(19, {});
  expect(replay.state).toEqual(run.state);
  expect(new SailingRun(sloop, run.weather, 41).conditions.wind(3)).not.toEqual(run.conditions.wind(3));
});

test('the sea grid keeps one metre cells anchored in world coordinates', () => {
  const run = new SailingRun(boat(), 'Chop · gusting wind', 7);
  const [line] = waterGrid([2.6, -1.6, 0], 4, run.conditions.water, 6);
  expect(Number.isInteger(line[0][0])).toBe(true);
  expect(line[1][0] - line[0][0]).toBe(1);
  expect(line[1][2]).toBe(run.conditions.water(line[1][0], line[1][1], 4).height);
});

test('a fixed true wind override preserves the waves, supports zero and is replayed with the original inputs', () => {
  const sloop = boat();
  const preset = 'Chop · gusting wind';
  const normal = new SailingRun(sloop, preset, 18);
  const override = new SailingRun(sloop, preset, 18, undefined, 7.5);
  const zero = new SailingRun(sloop, preset, 18, undefined, 0);
  for (const time of [0,1,4,8]) {
    expect(Math.hypot(...override.conditions.wind(time))).toBeCloseTo(7.5, 12);
    expect(Math.hypot(...zero.conditions.wind(time))).toBe(0);
    expect(override.conditions.water(1,2,time)).toEqual(normal.conditions.water(1,2,time));
  }
  override.advance(120, override.angles);
  const replay = new SailingRun(sloop, preset, 18, override.trace());
  replay.advance(120, {});
  expect(replay.windSpeed).toBe(7.5);
  expect(replay.state).toEqual(override.state);
});

test('a tall canted sail keeps its projected plate area, span and centre through rig rotation', () => {
  const underTest = model.parts.find(part => part.role === 'Rigid sail')!;
  const baseline = boat().parts.find(part => part.id === underTest.id)!;
  const raked = prepareSailingBoat({ ...model, parts: model.parts.map(part =>
    part.id === underTest.id ? { ...part, rotation: [50,0,0] } : part,
  ) }).parts.find(part => part.id === underTest.id)!;
  const foil = raked.foil!;
  expect(foil.area).toBeCloseTo(0.65 * 1.12, 8);
  expect(foil.area).toBeCloseTo(baseline.foil!.area, 8);
  expect(foil.height).toBeCloseTo(1.12, 8);
  expect(Math.abs(foil.chord[0])).toBeCloseTo(1, 8);
  expect(foil.span[1]).toBeCloseTo(-Math.sin(50*Math.PI/180), 8);
  expect(foil.span[2]).toBeCloseTo(Math.cos(50*Math.PI/180), 8);
  raked.center.forEach((value, axis) => expect(value).toBeCloseTo(baseline.center[axis], 8));
});

test('an open rigid sail feathers, reverses lift across tacks, and produces broadside drag', () => {
  const vertices: Vector[] = [[0,0,0.2], [0.6,0,0.2], [0.6,0,1.2], [0,0,1.2]];
  const prepared = withSailMesh(vertices, [[0,1,2], [0,2,3]]);
  const aerodynamicLoad = (degrees: number, speed: number) => {
    const angle = degrees*Math.PI/180;
    return sailLoad(prepared, [speed*Math.cos(angle), speed*Math.sin(angle), 0]);
  };
  expect(aerodynamicLoad(0,0)).toBeUndefined();
  const feather = aerodynamicLoad(0,5)!;
  expect(feather.incidence).toBeCloseTo(0);
  expect(feather.force[1]).toBeCloseTo(0);
  const port = aerodynamicLoad(12,5)!;
  const starboard = aerodynamicLoad(-12,5)!;
  expect(port.force[1]).toBeGreaterThan(1);
  expect(port.force[0]).toBeCloseTo(starboard.force[0], 10);
  expect(port.force[1]).toBeCloseTo(-starboard.force[1], 10);
  const broadside = aerodynamicLoad(90,5)!;
  expect(broadside.force[0]).toBeCloseTo(0, 10);
  expect(broadside.force[1]).toBeGreaterThan(4);
  expect(feather.force[0]).toBeLessThan(broadside.force[1]/20);
  const faster = aerodynamicLoad(12,10)!;
  faster.force.forEach((value, i) => expect(value).toBeCloseTo(4*port.force[i], 10));
  faster.moment.forEach((value, i) => expect(value).toBeCloseTo(4*port.moment[i], 10));
});

test('strip loads capture changing local incidence and survive CAD retessellation', () => {
  // The upper part of this tapered surface bends out of the lower plane.
  const vertices: Vector[] = [[0,0,0.2], [0.6,0,0.2], [0.5,0,0.7], [0,0,0.7], [0.3,0.25,1.2], [0,0.25,1.2]];
  const triangles: Vector[] = [[0,1,2], [0,2,3], [3,2,4], [3,4,5]];
  const refined = [...vertices];
  const subdivision: Vector[] = [];
  for (const [a,b,c] of triangles) {
    const middle = refined.push(scale(add(add(vertices[a], vertices[b]),vertices[c]),1/3))-1;
    subdivision.push([a,b,middle], [b,c,middle], [c,a,middle]);
  }
  const coarse = withSailMesh(vertices, triangles);
  const fine = withSailMesh(refined, subdivision);
  const strips = coarse.parts.find(part => part.sailStrips)!.sailStrips!;
  expect(strips).toHaveLength(8);
  expect(strips[0].area).toBeGreaterThan(strips[7].area);
  expect(strips[0].span[1]).toBeCloseTo(0, 10);
  expect(strips[7].span[1]).toBeGreaterThan(0.4);
  const wind: Vector = [-4, 2, 0];
  const coarseLoad = sailLoad(coarse, wind)!;
  const fineLoad = sailLoad(fine, wind)!;
  coarseLoad.force.forEach((value, i) => expect(value).toBeCloseTo(fineLoad.force[i], 10));
  coarseLoad.moment.forEach((value, i) => expect(value).toBeCloseTo(fineLoad.moment[i], 10));
  const turning = sailLoad(coarse, wind, [0,0,1])!;
  expect(Math.abs(turning.moment[2] - coarseLoad.moment[2])).toBeGreaterThan(0.03);
});

function withSailMesh(vertices: Vector[], triangles: Vector[]) {
  return prepareSailingBoat({ ...model, parts: model.parts.map(part =>
    part.role === 'Rigid sail' ? { ...part, translation: [0,0,0], rotation: [0,0,0], joint: null,
      mesh: { ...part.mesh, vertices, triangles, closed: false } } : part,
  ) });
}

function sailLoad(prepared: ReturnType<typeof boat>, wind: Vector, angular: Vector = [0,0,0]) {
  const weather = { ...makeWeather(weatherPresets['Flat calm'], 1), wind: () => wind };
  const state = { ...initialState(prepared, weather), angular };
  return loads(prepared, state, neutralControls(prepared), weather, true).components.find(part => part.medium === 'air');
}

test('a sealed displacement bulb adds its buoyancy and water loads at the saved mass and CG', () => {
  const legacy = boat();
  const wet = prepareSailingBoat({ ...model, parts: model.parts.map(part =>
    part.role === 'Ballast' ? { ...part, role: 'Displacement hull' } : part,
  ) });
  expect(wet.mass).toEqual(legacy.mass);
  expect(wet.center).toEqual(legacy.center);
  const weather = makeWeather(weatherPresets['Flat calm'], 1);
  const state = initialState(wet, weather);
  const controls = neutralControls(wet);
  const [nose, side] = [0.5, 0.12];
  const bulb = (prepared: ReturnType<typeof boat>, forward: number, leeway: number) =>
    loads(prepared, { ...state, velocity: [forward,leeway,0] }, controls, weather, true)
      .components.find(part => part.partId === '2');
  expect(bulb(legacy,nose,side)).toBeUndefined();
  const stationary = bulb(wet,0,0)!;
  expect(stationary.force[2]).toBeCloseTo(1025*9.80665*0.28*0.09*0.09, 5);
  expect(stationary.force.slice(0,2)).toEqual([0,0]);
  expect(stationary.moment[2]).toBe(0);
  const port = bulb(wet,nose,side)!;
  const starboard = bulb(wet,nose,-side)!;
  expect(port.force[0]).toBeLessThan(0);
  expect(port.force[1]).toBeLessThan(0);
  expect(port.force[0]).toBeCloseTo(starboard.force[0], 8);
  expect(port.force[1]).toBeCloseTo(-starboard.force[1], 8);
  const twice = bulb(wet,2*nose,2*side)!;
  expect(twice.force[0]).toBeCloseTo(4*port.force[0], 8);
  expect(twice.force[1]).toBeCloseTo(4*port.force[1], 8);
  expect(twice.moment[2]).toBeCloseTo(4*port.moment[2], 8);
});

test('mesh-derived body strips conserve wetted geometry under retessellation', () => {
  const hull = model.parts.find(part => part.role === 'Displacement hull')!;
  const { vertices, triangles } = hull.mesh;
  const refined = [...vertices];
  const subdivision: Vector[] = [];
  for (const [a,b,c] of triangles) {
    const middle = refined.push(scale(add(add(vertices[a],vertices[b]),vertices[c]),1/3))-1;
    subdivision.push([a,b,middle], [b,c,middle], [c,a,middle]);
  }
  const modified = prepareSailingBoat({ ...model, parts: model.parts.map(part =>
    part.id === hull.id ? { ...part, mesh: { ...part.mesh, vertices: refined, triangles: subdivision } } : part,
  ) });
  const original = boat();
  const weather = makeWeather(weatherPresets['Flat calm'], 1);
  const state = { ...initialState(original, weather), velocity: [0.52,0.18,0] as Vector, angular: [0,0,0.3] as Vector };
  const forces = (prepared: ReturnType<typeof boat>) =>
    loads(prepared, state, neutralControls(prepared), weather, true).components.find(part => part.partId === hull.id)!;
  const a = forces(original), b = forces(modified);
  a.force.forEach((value, i) => expect(value).toBeCloseTo(b.force[i], 8));
  a.moment.forEach((value, i) => expect(value).toBeCloseTo(b.moment[i], 8));
  const yawing = loads(original, { ...state, velocity: [0,0,0] }, neutralControls(original), weather, true)
    .components.find(part => part.partId === hull.id)!;
  expect(yawing.moment[2]).toBeLessThan(0);
});

test('wind shadow follows the upstream sail and weakens with partial overlap and distance', () => {
  const weather = makeWeather(weatherPresets['Flat calm'], 1);
  const vertices: Vector[] = [[0,-0.3,0.2], [0,0.3,0.2], [0,0.3,1.2], [0,-0.3,1.2]];
  const template = model.parts.find(part => part.role === 'Rigid sail')!;
  const source = { ...template, translation: [0,0,0] as Vector, rotation: [0,0,0] as Vector, joint: null,
    mesh: { ...template.mesh, vertices, triangles: [[0,1,2], [0,2,3]] as Vector[], closed: false } };
  function evaluate(position: Vector, wind: Vector, trim = 0, reverseOrder = false) {
    const receiver = { ...source, id: '6', translation: position };
    const emitter = { ...source, joint: { pivot: [0,0,0] as Vector, axis: [0,0,1] as Vector, minimum: 0, maximum: 90 } };
    const rig = reverseOrder ? [receiver,emitter] : [emitter,receiver];
    const prepared = prepareSailingBoat({ ...model, parts: [
      ...model.parts.filter(part => part.role !== 'Rigid sail'), ...rig,
    ] });
    const state = initialState(prepared, weather);
    const { components } = loads(prepared, state, { [source.id]: trim }, { ...weather, wind: () => wind }, true);
    return [source.id, receiver.id].map(id => components.find(load => load.partId === id)!);
  }
  const airflow: Vector = [5,0,0];
  const [upwind, downwind] = evaluate([0.6,0,0], airflow);
  expect(upwind.shadow).toBe(0);
  expect(downwind.shadow).toBeGreaterThan(0.25);
  expect(downwind.force[0]).toBeCloseTo(upwind.force[0]*(1-downwind.shadow!)**2, 6);
  const [formerlyUpwind, formerlyDownwind] = evaluate([0.6,0,0], [-5,0,0]);
  expect(formerlyDownwind.shadow).toBe(0);
  expect(formerlyUpwind.shadow).toBeCloseTo(downwind.shadow!, 8);
  const partial = evaluate([0.6,0.45,0], airflow)[1];
  const far = evaluate([2,0,0], airflow)[1];
  expect(partial.shadow).toBeGreaterThan(0);
  expect(partial.shadow!).toBeLessThan(downwind.shadow!);
  expect(far.shadow).toBeGreaterThan(0);
  expect(far.shadow!).toBeLessThan(downwind.shadow!);
  expect(evaluate([0,1,0], airflow).map(load => load.shadow)).toEqual([0,0]);
  expect(evaluate([0.6,0,0], airflow, 90)[1].shadow).toBeCloseTo(0, 8);
  expect(evaluate([0.6,0,0], airflow, 0, true)[1].shadow).toBeCloseTo(downwind.shadow!, 8);
});

test('a neutral stern rudder resists a yaw offset ahead and amplifies it astern', () => {
  const sloop = boat();
  const run = new SailingRun(sloop, 'Flat calm', 1);
  for (const speed of [-0.6, 0.6]) {
    for (const offset of [-2, 0, 2]) {
      const halfYaw = offset*Math.PI/360;
      const state = { ...run.state, velocity: [speed,0,0] as Vector,
        orientation: [0,0,Math.sin(halfYaw),Math.cos(halfYaw)] as typeof run.state.orientation };
      const rudder = loads(sloop, state, run.angles, run.conditions, true).components.find(part => part.name === 'Rudder')!;
      if (!offset) expect(rudder.moment[2]).toBeCloseTo(0, 6);
      else expect(rudder.moment[2] * -Math.sign(speed*offset)).toBeGreaterThan(0.01);
    }
  }
});

test('sailing instruments distinguish heading from stern-first travel', () => {
  const run = new SailingRun(boat(), 'Flat calm', 1);
  expect(instruments(run.state, run.conditions).course).toBeNull();
  const moving = instruments({ ...run.state, velocity: [-0.6,0,0] }, run.conditions);
  expect(moving.heading).toBeCloseTo(0);
  expect(moving.course).toBeCloseTo(180);
  expect(moving.foreAftSpeed).toBeCloseTo(-0.6);
});

test('a disabled part contributes no mass, loads or actuator while legacy parts stay enabled', () => {
  const reference = boat();
  const body = prepareSailingBoat({ ...model, parts: model.parts.map(part =>
    part.name === 'Rudder' || part.name === 'Main sail' ? { ...part, simulationEnabled: false } : part,
  ) });
  expect(body.mass).toBeCloseTo(reference.mass-0.25-0.6);
  expect(Object.keys(neutralControls(body))).toEqual([]);
  const run = new SailingRun(body, 'Smooth water · light wind', 1);
  const motion = { ...run.state, velocity: [0.6,0.2,0] as Vector };
  expect(loads(body, motion, {}, run.conditions, true).components.map(part => part.name)).toEqual(['Hull','Keel']);
});

test('the velocity arrow points along travel and scales linearly with speed', () => {
  const { state } = new SailingRun(boat(), 'Flat calm', 1);
  expect(velocityArrow(state)).toBeUndefined();
  const first = velocityArrow({ ...state, velocity: [-0.5,0.25,0.9] })!;
  const second = velocityArrow({ ...state, velocity: [-1,0.5,0.9] })!;
  expect(first.end[0] - first.start[0]).toBeCloseTo(-0.4);
  expect(first.end[1] - first.start[1]).toBeCloseTo(0.2);
  expect(first.end[2]).toBe(first.start[2]);
  expect(second.end[0] - second.start[0]).toBeCloseTo(2*(first.end[0]-first.start[0]));
});

test('the Sail viewport and solver share the same physical parts', () => {
  const preview = { ...model.parts[0], id: '6', name: 'Reference mesh', role: 'Visual only' as const };
  const assembly = { ...model, parts: [...model.parts, preview] };
  expect(sailingParts(assembly).map(part => part.id)).toEqual(model.parts.map(part => part.id));
  expect(prepareSailingBoat(assembly)).toEqual(boat());
});

test('two-sail trim sweeps cover every sample pair and report the same loads as the individual response', () => {
  const main = model.parts.find(part => part.role === 'Rigid sail')!;
  const second = { ...main, id: '6', translation: [0.65,0,0] as Vector,
    joint: { ...main.joint!, minimum: -3.5, maximum: 11.5 } };
  const prepared = prepareSailingBoat({ ...model, parts: [...model.parts, second] });
  const response = sailResponse(prepared, 5);
  const [first, other] = response.parts as JointedSail[];
  const { xAngles, yAngles, samples } = sailTrimGrid(response, first, other);
  expect(yAngles).toEqual([-3.5, 0, 5, 10, 11.5]);
  expect(samples).toHaveLength(xAngles.length*yAngles.length);
  for (const { x,y,total } of samples)
    expect(total).toEqual(response.at({ [first.id]: xAngles[x], [other.id]: yAngles[y] }).total);
});
