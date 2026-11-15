import { renderHook } from '@testing-library/react';
import type { GlobalState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_MODULE_PARAM_TYPE } from './DroneLinkMsg';
import { useSnailTrails } from './snailTrails';

function snapshot(lon: number, lat: number, receipt: number): GlobalState {
  return { 7: { id: 7, lastHeard: receipt, channels: {
    4: { channel: 4, lastHeard: receipt, params: {
      [DRONE_MODULE_PARAM_TYPE]: {
        param: DRONE_MODULE_PARAM_TYPE, msgType: DRONE_LINK_MSG_TYPE_CHAR,
        bytesPerValue: 1, numValues: 1, values: ['NMEA'], writable: false, lastHeard: receipt,
      },
      8: { param: 8, msgType: DRONE_LINK_MSG_TYPE_FLOAT,
        bytesPerValue: 4, numValues: 3, values: [lon, lat, 0], writable: false, lastHeard: receipt,
      },
    } },
  } } };
}
const source = (): string | undefined => 'wifi';
const offline = () => undefined;

test('ignores jitter, simplifies straight movement and keeps a short antimeridian crossing', () => {
  const view = renderHook(({ state }) => useSnailTrails('test', state, source), {
    initialProps: { state: snapshot(179.9998, 10, 1) },
  });
  view.rerender({ state: snapshot(179.999801, 10, 2) });
  expect(view.result.current.lines.features).toHaveLength(0);
  view.rerender({ state: snapshot(179.9999, 10, 3) });
  view.rerender({ state: snapshot(-179.9999, 10, 4) });
  const [segment] = view.result.current.lines.features;
  expect(segment.geometry.coordinates).toHaveLength(2);
  expect(segment.geometry.coordinates[1][0] - segment.geometry.coordinates[0][0]).toBeCloseTo(0.0003, 7);
});

test('caps retained points across segments and waits for a fresh fix after a feed interruption', () => {
  const first = snapshot(-1, 51, 1);
  const view = renderHook(({ state, path }: { state: GlobalState; path: () => string | undefined }) =>
    useSnailTrails('test', state, path), { initialProps: { state: first, path: source } });
  for (let i = 1; i <= 401; i++) {
    view.rerender({ state: snapshot(-1 + i / 10000, 51 + (i % 2) / 10000, i + 1), path: source });
  }
  const tip = snapshot(-1 + 401 / 10000, 51.0001, 402);
  view.rerender({ state: tip, path: offline });
  view.rerender({ state: tip, path: source });
  view.rerender({ state: snapshot(0, 51, 403), path: source });
  view.rerender({ state: snapshot(-2, 51, 404), path: source });
  expect(view.result.current.lines.features).toHaveLength(1);
  view.rerender({ state: snapshot(-2.1, 51, 405), path: source });
  const [old, fresh] = view.result.current.lines.features;
  expect(old.geometry.coordinates).toHaveLength(398);
  expect(fresh.geometry.coordinates).toHaveLength(2);
  expect(fresh.geometry.coordinates[0]).toEqual([-2, 51]);
  expect(fresh.geometry.coordinates[1][0]).toBeCloseTo(-2.1, 7);
});
