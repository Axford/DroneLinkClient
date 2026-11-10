import { GlobalState, ParameterState } from './DroneLinkState';
import { mapBindings, locationCoordinates } from './mapBindings';

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
}

// Rendering consumes selected semantic bindings; it never chooses the source.
export function observedPositions(state: GlobalState): ObservedPosition[] {
  return Object.values(state).flatMap(node => {
    const binding = mapBindings(node).location;
    const coordinates = locationCoordinates(binding);
    if (!binding || !coordinates) return [];
    return [{ nodeId: node.id, droneId: node.droneId, name: node.name || `Node ${node.id}`,
      channelId: binding.channelId, parameterId: binding.parameterId, priority: binding.priority,
      path: binding.path, coordinates, reading: binding.reading }];
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
