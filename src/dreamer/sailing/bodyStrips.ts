import { Vector, add, cross, meshBounds, scale, subtract } from '../boatModel';
import { clipPolygon } from './clipPolygon';

export interface BodyPatch {
  center: Vector;
  halfSize: Vector;
  surface: number;
  projected: Vector;
}

export interface DisplacementSurface {
  strips: BodyPatch[][];
  sideLiftSlope: number;
}

const axes: Vector[] = [[1,0,0], [0,1,0], [0,0,1]];
const bins = [16, 6, 10];

// Clip once in the neutral pose. Transverse and vertical subdivisions retain
// enough surface detail to follow a tilted waterline without visiting the CAD
// triangles at simulation frequency.
export function buildBodyStrips(vertices: Vector[], triangles: Vector[]): DisplacementSurface {
  const bounds = meshBounds(vertices);
  const size = subtract(bounds.max, bounds.min);
  const spacing = size.map((extent, axis) => extent / bins[axis]) as Vector;
  const strips: Map<number, BodyPatch>[] = Array.from({ length: bins[0] }, () => new Map());
  function collect(polygon: Vector[], indices: number[]) {
    const [x,y,z] = indices;
    const key = y * bins[2] + z;
    let patch = strips[x].get(key);
    if (!patch) {
      patch = {
        center: [0,0,0], halfSize: scale(spacing, 0.5), surface: 0, projected: [0,0,0],
      };
      strips[x].set(key, patch);
    }
    const a = polygon[0];
    for (let i = 1; i+1 < polygon.length; i++) {
      const b = polygon[i], c = polygon[i+1];
      const face = scale(cross(subtract(b,a), subtract(c,a)), 0.5);
      const area = Math.hypot(...face);
      patch.surface += area;
      patch.center = add(patch.center, scale(add(add(a,b),c), area/3));
      for (let axis = 0; axis < 3; axis++) patch.projected[axis] += Math.abs(face[axis])/2;
    }
  }
  function partition(polygon: Vector[], indices: number[]) {
    const axis = indices.length;
    if (axis === 3) {
      collect(polygon, indices);
      return;
    }
    const origin = bounds.min[axis];
    const width = spacing[axis];
    const index = (point: Vector) => Math.max(0, Math.min(bins[axis]-1, Math.floor((point[axis]-origin)/width)));
    const band = polygon.map(index);
    for (let i = Math.min(...band); i <= Math.max(...band); i++) {
      const lower = origin + i*width, upper = origin + (i+1)*width;
      const fragment = clipPolygon(clipPolygon(polygon, axes[axis], lower, 1), axes[axis], upper, -1);
      if (fragment.length >= 3) partition(fragment, [...indices, i]);
    }
  }
  for (const triangle of triangles) partition(triangle.map(index => vertices[index]), []);

  return {
    strips: strips.map(strip => Array.from(strip.values()).filter(patch => patch.surface > 1e-12)
      .map(patch => ({ ...patch, center: scale(patch.center, 1/patch.surface) }))),
    // A provisional low-aspect-ratio slope. Shallow bodies build side force
    // more slowly than deep fins, whose loads use the Water foil model.
    sideLiftSlope: 1.8 * Math.min(1, size[2]/size[0]),
  };
}

export function bodyPatchForce(patch: BodyPatch, velocity: Vector, wet: number, liftSlope: number, density: number): Vector {
  const [u,v] = velocity;
  const speed = Math.hypot(...velocity);
  // Skin friction opposes the relative motion. Pressure drag acts on the
  // projected areas, independently along each boat axis.
  const friction = scale(velocity, -0.5*density*wet*0.006*patch.surface*speed);
  const dragCoefficients = [0.25, 1.0, 1.0];
  const pressure = velocity.map((value, axis) =>
    -0.5*density*wet*dragCoefficients[axis]*patch.projected[axis]*value*Math.abs(value)) as Vector;
  const horizontal = Math.hypot(u,v);
  // sin(leeway)*cos(leeway) gives a linear response near zero and fades
  // toward broadside, where the cross-flow drag term carries the load.
  const lift = horizontal > 1e-8
    ? scale([v,-u,0], 0.5*density*wet*patch.projected[1]*liftSlope*u*v/horizontal)
    : [0,0,0] as Vector;
  return add(add(friction, pressure), lift);
}
