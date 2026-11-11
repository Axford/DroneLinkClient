import { Expected, Intent, WriteObservation } from '../commands/model';
import { ChannelState, GlobalState, NodeState, ParameterState } from './DroneLinkState';
import {
  DRONE_LINK_MSG_TYPE_ADDR as ADDR, DRONE_LINK_MSG_TYPE_CHAR as CHAR,
  DRONE_LINK_MSG_TYPE_FLOAT as FLOAT, DRONE_MODULE_PARAM_TYPE as MODULE_TYPE
} from './DroneLinkMsg';
import { ObservedPosition } from './observedPositions';

export type MapContext = { kind: 'background'; longitude: number; latitude: number } | { kind: 'marker'; nodeId: number };

export interface MapAction {
  key: string;
  label: string;
  recipient?: { key: string; label: string };
  warning?: string;
  receivedAt?: number;
  intent: Intent;
}

interface ActionGroup { label: string; entries: MapAction[] }
interface Observations { nodes: GlobalState; positions: ObservedPosition[] }
interface MapActionProvider {
  background?: (point: Extract<MapContext, { kind: 'background' }>, observations: Observations) => ActionGroup[];
  marker?: (node: NodeState, observations: Observations) => ActionGroup[];
}

const TARGET = 12;
const TARGET_SOURCE = 13;

function isCommandAddress(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 254;
}

function navChannels(node: NodeState): ChannelState[] {
  if (!isCommandAddress(node.id)) return [];
  return Object.values(node.channels).filter(channel => {
    const type = channel.params[MODULE_TYPE];
    return isCommandAddress(channel.channel) && type?.msgType === CHAR && !type.unavailable?.value && type.values[0] === 'Nav';
  });
}

function observedWrite(node: NodeState, reading: ParameterState | undefined, type: number, sizes: number[]): WriteObservation | undefined {
  const observation = reading?.writeObservation;
  const expected = observation?.expected;
  if (observation && reading?.writable && !reading.unavailable?.value && reading.msgType === type &&
      expected?.writable === true && expected.observationEpoch && expected.nodeGeneration === node.observationGeneration &&
      expected.msgType === type && sizes.includes(expected.payloadBytes) && observation.bytes.length === expected.payloadBytes) {
    return observation;
  }
}

const nodeLabel = (node: { name?: string; id: number }) => node.name ? `${node.name} (Node ${node.id})` : `Node ${node.id}`;
const channelLabel = (channel: ChannelState) => channel.name ? `${channel.name} (Channel ${channel.channel})` : `Nav (Channel ${channel.channel})`;

function targetWarning(source: ParameterState | undefined): string | undefined {
  if (!source?.lastHeard || source.unavailable?.value || source.msgType !== ADDR ||
      source.values.length !== 4 || !Array.from<number | string>(source.values).every(Number.isInteger)) return 'Target source unknown';
  if (source.values[1] !== 0) return 'A publication from the configured target source can overwrite these coordinates.';
}

function recipientKey(node: NodeState, channel: ChannelState, expected: Expected) {
  return [node.id, node.droneId, channel.channel, expected.observationEpoch, expected.nodeGeneration, expected.msgType, expected.payloadBytes];
}

const navActions: MapActionProvider = {
  background({ longitude, latitude }, { nodes }) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return [];
    // Mapbox can report longitudes in a neighbouring world copy.
    const lng = Math.abs(longitude) <= 180 ? longitude : ((longitude + 180) % 360 + 360) % 360 - 180;
    const entries = Object.values(nodes).flatMap(node => navChannels(node).flatMap(channel => {
      const reading = observedWrite(node, channel.params[TARGET], FLOAT, [12, 16]);
      if (!reading) return [];
      const { expected, bytes } = reading;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const retained = expected.payloadBytes === 16 ? [view.getFloat32(8, true), view.getFloat32(12, true)] : [view.getFloat32(8, true)];
      if (!retained.every(Number.isFinite)) return [];
      return [{
        key: JSON.stringify(['nav-target', ...recipientKey(node, channel, expected)]),
        label: `${nodeLabel(node)} · ${channelLabel(channel)}`,
        warning: targetWarning(channel.params[TARGET_SOURCE]),
        intent: { operation: 'write' as const, target: { nodeAddress: node.id, channel: channel.channel, param: TARGET },
          expected, payload: { values: [lng, latitude, ...retained] } }
      }];
    }));
    return [{ label: 'Set target', entries }];
  },
  marker(node, { nodes, positions }) {
    const channels = navChannels(node).flatMap(channel => {
      const observation = observedWrite(node, channel.params[TARGET_SOURCE], ADDR, [4]);
      return observation ? [{ channel, expected: observation.expected }] : [];
    });
    const entries = channels.flatMap(({ channel, expected }) => positions.filter(source => source.nodeId !== node.id).map(source => ({
      key: JSON.stringify(['nav-follow', ...recipientKey(node, channel, expected), source.nodeId, source.droneId,
        nodes[source.nodeId].observationGeneration, source.channelId, source.parameterId]),
      label: nodeLabel(nodes[source.nodeId]),
      recipient: channels.length > 1 ? { key: String(channel.channel), label: channelLabel(channel) } : undefined,
      receivedAt: source.reading.lastHeard,
      intent: {
        operation: 'write' as const, target: { nodeAddress: node.id, channel: channel.channel, param: TARGET_SOURCE }, expected,
        payload: { addresses: [{ source: node.id, node: source.nodeId, channel: source.channelId, param: source.parameterId, priority: 0 }] }
      }
    })));
    return [{ label: 'Follow', entries }];
  }
};

const providers: MapActionProvider[] = [navActions];

export function mapContextActions(context: MapContext, observations: Observations): ActionGroup[] {
  const groups = new Map<string, MapAction[]>();
  const marker = context.kind === 'marker' && observations.positions.some(position => position.nodeId === context.nodeId)
    ? observations.nodes[context.nodeId] : undefined;
  for (const provider of providers) {
    const contributions = context.kind === 'background' ? provider.background?.(context, observations) : marker && provider.marker?.(marker, observations);
    for (const { label, entries } of contributions || []) {
      if (entries.length) groups.set(label, [...(groups.get(label) || []), ...entries]);
    }
  }
  return Array.from(groups, ([label, entries]) => ({ label, entries }));
}
