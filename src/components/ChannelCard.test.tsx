import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChannelCard from './ChannelCard';
import { ChannelState, ParameterState } from '../dronelink/DroneLinkState';
const byte = (param: number, value: number): ParameterState => ({ param, msgType: 0, bytesPerValue: 1, numValues: 1, values: [value], writable: false, lastHeard: 1000, source: 'HTTP' });
const base: ChannelState = { channel: 4, name: 'GPS', type: 'NMEA', lastHeard: 1000, params: { 1: byte(1, 1), 4: byte(4, 0), 8: { ...byte(8, 0), name: 'zero' } } };

function Fixture({ channel }: { channel: ChannelState }) {
    const [open, setOpen] = useState(false);
    return <ChannelCard nodeId={7} channelId={4} channel={channel} expanded onToggleExpand={jest.fn()} systemOpen={open} onToggleSystem={setOpen} />;
}

test('headers expose device-reported status and zero reset count independently of age, with reachable system observations', async () => {
    render(<Fixture channel={base} />);
    expect(screen.getByText('7>4')).toBeVisible(); expect(screen.getByText('Status: Enabled')).toBeVisible(); expect(screen.getByText('Resets: 0')).toBeVisible();
    expect(screen.queryByText('Recent observation')).not.toBeInTheDocument(); expect(screen.queryByText('Older observation')).not.toBeInTheDocument();
    expect(screen.getByTitle(/Observed 7>4.1/)).toHaveAttribute('title', expect.stringContaining('HTTP'));
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
    expect(screen.queryByText(/Status:/)).not.toBeInTheDocument(); expect(screen.queryByText(/Resets:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('System parameters (2)'));
    expect(screen.getByText('Value unavailable')).toBeVisible();
});
