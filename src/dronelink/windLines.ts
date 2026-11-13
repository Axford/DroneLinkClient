import type { FeatureCollection, LineString } from 'geojson';
import type { ObservedPosition } from './observedPositions';
import { offsetPosition } from './mapGeometry';

// Match the legacy 10 m line measured along the published compass bearing.
const windLineLength = 10;

export function windLines(positions: ObservedPosition[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: positions.flatMap(({ nodeId, coordinates, wind }) => {
      if (!wind) return [];
      const end = offsetPosition(coordinates, windLineLength, wind.degrees);
      return [{
        type: 'Feature', id: nodeId, properties: {},
        geometry: { type: 'LineString', coordinates: [coordinates, end] }
      }];
    })
  };
}
