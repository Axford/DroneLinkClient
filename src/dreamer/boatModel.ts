export type Vector = [number, number, number];

// 3MF stores the three basis vectors followed by the translation.
export type MeshPose = [Vector, Vector, Vector, Vector];
export type Axis = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';
export const axes: Axis[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
export const identity: MeshPose = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, 0]];

export interface PartMesh {
  vertices: Vector[];
  triangles: Vector[];
  closed: boolean;
  duplicateVertices: number;
  degenerateFaces: number;
}
export const roles = ['Unassigned', 'Displacement hull', 'Ballast', 'Water foil', 'Rigid sail', 'Visual only'] as const;
export interface BoatPart {
  id: string;
  name: string;
  mesh: PartMesh;
  sourcePose: MeshPose;
  translation: Vector;
  rotation: Vector;
  role: typeof roles[number];
  simulationEnabled?: boolean;
  mass: number | null;
  centerOfMass: Vector | null;
  joint: null | { pivot: Vector; axis: Vector; neutral?: number; minimum: number; maximum: number };
}

export function transformPoint([x, y, z, position]: MeshPose, point: Vector): Vector {
  return [
    x[0]*point[0] + y[0]*point[1] + z[0]*point[2] + position[0],
    x[1]*point[0] + y[1]*point[1] + z[1]*point[2] + position[1],
    x[2]*point[0] + y[2]*point[1] + z[2]*point[2] + position[2],
  ];
}

export function composePose(parent: MeshPose, [x, y, z, position]: MeshPose): MeshPose {
  const origin = transformPoint(parent, position);
  const basis = [x, y, z].map(column => {
    const p = transformPoint([parent[0], parent[1], parent[2], [0, 0, 0]], column);
    return p;
  });
  return [basis[0], basis[1], basis[2], origin];
}

export function newPart(id: string, name: string, mesh: PartMesh, sourcePose: MeshPose): BoatPart {
  return {
    id, name, mesh, sourcePose, translation: [0, 0, 0], rotation: [0, 0, 0],
    role: 'Unassigned', mass: null, centerOfMass: uniformDensityCenter(mesh) ?? null, joint: null,
  };
}

export function replacePartMesh(part: BoatPart, incoming: BoatPart[]): BoatPart {
  if (incoming.length !== 1) throw new Error('Choose a 3MF containing exactly one part to replace this mesh.');
  return { ...part, mesh: incoming[0].mesh };
}

function axisVector(axis: Axis): Vector {
  const vector: Vector = [0, 0, 0];
  vector['XYZ'.indexOf(axis[1])] = axis[0] === '+' ? 1 : -1;
  return vector;
}

