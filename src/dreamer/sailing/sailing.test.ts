import type { BoatDocument } from '../cloudModels';
import fixture from './__fixtures__/sloop.json';
import { jointAngle, prepareSailingBoat } from './sailingModel';
import { instruments, loads } from './sailingPhysics';
import { SailingRun, neutralControls } from './sailingRun';
import { waterGrid } from './sailingScene';

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
