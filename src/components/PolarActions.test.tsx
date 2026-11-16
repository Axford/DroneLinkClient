import { fireEvent, render, screen } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { ChannelState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

test('Polar requests both legacy modes on its own channel and shows the mode actually read back', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued at local gateway', awaitingObservation: true, receivedAfterMs: 1000 });
    function fixture(mode: number, receivedAt = 1000, writable = true) {
        const channel: ChannelState = { channel: 4, type: 'Polar', lastHeard: receivedAt, params: {
            5: { param: 5, msgType: 4, bytesPerValue: 1, numValues: 1, values: ['Polar'], writable: false },
            9: { param: 9, msgType: 0, bytesPerValue: 1, numValues: 1, values: [mode], writable, lastHeard: receivedAt },
        } };
        const bytes = Uint8Array.of(mode);
        const expected = { msgType: 0, payloadBytes: 1, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
        return <ParameterEditorProvider resolve={target => target.param === 9 ? {
            id: 'wifi', label: 'Local · Wi-Fi', available: true, query: jest.fn(),
            write: (observation, payload) => write(target, observation, payload),
            sample: { observation: writable ? { expected, bytes } : undefined, value: { bytes, msgType: 0 }, receivedAt },
        } : undefined}>
            <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
                onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
        </ParameterEditorProvider>;
    }

    const view = render(fixture(0, 1000, false));
    const active = screen.getByRole('button', { name: 'Active' });
    const passive = screen.getByRole('button', { name: 'Passive' });
    const instrument = screen.getByRole('region', { name: 'Observed readings for channel 4' });
    expect(active).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(active);
    expect(write).not.toHaveBeenCalled();

    view.rerender(fixture(0));
    fireEvent.click(active);
    await screen.findByText(/Active: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 9 }, expect.anything(), { values: [1] });
    expect(instrument).toHaveTextContent('Passive');
    // Firmware can report Passive again after leaving the sampling area.
    view.rerender(fixture(0, 1001));
    expect(screen.getByRole('status')).toHaveTextContent('Newer mode is Passive');

    view.rerender(fixture(1, 1002));
    fireEvent.click(passive);
    await screen.findByText(/Passive: Queued at local gateway/);
    expect(write).toHaveBeenLastCalledWith({ nodeAddress: 7, channel: 4, param: 9 }, expect.anything(), { values: [0] });
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
});
