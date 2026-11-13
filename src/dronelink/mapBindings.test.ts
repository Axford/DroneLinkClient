import { mapBindings, locationCoordinates } from './mapBindings';
import { observedPositions } from './observedPositions';
import { observedNavigation } from './navigationLegs';
import { ChannelState, NodeState, ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT } from './DroneLinkMsg';

const reading = (param: number, values: number[] | string[], time = 1000): ParameterState => ({
  param, values, lastHeard: time, msgType: typeof values[0] === 'string' ? DRONE_LINK_MSG_TYPE_CHAR : DRONE_LINK_MSG_TYPE_FLOAT,
  bytesPerValue: 4, numValues: values.length, writable: false, source: 'Gateway 254'
});
const channel = (id: number, type: string, param: number, values: number[], time = 1000): ChannelState => ({
  channel: id, name: `${type} ${id}`, lastHeard: time, params: { 5: reading(5, [type]), [param]: reading(param, values, time) }
});
const node = (...channels: ChannelState[]): NodeState => ({ id: 7, droneId: 'drone-seven', interface: 'cloud', lastHeard: 9000,
  channels: Object.fromEntries(channels.map(row => [row.channel, row])) });

test('observed navigation joins only a coherent waypoint pair and clears an invalid target without hiding the origin', () => {
  const nav = channel(4, 'Nav', 12, [-179.75, 51, 10, 60]);
  nav.params[15] = reading(15, [179.75, 51, 5]);
  const other = channel(9, 'Nav', 12, [-178, 51, 10], 9000);
  const state = { 7: node(nav, other) };
  const navigation = observedNavigation(state);
  expect(navigation.waypoints).toEqual([
    { nodeId: 7, role: 'last', coordinates: [179.75, 51], channelId: 4 },
    { nodeId: 7, role: 'target', coordinates: [-179.75, 51], channelId: 4 }
  ]);
  expect(navigation.legs.features.filter(feature => feature.properties.kind === 'leg').map(feature => feature.geometry.coordinates)).toEqual([[[179.75, 51], [180.25, 51]]]);

  expect(navigation.legs.features.map(feature => feature.properties.kind)).toEqual(['target-radius', 'leg', 'corridor', 'corridor']);
  expect(observedNavigation(state, id => id === 7).legs.features.map(feature => feature.properties.kind)).toContain('previous-radius');

  nav.params[12] = reading(12, [0, 51, 10]);
  expect(observedNavigation(state).waypoints).toEqual([navigation.waypoints[0]]);
  expect(observedNavigation(state).legs.features).toEqual([]);

  delete nav.params[12];
  expect(observedNavigation(state).waypoints).toHaveLength(2);
  expect(observedNavigation(state).legs.features.map(feature => feature.properties.kind)).toEqual(['target-radius']);
  expect(observedNavigation({ 7: node() }).waypoints).toEqual([]);
});

test('legacy mapping priority and lower channel beat receipt recency, including after reload', () => {
  const state = node(channel(1, 'Nav', 10, [-1, 51, 0], 9000), channel(9, 'NMEA', 8, [-2, 52, 0], 8000), channel(4, 'NMEA', 8, [-3, 53, 0]));
  const selected = mapBindings(state).location!;
  expect([selected.priority, selected.channelId, selected.parameterId]).toEqual([3, 4, 8]);
  expect(observedPositions({ 7: state })[0]).toMatchObject({ nodeId: 7, droneId: 'drone-seven', coordinates: [-3, 53], reading: { source: 'Gateway 254', lastHeard: 1000 } });
  expect(mapBindings(JSON.parse(JSON.stringify(state)))).toEqual(mapBindings(state));
  delete state.channels[4]; delete state.channels[9];
  expect(observedPositions({ 7: state })[0]).toMatchObject({ channelId: 1, parameterId: 10, coordinates: [-1, 51] });
});

test('mapping precedes plot validation and never substitutes a fresh lower-priority source', () => {
  for (const coordinates of [[0, 51, 0], [181, 51, 0], [-1, 91, 0], [NaN, 51, 0], [-1, Infinity, 0]]) {
    const state = node(channel(1, 'Nav', 10, [-1, 51, 0], 9000), channel(2, 'NMEA', 8, coordinates));
    expect(mapBindings(state).location?.channelId).toBe(2);
    expect(locationCoordinates(mapBindings(state).location)).toBeUndefined();
    expect(observedPositions({ 7: state })).toEqual([]);
  }
});

test('all legacy semantic registrations remain available independently of visualisations', () => {
  const cases: Array<[string, number, string, number]> = [
    ['NMEA', 8, 'location', 3], ['NMEA', 18, 'location2', 3], ['NMEA', 10, 'heading', 1],
    ['Nav', 10, 'location', 2], ['Nav', 12, 'target', 2], ['Nav', 15, 'last', 2],
    ['CMPS12', 10, 'heading', 3], ['HMC5883L', 11, 'heading', 3], ['LSM9DS1', 11, 'heading', 3],
    ['Sailor', 10, 'heading', 2], ['Sailor', 12, 'wind', 2], ['TankSteer', 22, 'heading', 2],
    ['TurnRate', 12, 'heading', 1], ['Wind', 14, 'wind', 3], ['WindFromWing', 15, 'wind', 4]
  ];
  for (const [type, param, role, priority] of cases) {
    expect(Object.values(mapBindings(node(channel(6, type, param, [-1, 51, 0]))))).toEqual([
      expect.objectContaining({ role, priority, channelId: 6, parameterId: param })
    ]);
  }
  const state = node(channel(1, 'Wind', 14, [120]), channel(9, 'WindFromWing', 15, [140]));
  expect(mapBindings(state).wind).toMatchObject({ channelId: 9, priority: 4 });
});

test('late type discovery reconstructs existing values, while NAME-only, unknown types and reset do not invent positions', () => {
  const candidate = channel(1, 'NMEA', 8, [-1, 51, 0]); const state = node(candidate);
  delete candidate.params[5]; expect(mapBindings(state)).toEqual({});
  candidate.params[5] = reading(5, ['NMEA']); expect(mapBindings(state).location?.parameterId).toBe(8);
  delete candidate.params[8].lastHeard; expect(mapBindings(state)).toEqual({});
  for (const type of ['Unknown', 'constructor', '__proto__']) expect(mapBindings(node(channel(1, type, 8, [-1, 51, 0])))).toEqual({});
  expect(observedPositions({ 7: node() })).toEqual([]);
});

test('map wind requires the selected wing bearing and a valid primary position', () => {
  const gps = channel(1, 'NMEA', 8, [-1, 51, 0]);
  const local = channel(2, 'Wind', 14, [180], 9000);
  const subscribed = channel(3, 'Sailor', 12, [270], 9000);
  const wing = channel(4, 'WindFromWing', 15, [0]);
  const newerWing = channel(5, 'WindFromWing', 15, [90], 8000);
  expect(observedPositions({ 7: node(gps, local, subscribed) })[0].wind).toBeUndefined();
  const state = node(gps, local, subscribed, wing, newerWing);
  expect(observedPositions({ 7: state })[0].wind).toMatchObject({
    degrees: 0, binding: { channelId: 4, parameterId: 15, reading: { lastHeard: 1000, source: 'Gateway 254' } }
  });
  for (const values of [[-1], [361], [NaN], [90, 180]]) {
    wing.params[15] = reading(15, values);
    expect(observedPositions({ 7: state })[0].wind).toBeUndefined();
  }
  expect(observedPositions({ 7: node(wing, newerWing) })).toEqual([]);
});
