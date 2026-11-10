import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
  const view = render(<ObservedMap selectedNodeId={null} token="fixture" user={user} state={state()} onNodeSelect={select} />);
  const button = screen.getByRole('button', { name: /Drone drone-seven.*7>4.8.*Gateway 254/ });
  expect(button).toHaveAttribute('role', 'button');
  fireEvent.click(button); expect(select).toHaveBeenCalledWith(7);
  view.rerender(<ObservedMap selectedNodeId={null} token="fixture" user={user} state={state(-2)} onNodeSelect={select} />);
  expect(entries[0].setLngLat).toHaveBeenLastCalledWith([-2, 51]);
  view.rerender(<ObservedMap selectedNodeId={null} token="fixture" user={user} state={{}} onNodeSelect={select} />);
  expect(entries[0].remove).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: /Drone drone-seven/ })).not.toBeInTheDocument();
  view.rerender(<ObservedMap selectedNodeId={null} token="fixture" user={user} state={state()} onNodeSelect={select} />);
  view.unmount(); expect(entries[1].remove).toHaveBeenCalledTimes(1); expect(removeMap).toHaveBeenCalledTimes(1);
});

test('missing map configuration keeps an explicit inspector fallback', () => {
  const select = jest.fn();
  render(<ObservedMap selectedNodeId={null} token={null} user={user} state={state()} onNodeSelect={select} />);
  expect(screen.getByText(/Map unavailable/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Locate node 7' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect node 7: Node 7' }));
  expect(select).toHaveBeenCalledWith(7);
});

test('floating nodes select without camera movement; Locate alone centres on valid saved positions', () => {
  const easeTo = jest.fn(), fitBounds = jest.fn();
  const events: Record<string, (event: any) => void> = {};
  (mapboxgl.Map as unknown as jest.Mock).mockImplementation(({ container }) => ({
    container, addControl: jest.fn(), on: (name: string, callback: any) => { events[name] = callback; }, remove: jest.fn(), easeTo, fitBounds
  }));
  (mapboxgl as any).LngLatBounds = jest.fn().mockImplementation(() => ({ extend: jest.fn() }));
  (mapboxgl.Marker as unknown as jest.Mock).mockImplementation(({ element }) => {
    const marker: any = { setLngLat: jest.fn().mockReturnThis(), addTo: (map: any) => { map.container.append(element); return marker; }, remove: () => element.remove() };
    return marker;
  });
  const select = jest.fn();
  const nodes: GlobalState = { ...state(), 2: { id: 2, name: 'No GPS', lastHeard: 0, channels: {} }, 20: { id: 20, name: 'Waiting', lastHeard: 1000, channels: {} } };
  const view = render(<ObservedMap selectedNodeId={null} token="fixture" user={user} state={nodes} onNodeSelect={select} />);
  expect(screen.getAllByRole('button', { name: /^Inspect node/ }).map(button => button.textContent)).toEqual([
    expect.stringContaining('No GPS'), expect.stringContaining('Node 7'), expect.stringContaining('Waiting')
  ]);
  expect(screen.getByRole('button', { name: 'Locate node 2' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect node 2: No GPS' }));
  expect(select).toHaveBeenLastCalledWith(2); expect(easeTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect node 7: Node 7' }));
  expect(select).toHaveBeenLastCalledWith(7); expect(easeTo).not.toHaveBeenCalled();
  view.rerender(<ObservedMap selectedNodeId={7} token="fixture" user={user} state={nodes} onNodeSelect={select} />);
  expect(screen.getByRole('button', { name: /Drone drone-seven/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Inspect node 7: Node 7' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Locate node 7' }));
  expect(easeTo).toHaveBeenCalledTimes(1); expect(easeTo).toHaveBeenLastCalledWith({ center: [-1, 51], duration: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Fit observed positions' })); expect(fitBounds).toHaveBeenCalledTimes(1);
  view.rerender(<ObservedMap selectedNodeId={7} token="fixture" user={user} state={{ ...nodes, ...state(0) }} onNodeSelect={select} />);
  expect(screen.getByRole('button', { name: 'Locate node 7' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /Drone drone-seven/ })).not.toBeInTheDocument();
  expect(easeTo).toHaveBeenCalledTimes(1);
});

test('map failure leaves node selection usable and disables camera controls', () => {
  let fail: (event: any) => void = () => {};
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (mapboxgl.Map as unknown as jest.Mock).mockImplementation(() => ({ addControl: jest.fn(), remove: jest.fn(), on: (name: string, cb: any) => { if (name === 'error') fail = cb; } }));
  (mapboxgl.Marker as unknown as jest.Mock).mockImplementation(() => ({ setLngLat: jest.fn().mockReturnThis(), addTo: jest.fn().mockReturnThis(), remove: jest.fn() }));
  const select = jest.fn();
  render(<ObservedMap selectedNodeId={null} token="fixture" user={user} state={state()} onNodeSelect={select} />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect node 7: Node 7' }));
  // Map failure is delivered asynchronously by the SDK.
  act(() => fail({ error: new Error('Style unavailable') }));
  expect(screen.getByText('Map failed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Locate node 7' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Fit observed positions' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect node 7: Node 7' })); expect(select).toHaveBeenCalledTimes(2);
});

test('responsive remounts preserve the current camera in the Domain session view', () => {
  const constructor = mapboxgl.Map as unknown as jest.Mock;
  constructor.mockImplementation(() => ({ addControl: jest.fn(), on: jest.fn(), remove: jest.fn(), getCenter: () => ({ lng: -2, lat: 52 }), getZoom: () => 12 }));
  const viewState: React.MutableRefObject<{ lng: number; lat: number; zoom: number } | undefined> = { current: undefined };
  const first = render(<ObservedMap selectedNodeId={null} token="fixture" user={user} viewState={viewState} state={{}} onNodeSelect={() => {}} />);
  first.unmount();
  expect(viewState.current).toEqual({ lng: -2, lat: 52, zoom: 12 });
  const second = render(<ObservedMap selectedNodeId={null} token="fixture" user={user} viewState={viewState} state={{}} onNodeSelect={() => {}} />);
  expect(constructor).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-2, 52], zoom: 12 }));
  second.unmount();
});
