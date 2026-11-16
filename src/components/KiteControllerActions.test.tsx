import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { ChannelState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

test('KiteController switches the requested steering mode and keeps actual payout tied to telemetry', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 });
    function fixture(mode: number, receivedAt = 1000, writable = true) {
        const channel: ChannelState = { channel: 4, type: 'KiteController', lastHeard: receivedAt, params: {
            5: { param: 5, msgType: 4, bytesPerValue: 1, numValues: 1, values: ['KiteController'], writable: false },
            10: { param: 10, msgType: 0, bytesPerValue: 1, numValues: 1, values: [mode], writable, lastHeard: receivedAt },
            13: { param: 13, msgType: 3, bytesPerValue: 4, numValues: 2, values: [25, 1], writable: true, lastHeard: receivedAt },
            14: { param: 14, msgType: 3, bytesPerValue: 4, numValues: 4, values: [13, 27, 7.5, 5], writable: false, lastHeard: receivedAt },
        } };
        const bytes = Uint8Array.of(mode);
        const expected = { msgType: 0, payloadBytes: 1, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
        return <ParameterEditorProvider resolve={target => target.param === 10 ? {
            id: 'wifi', label: 'Local · Wi-Fi', available: true, query: jest.fn(),
            write: (observation, payload) => write(target, observation, payload),
            sample: { observation: writable ? { expected, bytes } : undefined, value: { bytes, msgType: 0 }, receivedAt },
        } : undefined}>
            <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
                onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
        </ParameterEditorProvider>;
    }

    const view = render(fixture(0, 1000, false));
    const auto = screen.getByRole('button', { name: 'Auto' });
    const manual = screen.getByRole('button', { name: 'Manual' });
    const instrument = screen.getByRole('region', { name: 'Observed readings for channel 4' });
    expect(auto).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(auto);
    expect(write).not.toHaveBeenCalled();

    view.rerender(fixture(0));
    fireEvent.click(auto);
    await screen.findByText(/Auto: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 10 }, expect.anything(), { values: [1] });
    expect(instrument).toHaveTextContent('Manual');
    expect(instrument).toHaveTextContent('Actual payout7.5');

    view.rerender(fixture(1, 1001));
    expect(screen.getByRole('status')).toHaveTextContent('Observed mode is now Auto');
    fireEvent.click(manual);
    await screen.findByText(/Manual: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 10 }, expect.anything(), { values: [0] });
    expect(instrument).toHaveTextContent('Auto');
    expect(instrument).toHaveTextContent('Actual payout7.5');
});
