import type { FeatureCollection, LineString } from 'geojson';
import type { ObservedPosition } from './observedPositions';

// Match the legacy 10 m line measured along the published compass bearing.
const windLineLength = 10;
const earthRadius = 6371e3;
const radians = Math.PI / 180;

export function windLines(positions: ObservedPosition[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: positions.flatMap(({ nodeId, coordinates, wind }) => {
      if (!wind) return [];
      const [lng, lat] = coordinates;
      const latitude = lat * radians;
      const bearing = wind.degrees * radians;
      const distance = windLineLength / earthRadius;
      const endLatitude = Math.asin(Math.sin(latitude) * Math.cos(distance) +
        Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
      const longitudeOffset = Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
        Math.cos(distance) - Math.sin(latitude) * Math.sin(endLatitude));
      // Keep the endpoint on the same world copy as the start near ±180°.
      const end = [lng + longitudeOffset / radians, endLatitude / radians];
      return [{
        type: 'Feature', id: nodeId, properties: {},
        geometry: { type: 'LineString', coordinates: [coordinates, end] }
      }];
    })
  };
}
