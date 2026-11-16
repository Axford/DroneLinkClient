import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { ChannelState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

test('RFM69 selections submit typed writes and keep showing the reported values until readback', async () => {
    const write = jest.fn()
        .mockResolvedValueOnce({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 })
        .mockResolvedValueOnce({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1001 });
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
    const selectPriority = screen.getByRole('combobox', { name: 'Minimum priority' });
    expect(selectPower).toBeDisabled();
    expect(selectPower).toHaveAccessibleDescription(/affects radio link reach/);
    fireEvent.change(selectPower, { target: { value: '-14' } });
    expect(write).not.toHaveBeenCalled();

    view.rerender(fixture());
    fireEvent.change(selectPower, { target: { value: '-14' } });
    fireEvent.change(selectPriority, { target: { value: '3' } });
    expect(write).toHaveBeenCalledTimes(1);
    await screen.findByText(/Transmit power: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 11 },
        expect.objectContaining({ expected: expect.objectContaining({ msgType: 3, payloadBytes: 4 }) }), { values: [-14] });
    expect(selectPower).toHaveValue('0');
    expect(selectPriority).toBeDisabled();
    view.rerender(fixture({ power: -14, receivedAt: 1001 }));
    expect(screen.getByRole('status')).toHaveTextContent('Reported power is -14 dBm');

    expect(selectPower).toHaveValue('-14');
    fireEvent.change(selectPriority, { target: { value: '3' } });
    expect(write).toHaveBeenCalledTimes(2);
    await screen.findByText(/Minimum priority: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 13 },
        expect.objectContaining({ expected: expect.objectContaining({ msgType: 0, payloadBytes: 1 }) }), { values: [3] });
});
