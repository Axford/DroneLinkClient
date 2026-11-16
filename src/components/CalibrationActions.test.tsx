import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { ChannelState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

test.each([
    ['HMC5883L', 20],
    ['QMC5883L', 20],
    ['MPU6050', 19],
])('%s reports one-shot calibration readback without claiming completion', async (type, param) => {
    const write = jest.fn()
        .mockResolvedValueOnce({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 })
        .mockResolvedValueOnce({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1002 });
    function fixture(mode: number, receivedAt = 1000, writable = true) {
        const channel: ChannelState = { channel: 4, type, lastHeard: receivedAt, params: {
            5: { param: 5, msgType: 4, bytesPerValue: 1, numValues: 1, values: [type], writable: false },
            [param]: { param, msgType: 0, bytesPerValue: 1, numValues: 1, values: [mode], writable, lastHeard: receivedAt },
        } };
        const bytes = Uint8Array.of(mode);
        const expected = { msgType: 0, payloadBytes: 1, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
        return <ParameterEditorProvider resolve={target => target.param === param ? {
            id: 'wifi', label: 'Local · Wi-Fi', available: true, query: jest.fn(),
            write: (observation, payload) => write(target, observation, payload),
            sample: { observation: writable ? { expected, bytes } : undefined, value: { bytes, msgType: 0 }, receivedAt },
        } : undefined}>
            <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
                onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
        </ParameterEditorProvider>;
    }

    const view = render(fixture(0, 1000, false));
    const reset = screen.getByRole('button', { name: 'Reset calibration' });
    const store = screen.getByRole('button', { name: 'Store calibration' });
    const instrument = screen.getByRole('region', { name: 'Observed readings for channel 4' });
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(reset);
    expect(write).not.toHaveBeenCalled();

    view.rerender(fixture(0));
    fireEvent.click(reset);
    await screen.findByText(/Reset calibration: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param }, expect.anything(), { values: [2] });
    expect(instrument).toHaveTextContent('Calibration modeOnline');
    view.rerender(fixture(2, 1001));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for a newer observation');
    view.rerender(fixture(0, 1002));
    expect(screen.getByRole('status')).toHaveTextContent('Newer mode is Online. Action outcome unconfirmed.');

    fireEvent.click(store);
    await screen.findByText(/Store calibration: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param }, expect.anything(), { values: [3] });
    view.rerender(fixture(1, 1003));
    expect(screen.getByRole('status')).toHaveTextContent('Newer mode is Fixed. Action outcome unconfirmed.');
    expect(instrument).toHaveTextContent('Calibration modeFixed');
});
