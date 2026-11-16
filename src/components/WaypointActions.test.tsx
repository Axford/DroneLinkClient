import { act, fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { Delivery } from '../commands/ParameterEditor';
import type { Target } from '../commands/model';
import type { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';
import { MapCameraProvider, useRegisterMapCamera } from './MapCamera';

function Camera({ center }: { center: (coordinates: [number, number]) => void }) {
    useRegisterMapCamera(center);
    return null;
}

function byte(param: number, value: number): ParameterState {
    return { param, msgType: 0, bytesPerValue: 1, numValues: 1, values: [value], writable: param !== 9, lastHeard: 1000 };
}

function fixture({ index = 1, count = 3, longitude = -1.2, receivedAt = 1000, available = true, modeType = 0,
    center, write }: {
    index?: number; count?: number; longitude?: number; receivedAt?: number; available?: boolean; modeType?: number;
    center?: jest.Mock; write: jest.Mock;
}) {
    const channel: ChannelState = { channel: 4, type: 'Waypoint', params: {
        5: { param: 5, msgType: 4, bytesPerValue: 1, numValues: 1, values: ['Waypoint'], writable: false, lastHeard: 1000 },

        8: byte(8, 0), 9: byte(9, count), 10: byte(10, index),
        11: { param: 11, msgType: 3, numValues: 3, bytesPerValue: 4, values: [longitude, 51.6, 20], writable: false, lastHeard: 1000 },
    }, lastHeard: 1000 };
    return <ParameterEditorProvider resolve={(target: Target) => {
        if (target.param !== 8 && target.param !== 10) return;
        const bytes = Uint8Array.of(target.param === 10 ? index : 0);
        const msgType = target.param === 10 ? 0 : modeType;
        const expected = { msgType, payloadBytes: 1, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
        return { id: 'wifi', label: 'Local · Wi-Fi', available, write: (observation, payload) => write(target, observation, payload), query: jest.fn(),
            sample: { observation: { bytes, expected }, value: { bytes, msgType }, receivedAt } };
    }}>
        <MapCameraProvider>
            {center && <Camera center={center} />}
            <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
                onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
        </MapCameraProvider>
    </ParameterEditorProvider>;
}

const button = (name: string) => screen.getByRole('button', { name });

test('Next writes an absolute bounded index through the Inspector path and waits for newer telemetry', async () => {
    let deliver!: (value: Delivery) => void;
    const write = jest.fn(() => new Promise<Delivery>(resolve => { deliver = resolve; }));
    const view = render(fixture({ write }));
    fireEvent.click(button('Next'));
    fireEvent.click(button('Next'));
    fireEvent.click(button('Reload'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ nodeAddress: 7, channel: 4, param: 10 },
        expect.objectContaining({ bytes: Uint8Array.of(1) }), { values: [2] });
    await act(async () => deliver({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 }));
    expect(screen.getByText('2 of 3')).toBeVisible();
    expect(button('Next')).toHaveAttribute('aria-disabled', 'true');
    view.rerender(fixture({ write, index: 2, receivedAt: 1001 }));
    expect(screen.getByRole('status')).toHaveTextContent('Newer waypoint matches');
    expect(screen.getByText('3 of 3')).toBeVisible();
    fireEvent.click(button('Next'));
    expect(write).toHaveBeenCalledTimes(1);
});

test('Restart returns to the first loaded waypoint and Reload writes the separate mode', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Retrieved by polling node' });
    const view = render(fixture({ write }));
    fireEvent.click(button('Restart'));
    await screen.findByText(/Restart: Retrieved/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 10 }, expect.anything(), { values: [0] });
    view.rerender(fixture({ write, count: 0 }));
    fireEvent.click(button('Restart'));
    fireEvent.click(button('Reload'));
    await screen.findByText(/Reload: Retrieved/);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 8 }, expect.anything(), { values: [1] });
    view.rerender(fixture({ write, modeType: 3 }));
    fireEvent.click(button('Reload'));
    expect(write).toHaveBeenCalledTimes(2);
});

test('Goto uses only the observed target and an available map, independently of write access', () => {
    const write = jest.fn();
    const center = jest.fn();
    const view = render(fixture({ write, center, available: false }));
    for (const name of ['Restart', 'Next', 'Reload']) {
        expect(button(name)).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(button(name));
    }
    fireEvent.click(button('Goto'));
    expect(center).toHaveBeenCalledWith([-1.2, 51.6]);
    expect(write).not.toHaveBeenCalled();
    view.rerender(fixture({ write, center, longitude: 0 }));
    expect(button('Goto')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button('Goto'));
    expect(center).toHaveBeenCalledTimes(1);
    view.rerender(fixture({ write }));
    expect(button('Goto')).toHaveAttribute('aria-disabled', 'true');
});
