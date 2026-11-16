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

export function waterlineSegment(vertices: readonly Vector[], waterline: number): [Vector, Vector] | undefined {
  const crossings: Vector[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const from = vertices[index];
    const to = vertices[(index + 1) % vertices.length];
    if (from[2] === waterline) crossings.push(from);
    if ((from[2] < waterline && to[2] > waterline) || (from[2] > waterline && to[2] < waterline)) {
      crossings.push(add(from, scale(subtract(to, from), (waterline - from[2]) / (to[2] - from[2]))));
    }
  }
  if (crossings.length === 2) return [crossings[0], crossings[1]];
}

export function nearestSampleIndex(points: readonly { angle: number }[], angle: number) {
  return points.reduce((best, point, index) =>
    Math.abs(point.angle - angle) < Math.abs(points[best].angle - angle) ? index : best, 0);
}
