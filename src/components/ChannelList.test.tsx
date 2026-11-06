import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChannelList from './ChannelList';
import { ChannelState } from '../dronelink/DroneLinkState';

const channel = (id: number, name: string, reading: string): ChannelState => ({
    channel: id, name, lastHeard: Date.now(),
    params: { 10: { param: 10, name: reading, msgType: 3, bytesPerValue: 4, numValues: 1, values: [42.5], writable: false } }
});

test('bulk and individual expansion stay in sync across repeated expand/collapse actions', async () => {
    render(<>
        {/* Jest does not load Bootstrap CSS; preserve its collapse visibility rule. */}
        <style>{'.collapse:not(.show) { display: none; }'}</style>
        <ChannelList nodeId={10} channels={{
            1: channel(1, 'First channel', 'First reading'),
            2: channel(2, 'Second channel', 'Second reading')
        }} />
    </>);
    const first = screen.getByText('First reading');
    const second = screen.getByText('Second reading');
    expect(first).not.toBeVisible();
    expect(second).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    await waitFor(() => { expect(first).toBeVisible(); expect(second).toBeVisible(); });

    fireEvent.click(screen.getByText('First channel'));
    await waitFor(() => expect(first).not.toBeVisible());
    expect(second).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    await waitFor(() => { expect(first).toBeVisible(); expect(second).toBeVisible(); });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    await waitFor(() => { expect(first).not.toBeVisible(); expect(second).not.toBeVisible(); });

    fireEvent.click(screen.getByText('Second channel'));
    await waitFor(() => expect(second).toBeVisible());
    expect(first).not.toBeVisible();
});
