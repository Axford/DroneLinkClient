import { NodeState, ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_MODULE_PARAM_TYPE } from './DroneLinkMsg';

export type MapRole = 'location' | 'location2' | 'heading' | 'target' | 'last' | 'wind';
export interface MapBinding {
  role: MapRole;
  priority: number;
  channelId: number;
  parameterId: number;
  path: string;
  reading: ParameterState;
}
interface Mapping { role: MapRole; parameterId: number; priority: number }

// Legacy oui/interfaces registrations and NodeUI.updateMapParam precedence.
// These are semantic mapping priorities, independent of packet priority or receipt age.
const mappings: Record<string, Mapping[]> = {
  NMEA: [{ role: 'location', parameterId: 8, priority: 3 }, { role: 'location2', parameterId: 18, priority: 3 }, { role: 'heading', parameterId: 10, priority: 1 }],
  Nav: [{ role: 'location', parameterId: 10, priority: 2 }, { role: 'target', parameterId: 12, priority: 2 }, { role: 'last', parameterId: 15, priority: 2 }],
  CMPS12: [{ role: 'heading', parameterId: 10, priority: 3 }],
  HMC5883L: [{ role: 'heading', parameterId: 11, priority: 3 }],
  LSM9DS1: [{ role: 'heading', parameterId: 11, priority: 3 }],
  Sailor: [{ role: 'heading', parameterId: 10, priority: 2 }, { role: 'wind', parameterId: 12, priority: 2 }],
  TankSteer: [{ role: 'heading', parameterId: 22, priority: 2 }],
  TurnRate: [{ role: 'heading', parameterId: 12, priority: 1 }],
  Wind: [{ role: 'wind', parameterId: 14, priority: 3 }],
  WindFromWing: [{ role: 'wind', parameterId: 15, priority: 4 }]
};

// Reconstruct from the authoritative snapshot, including when values precede module type.
// Invalid/stale coordinates do not promote a lower-precedence source.
export function mapBindings(node: NodeState): Partial<Record<MapRole, MapBinding>> {
  const selected: Partial<Record<MapRole, MapBinding>> = {};
  for (const channel of Object.values(node.channels)) {
    const type = channel.params[DRONE_MODULE_PARAM_TYPE];
    if (type?.msgType !== DRONE_LINK_MSG_TYPE_CHAR) continue;
    const moduleType = String(type.values[0]);
    if (!Object.prototype.hasOwnProperty.call(mappings, moduleType)) continue;
    for (const mapping of mappings[moduleType]) {
      const reading = channel.params[mapping.parameterId];
      if (reading?.msgType !== DRONE_LINK_MSG_TYPE_FLOAT || !reading.lastHeard) continue;
      const previous = selected[mapping.role];
      if (previous && (mapping.priority < previous.priority || (mapping.priority === previous.priority && channel.channel > previous.channelId))) continue;
      selected[mapping.role] = { ...mapping, channelId: channel.channel,
        path: `${channel.name || `Channel ${channel.channel}`}.${reading.name || `Param ${mapping.parameterId}`}`, reading };
    }
  }
  return selected;
}

export function locationCoordinates(binding: MapBinding | undefined): [number, number] | undefined {
  if (!binding) return;
  const [longitude, latitude] = binding.reading.values;
  // Preserve legacy zero-longitude suppression, adding finite/range validation.
  // No fallback to a lower-priority binding when the selected location cannot render.
  if (typeof longitude !== 'number' || typeof latitude !== 'number' ||
      !Number.isFinite(longitude) || !Number.isFinite(latitude) ||
      longitude === 0 || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return;
  return [longitude, latitude];
}
