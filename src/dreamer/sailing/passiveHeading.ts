import { Vector, add, dot, scale, subtract } from '../boatModel';
import { SailingBoat, SailingPart, jointAngle } from './sailingModel';
import { initialState, instruments, makeWeather, rotate, SailingState, step, stepSeconds, weatherPresets } from './sailingPhysics';
import { neutralControls } from './sailingRun';

export interface TrimPair {
  first: number;
  second: number;
}

export const passiveHeadingSettings = {
  windSpeed: 5,
  windFrom: 45,
  headingBin: 10,
  holdSeconds: 8,
  searchSeconds: 42,
  recoverySeconds: 30,
  maximumHeadingSpread: 2,
  maximumSpeedSpread: 0.04,
  maximumAttitudeSpread: 2,
  maximumAngularRate: 0.6,
  minimumForwardSpeed: 0.08,
  recoveryHeadingTolerance: 3,
  recoverySpeedTolerance: 0.08,
  yawDisturbance: 5,
  velocityFraction: 0.15,
  lateralDisturbance: 0.08,
} as const;

export function headingDifference(a: number, b: number) {
  return ((a-b+180)%360 + 360)%360 - 180;
}

const radians = Math.PI/180;
const wrap = (value: number) => (value%360 + 360)%360;

function yawed([x,y,z,w]: SailingState['orientation'], offset: number): SailingState['orientation'] {
  const c = Math.cos(offset*radians/2), s = -Math.sin(offset*radians/2);
  return [c*x-s*y,c*y+s*x,c*z+s*w,c*w-s*z];
}

function trimmed(part: SailingPart, angle: number): SailingState['orientation'] {
  const { axis } = part.joint!;
  const half = angle*radians/2;
  return [...scale(axis, Math.sin(half)), Math.cos(half)];
}

function compassVector(bearing: number): Vector {
  return [Math.cos(bearing*radians), -Math.sin(bearing*radians), 0];
}

function chordAngle(chord: Vector, wind: Vector) {
  const horizontal = Math.hypot(chord[0], chord[1]);
  return horizontal < 1e-8 ? null : Math.acos(Math.min(1, Math.abs(dot(chord,wind))/horizontal))/radians;
}