export function cross(a: Vector, b: Vector): Vector {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
}
export function dot(a: Vector, b: Vector) {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

export const add = (a: Vector, b: Vector): Vector => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const subtract = (a: Vector, b: Vector): Vector => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const scale = (v: Vector, amount: number): Vector => [v[0]*amount, v[1]*amount, v[2]*amount];

export function direction(v: Vector): Vector | undefined {
  const length = Math.hypot(...v);
  return length > 1e-9 && Number.isFinite(length) ? scale(v, 1 / length) : undefined;
}

export function partPose(part: BoatPart, forward: Axis, up: Axis): MeshPose {
  const x = axisVector(forward), z = axisVector(up), y = cross(z, x);
  const [rx, ry, rz] = part.rotation.map(value => value * Math.PI / 180);
  const [sx, sy, sz] = [rx, ry, rz].map(Math.sin);
  const [cx, cy, cz] = [rx, ry, rz].map(Math.cos);
  const orient = (v: Vector): Vector => [dot(v, x), dot(v, y), dot(v, z)];
  const origin = orient(part.sourcePose[3]);
  const placeDirection = (vector: Vector): Vector => {
    const [a, b, c] = orient(vector);
    const pitched = a*cy + (b*sx + c*cx)*sy;
    const lateral = b*cx - c*sx;
    return [
      pitched*cz - lateral*sz,
      pitched*sz + lateral*cz,
      -a*sy + (b*sx + c*cx)*cy,
    ];
  };
  return [placeDirection(part.sourcePose[0]), placeDirection(part.sourcePose[1]),
    placeDirection(part.sourcePose[2]), add(origin, part.translation)];
}

export function placedVertices(part: BoatPart, forward: Axis, up: Axis): Vector[] {
  const pose = partPose(part, forward, up);
  const place = jointPlacement(part, pose);
  return part.mesh.vertices.map(vertex => place(transformPoint(pose, vertex)));
}

export function localDirection([x, y, z]: MeshPose, world: Vector): Vector | undefined {
  const yz = cross(y, z);
  const determinant = dot(x, yz);
  if (!Number.isFinite(determinant) || determinant === 0) return undefined;
  const local = scale([dot(world, yz), dot(world, cross(z, x)), dot(world, cross(x, y))], 1 / determinant);
  return local.every(Number.isFinite) ? local : undefined;
}

export function jointFrame(part: BoatPart, pose: MeshPose) {
  if (!part.joint) return undefined;
  const pivot = transformPoint(pose, part.joint.pivot);
  const axis = direction(transformPoint([pose[0], pose[1], pose[2], [0, 0, 0]], part.joint.axis));
  return { pivot, axis };
}

export function turnAboutJoint(point: Vector, pivot: Vector, axis: Vector, angle: number): Vector {
  const angleRadians = angle * Math.PI / 180;
  const arm = subtract(point, pivot);
  const cos = Math.cos(angleRadians), sin = Math.sin(angleRadians);
  return add(pivot, add(add(scale(arm, cos), scale(cross(axis, arm), sin)),
    scale(axis, dot(axis, arm) * (1-cos))));
}

export function jointPlacement(part: BoatPart, pose: MeshPose, angle = 0) {
  const frame = jointFrame(part, pose);
  const rotation = (part.joint?.neutral ?? 0) + angle;
  return (vertex: Vector): Vector => frame?.axis && rotation
    ? turnAboutJoint(vertex, frame.pivot, frame.axis, rotation) : vertex;
}

export function rebaseJointZero(joint: NonNullable<BoatPart['joint']>, neutral: number) {
  const shift = (joint.neutral ?? 0) - neutral;
  return { ...joint, neutral, minimum: joint.minimum + shift, maximum: joint.maximum + shift };
}

export function jointSweep(minimum: number, maximum: number, elapsedSeconds: number): number {
  const phase = (Math.max(0, elapsedSeconds) % 4) / 2;
  return minimum + (maximum - minimum) * (1 - Math.abs(phase - 1));
}

export function meshBounds(vertices: Vector[]) {
  const min: Vector = [Infinity, Infinity, Infinity], max: Vector = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], vertex[i]);
      max[i] = Math.max(max[i], vertex[i]);
    }
  }
  return { min, max };
}

export function uniformDensityCenter(mesh: PartMesh): Vector | undefined {
  if (!mesh.closed || !mesh.triangles.length) return undefined;
  const { min, max } = meshBounds(mesh.vertices);
  const origin = scale(add(min, max), 0.5);
  let volume = 0, absoluteVolume = 0;
  let moment: Vector = [0, 0, 0];
  // Each oriented triangle and the reference point form a signed tetrahedron.
  for (const [i, j, k] of mesh.triangles) {
    const a = subtract(mesh.vertices[i], origin);
    const b = subtract(mesh.vertices[j], origin);
    const c = subtract(mesh.vertices[k], origin);
    const weight = dot(a, cross(b, c));
    volume += weight;
    absoluteVolume += Math.abs(weight);
    moment = add(moment, scale(add(add(a, b), c), weight / 4));
  }
  if (!absoluteVolume || Math.abs(volume) <= absoluteVolume * 1e-12) return undefined;
  const center = add(origin, scale(moment, 1 / volume));
  return center.every(Number.isFinite) ? center : undefined;
}
