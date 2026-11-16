import { Vector, add, direction, scale } from '../boatModel';
import { Controls } from './sailingModel';
import { ForceVector, SailingState, Weather } from './sailingPhysics';

export interface SailingPose {
  state: SailingState;
  center: Vector;
  angles: Controls;
  water: Weather['water'];
  vectors: { label: string; color: 'forward' | 'cg' | 'highlight' | 'up'; start: Vector; end: Vector }[];
}

export function waterGrid(position: Vector, time: number, water: Weather['water'], metresVisible: number) {
  const extent = Math.min(28, Math.max(4, Math.ceil(metresVisible)));
  const x = Math.floor(position[0]), y = Math.floor(position[1]);
  const lines: Vector[][] = [];
  // The grid stays on the integer world coordinates as the boat moves.
  for (let offset = -extent; offset <= extent; offset++) {
    const alongX: Vector[] = [], alongY: Vector[] = [];
    for (let index = -extent; index <= extent; index++) {
      const xx = x+index, xy = y+offset, yx = x+offset, yy = y+index;
      alongX.push([xx,xy,water(xx,xy,time).height]);
      alongY.push([yx,yy,water(yx,yy,time).height]);
    }
    lines.push(alongX, alongY);
  }
  return lines;
}

export function sailingForces(components: ForceVector[], mass: number, extent: number): SailingPose['vectors'] {
  return components.flatMap(({ name, medium, force, center, incidence, shadow }) => {
    const axis = direction(force);
    if (!axis) return [];
    const magnitude = Math.hypot(...force);
    const length = extent * Math.sqrt(magnitude/(mass*9.80665)) * 0.55;
    return [{
      label: name + ' · ' + magnitude.toFixed(magnitude < 10 ? 1 : 0) + ' N' +
        (incidence === undefined ? '' : ' · ' + incidence.toFixed(0) + '° incidence') +
        (!shadow || shadow < 0.005 ? '' : ' · ' + Math.round(100*shadow) + '% shadow'),
      color: medium === 'air' ? 'cg' : 'highlight',
      start: center, end: add(center, scale(axis, length)),
    }];
  });
}
