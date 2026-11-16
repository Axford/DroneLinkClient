import { Vector, add, scale, subtract } from './boatModel';

export interface HydrostaticPose {
  heel: number;
  pitch: number;
  water?: { waterline: number; cg: Vector; cp: Vector; displacementIds: readonly string[] };
}

// The solver applies heel around forward, then bow-up pitch around negative port.
export function hydrostaticRotation(heel: number, pitch: number) {
  const roll = heel * Math.PI / 180;
  const trim = pitch * Math.PI / 180;
  const [sr, cr, sp, cp] = [Math.sin(roll), Math.cos(roll), Math.sin(trim), Math.cos(trim)];
  return ([x, y, z]: Vector): Vector => {
    const rolledZ = y*sr + z*cr;
    return [x*cp - rolledZ*sp, y*cr - z*sr, x*sp + rolledZ*cp];
  };
}

export function surfaceSegment(vertices: readonly Vector[], heights: readonly number[],
  surface?: (point: Vector) => number): [Vector, Vector] | undefined {
  const crossings: Vector[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const next = (index + 1) % vertices.length;
    const from = vertices[index], to = vertices[next];
    const start = heights[index], finish = heights[next];
    if (start === 0) crossings.push(from);
    if ((start < 0 && finish > 0) || (start > 0 && finish < 0)) {
      const edge = subtract(to, from);
      if (!surface) crossings.push(add(from, scale(edge, -start / (finish - start))));
      else {
        let left = 0, right = 1;
        for (let iteration = 0; iteration < 10; iteration++) {
          const mid = (left + right) / 2;
          if ((surface(add(from, scale(edge, mid))) < 0) === (start < 0)) left = mid;
          else right = mid;
        }
        crossings.push(add(from, scale(edge, (left + right) / 2)));
      }
    }
  }
  if (crossings.length === 2) return [crossings[0], crossings[1]];
}

export function waterlineSegment(vertices: readonly Vector[], waterline: number) {
  return surfaceSegment(vertices, vertices.map(point => point[2] - waterline));
}

export function nearestSampleIndex(points: readonly { angle: number }[], angle: number) {
  return points.reduce((best, point, index) =>
    Math.abs(point.angle - angle) < Math.abs(points[best].angle - angle) ? index : best, 0);
}
