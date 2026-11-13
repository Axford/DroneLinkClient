import { GlobalState, ParameterState } from './DroneLinkState';
import { MapBinding, mapBindings, locationCoordinates } from './mapBindings';

export interface ObservedBearing {
  degrees: number;
  binding: MapBinding;
}

export interface ObservedPosition {
  nodeId: number;
  droneId?: string;
  name: string;
  channelId: number;
  parameterId: number;
  priority: number;
  path: string;
  coordinates: [number, number];
  reading: ParameterState;
  heading?: ObservedBearing;
  wind?: ObservedBearing;
}

function observedBearing(binding: MapBinding | undefined): ObservedBearing | undefined {
  if (!binding || binding.reading.numValues !== 1 || binding.reading.values.length !== 1) return;
  const degrees = binding.reading.values[0];
  if (typeof degrees === 'number' && Number.isFinite(degrees) && degrees >= 0 && degrees <= 360) {
    return { degrees, binding };
  }
}

// Rendering consumes selected semantic bindings; it never chooses the source.
export function observedPositions(state: GlobalState, role: 'location' | 'location2' = 'location'): ObservedPosition[] {
  return Object.values(state).flatMap(node => {
    const bindings = mapBindings(node);
    const binding = bindings[role];
    const coordinates = locationCoordinates(binding);
    if (!binding || !coordinates) return [];
    const heading = role === 'location' ? observedBearing(bindings.heading) : undefined;
    // Wind publishes a sensor-relative angle and Sailor's subscription does not establish a frame.
    const wind = role === 'location' && bindings.wind?.moduleType === 'WindFromWing'
      ? observedBearing(bindings.wind) : undefined;
    return [{ nodeId: node.id, droneId: node.droneId, name: node.name || `Node ${node.id}`,
      channelId: binding.channelId, parameterId: binding.parameterId, priority: binding.priority,
      path: binding.path, coordinates, reading: binding.reading, heading, wind }];
  });
}

export function receiptAgeLabel(receivedAt: number | undefined, now = Date.now()): string {
  if (!receivedAt) return 'No saved receipt';
  const minutes = Math.floor(Math.max(0, now - receivedAt) / 60000);
  const age = minutes < 1 ? 'less than a minute ago' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  return age;
}

export function receiptLabel(receivedAt: number | undefined, now = Date.now()): string {
  if (!receivedAt) return 'No saved receipt';
  return `${new Date(receivedAt).toLocaleString()} (${receiptAgeLabel(receivedAt, now)})`;
}


/** Short visual label; the full Server receipt remains available separately. */
export function compactReceiptAge(receivedAt: number | undefined, now = Date.now()): string {
  if (!receivedAt) return '—';
  const seconds = Math.floor(Math.max(0, now - receivedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}
