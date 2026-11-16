import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { ChannelState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

test('RFM69 settings apply typed writes explicitly and keep the reported value tied to its route', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 });
    function fixture({ power = 0, pathId = 'wifi', available = true, receivedAt = 1000 } = {}) {
        const channel: ChannelState = { channel: 4, type: 'RFM69Telemetry', lastHeard: receivedAt, params: {
            5: { param: 5, msgType: 4, bytesPerValue: 1, numValues: 1, values: ['RFM69Telemetry'], writable: false },
            11: { param: 11, msgType: 3, bytesPerValue: 4, numValues: 1, values: [power], writable: true, lastHeard: receivedAt },
            13: { param: 13, msgType: 0, bytesPerValue: 1, numValues: 1, values: [0], writable: true, lastHeard: receivedAt },
        } };
        return <ParameterEditorProvider resolve={target => {
            if (target.param !== 11 && target.param !== 13) return;
            const isPower = target.param === 11;
            const bytes = new Uint8Array(isPower ? 4 : 1);
            if (isPower) new DataView(bytes.buffer).setFloat32(0, power, true);
            const msgType = isPower ? 3 : 0;
            const expected = { msgType, payloadBytes: bytes.length, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
            return { id: pathId, label: pathId, available, query: jest.fn(),
                write: (observation, payload) => write(target, observation, payload),
                sample: { observation: { expected, bytes }, value: { msgType, bytes }, receivedAt } };
        }}>
            <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
                onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
        </ParameterEditorProvider>;
    }

    const view = render(fixture({ available: false }));
    const selectPower = screen.getByRole('combobox', { name: 'Transmit power' });
    const applyPower = screen.getByRole('button', { name: 'Apply transmit power' });
    expect(selectPower).toBeDisabled();
    view.rerender(fixture());
    fireEvent.change(selectPower, { target: { value: '-14' } });
    expect(write).not.toHaveBeenCalled();

    view.rerender(fixture({ pathId: 'serial' }));
    fireEvent.click(applyPower);
    expect(write).not.toHaveBeenCalled();
    fireEvent.change(selectPower, { target: { value: '-14' } });
    fireEvent.click(applyPower);
    await screen.findByText(/Transmit power: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 11 },
        expect.objectContaining({ expected: expect.objectContaining({ msgType: 3, payloadBytes: 4 }) }), { values: [-14] });
    expect(screen.getByText('Reported 0 dBm')).toBeVisible();
    view.rerender(fixture({ power: -14, pathId: 'serial', receivedAt: 1001 }));
    expect(screen.getByRole('status')).toHaveTextContent('Reported power is -14 dBm');

    fireEvent.change(screen.getByRole('combobox', { name: 'Minimum priority' }), { target: { value: '3' } });
    expect(write).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply minimum priority' }));
    await screen.findByText(/Minimum priority: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 13 },
        expect.objectContaining({ expected: expect.objectContaining({ msgType: 0, payloadBytes: 1 }) }), { values: [3] });
});