export function createPassiveSearch(boat: SailingBoat) {
  const options = passiveHeadingSettings;
  const sails = boat.parts.filter(part => part.sailStrips);
  if (sails.length !== 2 || sails.some(part => !part.joint))
    throw new Error('The passive-heading search needs two enabled rigid sails with joints.');
  if (boat.parts.some(part => part.foil?.medium === 'water' && part.joint))
    throw new Error('Exclude the rudder and other actuated water foils from the saved model first.');
  const weather = makeWeather(weatherPresets['Smooth water · light wind'], 1, options.windSpeed);
  const calmPose = initialState(boat, weather);
  const neutral = neutralControls(boat);
  const wind = compassVector(options.windFrom);
  const holdSamples = options.holdSeconds * 2;
  const sampleTicks = Math.round(0.5/stepSeconds);

  function evaluate(start: SailingState, trim: TrimPair, seconds: number) {
    const controls = { ...neutral, [sails[0].id]: trim.first, [sails[1].id]: trim.second };
    let state = start;
    const tail: (ReturnType<typeof instruments> & { angularRate: number })[] = [];
    try {
      for (let i = 0; i < seconds*2; i++) {
        for (let tick = 0; tick < sampleTicks; tick++) state = step(boat, state, controls, weather);
        const sample = instruments(state, weather);
        if (Math.abs(sample.heel) >= 85 || Math.abs(sample.pitch) >= 80) return { status: 'overturned' as const };
        if (i >= seconds*2-holdSamples)
          tail.push({ ...sample, angularRate: Math.hypot(...state.angular)/radians });
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('The model became unstable.')) return { status: 'numerical failure' as const };
      throw error;
    }
    const terminal = tail[tail.length-1];
    const extent = (values: number[]) => Math.max(...values)-Math.min(...values);
    const headingSpread = extent(tail.map(s => headingDifference(s.heading,terminal.heading)));
    const speedSpread = extent(tail.map(s => s.speed));
    const attitudeSpread = Math.max(extent(tail.map(s => s.heel)), extent(tail.map(s => s.pitch)));
    const angularRate = Math.max(...tail.map(s => s.angularRate));
    const steady = headingSpread <= options.maximumHeadingSpread && speedSpread <= options.maximumSpeedSpread &&
      attitudeSpread <= options.maximumAttitudeSpread && angularRate <= options.maximumAngularRate;
    const status = !steady ? 'unsettled' : tail.every(s => s.foreAftSpeed > options.minimumForwardSpeed) ? 'forward'
      : tail.every(s => s.foreAftSpeed < -options.minimumForwardSpeed) ? 'astern' : 'slow';
    return { state, status, terminal, headingSpread, speedSpread, attitudeSpread, angularRate };
  }

  function verify(sample: SailingState, trim: TrimPair) {
    const baseline = instruments(sample, weather);
    const lateral = compassVector(baseline.heading-90);
    const { yawDisturbance, velocityFraction, lateralDisturbance } = options;
    const disturbances: [string, SailingState][] = [
      ['yaw port', { ...sample, orientation: yawed(sample.orientation, -yawDisturbance) }],
      ['yaw starboard', { ...sample, orientation: yawed(sample.orientation, yawDisturbance) }],
      ['slower with port drift', { ...sample, velocity: add(scale(sample.velocity,1-velocityFraction), scale(lateral,lateralDisturbance)) }],
      ['faster with starboard drift', { ...sample, velocity: add(scale(sample.velocity,1+velocityFraction), scale(lateral,-lateralDisturbance)) }],
    ];
    return disturbances.map(([disturbance, start]) => {
      const result = evaluate(start, trim, options.recoverySeconds);
      const headingError = result.terminal ? Math.abs(headingDifference(result.terminal.heading, baseline.heading)) : null;
      const speedError = result.terminal ? Math.abs(result.terminal.speed-baseline.speed) : null;
      return { disturbance, status: result.status, headingError, speedError,
        recovered: result.status === 'forward' && headingError !== null && speedError !== null &&
          headingError <= options.recoveryHeadingTolerance && speedError <= options.recoverySpeedTolerance };
    });
  }

  function describe(state: SailingState, trim: TrimPair) {
    const numbers = instruments(state, weather);
    const { heading, course, speed, foreAftSpeed, heel, pitch } = numbers;
    const geometry = sails.map((part,index) => {
      const angle = jointAngle(part.joint!, index === 0 ? trim.first : trim.second);
      const rotation = trimmed(part, angle);
      const pivot = part.joint!.pivot;
      const center = rotate(state.orientation, add(pivot, rotate(rotation, subtract(part.center,pivot))));
      const chord = rotate(state.orientation, rotate(rotation, part.foil!.chord));
      return { name: part.name, upwind: dot(center,wind), angleToWind: chordAngle(chord,wind) };
    }).sort((a,b) => b.upwind-a.upwind);
    const [windward, leeward] = Math.abs(geometry[0].upwind-geometry[1].upwind) > 0.01
      ? geometry : [{ name: null, angleToWind: null }, { name: null, angleToWind: null }];
    return { heading, windAngle: headingDifference(heading, options.windFrom), course,
      leeway: course === null ? null : headingDifference(course,heading), speed, foreAftSpeed,
      heel, pitch, upwindVmg: dot(state.velocity,wind),
      windwardSail: windward.name, windwardAngleToWind: windward.angleToWind,
      leewardSail: leeward.name, leewardAngleToWind: leeward.angleToWind };
  }

  return {
    sails,
    run(trim: TrimPair, heading: number, speed: number) {
      const start = { ...calmPose, orientation: yawed(calmPose.orientation,wrap(heading)),
        velocity: scale(compassVector(heading),speed) };
      return evaluate(start, trim, options.searchSeconds);
    },
    verify, describe,
  };
}
