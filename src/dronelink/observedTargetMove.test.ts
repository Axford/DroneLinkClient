import { observedTargetMove } from './mapContextActions';
import { DRONE_LINK_MSG_TYPE_CHAR as CHAR, DRONE_LINK_MSG_TYPE_FLOAT as FLOAT,
  DRONE_LINK_MSG_TYPE_UINT32_T as UINT32 } from './DroneLinkMsg';
import { NodeState, ParameterState } from './DroneLinkState';
import { ObservedWaypoint } from './navigationLegs';

function fixture(guard?: number) {
  const target: ObservedWaypoint = { nodeId: 11, channelId: 12, coordinates: [-2, 51], role: 'target' };
  const reading = (param: number, msgType: number, values: string[] | number[]): ParameterState => ({
    param, msgType, values, lastHeard: 100, bytesPerValue: 4, numValues: values.length, writable: false
  });
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, guard ?? 0, true);
  view.setFloat32(4, -2, true);
  view.setFloat32(8, 51, true);
  const move = { ...reading(27, UINT32, []), writable: true, writeObservation: { bytes, expected: {
    observationEpoch: 'epoch', nodeGeneration: 2, msgType: UINT32, payloadBytes: 12, writable: true as const
  } } };
  const node: NodeState = { id: 11, lastHeard: 100, observationGeneration: 2, channels: { 12: { channel: 12, lastHeard: 100,
    params: { 5: reading(5, CHAR, ['Nav']), 12: reading(12, FLOAT, [-2, 51, 20]) }
  } } };
  if (guard !== undefined) node.channels[12].params[27] = move;
  return { target, nodes: { 11: node } };
}

test('a drag submits coordinates with the guard for the observed active target', () => {
  const { target, nodes } = fixture(123);
  const action = observedTargetMove(target, nodes, 357, 52);
  expect(action?.intent).toMatchObject({
    operation: 'write', target: { nodeAddress: 11, channel: 12, param: 27 },
    payload: { values: [123, 0xc0400000, 0x42500000] }
  });
  expect(observedTargetMove(target, fixture(124).nodes, 357, 52)?.key).not.toBe(action?.key);
});

test('a drag is unavailable without a compatible guard for the displayed target', () => {
  for (const guard of [undefined, 0]) {
    const { target, nodes } = fixture(guard);
    expect(observedTargetMove(target, nodes, -3, 52)).toBeUndefined();
  }
  const { target, nodes } = fixture(123);
  expect(observedTargetMove({ ...target, coordinates: [-4, 51] }, nodes, -3, 52)).toBeUndefined();
  expect(observedTargetMove(target, nodes, 0, 52)).toBeUndefined();
});
