import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChannelCard from './ChannelCard';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
const byte = (param: number, value: number): ParameterState => ({ param, msgType: 0, bytesPerValue: 1, numValues: 1, values: [value], writable: false, lastHeard: 1000, source: 'HTTP' });
const base: ChannelState = { channel: 4, name: 'GPS', type: 'NMEA', lastHeard: 1000, params: { 1: byte(1, 1), 4: byte(4, 0), 8: { ...byte(8, 0), name: 'zero' } } };

function Fixture({ channel }: { channel: ChannelState }) {
    const [open, setOpen] = useState(false);
    return <ChannelCard nodeId={7} channelId={4} channel={channel} expanded onToggleExpand={jest.fn()} systemOpen={open} onToggleSystem={setOpen} showParameters={false} onShowParameters={jest.fn()} />;
}

test('headers expose device-reported status and zero reset count independently of age, with reachable system observations', async () => {
    render(<Fixture channel={base} />);
    const header = screen.getByRole('button', { name: /4\. GPS.*Resets: 0.*Receipt age:.*Enabled/ });
    expect(header.closest('.channel-card')).toHaveAttribute('data-status', 'enabled');
    expect(screen.getByText('Enabled')).toHaveClass('visually-hidden');
    expect(screen.queryByText('NMEA')).not.toBeInTheDocument();
    expect(screen.queryByText('Recent observation')).not.toBeInTheDocument(); expect(screen.queryByText('Older observation')).not.toBeInTheDocument();
    expect(screen.getByTitle(/Observed 7>4.4/)).toHaveAttribute('title', expect.stringContaining('HTTP'));
    expect(screen.getByText('zero')).toBeVisible();
    expect(screen.getByRole('article', { name: 'Parameter 7>4.1', hidden: true })).not.toBeVisible();
    fireEvent.click(screen.getByText('System parameters (2)'));
    await waitFor(() => expect(screen.getByRole('article', { name: 'Parameter 7>4.1' })).toBeVisible());
    expect(screen.queryByRole('button', { name: /^(Enable|Restart|Query|Edit)$/i })).not.toBeInTheDocument();
});

test('incorrect type or failed status/reset facets never fabricate header summaries', () => {
    render(<Fixture channel={{ ...base, params: {
        1: { ...byte(1, 1), msgType: 3, bytesPerValue: 4 }, 4: { ...byte(4, 9), unavailable: { value: 'invalid-input' } }
    } }} />);
    expect(screen.getByRole('button', { name: /4\. GPS.*Resets: —/ }).closest('.channel-card')).not.toHaveAttribute('data-status');
    expect(screen.getByTitle('Reset count unavailable')).toBeVisible();
    fireEvent.click(screen.getByText('System parameters (2)'));
    expect(screen.getByText('Value unavailable')).toBeVisible();
});

test('reported error takes precedence and a nameless channel uses its module type', () => {
    render(<Fixture channel={{ ...base, name: '  ', params: {
        ...base.params, 3: byte(3, 1), 4: { ...byte(4, 300), msgType: 2, bytesPerValue: 4 }
    } }} />);
    const header = screen.getByRole('button', { name: /4\. NMEA.*Resets: 300.*Error.*Enabled/ });
    expect(header.closest('.channel-card')).toHaveAttribute('data-status', 'error');
});

test('the collapsed header writes the observed status without changing it before readback', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued at local gateway', receivedAfterMs: 1200, local: true, awaitingObservation: true });
    const toggle = jest.fn();
    const statusCard = (status: number, receivedAt: number, available = true) => {
        const bytes = Uint8Array.of(status);
        return <ParameterEditorProvider resolve={() => ({
            id: 'wifi', label: 'Local · Wi-Fi', available, write, query: jest.fn(),
            sample: { observation: { bytes, expected: { msgType: 0, payloadBytes: 1, writable: true, nodeGeneration: 0, observationEpoch: 'local' } },
                value: { msgType: 0, bytes }, receivedAt },
        })}>
            <ChannelCard nodeId={7} channelId={4} channel={{ ...base, params: { ...base.params, 1: byte(1, status) } }}
                expanded={false} onToggleExpand={toggle} systemOpen={false} onToggleSystem={jest.fn()}
                showParameters={false} onShowParameters={jest.fn()} />
        </ParameterEditorProvider>;
    };
    const view = render(statusCard(2, 1000));
    const disable = screen.getByRole('button', { name: 'Disable GPS' });
    fireEvent.click(disable);
    fireEvent.click(disable);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ bytes: Uint8Array.of(2) }), { values: [0] });
    expect(toggle).not.toHaveBeenCalled();
    await screen.findByText('Waiting for a newer status observation');
    expect(disable.closest('.channel-card')).toHaveAttribute('data-status', 'waiting');
    view.rerender(statusCard(0, 1300));
    expect(screen.getByRole('button', { name: 'Enable GPS' })).toBeVisible();
    expect(screen.getByText('Newer status observation matches')).toBeVisible();
    const enable = screen.getByRole('button', { name: 'Enable GPS' });
    write.mockResolvedValueOnce({ status: 'Queued at local gateway', receivedAfterMs: 1350, local: true, awaitingObservation: true });
    fireEvent.click(enable);
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ bytes: Uint8Array.of(0) }), { values: [1] });
    await screen.findByText('Waiting for a newer status observation');
    expect(enable.closest('.channel-card')).toHaveAttribute('data-status', 'disabled');
    view.rerender(statusCard(2, 1400));
    expect(screen.getByRole('button', { name: 'Disable GPS' }).closest('.channel-card')).toHaveAttribute('data-status', 'waiting');
    expect(screen.getByText('Newer status observation matches')).toBeVisible();
    expect(screen.queryByText('Newer status observation differs')).not.toBeInTheDocument();
    view.rerender(statusCard(0, 1300, false));
    expect(screen.getByRole('button', { name: 'Enable GPS' })).toHaveAttribute('aria-disabled', 'true');
});
