import { angleDelta, protractorBasis, screenProtractor } from './jointProtractor';
import { BoatPart, identity, jointPlacement } from './boatModel';

test('protractor round-trips angles in an inclined view and detects edge-on views', () => {
  const plane = screenProtractor([120, 80, 0], [72, 14], [31, -38]);
  expect(plane.draggable).toBe(true);
  for (const angle of [-125, -2, 0, 59, 179]) {
    const [x, y] = plane.point(angle, 0.82);
    expect(plane.angle([x, y])).toBeCloseTo(angle);
  }
  expect(plane.angle([120, 80])).toBeUndefined();
  expect(screenProtractor([0, 0, 0], [92, 0], [0, 2]).draggable).toBe(false);
  expect(angleDelta(179, -179)).toBe(2);
  expect(angleDelta(-179, 179)).toBe(-2);
  expect(protractorBasis([1, 0, 0])).toEqual([[0, 1, 0], [0, 0, 1]]);
});

test('joint travel is applied relative to saved zero, including legacy joints', () => {
  const part: BoatPart = {
    id: 'j', name: 'Joint', mesh: { vertices: [], triangles: [], closed: false, duplicateVertices: 0, degenerateFaces: 0 },
    sourcePose: identity, translation: [0, 0, 0], rotation: [0, 0, 0], mass: 1, centerOfMass: null, role: 'Water foil',
    joint: { pivot: [0, 0, 0], axis: [0, 0, 1], minimum: -30, maximum: 30 },
  };
  expect(jointPlacement(part, identity)([1, 0, 0])).toEqual([1, 0, 0]);
  part.joint!.neutral = 60;
  const neutral = jointPlacement(part, identity)([1, 0, 0]);
  expect(neutral[0]).toBeCloseTo(0.5);
  expect(neutral[1]).toBeCloseTo(Math.sqrt(3) / 2);
  const maximum = jointPlacement(part, identity, 30)([1, 0, 0]);
  expect(maximum[0]).toBeCloseTo(0);
  expect(maximum[1]).toBeCloseTo(1);
});
