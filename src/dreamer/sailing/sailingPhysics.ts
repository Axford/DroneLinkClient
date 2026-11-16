// Adapted from the fixed-step Dreamer physics prototype at Server 5f9abc7.
import { Vector, add, cross, dot, scale, subtract as sub } from '../boatModel';
import { bodyPatchForce } from './bodyStrips';
import { sailCoefficients } from './sailStrips';
import { WakeStrip, windShadow } from './sailWake';
import { Controls, SailingBoat, SailingPart, jointAngle, waterDensity } from './sailingModel';

type Quaternion = [number, number, number, number];
export interface SailingState {
  time: number;
  position: Vector;
  orientation: Quaternion;
  velocity: Vector;
  angular: Vector;
}
export interface ForceVector {
  name: string;
  partId: string;
  medium: 'air' | 'water';
  center: Vector;
  force: Vector;
  moment: Vector; // World-space torque about the boat CG, including residual couples.
  incidence?: number;
  shadow?: number; // Fractional speed deficit, averaged over the sail area.
}

const gravity = 9.80665;
const airDensity = 1.225;
export const stepSeconds = 1 / 120;
const radians = (value: number) => value * Math.PI / 180;
const degrees = (value: number) => value * 180 / Math.PI;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const norm = (value: Vector) => Math.hypot(...value);
const unit = (value: Vector) => scale(value, 1 / norm(value));
const abs = (value: Vector): Vector => value.map(Math.abs) as Vector;
const axisAngle = (axis: Vector, angle: number): Quaternion => [...scale(axis, Math.sin(angle/2)), Math.cos(angle/2)];
const normalise = (q: Quaternion) => q.map(value => value / Math.hypot(...q)) as Quaternion;
const inverse = ([x,y,z,w]: Quaternion): Quaternion => [-x,-y,-z,w];

export function rotate([x,y,z,w]: Quaternion, v: Vector): Vector {
  const axis: Vector = [x,y,z];
  const twice = scale(cross(axis,v), 2);
  return add(v, add(scale(twice,w), cross(axis,twice)));
}

function compose(a: Quaternion, b: Quaternion): Quaternion {
  const av: Vector = [a[0],a[1],a[2]], bv: Vector = [b[0],b[1],b[2]];
  return [...add(cross(av,bv), add(scale(av,b[3]), scale(bv,a[3]))), a[3]*b[3] - dot(av,bv)];
}

export const weatherPresets = Object.freeze({
  'Flat calm': { wind: 0, gust: 0, swell: 0 },
  'Smooth water · light wind': { wind: 3, gust: 0, swell: 0 },
  'Chop · gusting wind': { wind: 5, gust: 2, swell: 0.11 },
});

export function makeWeather(preset: typeof weatherPresets[WeatherPreset], seed: number, windSpeed?: number) {
  const waves: Vector[] = [[0.35, 0.10, 0.9], [-0.5, 0.9, 1.8], [0.8, 1.6, 2.5]];
  let random = seed >>> 0;
  const phases = waves.map(() => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 2**32 * 2 * Math.PI;
  });
  return {
    water(x: number, y: number, time: number) {
      let height = 0, verticalSpeed = 0;
      if (preset.swell) waves.forEach(([kx, ky, frequency], i) => {
        const phase = kx*x + ky*y - frequency*time + phases[i];
        const amplitude = preset.swell / (i + 1);
        height += amplitude * Math.sin(phase);
        verticalSpeed -= amplitude * frequency * Math.cos(phase);
      });
      return { height, verticalSpeed };
    },
    wind(time: number): Vector {
      // The local compass is north along +X and east along -Y. Wind comes FROM 45 degrees.
      const speed = windSpeed ?? (preset.wind + preset.gust * (0.65*Math.sin(0.37*time + phases[0]) + 0.35*Math.sin(0.9*time)));
      const from = radians(45 + preset.gust * 8 * Math.sin(0.24*time + phases[1]));
      return [-speed * Math.cos(from), speed * Math.sin(from), 0];
    },
  };
}

