import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import mapboxgl from 'mapbox-gl';
import ObservedMap from './ObservedMap';
import { GlobalState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT } from '../dronelink/DroneLinkMsg';

jest.mock('mapbox-gl', () => ({ Map: jest.fn(), Marker: jest.fn(), NavigationControl: jest.fn() }));
const user = { _id: 'viewer', displayName: 'Viewer', email: 'viewer@example.test' };
const state = (longitude = -1): GlobalState => ({ 7: { id: 7, droneId: 'drone-seven', lastHeard: 1000, channels: {
  4: { channel: 4, name: 'GPS', lastHeard: 1000, params: {
    5: { param: 5, values: ['NMEA'], msgType: DRONE_LINK_MSG_TYPE_CHAR, bytesPerValue: 1, numValues: 1, writable: false, lastHeard: 1000 },
    8: { param: 8, name: 'location', values: [longitude, 51, 0], msgType: DRONE_LINK_MSG_TYPE_FLOAT, bytesPerValue: 4, numValues: 3, writable: false, lastHeard: 1000, source: 'Gateway 254' }
  } }
} } });
afterEach(() => jest.restoreAllMocks());
test('markers display binding provenance, select carried nodes, move and disappear on reset/domain teardown', () => {
  const removeMap = jest.fn(); const events: Record<string, () => void> = {};
  (mapboxgl.Map as unknown as jest.Mock).mockImplementation(({ container }) => ({
    container, addControl: jest.fn(), on: (name: string, callback: () => void) => { events[name] = callback; }, remove: removeMap
  }));
  const entries: any[] = [];
  (mapboxgl.Marker as unknown as jest.Mock).mockImplementation(({ element }) => {
    const marker: any = { setLngLat: jest.fn().mockReturnThis(), addTo: (map: any) => { map.container.append(element); return marker; }, remove: jest.fn(() => element.remove()) };
    entries.push(marker); return marker;
  });
  const select = jest.fn();
  const view = render(<ObservedMap token="fixture" user={user} state={state()} onNodeSelect={select} />);
  const button = screen.getByRole('button', { name: /Drone drone-seven.*7>4.8.*Gateway 254/ });
  expect(button).toHaveAttribute('role', 'button');
  fireEvent.click(button); expect(select).toHaveBeenCalledWith(7);
  view.rerender(<ObservedMap token="fixture" user={user} state={state(-2)} onNodeSelect={select} />);
  expect(entries[0].setLngLat).toHaveBeenLastCalledWith([-2, 51]);
  view.rerender(<ObservedMap token="fixture" user={user} state={{}} onNodeSelect={select} />);
  expect(entries[0].remove).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: /Drone drone-seven/ })).not.toBeInTheDocument();
  view.rerender(<ObservedMap token="fixture" user={user} state={state()} onNodeSelect={select} />);
  view.unmount(); expect(entries[1].remove).toHaveBeenCalledTimes(1); expect(removeMap).toHaveBeenCalledTimes(1);
});

test('missing map configuration keeps an explicit inspector fallback', () => {
  render(<ObservedMap token={null} user={user} state={{}} onNodeSelect={() => {}} />);
  expect(screen.getByText(/Map unavailable/)).toBeVisible();
});
