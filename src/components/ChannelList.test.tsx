import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChannelList from './ChannelList';
import { InspectorSessionProvider } from './InspectorSession';
import { ChannelState, GlobalState, NodeState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T } from '../dronelink/DroneLinkMsg';

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

const reading = (param: number, msgType: number, values: number[] | string[]) => ({
    param, msgType, values, numValues: values.length, bytesPerValue: msgType === DRONE_LINK_MSG_TYPE_FLOAT || msgType === DRONE_LINK_MSG_TYPE_UINT32_T ? 4 : 1,
    writable: false, lastHeard: 1000, timestamp: 500, source: 'Gateway 254'
});
const specialist = (id: number, type: string, params: ChannelState['params']): ChannelState => ({
    channel: id, type, lastHeard: 2000, params: { ...params, 5: reading(5, DRONE_LINK_MSG_TYPE_CHAR, [type]) }
});

test('supported channels open to their own observed readings and expose the saved provenance', () => {
    render(session(node(7, {
        1: specialist(1, 'Management', {
            10: reading(10, DRONE_LINK_MSG_TYPE_UINT8_T, [1, 15, 42]),
            12: reading(12, DRONE_LINK_MSG_TYPE_UINT8_T, [192, 168, 1, 4]),
            13: reading(13, DRONE_LINK_MSG_TYPE_UINT32_T, [90061])
        }),
        4: specialist(4, 'NMEA', {
            8: reading(8, DRONE_LINK_MSG_TYPE_FLOAT, [-1, 51, 0]),
            9: reading(9, DRONE_LINK_MSG_TYPE_UINT8_T, [3]),
            10: reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [82.5]),
            11: reading(11, DRONE_LINK_MSG_TYPE_FLOAT, [0])
        }),
        5: specialist(5, 'NMEA', { 10: reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [0]) }),
        6: specialist(6, 'INA219', {
            12: reading(12, DRONE_LINK_MSG_TYPE_FLOAT, [-0.25]),
            13: reading(13, DRONE_LINK_MSG_TYPE_FLOAT, [2]),
            14: reading(14, DRONE_LINK_MSG_TYPE_FLOAT, [7.5]),
            15: reading(15, DRONE_LINK_MSG_TYPE_FLOAT, [3.75])
        })
    })));
    const summary = (id: number) => within(screen.getByLabelText(`Observed readings for channel ${id}`));
    for (const value of ['1d 1h 1m 1s', '192.168.1.4', 'Core 0: Brownout', 'Core 1: Code 42']) expect(summary(1).getByText(value)).toBeVisible();
    expect(summary(1).getAllByRole('term').map(term => term.textContent)).toEqual(['Last reported uptime', 'IP address', 'Reset reasons']);
    for (const value of ['51.00000°, -1.00000°', '82.5°', '0.0 kn']) expect(summary(4).getByText(value)).toBeVisible();
    expect(summary(4).getByText('3 sats').closest('[data-severity]')).toHaveAttribute('data-severity', 'danger');
    expect(summary(5).getByText('0.0°')).toBeVisible();
    expect(summary(5).getByText('— sats')).toBeVisible();
    expect(summary(4).getAllByRole('term')[0]).toHaveTextContent('Heading');
    for (const value of ['3.75 V', '7.50 V', '-0.25 A', '2.00 W']) expect(summary(6).getByText(value)).toBeVisible();
    expect(summary(6).getAllByRole('term')[0]).toHaveTextContent('Cell voltage');
    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 4 reading details' }));
    expect(details.getByText(/^7>4\.10 · Gateway 254/)).toHaveTextContent(new Date(1000).toLocaleString());
    expect(details.getAllByText(/Value last changed/)[0]).toHaveTextContent(new Date(500).toLocaleString());
});

test('invalid readings stay unavailable and view choice follows the channel only for its current identity', () => {
    const gps = specialist(4, 'NMEA', { 8: reading(8, DRONE_LINK_MSG_TYPE_FLOAT, [-1, 51]),
        9: reading(9, DRONE_LINK_MSG_TYPE_FLOAT, [3.2]), 10: reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [999]),
        11: reading(11, DRONE_LINK_MSG_TYPE_UINT8_T, [5]) });
    const power = specialist(6, 'INA219', { 14: reading(14, DRONE_LINK_MSG_TYPE_FLOAT, [NaN]),
        15: reading(15, DRONE_LINK_MSG_TYPE_UINT8_T, [4]) });
    const management = specialist(7, 'Management', { 10: reading(10, DRONE_LINK_MSG_TYPE_UINT8_T, [0, 15]),
        12: reading(12, DRONE_LINK_MSG_TYPE_UINT8_T, [10, 0, 0, 256]), 13: reading(13, DRONE_LINK_MSG_TYPE_FLOAT, [0]) });
    const a = node(7, { 4: gps, 6: power, 7: management, 8: channel(8, 'Generic', 'Generic reading') });
    const b = node(11, { 4: gps });
    const nodes = { 7: a, 11: b };
    const view = render(session(a, nodes));
    const controls = () => within(screen.getByRole('group', { name: 'View for channel 4' }));
    for (const [id, count] of [[4, 4], [6, 4], [7, 3]]) {
        const fields = screen.getByLabelText(`Observed readings for channel ${id}`);
        expect(within(fields).getAllByText(/Unavailable$/)).toHaveLength(count);
    }
    expect(screen.queryByRole('group', { name: 'View for channel 8' })).not.toBeInTheDocument();
    expect(screen.getByText('Generic reading')).toBeVisible();
    fireEvent.click(controls().getByRole('button', { name: 'Parameters' }));
    expect(screen.getByRole('article', { name: 'Parameter 7>4.8' })).toBeVisible();
    view.rerender(session(b, nodes));
    expect(controls().getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
    view.rerender(session(a, nodes, 'a', 'narrow'));
    expect(controls().getByRole('button', { name: 'Parameters' })).toHaveAttribute('aria-pressed', 'true');
    const replaced = node(7, { ...a.channels, 4: specialist(4, 'INA219', {}) });
    view.rerender(session(replaced, { ...nodes, 7: replaced }));
    expect(controls().getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
    view.rerender(session(a, nodes));
    expect(controls().getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(controls().getByRole('button', { name: 'Parameters' }));
    const reset = { ...a, observationGeneration: 1 };
    view.rerender(session(reset, { ...nodes, 7: reset }));
    expect(controls().getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(controls().getByRole('button', { name: 'Parameters' }));
    view.rerender(session(reset, { ...nodes, 7: reset }, 'b'));
    expect(controls().getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true');
});