export type WeatherPreset = keyof typeof weatherPresets;
export type Weather = ReturnType<typeof makeWeather>;

function partPoint(part: SailingPart, point: Vector, controls: Controls): Vector {
  if (!part.joint) return point;
  const { pivot, axis } = part.joint;
  return add(pivot, rotate(axisAngle(axis, radians(jointAngle(part.joint, controls[part.id]))), sub(point, pivot)));
}

export function initialState(boat: SailingBoat, weather: Weather): SailingState {
  const orientation: Quaternion = [0,0,0,1];
  const up = abs(rotate(inverse(orientation), [0, 0, 1]));
  const samples = boat.cells.map(cell => {
    const [x, y, z] = rotate(orientation, sub(cell.point, boat.center));
    return { depth: weather.water(x, y, 0).height - z, half: dot(up, cell.size) / 2, volume: cell.volume };
  });
  const verticalSize = boat.waterlineBounds[1] - boat.waterlineBounds[0];
  let low = Math.min(...samples.map(cell => cell.depth - cell.half)) - verticalSize;
  let high = Math.max(...samples.map(cell => cell.depth + cell.half)) + verticalSize;
  for (let i = 0; i < 30; i++) {
    const height = (low + high) / 2;
    const submerged = samples.reduce((sum, { depth, half, volume }) =>
      sum + volume * wetFraction(depth - height, half), 0);
    if (waterDensity * submerged > boat.mass) low = height;
    else high = height;
  }
  return { time: 0, position: [0, 0, (low + high) / 2], orientation,
    velocity: [0, 0, 0], angular: [0, 0, 0] };
}

const wetFraction = (depth: number, half: number) => clamp(0.5 + depth / (2 * Math.max(half, 1e-8)), 0, 1);

