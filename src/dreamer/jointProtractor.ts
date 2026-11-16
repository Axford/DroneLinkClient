import { Vector, cross, direction, dot, scale, subtract } from './boatModel';

export type ScreenPoint = [number, number];
const radians = Math.PI / 180;

export function protractorBasis(axis: Vector): [Vector, Vector] {
  const reference: Vector = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const zero = direction(subtract(reference, scale(axis, dot(reference, axis))))!;
  return [zero, cross(axis, zero)];
}

export function screenProtractor(center: Vector, u: ScreenPoint, v: ScreenPoint) {
  const determinant = u[0]*v[1] - u[1]*v[0];
  return {
    center,
    // Near an edge-on view, a small cursor move can otherwise jump many degrees.
    draggable: Math.abs(determinant) / Math.max(Math.hypot(...u), Math.hypot(...v))**2 >= 0.15,
    point(angle: number, radius = 1): Vector {
      const a = Math.cos(angle * radians) * radius, b = Math.sin(angle * radians) * radius;
      return [center[0]+a*u[0]+b*v[0], center[1]+a*u[1]+b*v[1], center[2]];
    },
    angle([x, y]: ScreenPoint): number | undefined {
      const dx = x-center[0], dy = y-center[1];
      if (!determinant || Math.hypot(dx, dy) < 8) return undefined;
      const a = (dx*v[1]-dy*v[0]) / determinant;
      const b = (u[0]*dy-u[1]*dx) / determinant;
      return Math.atan2(b, a) / radians;
    },
  };
}

export function angleDelta(previous: number, next: number) {
  return ((next - previous + 540) % 360) - 180;
}
