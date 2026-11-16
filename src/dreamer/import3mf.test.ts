import { strToU8, zipSync } from 'fflate';
import { BoatPart, meshBounds, placedVertices, replacePartMesh } from './boatModel';
import { import3mf } from './import3mf';

const utf8 = (text: string) => Uint8Array.from(strToU8(text));

const vertices = [
  [0, 0, 0], [1200, 0, 0], [0, 300, 0], [0, 0, 216], [0, 0, 0],
];
const closed = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3], [4, 0, 3]];
function mesh(triangles: number[][], points = vertices) {
  return `<mesh><vertices>${points.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices>
    <triangles>${triangles.map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join('')}</triangles></mesh>`;
}
function archive(resources: string, items: string, unit = 'millimeter') {
  return zipSync({
    '_rels/.rels': utf8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/boat.model"/></Relationships>'),
    '3D/boat.model': utf8(`<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="${unit}">
      <resources>${resources}</resources><build>${items}</build></model>`),
  });
}
const hull = `<object id="1" name="Hull">${mesh(closed)}</object>`;

test('imports named parts, converts units and composes nested instance poses', () => {
  const items = '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 1000 0"/><item objectid="1"/>';
  const parts = import3mf(archive(hull + `<object id="2"><components>
    <component objectid="1" transform="0 1 0 -1 0 0 0 0 1 2000 0 0"/>
    </components></object>`, items));
  expect(parts.map(part => part.name)).toEqual(['Hull', 'Hull']);
  expect(parts[0].id).not.toBe(parts[1].id);
  expect(parts[0].mesh).toBe(parts[1].mesh);
  const bounds = meshBounds(placedVertices(parts[0], '+Y', '+Z'));
  expect(bounds.min[0]).toBeCloseTo(1);
  expect(bounds.max[0]).toBeCloseTo(2.2);
  expect(bounds.min[1]).toBeCloseTo(-2);
  expect(parts[0].mesh).toMatchObject({ closed: true, duplicateVertices: 1, degenerateFaces: 1 });
});

test('replacement keeps the selected part identity, imported and edited placement, and physics settings', () => {
  const [part] = import3mf(archive(hull, '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 40 0 0"/>'));
  const edited: BoatPart = { ...part, role: 'Displacement hull', mass: 7.5,
    translation: [0.25, 1, 0], rotation: [0, 0, 90], centerOfMass: [0, 0, 0.1],
    joint: { pivot: [0.1, 0, 0], axis: [0, 0, 1], minimum: -30, maximum: 35 } };
  const replacement = import3mf(archive(`<object id="1" name="Revised hull">${mesh(closed, vertices.map(
    ([x, y, z]) => [x*2, y, z],
  ))}</object>`, '<item objectid="1" transform="1 0 0 0 1 0 0 0 1 900 0 0"/>'));
  const revised = replacePartMesh(edited, replacement);
  expect(revised).toEqual({ ...edited, mesh: replacement[0].mesh });
  expect(revised.mesh.vertices[1][0]).toBeCloseTo(2.4);
  expect(edited.mesh.vertices[1][0]).toBeCloseTo(1.2);
  expect(() => replacePartMesh(edited, [...replacement, ...replacement])).toThrow('exactly one part');
});

test('flags open meshes and rejects missing triangle indices and cyclic components', () => {
  const item = '<item objectid="1"/>';
  expect(import3mf(archive(`<object id="1">${mesh([[0, 1, 2]])}</object>`, item))[0].mesh.closed).toBe(false);
  expect(() => import3mf(archive(`<object id="1">${mesh([[0, 8, 2]])}</object>`, item))).toThrow('unknown vertex');
  expect(() => import3mf(archive('<object id="1"><components><component objectid="1"/></components></object>', item))).toThrow('cycle');
});
