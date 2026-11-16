import { BoatDocument } from '../cloudModels';
import {
  BoatPart, Vector, add, cross, direction, dot, jointFrame, jointPlacement, meshBounds, partPose, scale, subtract, transformPoint,
} from '../boatModel';

export const waterDensity = 1025;
export type Controls = Record<string, number>;

export interface SailingJoint {
  pivot: Vector;
  axis: Vector;
  minimum: number;
  maximum: number;
}

export interface SailingPart {
  id: string;
  name: string;
  center: Vector;
  foil?: { medium: 'air' | 'water'; chord: Vector; span: Vector; height: number; width: number; area: number };
  joint?: SailingJoint;
}
interface DisplacementCell {
  part: SailingPart;
  point: Vector;
  size: Vector;
  volume: number;
}
export interface SailingBoat {
  parts: SailingPart[];
  cells: DisplacementCell[];
  mass: number;
  center: Vector;
  inertia: Vector;
  waterlineBounds: [number, number];
}

function hullCells(part: SailingPart, vertices: Vector[], triangles: Vector[]): DisplacementCell[] {
  const { min, max } = meshBounds(vertices);
  const size = subtract(max, min);
  // Intersect vertical columns with the closed hull. Sample the actual volume
  // inside each column, including multiple intervals in a concave hull.
  if (size.some(length => !(length > 1e-9))) throw new Error(part.name + ' has no enclosed displacement volume.');
  const spacing = Math.max(size[0], size[1]) / 18;
  const nx = Math.max(3, Math.ceil(size[0] / spacing));
  const ny = Math.max(3, Math.ceil(size[1] / spacing));
  const dx = size[0] / nx, dy = size[1] / ny;
  const hits: number[][] = Array.from({ length: nx * ny }, () => []);
  const xAt = (column: number) => min[0] + (column + 0.50001)*dx;
  const yAt = (row: number) => min[1] + (row + 0.49997)*dy;
  let signedVolume = 0;
  for (const [i,j,k] of triangles) {
    const a = vertices[i], b = vertices[j], c = vertices[k];
    const ab = subtract(b,a), ac = subtract(c,a);
    const normal = cross(ab,ac);
    signedVolume += dot(subtract(a, min), normal) / 6;
    if (Math.abs(normal[2]) < 1e-14 * size[0]*size[1]) continue;
    const x0 = Math.max(0, Math.ceil((Math.min(a[0],b[0],c[0]) - xAt(0))/dx));
    const x1 = Math.min(nx-1, Math.floor((Math.max(a[0],b[0],c[0]) - xAt(0))/dx));
    const y0 = Math.max(0, Math.ceil((Math.min(a[1],b[1],c[1]) - yAt(0))/dy));
    const y1 = Math.min(ny-1, Math.floor((Math.max(a[1],b[1],c[1]) - yAt(0))/dy));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const px = xAt(x) - a[0], py = yAt(y) - a[1];
      const u = (px*ac[1] - py*ac[0])/normal[2];
      const v = (ab[0]*py - ab[1]*px)/normal[2];
      if (u >= -1e-10 && v >= -1e-10 && u+v <= 1+1e-10)
        hits[x*ny+y].push(a[2] + u*ab[2] + v*ac[2]);
    }
  }
  const cells: DisplacementCell[] = [];
  let sampledVolume = 0;
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) {
    const sorted = hits[x*ny+y].sort((a,b) => a-b);
    const levels = sorted.filter((height, index) => !index || height - sorted[index-1] > size[2]*1e-8);
    if (levels.length % 2) throw new Error(part.name + ' could not be sampled as a sealed hull.');
    for (let index = 0; index < levels.length; index += 2) {
      const depth = levels[index+1] - levels[index];
      const layers = Math.max(2, Math.min(6, Math.ceil(depth/spacing)));
      const dz = depth / layers;
      const volume = dx*dy*dz;
      for (let z = 0; z < layers; z++)
        cells.push({ part, point: [xAt(x),yAt(y),levels[index] + (z+0.5)*dz], size: [dx,dy,dz], volume });
      sampledVolume += depth*dx*dy;
    }
  }
  const volume = Math.abs(signedVolume);
  if (!(volume > 0 && sampledVolume > 0) || Math.abs(sampledVolume-volume) > volume*0.2)
    throw new Error(part.name + ' has inconsistent displacement volume. Review the sealed hull geometry.');
  return cells.map(cell => ({ ...cell, volume: cell.volume*volume/sampledVolume }));
}

