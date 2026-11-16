import { unzipSync } from 'fflate';
import { BoatPart, MeshPose, PartMesh, Vector, composePose, identity, newPart } from './boatModel';

const core = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const rootModel = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';
const unitScales = { micron: 1e-6, millimeter: 0.001, centimeter: 0.01, meter: 1, inch: 0.0254, foot: 0.3048 };
export const max3mfBytes = 12 * 1024 * 1024;
const maxModelBytes = 24 * 1024 * 1024;
const maxTriangles = 120_000;

function modelFile(bytes: Uint8Array) {
  function readEntry(path: string, limit: number) {
    let found = false;
    const entries = unzipSync(bytes, { filter: file => {
      if (file.name !== path) return false;
      if (found || file.originalSize > limit) throw new Error('The 3MF contains a duplicate or oversized model entry.');
      found = true;
      return true;
    } });
    if (!found) throw new Error('The 3MF is missing ' + path + '.');
    const contents = new TextDecoder('utf-8', { fatal: true }).decode(entries[path]);
    if (/<!DOCTYPE|<!ENTITY/i.test(contents)) throw new Error('The 3MF includes an unsupported XML declaration.');
    const document = new DOMParser().parseFromString(contents, 'application/xml');
    if (document.getElementsByTagNameNS('*', 'parsererror').length) throw new Error('The 3MF contains invalid XML.');
    return document.documentElement;
  }
  const rels = readEntry('_rels/.rels', 128 * 1024);
  const roots = Array.from(rels.getElementsByTagNameNS(relationships, 'Relationship')).filter(r => r.getAttribute('Type') === rootModel);
  const path = roots[0]?.getAttribute('Target')?.replace(/^\//, '');
  if (roots.length !== 1 || !path || roots[0].getAttribute('TargetMode') === 'External' ||
      !/^[\w./ -]+\.model$/i.test(path) || path.split('/').includes('..'))
    throw new Error('The 3MF must reference one model inside the file.');
  return readEntry(path, maxModelBytes);
}

function children(element: Element, name: string) {
  return Array.from(element.children).filter(child => child.namespaceURI === core && child.localName === name);
}

function numbers(el: Element, keys: string[]) {
  return keys.map(key => {
    const raw = el.getAttribute(key);
    const value = raw?.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(value)) throw new Error('The 3MF contains an invalid ' + key + ' value.');
    return value;
  }) as Vector;
}

function pose(el: Element, units: number): MeshPose {
  const raw = el.getAttribute('transform');
  if (!raw) return identity;
  const v = raw.trim().split(/\s+/).map(Number);
  if (v.length !== 12 || v.some(value => !Number.isFinite(value) || Math.abs(value) > 1e6))
    throw new Error('A 3MF part has an invalid transform.');
  return [[v[0], v[1], v[2]], [v[3], v[4], v[5]], [v[6], v[7], v[8]], [v[9]*units, v[10]*units, v[11]*units]];
}

