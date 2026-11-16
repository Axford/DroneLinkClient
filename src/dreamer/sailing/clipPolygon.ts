import { Vector, add, dot, scale, subtract } from '../boatModel';

export function clipPolygon(polygon: Vector[], axis: Vector, boundary: number, side: number): Vector[] {
  const clipped: Vector[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i+1) % polygon.length];
    const da = side * (dot(a, axis) - boundary), db = side * (dot(b, axis) - boundary);
    if (da >= 0) clipped.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0))
      clipped.push(add(a, scale(subtract(b,a), da/(da-db))));
  }
  return clipped;
}
