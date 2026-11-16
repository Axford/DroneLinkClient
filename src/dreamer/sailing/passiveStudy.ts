import { Vector, cross, dot, subtract } from '../boatModel';
import { createPassiveSearch, headingDifference, passiveHeadingSettings as settings, TrimPair } from './passiveHeading';
import { jointAngle, SailingPart } from './sailingModel';
import { SailingState } from './sailingPhysics';

type Search = ReturnType<typeof createPassiveSearch>;
export type PassiveOutcome = ReturnType<Search['describe']>;
export type Recovery = ReturnType<Search['verify']>;
export interface StartingCondition { initialHeading: number; initialSpeed: number }
export interface PassiveTrial extends StartingCondition { trim: TrimPair }
export interface PassiveCandidate {
  trim: TrimPair;
  outcome: PassiveOutcome;
  state: SailingState;
  starts: StartingCondition[];
}
export interface VerifiedTrim extends PassiveCandidate {
  evidence: 'simulated' | 'mirrored';
  disturbances?: Recovery;
}

const radians = Math.PI/180;
const wrap = (a: number) => (a%360+360)%360;

export function passiveTrials([first, second]: SailingPart[]) {
  const coarse = [-75,-45,-15,0,15,45,75];
  const angles = (part: SailingPart) => {
    const joint = part.joint!;
    return Array.from(new Set([joint.minimum, ...coarse.map(a => jointAngle(joint,a)), joint.maximum])).sort((a,b) => a-b);
  };
  const starts = [0,60,120,180,240,300].map(offset => ({
    initialHeading: wrap(settings.windFrom+offset), initialSpeed: 0,
  }));
  const movingStarts = [30,90,150,210,270,330].map(offset => ({
    initialHeading: wrap(settings.windFrom+offset), initialSpeed: 0.35,
  }));
  const limits = [angles(first), angles(second)];
  const trials = limits[0].flatMap(a => limits[1].flatMap(b => starts.map(start =>
    ({ trim: { first:a, second:b }, ...start }))));
  const extra = [[-75,-75],[-65,-55],[-55,-65],[-45,-45],[-75,0],[0,-75],[45,45],[65,60],[60,65],[75,75]];
  for (const [a,b] of extra)
    for (const start of movingStarts)
      trials.push({ trim: { first: jointAngle(first.joint!,a), second: jointAngle(second.joint!,b) }, ...start });
  const distinct = new Map(trials.map(trial =>
    [[trial.trim.first,trial.trim.second,trial.initialHeading,trial.initialSpeed].join(','),trial]));
  return { trials: Array.from(distinct.values()), starts, movingStarts, angles: limits };
}

export function sameOutcome(a: PassiveCandidate, b: PassiveCandidate) {
  return Math.abs(a.trim.first-b.trim.first) < 1e-8 && Math.abs(a.trim.second-b.trim.second) < 1e-8 &&
    Math.abs(headingDifference(a.outcome.heading,b.outcome.heading)) < 2 &&
    Math.abs(a.outcome.speed-b.outcome.speed) < 0.04;
}

export function collectCandidates(observed: (PassiveTrial & { outcome: PassiveOutcome; state: SailingState })[]) {
  const candidates: PassiveCandidate[] = [];
  for (const { trim, outcome, state, initialHeading, initialSpeed } of observed) {
    const candidate = { trim, outcome, state, starts: [{ initialHeading, initialSpeed }] };
    const previous = candidates.find(item => sameOutcome(item,candidate));
    if (previous) previous.starts.push(...candidate.starts);
    else candidates.push(candidate);
  }
  return candidates;
}

export function headingBins<T extends { outcome: PassiveOutcome }>(results: T[]) {
  return Array.from({ length: 360/settings.headingBin }, (_, index) => {
    const center = index*settings.headingBin-180;
    const entries = results.filter(({ outcome }) => {
      const offset = headingDifference(outcome.windAngle,center);
      return offset >= -settings.headingBin/2 && offset < settings.headingBin/2;
    }).sort((a,b) => b.outcome.speed-a.outcome.speed);
    return { center, entries };
  });
}

const reflectPoint = ([x,y,z]: Vector): Vector => [x,-y,z];
const reflectAxial = ([x,y,z]: Vector): Vector => [-x,y,-z];

// The toggle is the operator's assertion that the hull and sail geometry are
// symmetric. Check that each reflected joint line also has a usable counterpart.
export function trimReflection(sails: SailingPart[], lengthScale: number) {
  const joints = sails.map(part => part.joint!);
  for (const dest of [[0,1], [1,0]]) {
    const factors = joints.map((source,i) => dot(reflectAxial(source.axis),joints[dest[i]].axis));
    const matches = joints.every((source,i) => {
      const target = joints[dest[i]];
      const separation = cross(subtract(reflectPoint(source.pivot),target.pivot),target.axis);
      return Math.abs(factors[i]) >= 0.98 && Math.hypot(...separation) <= Math.max(0.002,lengthScale*0.01);
    });
    if (matches) return (trim: TrimPair): TrimPair | null => {
      const input = [trim.first,trim.second], output = [0,0];
      for (let i = 0; i < input.length; i++)
        output[dest[i]] = Math.sign(factors[i])*input[i];
      if (output.some((angle,i) => Math.abs(jointAngle(joints[i],angle)-angle) > 1e-8)) return null;
      return { first: output[0], second: output[1] };
    };
  }
  return null;
}

const opposite = (heading: number) => wrap(2*settings.windFrom-heading);

export function symmetricTrials(trials: PassiveTrial[], reflect: NonNullable<ReturnType<typeof trimReflection>>) {
  return trials.filter(trial => {
    if (headingDifference(trial.initialHeading,settings.windFrom) >= 0) return true;
    const trim = reflect(trial.trim);
    return !trim || !trials.some(candidate => candidate.initialHeading === opposite(trial.initialHeading) &&
      candidate.initialSpeed === trial.initialSpeed && candidate.trim.first === trim.first && candidate.trim.second === trim.second &&
      (candidate.initialHeading !== trial.initialHeading || candidate.trim.first < trial.trim.first ||
        (candidate.trim.first === trial.trim.first && candidate.trim.second < trial.trim.second)));
  });
}

function rotateYaw([x,y,z,w]: SailingState['orientation'], degrees: number): SailingState['orientation'] {
  const c = Math.cos(degrees*radians/2), s = -Math.sin(degrees*radians/2);
  return [c*x-s*y,c*y+s*x,c*z+s*w,c*w-s*z];
}

export function reflectVerified(candidate: VerifiedTrim, trim: TrimPair, describe: Search['describe']): VerifiedTrim {
  const { state } = candidate;
  const [x,y,z,w] = rotateYaw(state.orientation,-settings.windFrom);
  const [vx,vy,vz] = state.velocity;
  const angle = 2*settings.windFrom*radians;
  const reflected: SailingState = { ...state, position: [0,0,state.position[2]],
    orientation: rotateYaw([-x,y,-z,w],settings.windFrom),
    velocity: [Math.cos(angle)*vx-Math.sin(angle)*vy,-Math.sin(angle)*vx-Math.cos(angle)*vy,vz],
    angular: reflectAxial(state.angular) };
  return { trim, state: reflected, evidence: 'mirrored', outcome: describe(reflected,trim),
    starts: candidate.starts.map(start => ({ ...start, initialHeading: opposite(start.initialHeading) })) };
}
