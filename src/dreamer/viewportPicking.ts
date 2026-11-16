import { Vector } from './boatModel';

export type ScreenFace = { vertices: [Vector, Vector, Vector] };

function depthAt(x: number, y: number, [a, b, c]: ScreenFace['vertices']): number | undefined {
  const determinant = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
  if (Math.abs(determinant) < 1e-9) return undefined;
  const u = ((b[1]-c[1])*(x-c[0]) + (c[0]-b[0])*(y-c[1])) / determinant;
  const v = ((c[1]-a[1])*(x-c[0]) + (a[0]-c[0])*(y-c[1])) / determinant;
  const w = 1-u-v;
  if (Math.min(u, v, w) < -1e-6) return undefined;
  return u*a[2] + v*b[2] + w*c[2];
}

export function nearestVisibleVertex(x: number, y: number, vertices: Vector[], faces: ScreenFace[]): number | undefined {
  const nearby = vertices.flatMap((vertex, index) => {
    const distance = Math.hypot(vertex[0]-x, vertex[1]-y);
    return distance <= 12 ? [{ vertex, index, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || b.vertex[2] - a.vertex[2]);

  for (const { vertex, index } of nearby) {
    const [vx, vy, depth] = vertex;
    if (!faces.some(face => {
      const front = depthAt(vx, vy, face.vertices);
      return front !== undefined && front > depth + 1e-6;
    })) return index;
  }
  return undefined;
}
