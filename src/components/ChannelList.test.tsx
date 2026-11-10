import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChannelList from './ChannelList';
import { InspectorSessionProvider } from './InspectorSession';
import { ChannelState, GlobalState, NodeState } from '../dronelink/DroneLinkState';

const channel = (id: number, name: string, reading: string): ChannelState => ({
    channel: id, name, lastHeard: Date.now(),
    params: { 10: { param: 10, name: reading, msgType: 3, bytesPerValue: 4, numValues: 1, values: [42.5], writable: false } }
});

const node = (id: number, channels: NodeState['channels'], observationGeneration = 0): NodeState => ({ id, channels, observationGeneration, lastHeard: 1000 });
const session = (current: NodeState, nodes: GlobalState = { [current.id]: current }, domain = 'a', layout = 'wide') => <InspectorSessionProvider key={domain} nodes={nodes} inventoryComplete><style>{'.collapse:not(.show) { display: none; }'}</style><ChannelList key={`${layout}:${current.id}:${current.observationGeneration}`} node={current} /></InspectorSessionProvider>;

test('bulk and individual expansion stay in sync across repeated expand/collapse actions', async () => {
    render(session(node(10, {
        1: channel(1, 'First channel', 'First reading'),
        2: channel(2, 'Second channel', 'Second reading')
    })));
    const first = screen.getByText('First reading');
    const second = screen.getByText('Second reading');
    expect(first).toBeVisible();
    expect(second).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    await waitFor(() => { expect(first).not.toBeVisible(); expect(second).not.toBeVisible(); });

    if (screen.queryByRole('button', { name: 'Expand All' })) fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    await waitFor(() => { expect(first).toBeVisible(); expect(second).toBeVisible(); });

    fireEvent.click(screen.getByText('First channel'));
    await waitFor(() => expect(first).not.toBeVisible());
    expect(second).toBeVisible();

    if (screen.queryByRole('button', { name: 'Expand All' })) fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    await waitFor(() => { expect(first).toBeVisible(); expect(second).toBeVisible(); });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    await waitFor(() => { expect(first).not.toBeVisible(); expect(second).not.toBeVisible(); });

    fireEvent.click(screen.getByText('Second channel'));
    await waitFor(() => expect(second).toBeVisible());
    expect(first).not.toBeVisible();
});


test('bulk expansion handles a reset/rebuilt channel set with the same number of channels', async () => {
  const view = render(session(node(7, { 1: channel(1, 'Original', 'Old reading') })));
  if (screen.queryByRole('button', { name: 'Expand All' })) fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
  await waitFor(() => expect(screen.getByText('Old reading')).toBeVisible());
  view.rerender(session(node(7, { 2: channel(2, 'Replacement', 'New reading') })));
  if (screen.queryByRole('button', { name: 'Expand All' })) fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
  await waitFor(() => expect(screen.getByText('New reading')).toBeVisible());
});

test('keeps per-node context through switches and remounts; reset and Domain replacement discard it', async () => {
    const a = node(7, { 1: { ...channel(1, 'GPS', 'Location'), params: { ...channel(1, 'GPS', 'Location').params, 1: { param: 1, msgType: 0, values: [1], numValues: 1, bytesPerValue: 1, writable: false } } }, 4: channel(4, 'Battery', 'Voltage') });
    const b = node(11, { 1: channel(1, 'Other GPS', 'Other location') });
    const nodes = { 7: a, 11: b };
    const view = render(session(a, nodes));
    fireEvent.click(screen.getByText('System parameters (1)'));
    fireEvent.click(screen.getByText('Battery'));
    fireEvent.click(screen.getByRole('button', { name: 'Reorder channels' }));
    const earlier = screen.getByRole('button', { name: 'Move channel 4 earlier' });
    earlier.focus(); fireEvent.click(earlier);
    expect(earlier).toHaveFocus(); expect(earlier).toHaveAttribute('aria-disabled', 'true');
    const channelOrder = () => screen.getAllByRole('button').filter(button => button.classList.contains('dw-channel-toggle')).map(button => button.querySelector('strong')?.textContent);
    expect(channelOrder()).toEqual(['Battery', 'GPS']);
    await waitFor(() => expect(screen.getByRole('article', { name: 'Parameter 7>1.1' })).toBeVisible());
    view.rerender(session(b, nodes)); expect(channelOrder()).toEqual(['Other GPS']);
    view.rerender(session(a, nodes, 'a', 'narrow')); expect(channelOrder()).toEqual(['Battery', 'GPS']);
    expect(screen.getByRole('button', { name: /^Battery/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('article', { name: 'Parameter 7>1.1' })).toBeVisible();
    const reset = { ...a, observationGeneration: 1 };
    view.rerender(session(reset, { ...nodes, 7: reset })); expect(channelOrder()).toEqual(['GPS', 'Battery']);
    expect(screen.getByRole('button', { name: /^Battery/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('System parameters (1)').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Battery'));
    view.rerender(session(reset, { ...nodes, 7: reset }, 'b')); expect(screen.getByRole('button', { name: /^Battery/ })).toHaveAttribute('aria-expanded', 'true');
});

test('prunes removed channels even while another node is selected and appends new channels in numeric order', () => {
    const a = node(7, { 4: channel(4, 'Four', 'Four reading'), 9: channel(9, 'Nine', 'Nine reading') });
    const b = node(11, { 1: channel(1, 'Other', 'Other reading') });
    const view = render(session(a, { 7: a, 11: b }));
    fireEvent.click(screen.getByText('Nine'));
    fireEvent.click(screen.getByRole('button', { name: 'Reorder channels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move channel 9 earlier' }));
    view.rerender(session(b, { 7: { ...a, channels: { 4: a.channels[4] } }, 11: b }));
    const updated = { ...a, channels: { ...a.channels, 2: channel(2, 'Two', 'Two reading'), 8: channel(8, 'Eight', 'Eight reading') } };
    view.rerender(session(updated, { 7: updated, 11: b }));
    const headers = screen.getAllByRole('button').filter(button => button.classList.contains('dw-channel-toggle'));
    expect(headers.map(button => button.querySelector('strong')?.textContent)).toEqual(['Four', 'Two', 'Eight', 'Nine']);
    expect(headers[3]).toHaveAttribute('aria-expanded', 'true');
});

test('temporary resync gaps retain preferences; a completed empty snapshot removes them', () => {
    const current = node(7, { 4: channel(4, 'GPS', 'Location'), 5: channel(5, 'Battery', 'Voltage') });
    const snapshot = (nodes: GlobalState, complete: boolean) => <InspectorSessionProvider nodes={nodes} inventoryComplete={complete}>{nodes[7] && <ChannelList node={nodes[7]} />}</InspectorSessionProvider>;
    const view = render(snapshot({ 7: current }, true));
    fireEvent.click(screen.getByText('Battery'));
    view.rerender(snapshot({}, false));
    view.rerender(snapshot({ 7: current }, true));
    expect(screen.getByRole('button', { name: /^Battery/ })).toHaveAttribute('aria-expanded', 'false');
    view.rerender(snapshot({}, true));
    view.rerender(snapshot({ 7: current }, true));
    expect(screen.getByRole('button', { name: /^Battery/ })).toHaveAttribute('aria-expanded', 'true');
});
