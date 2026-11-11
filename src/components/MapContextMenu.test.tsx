import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { CommandScope, submit } from '../commands/session';
import { ChannelState, GlobalState, ParameterState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_ADDR as ADDR, DRONE_LINK_MSG_TYPE_CHAR as CHAR, DRONE_LINK_MSG_TYPE_FLOAT as FLOAT } from '../dronelink/DroneLinkMsg';
import { observedPositions } from '../dronelink/observedPositions';
import MapContextMenu from './MapContextMenu';

jest.mock('../commands/session', () => ({ ...jest.requireActual('../commands/session'), submit: jest.fn() }));
const send = submit as jest.Mock;

function param(id: number, msgType: number, values: number[] | string[], bytes?: Uint8Array): ParameterState {
  return { param: id, msgType, values, lastHeard: 1000, bytesPerValue: msgType === CHAR ? 1 : 4,
    numValues: msgType === ADDR ? values.length / 4 : values.length, writable: !!bytes,
    writeObservation: bytes && { bytes, expected: { observationEpoch: 'test', nodeGeneration: 1, msgType, payloadBytes: bytes.length, writable: true } } };
}

function target(values: number[]) {
  const bytes = new Uint8Array(values.length * 4);
  const data = new DataView(bytes.buffer);
  values.forEach((value, i) => data.setFloat32(i * 4, value, true));
  return param(12, FLOAT, values, bytes);
}

function nodes(radius = 5, useGps = true, configured = true): GlobalState {
  const nav = (channel: number, values: number[], address?: number[]): ChannelState => {
    const params: ChannelState['params'] = { 5: param(5, CHAR, ['Nav']), 10: param(10, FLOAT, [-1, 51, 0]), 12: target(values) };
    if (address) params[13] = param(13, ADDR, address, Uint8Array.from(address));
    return { channel, name: 'Helm ' + channel, lastHeard: 1000, params };
  };
  const channels: GlobalState[number]['channels'] = {
    4: { channel: 4, lastHeard: 1000, params: { 5: param(5, CHAR, ['Nav']), 10: param(10, FLOAT, [-2, 51, 0]) } }
  };
  if (useGps) channels[2] = { channel: 2, lastHeard: 1000, params: { 5: param(5, CHAR, ['NMEA']), 8: param(8, FLOAT, [-2, 51, 0]) } };
  return {
    11: { id: 11, name: 'Rover', observationGeneration: 1, lastHeard: 1000,
      channels: { 3: nav(3, [-1, 51, radius], configured ? [11, 22, 2, 8] : [0, 0, 0, 255]), 4: nav(4, [-1, 51, 8, 9], [0, 0, 0, 255]),
        5: nav(5, [-1, 51, Number.NaN]) } },
    22: { id: 22, name: 'Beacon', observationGeneration: 1, lastHeard: 1000, channels }
  };
}

function Fixture({ state, canSubmit = true, select, cameraRevision = 0 }: { state: GlobalState; canSubmit?: boolean; select?: () => void; cameraRevision?: number }) {
  const pane = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLDivElement>(null);
  return <CommandScope.Provider value={{ domainId: 'domain', userId: 'editor', canSubmit, canSettings: false }}>
    <div ref={pane}><div ref={canvas} data-testid="canvas"><button data-map-node="11" onClick={select}>Rover marker</button></div>
      <MapContextMenu pane={pane} canvas={canvas} enabled state={state} positions={observedPositions(state)}
        cameraRevision={cameraRevision} unproject={() => ({ lng: 358, lat: 52 })} now={121000} />
    </div>
  </CommandScope.Provider>;
}

const background = () => fireEvent.contextMenu(screen.getByTestId('canvas'));
const marker = () => screen.getByRole('button', { name: 'Rover marker' });
const entry = (channel: number) => screen.getByRole('button', { name: new RegExp('Helm ' + channel) });

beforeEach(() => send.mockResolvedValue({}));
afterEach(() => { send.mockReset(); jest.useRealTimers(); });

