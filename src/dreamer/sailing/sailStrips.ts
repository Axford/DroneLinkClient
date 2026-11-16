import { Vector, add, cross, direction, dot, scale, subtract } from '../boatModel';

export interface SailStrip {
  center: Vector;
  chord: Vector;
  span: Vector;
  area: number;
}

export function fitSurfaceNormal(faces: Vector[]): Vector {
  // Opposite faces contribute to the same axis regardless of mesh winding.
  const tensor: Vector[] = [[0,0,0], [0,0,0], [0,0,0]];
  for (const face of faces) {
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
  for (let iteration = 0; iteration < 16; iteration++) {
    const estimate = normal;
    normal = direction(tensor.map(row => dot(row, estimate)) as Vector) ?? estimate;
  }
  return normal;
}

function clip(polygon: Vector[], axis: Vector, boundary: number, side: number): Vector[] {
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

export function buildSailStrips(
  vertices: Vector[], triangles: Vector[], closed: boolean, origin: Vector, span: Vector, normal: Vector,
): SailStrip[] {
  const bandCount = 8;
  const bands: { face: Vector; center: Vector }[][] = Array.from({ length: bandCount }, () => []);
  const points = vertices.map(vertex => subtract(vertex, origin));
  const projections = points.map(point => dot(point, span));
  let lower = Infinity, upper = -Infinity;
  for (const projection of projections) {
    lower = Math.min(lower, projection);
    upper = Math.max(upper, projection);
  }
  const width = (upper-lower)/bandCount;
  const bandIndex = (index: number) => Math.min(bandCount-1, Math.floor((projections[index]-lower)/width));

  // Integrate the exact portion of each triangle in each band, independent
  // of the alignment of the original triangle edges with the bands.
  for (const triangle of triangles) {
    const polygon = triangle.map(index => points[index]);
    const indices = triangle.map(bandIndex);
    for (let band = Math.min(...indices); band <= Math.max(...indices); band++) {
      const slice = clip(clip(polygon, span, lower+band*width, 1), span, lower+(band+1)*width, -1);
      for (let i = 1; i+1 < slice.length; i++) {
        const [a,b,c] = [slice[0],slice[i],slice[i+1]];
        bands[band].push({
          face: cross(subtract(b,a), subtract(c,a)),
          center: scale(add(add(a,b),c), 1/3),
        });
      }
    }
  }

  const strips: SailStrip[] = [];
  for (const band of bands) {
    if (!band.length) continue;
    const fitted = fitSurfaceNormal(band.map(({ face }) => face));
    const localNormal = dot(fitted, normal) < 0 ? scale(fitted,-1) : fitted;
    const localSpan = direction(subtract(span, scale(localNormal, dot(span,localNormal))));
    if (!localSpan) continue;
    const chord = cross(localNormal, localSpan);
    let area2 = 0, moment: Vector = [0,0,0];
    for (const { face, center } of band) {
      const weight = Math.abs(dot(face,localNormal));
      area2 += weight;
      moment = add(moment, scale(center,weight));
    }
    // A closed thin foil contributes two projected surfaces. An open sail
    // contributes one. Cross products above measure twice the triangle area.
    const area = area2/(closed ? 4 : 2);
    if (area > 1e-10)
      strips.push({ center: add(origin, scale(moment,1/area2)), chord, span: localSpan, area });
  }
  return strips;
}

export function sailCoefficients(incidence: number) {
  const angle = Math.abs(incidence);
  const attachedLift = 1.18 * Math.tanh(3.8 * angle / 1.18);
  const separatedLift = 1.1 * Math.sin(2*angle);
  const stall = Math.min(1, Math.max(0, (angle * 180/Math.PI - 12)/18));
  const blend = stall*stall*(3-2*stall);
  return {
    lift: Math.sign(incidence) * ((1-blend)*attachedLift + blend*separatedLift),
    drag: 0.012 + (1-blend)*0.12*attachedLift**2 + blend*1.1*Math.sin(angle)**2,
  };
}
