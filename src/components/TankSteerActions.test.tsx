import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { Target } from '../commands/model';
import type { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

function sample(param: number, value: number): ParameterState {
    const msgType = param === 10 ? 0 : 3;
    return { param, msgType, bytesPerValue: msgType === 0 ? 1 : 4, numValues: 1, values: [value],
        writable: param === 10 || param === 24, lastHeard: 1000 };
}

function summary(write: jest.Mock, { mode = 0, distance = 8, receivedAt = 1000, available = true, writableDistance = true } = {}) {
    const channel: ChannelState = {
        channel: 4, type: 'TankSteer', lastHeard: receivedAt, params: {
            5: { ...sample(5, 0), msgType: 4, values: ['TankSteer'] },
            8: sample(8, 0.4), 9: sample(9, -0.2), 10: sample(10, mode), 24: sample(24, distance),
        },
    };
    return <ParameterEditorProvider resolve={(target: Target) => {
        if (target.param !== 10 && target.param !== 24) return;
        const isMode = target.param === 10;
        const bytes = isMode ? Uint8Array.of(mode) : new Uint8Array(4);
        if (!isMode) new DataView(bytes.buffer).setFloat32(0, distance, true);
        const msgType = isMode ? 0 : 3;
        const expected = { msgType, payloadBytes: bytes.length, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
        const observation = isMode || writableDistance ? { expected, bytes } : undefined;
        return { id: 'wifi', label: 'Local · Wi-Fi', available, write: (observation, payload) => write(target, observation, payload),
            query: jest.fn(), sample: { observation, value: { msgType, bytes }, receivedAt } };
    }}>
        <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
            onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
    </ParameterEditorProvider>;
}

const button = (name: string) => screen.getByRole('button', { name });

test('the mode action submits the typed write and waits for newer observed mode', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 });
    const view = render(summary(write));
    fireEvent.click(button('Automatic'));
    fireEvent.click(button('Automatic'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ nodeAddress: 7, channel: 4, param: 10 },
        expect.objectContaining({ bytes: Uint8Array.of(0) }), { values: [1] });
    await screen.findByText(/Automatic: Queued at local gateway/);
    expect(screen.getByRole('region', { name: 'Observed readings for channel 4' })).toHaveTextContent('Manual');
    view.rerender(summary(write, { mode: 1, receivedAt: 1001 }));
    expect(screen.getByRole('status')).toHaveTextContent('Observed mode is now Automatic');
    expect(button('Clear distance')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button('Clear distance'));
    expect(write).toHaveBeenCalledTimes(1);
});

test('Clear distance requires Manual and writable distance and reports the distance observation', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 });
    const view = render(summary(write, { writableDistance: false }));
    fireEvent.click(button('Clear distance'));
    view.rerender(summary(write, { available: false }));
    fireEvent.click(button('Automatic'));
    fireEvent.click(button('Clear distance'));
    expect(write).not.toHaveBeenCalled();

    view.rerender(summary(write));
    fireEvent.click(button('Clear distance'));
    expect(write).toHaveBeenCalledWith({ nodeAddress: 7, channel: 4, param: 24 },
        expect.objectContaining({ expected: expect.objectContaining({ msgType: 3, payloadBytes: 4 }) }), { values: [0] });
    await screen.findByText(/Clear distance: Queued at local gateway/);
    expect(screen.getByText('8.0 m')).toBeVisible();
    view.rerender(summary(write, { distance: 0, receivedAt: 1001 }));
    expect(screen.getByRole('status')).toHaveTextContent('Observed distance is zero');
    expect(screen.getByText('0.40')).toBeVisible();
    expect(screen.getByText('-0.20')).toBeVisible();
});