test('Set target uses the latest retained floats and the observed size, with one immediate command', async () => {
  const { rerender } = render(<Fixture state={nodes()} />);
  background();
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole('img', { name: /configured target source/ })).toBeVisible();
  expect(within(entry(4)).queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Helm 5/ })).not.toBeInTheDocument();
  rerender(<Fixture state={nodes(17)} />);
  const choice = entry(3);
  fireEvent.click(choice);
  fireEvent.click(choice);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toMatchObject({
    target: { nodeAddress: 11, channel: 3, param: 12 }, expected: { payloadBytes: 12 }, payload: { values: [-2, 52, 17] }
  });
  await screen.findByText(/Command accepted/);
  background();
  fireEvent.click(entry(4));
  expect(send.mock.calls[1][1]).toMatchObject({
    target: { nodeAddress: 11, channel: 4, param: 12 }, expected: { payloadBytes: 16 }, payload: { values: [-2, 52, 8, 9] }
  });
  await screen.findByText(/Command accepted/);
});

test('unknown source warns without hiding a writable target', () => {
  const state = nodes();
  delete state[11].channels[3].params[13];
  render(<Fixture state={state} />);
  background();
  expect(within(entry(3)).getByRole('img', { name: 'Target source unknown' })).toBeVisible();
});

test('Follow isolates the marker and requires reopening after a source binding change', async () => {
  const { rerender } = render(<Fixture state={nodes()} />);
  fireEvent.contextMenu(marker());
  expect(screen.getByText('Follow')).toBeVisible();
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  expect(screen.getAllByTitle(/Server receipt/)).toHaveLength(2);
  const updated = nodes();
  updated[22].channels[2].params[8].values = [-3, 51, 0];
  rerender(<Fixture state={updated} />);
  expect(screen.getByText('Follow')).toBeVisible();
  rerender(<Fixture state={nodes(5, false)} />);
  expect(screen.queryByText('Follow')).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
  fireEvent.contextMenu(marker());
  const second = screen.getByRole('group', { name: 'Helm 4 (Channel 4)' });
  fireEvent.click(within(second).getByRole('button', { name: /Beacon/ }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toMatchObject({
    target: { nodeAddress: 11, channel: 4, param: 13 },
    payload: { addresses: [{ source: 11, node: 22, channel: 4, param: 10, priority: 0 }] }
  });
  await screen.findByText(/Command accepted/);
});

test('an open menu closes on authority loss, reset, and outside pointer interaction', () => {
  const { rerender } = render(<Fixture state={nodes()} />);
  background();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  background();
  rerender(<Fixture state={nodes()} cameraRevision={1} />);
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  background();
  rerender(<Fixture state={nodes()} canSubmit={false} />);
  background();
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  rerender(<Fixture state={nodes()} />);
  background();
  const reset = nodes();
  reset[11].observationGeneration = 2;
  rerender(<Fixture state={reset} />);
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  expect(send).not.toHaveBeenCalled();
});

function touch(type: string, element: Element, pointerId = 1, clientX = 10) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 10 });
  Object.assign(event, { pointerId, pointerType: 'touch', isPrimary: pointerId === 1 });
  fireEvent(element, event);
}

test('touch pan and pinch cancel long press while ordinary marker taps still select', () => {
  jest.useFakeTimers();
  const select = jest.fn();
  const { rerender } = render(<Fixture state={nodes()} select={select} />);
  const canvas = screen.getByTestId('canvas');
  touch('pointerdown', canvas);
  touch('pointermove', canvas, 1, 14);
  act(() => jest.advanceTimersByTime(600));
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  touch('pointerdown', canvas);
  touch('pointerdown', canvas, 2);
  act(() => jest.advanceTimersByTime(600));
  expect(screen.queryByText('Set target')).not.toBeInTheDocument();
  touch('pointerdown', marker());
  touch('pointerup', marker());
  fireEvent.click(marker());
  expect(select).toHaveBeenCalledTimes(1);
  touch('pointerdown', marker());
  act(() => jest.advanceTimersByTime(600));
  touch('pointerup', marker());
  fireEvent.click(marker());
  expect(screen.getByText('Follow')).toBeVisible();
  expect(select).toHaveBeenCalledTimes(1);
  rerender(<Fixture state={nodes()} select={select} cameraRevision={1} />);
  expect(screen.getByText('Follow')).toBeVisible();
  touch('pointerdown', canvas);
  act(() => jest.advanceTimersByTime(600));
  expect(screen.getByText('Set target')).toBeVisible();
  expect(send).not.toHaveBeenCalled();
});
