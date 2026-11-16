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
  mass: number | null;
  centerOfMass: Vector;
  joint: null | { pivot: Vector; axis: Vector; minimum: number; maximum: number };
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
    role: 'Unassigned', mass: null, centerOfMass: [0, 0, 0], joint: null,
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

export function placedVertices(part: BoatPart, forward: Axis, up: Axis): Vector[] {
  const x = axisVector(forward), z = axisVector(up), y = cross(z, x);
  const [rx, ry, rz] = part.rotation.map(value => value * Math.PI / 180);
  const [sx, sy, sz] = [rx, ry, rz].map(Math.sin);
  const [cx, cy, cz] = [rx, ry, rz].map(Math.cos);
  const orient = (v: Vector): Vector => [dot(v, x), dot(v, y), dot(v, z)];
  const origin = orient(part.sourcePose[3]);
  const basis: MeshPose = [part.sourcePose[0], part.sourcePose[1], part.sourcePose[2], [0, 0, 0]];
  return part.mesh.vertices.map(vertex => {
    const [a, b, c] = orient(transformPoint(basis, vertex));
    const pitched = a*cy + (b*sx + c*cx)*sy;
    const lateral = b*cx - c*sx;
    return [
      pitched*cz - lateral*sz + origin[0] + part.translation[0],
      pitched*sz + lateral*cz + origin[1] + part.translation[1],
      -a*sy + (b*sx + c*cx)*cy + origin[2] + part.translation[2],
    ];
  });
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
