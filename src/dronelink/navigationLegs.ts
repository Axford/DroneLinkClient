import type { FeatureCollection, LineString } from 'geojson';
import type { GlobalState } from './DroneLinkState';
import { locationCoordinates, MapBinding, mapBindings } from './mapBindings';
import { initialBearing, offsetPosition } from './mapGeometry';

export interface ObservedWaypoint {
  nodeId: number;
  role: 'target' | 'last';
  coordinates: [number, number];
  channelId: number;
}

type NavigationLine = { kind: 'leg' | 'corridor' | 'target-radius' | 'previous-radius' };
const alwaysHidden = () => false;
const longitudeDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

function waypoint(nodeId: number, binding: MapBinding | undefined): ObservedWaypoint | undefined {
  if (!binding || (binding.role !== 'target' && binding.role !== 'last')) return;
  if (binding.reading.unavailable?.value) return;
  const { values, numValues } = binding.reading;
  if (values.length !== numValues || (numValues !== 3 && !(binding.role === 'target' && numValues === 4))) return;
  const coordinates = locationCoordinates(binding);
  if (coordinates) return { nodeId, role: binding.role, coordinates, channelId: binding.channelId };
}

function radius(binding: MapBinding | undefined): number | undefined {
  const value = binding?.reading.values[2];
  // Reject radii large enough to wrap a ring around a hemisphere.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10000000) return value;
}

export function observedNavigation(state: GlobalState, showPreviousRadius = alwaysHidden as (nodeId: number) => boolean): {
  waypoints: ObservedWaypoint[];
  legs: FeatureCollection<LineString, NavigationLine>;
} {
  const waypoints: ObservedWaypoint[] = [];
  const legs: FeatureCollection<LineString, NavigationLine> = { type: 'FeatureCollection', features: [] };
  const add = (kind: NavigationLine['kind'], coordinates: number[][]) => {
    legs.features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates } });
  };
  const ring = (kind: 'target-radius' | 'previous-radius', waypoint: ObservedWaypoint, metres: number) => {
    const coordinates = Array.from({ length: 64 }, (_, index) => offsetPosition(waypoint.coordinates, metres, index * 360 / 64));
    add(kind, [...coordinates, coordinates[0]]);
  };
  for (const node of Object.values(state)) {
    const { target: targetBinding, last: lastBinding } = mapBindings(node);
    const target = waypoint(node.id, targetBinding);
    const last = waypoint(node.id, lastBinding);
    if (last) waypoints.push(last);
    if (target) waypoints.push(target);
    const targetRadius = radius(targetBinding);
    const previousRadius = radius(lastBinding);
    if (target && targetRadius) ring('target-radius', target, targetRadius);
    if (last && previousRadius && showPreviousRadius(node.id)) ring('previous-radius', last, previousRadius);
    // Two independent bindings can select different Nav channels. They do not describe one leg.
    if (!last || !target || lastBinding?.channelId !== targetBinding?.channelId) continue;
    const [fromLng, fromLat] = last.coordinates;
    const [toLng, toLat] = target.coordinates;
    // Keep short legs across the antimeridian on the same world copy.
    const delta = longitudeDelta(fromLng, toLng);
    if (delta === 0 && fromLat === toLat) continue;
    const end: [number, number] = [fromLng + delta, toLat];
    add('leg', [last.coordinates, end]);
    if (targetRadius) {
      const bearing = initialBearing(last.coordinates, end);
      for (const side of [-90, 90]) {
        const start = offsetPosition(last.coordinates, targetRadius, bearing + side);
        const finish = offsetPosition(end, targetRadius, bearing + side);
        add('corridor', [start, [start[0] + longitudeDelta(start[0], finish[0]), finish[1]]]);
      }
    }
  }
  return { waypoints, legs };
}