function readMesh(element: Element, units: number): PartMesh {
  const vertexElements = children(children(element, 'vertices')[0] ?? element, 'vertex');
  const faces = children(children(element, 'triangles')[0] ?? element, 'triangle');
  if (!vertexElements.length || !faces.length || vertexElements.length > maxTriangles || faces.length > maxTriangles)
    throw new Error('A 3MF part has an empty mesh or exceeds the triangle limit.');
  const vertices: Vector[] = [], exact = new Map<string, number>();
  const indexes = vertexElements.map(vertex => {
    const raw = numbers(vertex, ['x', 'y', 'z']);
    const point: Vector = [raw[0]*units, raw[1]*units, raw[2]*units];
    if (point.some(value => Math.abs(value) > 1000)) throw new Error('A 3MF vertex is outside the supported coordinate range.');
    const key = point.join(',');
    const existing = exact.get(key);
    if (existing !== undefined) return existing;
    exact.set(key, vertices.length);
    return vertices.push(point) - 1;
  });
  const triangles: Vector[] = [], edges = new Map<string, { count: number; winding: number }>();
  for (const face of faces) {
    const [i, j, k] = numbers(face, ['v1', 'v2', 'v3']);
    if ([i, j, k].some(index => !Number.isInteger(index) || index < 0 || index >= indexes.length))
      throw new Error('A 3MF triangle references an unknown vertex.');
    const [a, b, c] = [indexes[i], indexes[j], indexes[k]];
    const [p, q, r] = [vertices[a], vertices[b], vertices[c]];
    const ux = q[0]-p[0], uy = q[1]-p[1], uz = q[2]-p[2];
    const vx = r[0]-p[0], vy = r[1]-p[1], vz = r[2]-p[2];
    if (uy*vz-uz*vy === 0 && uz*vx-ux*vz === 0 && ux*vy-uy*vx === 0) continue;
    triangles.push([a, b, c]);
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = from < to ? from + ':' + to : to + ':' + from;
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count++;
      edge.winding += from < to ? 1 : -1;
      edges.set(key, edge);
    }
  }
  if (!triangles.length) throw new Error('A 3MF part has no usable triangles.');
  return { vertices, triangles, duplicateVertices: indexes.length - vertices.length,
    degenerateFaces: faces.length - triangles.length,
    closed: Array.from(edges.values()).every(edge => edge.count === 2 && edge.winding === 0) };
}

export function import3mf(bytes: Uint8Array): BoatPart[] {
  if (!bytes.length || bytes.length > max3mfBytes) throw new Error('Choose a 3MF file under 12 MiB.');
  const model = modelFile(bytes);
  if (model.namespaceURI !== core || model.localName !== 'model') throw new Error('The 3MF uses an unsupported model format.');
  const unit = model.getAttribute('unit') ?? 'millimeter';
  if (!Object.prototype.hasOwnProperty.call(unitScales, unit)) throw new Error('The 3MF uses an unknown unit.');
  const units = unitScales[unit as keyof typeof unitScales];
  const resources = children(model, 'resources')[0], build = children(model, 'build')[0];
  if (!resources || !build) throw new Error('The 3MF is missing its parts or assembly.');
  const objects = new Map<string, Element>();
  for (const object of children(resources, 'object')) {
    const id = object.getAttribute('id');
    if (!id || objects.has(id)) throw new Error('The 3MF contains a missing or duplicate part ID.');
    objects.set(id, object);
  }
  const parts: BoatPart[] = [], meshes = new Map<string, PartMesh>();
  let totalTriangles = 0, references = 0;
  function visit(reference: Element, parent: MeshPose, ancestors: string[]) {
    const id = reference.getAttribute('objectid') ?? '';
    const object = objects.get(id);
    if (!object || Array.from(reference.attributes).some(attr => attr.localName === 'path'))
      throw new Error('The 3MF references a part outside its main model.');
    if (++references > 500 || ancestors.length > 24 || ancestors.includes(id))
      throw new Error('The 3MF assembly is too deeply nested or contains a cycle.');
    const placement = composePose(parent, pose(reference, units));
    const mesh = children(object, 'mesh')[0];
    if (mesh) {
      let geometry = meshes.get(id);
      if (!geometry) { geometry = readMesh(mesh, units); meshes.set(id, geometry); }
      totalTriangles += geometry.triangles.length;
      if (parts.length >= 50 || totalTriangles > maxTriangles)
        throw new Error('The assembly exceeds 50 parts or 120,000 placed triangles.');
      parts.push(newPart(String(parts.length + 1), object.getAttribute('name') || 'Part ' + id, geometry, placement));
      return;
    }
    const assembly = children(object, 'components')[0];
    const components = assembly ? children(assembly, 'component') : [];
    if (!components.length) throw new Error('A referenced 3MF part has no mesh or components.');
    for (const component of components) visit(component, placement, [...ancestors, id]);
  }
  for (const item of children(build, 'item')) visit(item, identity, []);
  if (!parts.length) throw new Error('The 3MF has no parts to import.');
  return parts;
}