function foilGeometry(part: BoatPart, vertices: Vector[], origin: Vector): { foil: NonNullable<SailingPart['foil']>; center: Vector } {
  // Area-weighted normal tensor. Opposite faces reinforce the same axis, and
  // a tall raked sail cannot make its span look like a horizontal chord.
  const tensor: Vector[] = [[0,0,0], [0,0,0], [0,0,0]];
  for (const [i,j,k] of part.mesh.triangles) {
    const face = cross(subtract(vertices[j],vertices[i]), subtract(vertices[k],vertices[i]));
    const area2 = Math.hypot(...face);
    if (!area2) continue;
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 3; column++)
        tensor[row][column] += face[row]*face[column]/area2;
  }
  const diagonal = tensor.map((row,index) => row[index]);
  const seed = diagonal.indexOf(Math.max(...diagonal));
  let normal: Vector = [0,0,0];
  normal[seed] = 1;
  for (let iteration = 0; iteration < 16; iteration++)
    normal = direction(tensor.map(row => dot(row, normal)) as Vector) ?? normal;

  const up: Vector = [0,0,1];
  const span = direction(subtract(up, scale(normal, dot(up, normal))));
  if (!span) throw new Error(part.name + ' needs a lifting surface with height and chord.');
  const chord = cross(normal, span);
  let area2 = 0, moment: Vector = [0,0,0];
  for (const [i,j,k] of part.mesh.triangles) {
    const [a,b,c] = [vertices[i],vertices[j],vertices[k]];
    const weight = Math.abs(dot(normal, cross(subtract(b,a), subtract(c,a))));
    const centroid = scale(add(add(subtract(a,origin),subtract(b,origin)),subtract(c,origin)),1/3);
    area2 += weight;
    moment = add(moment,scale(centroid,weight));
  }
  let lower = Infinity, upper = -Infinity;
  for (const vertex of vertices) {
    const along = dot(subtract(vertex,origin), span);
    lower = Math.min(lower,along);
    upper = Math.max(upper,along);
  }
  const height = upper - lower;
  const area = area2/(part.mesh.closed ? 4 : 2);
  if (!(area > 1e-8 && height > 1e-6)) throw new Error(part.name + ' needs a lifting surface with height and chord.');
  return {
    center: add(origin,scale(moment,1/area2)),
    foil: { medium: part.role === 'Rigid sail' ? 'air' : 'water', chord, span, height, width: area/height, area },
  };
}

export function prepareSailingBoat(model: BoatDocument): SailingBoat {
  const parts: SailingPart[] = [], cells: DisplacementCell[] = [];
  const loads: { mass: number; cg: Vector; size: Vector }[] = [];
  const hullBounds: ReturnType<typeof meshBounds>[] = [];
  for (const part of model.parts) {
    if (part.role === 'Visual only') continue;
    if (part.role === 'Unassigned') throw new Error(part.name + ' needs a physics role.');
    if (part.mass === null || !Number.isFinite(part.mass) || part.mass < 0)
      throw new Error(part.name + ' needs a mass or an explicit zero.');
    if (part.mass > 0 && !part.centerOfMass) throw new Error(part.name + ' needs a centre of mass.');
    const pose = partPose(part, model.forward, model.up);
    const neutral = jointPlacement(part, pose);
    const place = (point: Vector) => neutral(transformPoint(pose, point));
    const vertices = part.mesh.vertices.map(place);
    const bounds = meshBounds(vertices);
    const size = subtract(bounds.max, bounds.min);
    const center = scale(add(bounds.min,bounds.max),0.5);
    if (!center.every(Number.isFinite)) throw new Error(part.name + ' has invalid placement.');
    if (part.centerOfMass && part.mass > 0) loads.push({ mass: part.mass, cg: place(part.centerOfMass), size });
    const entry: SailingPart = { id: part.id, name: part.name, center };
    if (part.role === 'Displacement hull') {
      if (!part.mesh.closed) throw new Error(part.name + ' needs a sealed displacement mesh.');
      if (hullBounds.some(box => box.min.every((n,i) => Math.min(box.max[i],bounds.max[i]) > Math.max(n,bounds.min[i]))))
        throw new Error(part.name + ' has overlapping displacement bounds.');
      hullBounds.push(bounds);
      cells.push(...hullCells(entry, vertices, part.mesh.triangles));
      if (cells.length > 4000) throw new Error('The displacement model has too many sampled cells.');
    }
    if (part.role === 'Water foil' || part.role === 'Rigid sail') {
      const geometry = foilGeometry(part, vertices, center);
      entry.foil = geometry.foil;
      entry.center = geometry.center;
      if (part.joint) {
        const frame = jointFrame(part, pose);
        if (!frame?.axis || part.joint.minimum > part.joint.maximum)
          throw new Error(part.name + ' needs a valid joint axis and travel.');
        entry.joint = { minimum: part.joint.minimum, maximum: part.joint.maximum, pivot: frame.pivot, axis: frame.axis };
      }
    }
    parts.push(entry);
  }
  const mass = loads.reduce((sum, part) => sum + part.mass, 0);
  if (!(mass > 0) || !Number.isFinite(mass)) throw new Error('Set a positive boat mass.');
  if (!cells.length) throw new Error('Assign the Displacement hull role to a sealed hull.');
  if (mass >= waterDensity * cells.reduce((sum, cell) => sum + cell.volume, 0))
    throw new Error('The hull cannot displace enough water for this mass.');
  const center = scale(loads.reduce((sum, part) => add(sum, scale(part.cg,part.mass)), [0,0,0] as Vector), 1/mass);
  const inertia = [0,0,0] as Vector;
  for (const { mass, cg, size } of loads) {
    const offset = subtract(cg, center);
    for (let axis = 0; axis < 3; axis++) {
      const a = (axis+1)%3, b = (axis+2)%3;
      inertia[axis] += mass*((size[a]**2+size[b]**2)/12 + offset[a]**2+offset[b]**2);
    }
  }
  if (inertia.some(value => !Number.isFinite(value) || value <= 1e-10))
    throw new Error('Review the mass distribution and dimensions.');
  return { parts, cells, mass, center, inertia,
    waterlineBounds: [Math.min(...hullBounds.map(box => box.min[2])), Math.max(...hullBounds.map(box => box.max[2]))] };
}

export function jointAngle(joint: SailingJoint, requested = 0) {
  return Math.max(joint.minimum, Math.min(joint.maximum, requested));
}
