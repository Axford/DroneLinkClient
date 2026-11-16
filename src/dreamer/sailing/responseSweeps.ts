import { Vector } from '../boatModel';
import { SailingBoat, SailingJoint } from './sailingModel';
import { initialState, loads, makeWeather, weatherPresets } from './sailingPhysics';
import { neutralControls } from './sailingRun';

export const sweepSpeeds = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2];
export const sweepLeeway = Array.from({ length: 13 }, (_, index) => 5*index-30);

export interface ResponseLoad {
  longitudinal: number;
  side: number;
  yaw: number;
  vertical: number;
  shadow: number;
}

const zero: ResponseLoad = { longitudinal: 0, side: 0, yaw: 0, vertical: 0, shadow: 0 };

export function trimAngles({ minimum, maximum }: SailingJoint): number[] {
  const range = maximum-minimum;
  if (range > 360) return Array.from({ length: 73 }, (_, index) => minimum*(1-index/72)+maximum*(index/72));
  const angles = new Set([minimum, maximum]);
  if (minimum <= 0 && maximum >= 0) angles.add(0);
  const first = Math.ceil(minimum/5);
  const count = Math.min(73, Math.max(0, Math.floor(maximum/5)-first+1));
  for (let i = 0; i < count; i++) angles.add((first+i)*5);
  return Array.from(angles).sort((a,b) => a-b);
}

export function sailResponse(boat: SailingBoat, windSpeed: number) {
  const weather = makeWeather(weatherPresets['Smooth water · light wind'], 1, windSpeed);
  const state = initialState(boat, weather);
  const neutral = neutralControls(boat);
  const parts = boat.parts.filter(part => part.sailStrips);
  return {
    parts,
    at(angles: Record<string, number>) {
      const { components } = loads(boat, state, { ...neutral, ...angles }, weather, true);
      const byPart = parts.map(part => {
        const load = components.find(component => component.partId === part.id);
        return load ? { longitudinal: load.force[0], side: load.force[1], yaw: load.moment[2],
          vertical: load.force[2], shadow: load.shadow ?? 0 } : zero;
      });
      const total = byPart.reduce((sum, load) => ({
        longitudinal: sum.longitudinal+load.longitudinal, side: sum.side+load.side, yaw: sum.yaw+load.yaw,
        vertical: sum.vertical+load.vertical, shadow: 0,
      }), zero);
      return { byPart, total };
    },
  };
}

export function hullResponse(boat: SailingBoat) {
  const weather = makeWeather(weatherPresets['Flat calm'], 1);
  const state = initialState(boat, weather);
  const controls = neutralControls(boat);
  const parts = boat.parts.filter(part => part.displacementSurface || part.foil?.medium === 'water');
  return {
    parts,
    at(speed: number, leeway: number): ResponseLoad[] {
      const angle = leeway*Math.PI/180;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const velocity: Vector = [speed*ux, speed*uy, 0];
      const { components } = loads(boat, { ...state, velocity }, controls, weather, true);
      return parts.map(part => {
        const load = components.find(component => component.partId === part.id);
        if (!load) return zero;
        const [x,y,z] = load.force;
        return { longitudinal: -ux*x-uy*y, side: -uy*x+ux*y, yaw: load.moment[2], vertical: z, shadow: 0 };
      });
    },
  };
}
