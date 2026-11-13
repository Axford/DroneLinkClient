import type { FeatureCollection, LineString } from 'geojson';
import type { GlobalState } from './DroneLinkState';
import { locationCoordinates, MapBinding, mapBindings } from './mapBindings';

export interface ObservedWaypoint {
  nodeId: number;
  role: 'target' | 'last';
  coordinates: [number, number];
}

function waypoint(nodeId: number, binding: MapBinding | undefined): ObservedWaypoint | undefined {
  if (!binding || (binding.role !== 'target' && binding.role !== 'last')) return;
  const { values, numValues } = binding.reading;
  if (values.length !== numValues || (numValues !== 3 && !(binding.role === 'target' && numValues === 4))) return;
  const coordinates = locationCoordinates(binding);
  if (coordinates) return { nodeId, role: binding.role, coordinates };
}

export function observedNavigation(state: GlobalState): {
  waypoints: ObservedWaypoint[];
  legs: FeatureCollection<LineString>;
} {
  const waypoints: ObservedWaypoint[] = [];
  const legs: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
  for (const node of Object.values(state)) {
    const { target: targetBinding, last: lastBinding } = mapBindings(node);
    const target = waypoint(node.id, targetBinding);
    const last = waypoint(node.id, lastBinding);
    if (last) waypoints.push(last);
    if (target) waypoints.push(target);
    // Two independent bindings can select different Nav channels. They do not describe one leg.
    if (!last || !target || lastBinding?.channelId !== targetBinding?.channelId) continue;
    const [fromLng, fromLat] = last.coordinates;
    const [toLng, toLat] = target.coordinates;
    // Keep short legs across the antimeridian on the same world copy.
    const delta = ((toLng - fromLng + 540) % 360) - 180;
    if (delta === 0 && fromLat === toLat) continue;
    legs.features.push({
      type: 'Feature', id: node.id, properties: {},
      geometry: { type: 'LineString', coordinates: [last.coordinates, [fromLng + delta, toLat]] }
    });
  }
  return { waypoints, legs };
}
