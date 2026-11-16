import { Vector, identity, jointSweep, localDirection, meshBounds, partPose, turnAboutJoint } from './boatModel';
import { nearestVisibleVertex } from './viewportPicking';

test('vertex picking selects the closest visible vertex and skips geometry behind another part', () => {
  const vertices: Vector[] = [[4, 4, 0], [7, 4, 1], [25, 25, 0]];
  const faces = [{ vertices: [[1, 1, 2], [6, 1, 2], [4, 7, 2]] as [Vector, Vector, Vector] }];
  expect(nearestVisibleVertex(4, 4, vertices, faces)).toBe(1);
  expect(nearestVisibleVertex(4, 4, vertices, [])).toBe(0);
  expect(nearestVisibleVertex(70, 8, vertices, faces)).toBeUndefined();
});

test('drag deltas can be converted back to CAD coordinates without changing the neutral placement', () => {
  const pose = partPose({
    id: '1', name: 'Rudder', mesh: { vertices: [], triangles: [], closed: false, duplicateVertices: 0, degenerateFaces: 0 },
    sourcePose: identity, translation: [0.2, -0.1, 0], rotation: [0, 0, 90],
    mass: 1, centerOfMass: [0, 0, 0], joint: null, role: 'Water foil',
  }, '-Y', '+Z');
  const local = localDirection(pose, [0.24, 0.3, 0.05])!;
  expect(local[0]).toBeCloseTo(-0.24);
  expect(local[1]).toBeCloseTo(-0.3);
  expect(local[2]).toBeCloseTo(0.05);
  expect(pose[3]).toEqual([0.2, -0.1, 0]);
});

test('joint motion sweeps the configured bounds around a fixed world pivot', () => {
  expect([0, 1, 2, 3, 4].map(time => jointSweep(-18, 42, time))).toEqual([-18, 12, 42, 12, -18]);
  const pivot: Vector = [7, 2, 0];
  const rotated = turnAboutJoint([8, 2, 0], pivot, [0, 0, 1], 90);
  expect(meshBounds([rotated, pivot]).max).toEqual([7, 3, 0]);
  expect(turnAboutJoint(pivot, pivot, [0, 0, 1], -18)).toEqual(pivot);
});