export function loads(boat: SailingBoat, state: SailingState, controls: Controls, weather: Weather, report = false) {
  const q = state.orientation, toBody = inverse(q);
  const worldAngular = rotate(q, state.angular);
  const up = abs(rotate(toBody, [0, 0, 1]));
  const force: Vector = [0, 0, -boat.mass * gravity], torque: Vector = [0, 0, 0];
  let displaced = 0;
  const sailReport = report ? new Map<SailingPart, { incidence: number; shadow: number }>() : undefined;
  const byPart = report ? new Map<SailingPart, { force: Vector; moment: Vector; weightedArm: Vector; weight: number }>() : null;
  function apply(f: Vector, arm: Vector, part: SailingPart) {
    const moment = cross(arm, f);
    for (let i = 0; i < 3; i++) {
      force[i] += f[i];
      torque[i] += moment[i];
    }
    if (byPart) {
      const weight = norm(f);
      if (!weight) return;
      if (!byPart.has(part)) byPart.set(part, {
        force: [0, 0, 0], moment: [0, 0, 0], weightedArm: [0, 0, 0], weight: 0,
      });
      const entry = byPart.get(part)!;
      entry.weight += weight;
      for (let i = 0; i < 3; i++) {
        entry.force[i] += f[i];
        entry.moment[i] += moment[i];
        entry.weightedArm[i] += weight * arm[i];
      }
    }
  }
  const localVelocity = (arm: Vector) => add(state.velocity, cross(worldAngular, arm));
  for (const cell of boat.cells) {
    const arm = rotate(q, sub(cell.point, boat.center));
    const [x, y, z] = add(state.position, arm);
    const water = weather.water(x, y, state.time);
    const volume = cell.volume * wetFraction(water.height - z, dot(up, cell.size) / 2);
    if (!volume) continue;
    displaced += volume;
    apply([0, 0, waterDensity * gravity * volume], arm, cell.part);
  }
  const wind = weather.wind(state.time);
  const rig = boat.parts.flatMap(part => {
    if (!part.sailStrips) return [];
    const joint = part.joint;
    const frame = joint ? axisAngle(joint.axis, radians(jointAngle(joint, controls[part.id]))) : null;
    const orientation = frame ? compose(q, frame) : q;
    const origin = joint?.pivot ?? boat.center;
    const originArm = rotate(q, sub(origin, boat.center));
    const strips = part.sailStrips.map(strip => {
      const chord = rotate(orientation, strip.chord);
      const span = rotate(orientation, strip.span);
      return {
        area: strip.area, chord, span, normal: cross(span, chord),
        arm: add(originArm, rotate(orientation, sub(strip.center, origin))),
        spanLength: strip.spanLength, chordLength: strip.area/strip.spanLength,
      };
    });
    return [{ part, strips }];
  });
  for (const { part, strips } of rig) {
    const others: WakeStrip[] = rig.flatMap(sail => sail.part === part ? [] : sail.strips);
    let weightedIncidence = 0, weightedShadow = 0, area = 0;
    for (const strip of strips) {
      const { arm, span, chord, normal } = strip;
      const relative = sub(wind, localVelocity(arm));
      const flow = sub(relative, scale(span, dot(relative, span)));
      const speed = norm(flow);
      if (speed < 1e-6) continue;
      const direction = scale(flow, 1 / speed);
      const angle = Math.atan2(dot(flow, normal), Math.abs(dot(flow, chord)));
      const coefficients = sailCoefficients(angle);
      const liftDirection = sub(normal, scale(direction, dot(normal, direction)));
      const lift: Vector = norm(liftDirection) < 1e-6 ? [0, 0, 0] : scale(unit(liftDirection), coefficients.lift);
      const drag = scale(direction, coefficients.drag);
      const shadow = others.length ? windShadow(strip, others, unit(relative)) : 0;
      const localSpeed = speed * (1-shadow);
      apply(scale(add(lift, drag), 0.5*airDensity*localSpeed**2*strip.area), arm, part);
      if (sailReport) {
        weightedIncidence += strip.area * Math.abs(angle);
        weightedShadow += strip.area * shadow;
        area += strip.area;
      }
    }
    if (area) sailReport?.set(part, { incidence: degrees(weightedIncidence / area), shadow: weightedShadow / area });
  }
  for (const part of boat.parts) {
    if (part.displacementSurface) {
      const { strips, sideLiftSlope } = part.displacementSurface;
      for (const strip of strips) {
        for (const patch of strip) {
          const arm = rotate(q, sub(patch.center, boat.center));
          const [x,y,z] = add(state.position, arm);
          const { height, verticalSpeed } = weather.water(x, y, state.time);
          const wet = wetFraction(height-z, dot(up, patch.halfSize));
          if (!wet) continue;
          const relative = rotate(toBody, sub(localVelocity(arm), [0,0,verticalSpeed]));
          apply(rotate(q, bodyPatchForce(patch, relative, wet, sideLiftSlope, waterDensity)), arm, part);
        }
      }
      continue;
    }
    if (part.sailStrips) continue;
    const foil = part.foil;
    if (!foil) continue;
    const center = partPoint(part, part.center, controls);
    const chordTip = partPoint(part, add(part.center, foil.chord), controls);
    const spanTip = partPoint(part, add(part.center, foil.span), controls);
    const chord = rotate(q, sub(chordTip, center));
    const span = rotate(q, sub(spanTip, center));
    const normal = cross(span, chord);
    const strips = 4;
    for (let strip = 0; strip < strips; strip++) {
      const arm = add(rotate(q, sub(center, boat.center)), scale(span, ((strip + 0.5) / strips - 0.5) * foil.height));
      const [x, y, z] = add(state.position, arm);
      const water = weather.water(x, y, state.time);
      const half = (Math.abs(span[2]) * foil.height / strips + Math.abs(chord[2]) * foil.width) / 2;
      const fraction = wetFraction(water.height - z, half);
      if (!fraction) continue;
      const relative = sub([0, 0, water.verticalSpeed], localVelocity(arm));
      const flow = sub(relative, scale(span, dot(relative, span)));
      const speed = norm(flow);
      if (speed < 1e-6) continue;
      const direction = scale(flow, 1 / speed);
      const liftDirection = sub(normal, scale(direction, dot(normal, direction)));
      const angle = Math.atan2(dot(flow, normal), Math.abs(dot(flow, chord)));
      const pressureArea = 0.5 * waterDensity * speed**2 * foil.area * fraction / strips;
      const lift: Vector = norm(liftDirection) < 1e-6 ? [0, 0, 0] : scale(unit(liftDirection), 1.1 * Math.sin(2 * angle));
      const drag = scale(direction, 0.012 + 1.1 * Math.sin(angle)**2);
      apply(scale(add(lift, drag), pressureArea), arm, part);
    }
  }
  const result = { force, torque: rotate(toBody, torque), displaced, components: [] as ForceVector[] };
  if (!byPart) return result;
  const { components } = result;
  for (const [part, entry] of Array.from(byPart)) {
    const forceSquared = dot(entry.force, entry.force);
    // Choose the point on the resultant's line of action closest to the
    // force-weighted sample centre. A moment parallel to the force is residual.
    const reference = scale(entry.weightedArm, 1 / entry.weight);
    const correction = forceSquared < 1e-12 ? [0, 0, 0] as Vector
      : scale(cross(entry.force, sub(entry.moment, cross(reference, entry.force))), 1 / forceSquared);
    const center = add(state.position, add(reference, correction));
    components.push({
      name: part.name, partId: part.id, medium: part.foil?.medium ?? 'water',
      center, force: entry.force, moment: entry.moment, ...sailReport?.get(part),
    });
  }
  return { ...result, components };
}

