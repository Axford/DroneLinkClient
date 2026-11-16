import { Vector, dot, subtract } from '../boatModel';

export interface WakeStrip {
  arm: Vector;
  chord: Vector;
  span: Vector;
  normal: Vector;
  spanLength: number;
  chordLength: number;
}

function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t*t*(3-2*t);
}

// Trace back along the undisturbed apparent airflow. The most effective wake
// at each sample sets its deficit so overlapping bands do not stack deficits.
export function windShadow(strip: WakeStrip, others: readonly WakeStrip[], flow: Vector): number {
  const stations = [-strip.chordLength/3, 0, strip.chordLength/3];
  const deficits = [0,0,0];
  for (const source of others) {
    const incidence = dot(flow, source.normal);
    const blockage = Math.abs(incidence);
    if (blockage < 1e-4) continue;
    const offset = subtract(strip.arm, source.arm);
    const distance = dot(offset, source.normal)/incidence;
    const chordShift = dot(strip.chord, source.normal)/incidence;
    const chordOffset = dot(offset, source.chord);
    const chordDirection = dot(strip.chord, source.chord);
    const chordFlow = dot(flow, source.chord);
    const spanOffset = dot(offset, source.span);
    const spanDirection = dot(strip.chord, source.span);
    const spanFlow = dot(flow, source.span);
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const downwind = distance + station*chordShift;
      if (downwind <= 0) continue;
      const chord = Math.abs(chordOffset + station*chordDirection - downwind*chordFlow);
      const span = Math.abs(spanOffset + station*spanDirection - downwind*spanFlow);
      const spread = 0.08*downwind;
      const chordEdge = smooth(1 - (chord-source.chordLength/2-spread)/(0.15*source.chordLength+spread));
      const spanEdge = smooth(1 - (span-source.spanLength/2-spread)/(0.15*source.spanLength+spread));
      const onset = smooth(downwind/(0.1*source.chordLength));
      const recovery = 1/(1+downwind/(3*source.chordLength))**2;
      const deficit = 0.55*blockage*chordEdge*spanEdge*onset*recovery;
      deficits[i] = Math.max(deficits[i], deficit);
    }
  }
  return (deficits[0]+deficits[1]+deficits[2])/3;
}