export function step(boat: SailingBoat, state: SailingState, controls: Controls, weather: Weather): SailingState {
  const { force, torque } = loads(boat, state, controls, weather);
  const velocity = add(state.velocity, scale(force, stepSeconds / boat.mass));
  const moment = state.angular.map((value, axis) => value * boat.inertia[axis]) as Vector;
  const netTorque = sub(torque, cross(state.angular, moment));
  const angular = add(state.angular, netTorque.map((value, axis) => stepSeconds * value / boat.inertia[axis]) as Vector);
  const rate = norm(angular);
  const orientation = rate ? normalise(compose(state.orientation, axisAngle(scale(angular, 1 / rate), rate * stepSeconds))) : state.orientation;
  const position = add(state.position, scale(velocity, stepSeconds));
  if (![...position, ...velocity, ...orientation, ...angular].every(Number.isFinite) || norm(velocity) > 25 || rate > 30)
    throw new Error('The model became unstable. Reset it and check the mass, dimensions and control angles.');
  return { time: state.time + stepSeconds, position, velocity, orientation, angular };
}

export function windVectors(state: SailingState, weather: Weather) {
  const trueWind = weather.wind(state.time);
  return { trueWind, apparentWind: sub(trueWind, state.velocity) };
}

export function instruments(state: SailingState, weather: Weather) {
  const forward = rotate(state.orientation, [1, 0, 0]);
  const port = rotate(state.orientation, [0, 1, 0]);
  const up = rotate(state.orientation, [0, 0, 1]);
  const { apparentWind: apparent } = windVectors(state, weather);
  const localWind = rotate(inverse(state.orientation), scale(apparent, -1));
  const bearing = (x: number, east: number) => (degrees(Math.atan2(east, x)) + 360) % 360;
  return {
    heading: bearing(forward[0], -forward[1]),
    heel: degrees(Math.atan2(port[2], up[2])),
    pitch: degrees(Math.asin(clamp(forward[2], -1, 1))),
    wind: norm(apparent) > 0.01 ? bearing(localWind[0], -localWind[1]) : null,
    windSpeed: norm(apparent),
    speed: Math.hypot(...state.velocity.slice(0, 2)),
  };
}
