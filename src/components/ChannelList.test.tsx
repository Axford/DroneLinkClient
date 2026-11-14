import { CommandScope } from '../commands/session';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChannelList, { ChannelListActions } from './ChannelList';
import { InspectorSessionProvider } from './InspectorSession';
import { ChannelState, GlobalState, NodeState } from '../dronelink/DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_LINK_MSG_TYPE_UINT8_T, DRONE_LINK_MSG_TYPE_UINT32_T } from '../dronelink/DroneLinkMsg';

const channel = (id: number, name: string, reading: string): ChannelState => ({
    channel: id, name, lastHeard: Date.now(),
    params: { 10: { param: 10, name: reading, msgType: 3, bytesPerValue: 4, numValues: 1, values: [42.5], writable: false } }
});

const node = (id: number, channels: NodeState['channels'], observationGeneration = 0): NodeState => ({ id, channels, observationGeneration, lastHeard: 1000 });
const session = (current: NodeState, nodes: GlobalState = { [current.id]: current }, domain = 'a', layout = 'wide') => <InspectorSessionProvider key={domain} nodes={nodes} inventoryComplete><style>{'.collapse:not(.show) { display: none; }'}</style><ChannelListActions node={current} /><ChannelList key={`${layout}:${current.id}:${current.observationGeneration}`} node={current} /></InspectorSessionProvider>;

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
    const channelOrder = () => screen.getAllByRole('button').filter(button => button.classList.contains('dw-channel-toggle')).map(button => button.querySelector('.dw-channel-name')?.textContent);
    expect(channelOrder()).toEqual(['Battery', 'GPS']);
    await waitFor(() => expect(screen.getByRole('article', { name: 'Parameter 7>1.1' })).toBeVisible());
    view.rerender(session(b, nodes)); expect(channelOrder()).toEqual(['Other GPS']);
    view.rerender(session(a, nodes, 'a', 'narrow')); expect(channelOrder()).toEqual(['Battery', 'GPS']);
    expect(screen.getByRole('button', { name: /^4\. Battery/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('article', { name: 'Parameter 7>1.1' })).toBeVisible();
    const reset = { ...a, observationGeneration: 1 };
    view.rerender(session(reset, { ...nodes, 7: reset })); expect(channelOrder()).toEqual(['GPS', 'Battery']);
    expect(screen.getByRole('button', { name: /^4\. Battery/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('System parameters (1)').closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Battery'));
    view.rerender(session(reset, { ...nodes, 7: reset }, 'b')); expect(screen.getByRole('button', { name: /^4\. Battery/ })).toHaveAttribute('aria-expanded', 'true');
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
    expect(headers.map(button => button.querySelector('.dw-channel-name')?.textContent)).toEqual(['Four', 'Two', 'Eight', 'Nine']);
    expect(headers[3]).toHaveAttribute('aria-expanded', 'true');
});

test('temporary resync gaps retain preferences; a completed empty snapshot removes them', () => {
    const current = node(7, { 4: channel(4, 'GPS', 'Location'), 5: channel(5, 'Battery', 'Voltage') });
    const snapshot = (nodes: GlobalState, complete: boolean) => <InspectorSessionProvider nodes={nodes} inventoryComplete={complete}>{nodes[7] && <ChannelList node={nodes[7]} />}</InspectorSessionProvider>;
    const view = render(snapshot({ 7: current }, true));
    fireEvent.click(screen.getByText('Battery'));
    view.rerender(snapshot({}, false));
    view.rerender(snapshot({ 7: current }, true));
    expect(screen.getByRole('button', { name: /^5\. Battery/ })).toHaveAttribute('aria-expanded', 'false');
    view.rerender(snapshot({}, true));
    view.rerender(snapshot({ 7: current }, true));
    expect(screen.getByRole('button', { name: /^5\. Battery/ })).toHaveAttribute('aria-expanded', 'true');
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
            15: reading(15, DRONE_LINK_MSG_TYPE_FLOAT, [3.75]),
            16: reading(16, DRONE_LINK_MSG_TYPE_UINT8_T, [1]),
            19: reading(19, DRONE_LINK_MSG_TYPE_FLOAT, [-0.5])
        })
    })));
    const summary = (id: number) => within(screen.getByLabelText(`Observed readings for channel ${id}`));
    for (const value of ['1d 1h 1m 1s', '192.168.1.4', 'Core 0: Brownout', 'Core 1: Code 42']) expect(summary(1).getByText(value)).toBeVisible();
    expect(summary(1).getAllByRole('term').map(term => term.textContent)).toEqual(['Last reported uptime', 'IP address', 'Reset reasons']);
    for (const value of ['51.00000°, -1.00000°', '82.5°', '0.0 kn']) expect(summary(4).getByText(value)).toBeVisible();
    expect(summary(4).getByText('3 sats').closest('[data-severity]')).toHaveAttribute('data-severity', 'danger');
    expect(summary(5).getByText('0.0°')).toBeVisible();
    expect(summary(5).getByText('— sats')).toBeVisible();
    const heading = summary(4).getAllByRole('term')[0];
    expect(heading).toHaveTextContent('Heading');
    expect(heading).toHaveClass('visually-hidden');
    for (const value of ['3.75 V', '7.50 V', '-0.25 A', '2.00 W', 'Triggered', '-0.50 Ah']) expect(summary(6).getByText(value)).toBeVisible();
    const voltage = summary(6).getAllByRole('term')[0];
    expect(voltage).toHaveTextContent('Cell voltage');
    expect(voltage).not.toHaveClass('visually-hidden');
    expect(summary(6).getByText(/Voltage scale from 0 to 5 volts/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 4 reading details' }));
    expect(details.getByText(/^7>4\.10 · Gateway 254/)).toHaveTextContent(new Date(1000).toLocaleString());
    expect(details.getAllByText(/Value last changed/)[0]).toHaveTextContent(new Date(500).toLocaleString());
});

test('Management shows the firmware build from its own channel with independent receipt provenance', () => {
    const primary = specialist(1, 'Management', {
        9: { ...reading(9, DRONE_LINK_MSG_TYPE_CHAR, ['69cd31f']), numValues: 7, source: 'HTTP', lastHeard: 1500 },
        10: reading(10, DRONE_LINK_MSG_TYPE_UINT8_T, [0, 1, 3]),
        12: reading(12, DRONE_LINK_MSG_TYPE_UINT8_T, [192, 0, 2, 11]),
        13: reading(13, DRONE_LINK_MSG_TYPE_UINT32_T, [0])
    });
    const peer = specialist(2, 'Management', {
        9: { ...reading(9, DRONE_LINK_MSG_TYPE_CHAR, ['preview']), numValues: 7 },
        12: reading(12, DRONE_LINK_MSG_TYPE_UINT8_T, [0, 0, 0, 0])
    });
    const current = node(7, { 1: primary, 2: peer });
    const view = render(session(current));
    const first = within(screen.getByLabelText('Observed readings for channel 1'));
    const second = within(screen.getByLabelText('Observed readings for channel 2'));
    expect(first.getByText('69cd31f')).toBeVisible();
    expect(first.getByText('0s')).toBeVisible();
    expect(second.getByText('No IP assigned')).toBeVisible();
    expect(second.queryByText('Firmware build')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Channel 1 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 1 reading details' }));
    expect(details.getByText(/^7>1\.9 · HTTP/)).toHaveTextContent(new Date(1500).toLocaleString());
    fireEvent.click(details.getByRole('button', { name: 'Close Channel 1 reading details' }));
    const updated = node(7, { 1: primary, 2: { ...peer, params: {
        ...peer.params, 9: { ...peer.params[9], numValues: 16, values: ['deadbeef12'] }
    } } });
    view.rerender(session(updated));
    expect(second.getByText('deadbeef12')).toBeVisible();
    expect(first.getByText('69cd31f')).toBeVisible();
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
    for (const [id, count] of [[4, 4], [6, 6], [7, 3]]) {
        const fields = screen.getByLabelText(`Observed readings for channel ${id}`);
        expect(within(fields).getAllByText(/Unavailable$/)).toHaveLength(count);
    }
    expect(within(screen.getByLabelText('Observed readings for channel 4')).getByText('Heading')).not.toHaveClass('visually-hidden');
    expect(screen.queryByRole('group', { name: 'View for channel 8' })).not.toBeInTheDocument();
    expect(screen.getByText('Generic reading')).toBeVisible();
    fireEvent.click(controls().getByRole('button', { name: 'Show Parameters' }));
    expect(screen.getByRole('article', { name: 'Parameter 7>4.8' })).toBeVisible();
    view.rerender(session(b, nodes));
    expect(controls().getByRole('button', { name: 'Show Parameters' })).toBeVisible();
    view.rerender(session(a, nodes, 'a', 'narrow'));
    expect(controls().getByRole('button', { name: 'Show Summary' })).toBeVisible();
    const replaced = node(7, { ...a.channels, 4: specialist(4, 'INA219', {}) });
    view.rerender(session(replaced, { ...nodes, 7: replaced }));
    expect(controls().getByRole('button', { name: 'Show Parameters' })).toBeVisible();
    view.rerender(session(a, nodes));
    expect(controls().getByRole('button', { name: 'Show Parameters' })).toBeVisible();
    fireEvent.click(controls().getByRole('button', { name: 'Show Parameters' }));
    const reset = { ...a, observationGeneration: 1 };
    view.rerender(session(reset, { ...nodes, 7: reset }));
    expect(controls().getByRole('button', { name: 'Show Parameters' })).toBeVisible();
    fireEvent.click(controls().getByRole('button', { name: 'Show Parameters' }));
    view.rerender(session(reset, { ...nodes, 7: reset }, 'b'));
    expect(controls().getByRole('button', { name: 'Show Parameters' })).toBeVisible();
});

test('specialist reading details link to the same parameter view only with cloud edit access', () => {
    const gps = specialist(4, 'NMEA', { 8: reading(8, DRONE_LINK_MSG_TYPE_FLOAT, [-1, 51]) });
    const selected = node(7, { 4: gps });
    const scope = { domainId: 'specialist', userId: 'operator', canSubmit: true, canSettings: false };
    const fixture = (canSubmit: boolean) => <CommandScope.Provider value={{ ...scope, canSubmit }}>
        {session(selected, { 7: selected })}
    </CommandScope.Provider>;
    const view = render(fixture(false));
    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    expect(screen.queryByRole('button', { name: 'Open parameters for commands' })).not.toBeInTheDocument();
    view.rerender(fixture(true));
    fireEvent.click(screen.getByRole('button', { name: 'Open parameters for commands' }));
    expect(screen.getByRole('button', { name: 'Show Summary' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'Parameter 7>4.8' })).toBeVisible();
});

test('SerialTelemetry keeps each count and rate together with independent availability and receipt details', () => {
    const serial = specialist(4, 'SerialTelemetry', { 9: reading(9, DRONE_LINK_MSG_TYPE_UINT32_T, [1840, 916, 0]) });
    const other = specialist(6, 'SerialTelemetry', {
        9: reading(9, DRONE_LINK_MSG_TYPE_UINT32_T, [4, 1]),
        10: reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [12.4, 0, 2.5])
    });
    const untyped = { ...serial, type: undefined, params: { 9: serial.params[9] } };
    const view = render(session(node(7, { 4: untyped, 6: other })));
    expect(screen.getByRole('article', { name: 'Parameter 7>4.9' })).toBeVisible();
    view.rerender(session(node(7, { 4: serial, 6: other })));
    const summary = (id: number) => within(screen.getByLabelText(`Observed readings for channel ${id}`));
    const column = (id: number, label: string) => within(summary(id).getByText(label, { exact: true }).parentElement!);

    expect(summary(4).getAllByRole('term').map(term => term.textContent)).toEqual(['Sent', 'Received', 'Rejected']);
    expect(column(4, 'Sent').getByText('1840')).toBeVisible();
    expect(column(4, 'Sent').getByText('Unavailable')).toBeInTheDocument();
    expect(column(4, 'Rejected').getByText('0')).toBeVisible();
    expect(column(6, 'Sent').getByText('12.4/s')).toBeVisible();
    expect(column(6, 'Received').getByText('0.0/s')).toBeVisible();
    expect(column(6, 'Received').getByText('Unavailable')).toBeInTheDocument();

    const updated = { ...serial, params: { ...serial.params,
        10: { ...reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [9.3, 5.4, 0]), lastHeard: 2000, source: 'HTTP' } } };
    view.rerender(session(node(7, { 4: updated, 6: other })));
    expect(column(4, 'Sent').getByText('9.3/s')).toBeVisible();
    expect(column(4, 'Rejected').getByText('0.0/s')).toBeVisible();
    expect(column(6, 'Sent').getByText('12.4/s')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 4 reading details' }));
    expect(details.getByText(/complete serial RX handoffs before DroneLink CRC/)).toBeVisible();
    expect(details.getByText(/^7>4\.9 · Gateway 254/)).toHaveTextContent(new Date(1000).toLocaleString());
    expect(details.getByText(/^7>4\.10 · HTTP/)).toHaveTextContent(new Date(2000).toLocaleString());
    fireEvent.click(details.getByRole('button', { name: 'Close Channel 4 reading details' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'View for channel 4' })).getByRole('button', { name: 'Show Parameters' }));
    expect(screen.getByRole('article', { name: 'Parameter 7>4.9' })).toBeVisible();
});

test('UDPTelemetry shares the packet layout while keeping transport mappings and nodes independent', () => {
    const udp = specialist(4, 'UDPTelemetry', {
        9: reading(9, DRONE_LINK_MSG_TYPE_UINT8_T, [255, 255, 255, 255]),
        10: reading(10, DRONE_LINK_MSG_TYPE_UINT32_T, [4820, 3400, 3]),
        11: { ...reading(11, DRONE_LINK_MSG_TYPE_FLOAT, [19.4, 16.5, 0.1]), lastHeard: 2000, source: 'HTTP' }
    });
    const serial = specialist(6, 'SerialTelemetry', {
        9: { ...udp.params[10], param: 9 },
        10: { ...udp.params[11], param: 10 }
    });
    const a = node(7, { 4: udp, 6: serial });
    const b = node(11, { 4: specialist(4, 'UDPTelemetry', { 10: reading(10, DRONE_LINK_MSG_TYPE_UINT32_T, [17, 4, 0]) }) });
    const nodes = { 7: a, 11: b };
    const view = render(session(a, nodes));
    const summary = (id: number) => screen.getByLabelText(`Observed readings for channel ${id}`);

    expect(summary(4).textContent).toEqual(summary(6).textContent);
    expect(within(summary(4)).getByText('19.4/s')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 4 reading details' }));
    expect(details.getByText(/^7>4\.10 · Gateway 254/)).toHaveTextContent(new Date(1000).toLocaleString());
    expect(details.getByText(/^7>4\.11 · HTTP/)).toHaveTextContent(new Date(2000).toLocaleString());
    expect(details.queryByText(/serial RX handoffs/)).not.toBeInTheDocument();
    fireEvent.click(details.getByRole('button', { name: 'Close Channel 4 reading details' }));

    view.rerender(session(b, nodes));
    expect(within(summary(4)).getByText('17')).toBeVisible();
    expect(within(summary(4)).getByText('0')).toBeVisible();
    expect(within(summary(4)).getAllByText('Unavailable')).toHaveLength(3);
    expect(within(summary(4)).queryByText('4820')).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'View for channel 4' })).getByRole('button', { name: 'Show Parameters' }));
    expect(screen.getByRole('article', { name: 'Parameter 11>4.10' })).toBeVisible();
});

test('INA3221 aligns the readings of each input and keeps provenance on the source vectors', () => {
    const power = specialist(6, 'INA3221', {
        12: reading(12, DRONE_LINK_MSG_TYPE_FLOAT, [1.25, 0, -0.92]),
        13: reading(13, DRONE_LINK_MSG_TYPE_FLOAT, [14.6, 5.7]),
        14: reading(14, DRONE_LINK_MSG_TYPE_FLOAT, [11.7, 11.9, 11.3]),
        15: reading(15, DRONE_LINK_MSG_TYPE_FLOAT, [3.9, 0, 5.25]),
        16: reading(16, DRONE_LINK_MSG_TYPE_UINT8_T, [0, 1, 2]),
        20: { ...reading(20, DRONE_LINK_MSG_TYPE_FLOAT, [214, 79, -132]), lastHeard: 2000, source: 'HTTP' }
    });
    render(session(node(7, { 6: power })));
    const summary = within(screen.getByLabelText('Observed readings for channel 6'));
    const input = (number: number) => within(summary.getByRole('group', { name: `Input ${number}` }));
    expect(summary.getAllByRole('group').map(group => group.getAttribute('aria-label'))).toEqual(['Input 1', 'Input 2', 'Input 3']);
    for (const [number, values] of [
        [1, ['3.90 V', '11.70 V', '1.25 A', '214.00 Ah', 'Clear']],
        [2, ['0.00 V', '11.90 V', '0.00 A', '79.00 Ah', 'Triggered']],
        [3, ['5.25 V', '11.30 V', '-0.92 A', '-132.00 Ah', 'Above scale']]
    ] as const) {
        for (const value of values) expect(input(number).getByText(value, { exact: true })).toBeVisible();
        expect(input(number).getByText('Power').nextElementSibling).toHaveTextContent('Unavailable');
    }
    expect(input(3).getByText('Device alarm').nextElementSibling).toHaveTextContent('Unavailable');
    expect(summary.queryByRole('heading', { name: 'Input 1' })).not.toBeInTheDocument();
    expect(input(1).getByText('Cell voltage')).toHaveClass('visually-hidden');
    expect(input(1).getByText('Current')).toHaveClass('visually-hidden');
    expect(input(1).getByText('Power')).not.toHaveClass('visually-hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Channel 6 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 6 reading details' }));
    const second = within(details.getByRole('group', { name: 'Input 2' }));
    expect(second.getByText(/^7>6\.15 · Gateway 254/)).toHaveTextContent(new Date(1000).toLocaleString());
    expect(second.getByText(/^7>6\.20 · HTTP/)).toHaveTextContent(new Date(2000).toLocaleString());
    fireEvent.click(details.getByRole('button', { name: 'Close Channel 6 reading details' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'View for channel 6' })).getByRole('button', { name: 'Show Parameters' }));
    expect(screen.getByRole('article', { name: 'Parameter 7>6.15' })).toBeVisible();
});

test('Anemometer keeps current speed, sampled frequency and parameter provenance separate', () => {
    const at = Date.now();
    const wind = (id: number, value: number, lastHeard: number, source = 'HTTP') => specialist(id, 'Anemometer', {
        10: { ...reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [value]), lastHeard, source },
        11: reading(11, DRONE_LINK_MSG_TYPE_FLOAT, [99])
    });
    const snapshot = (value: number, offset: number, source?: string, sampleLive = true) => {
        const observed = node(7, { 4: wind(4, value, at + offset, source), 6: wind(6, -1, at) });
        return <InspectorSessionProvider nodes={{ 7: observed }} inventoryComplete>
            <ChannelList node={observed} sampleLive={sampleLive} />
        </InspectorSessionProvider>;
    };
    const view = render(snapshot(19.4384, 0));
    const summary = () => within(screen.getByRole('region', { name: 'Observed readings for channel 4' }));
    expect(summary().getByText('19.4 kn')).toBeVisible();
    expect(summary().getByText('10.0 m/s')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Observed readings for channel 6' })).getByText('Unavailable')).toBeVisible();
    view.rerender(snapshot(19.4384, 1000));
    view.rerender(snapshot(0, 2000));
    expect(summary().getByText('0.0 kn')).toBeVisible();
    expect(summary().getByRole('img', { name: /0 kn: 1, 19 kn: 2\. Current bin: 0 kn/ })).toBeVisible();
    view.rerender(snapshot(30, 3000, 'Gateway 254'));
    expect(summary().getByRole('img', { name: /counts by rounded speed: 30 kn: 1\. Current bin: 30 kn/ })).toBeVisible();
    view.rerender(snapshot(38, 4000, 'Gateway 254'));
    expect(summary().getByText('38.0 kn')).toBeVisible();
    expect(summary().getByRole('img', { name: /30 kn: 1\. Current wind speed is above the plot range/ })).toBeVisible();
    view.rerender(snapshot(38, 4000, 'Gateway 254', false));
    expect(summary().queryByRole('img')).not.toBeInTheDocument();
    expect(summary().getByText('38.0 kn')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 4 reading details' }));
    expect(details.getByText(/^7>4\.10 · Gateway 254/)).toBeVisible();
    fireEvent.click(details.getByRole('button', { name: 'Close Channel 4 reading details' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'View for channel 4' })).getByRole('button', { name: 'Show Parameters' }));
    expect(screen.getByRole('article', { name: 'Parameter 7>4.10' })).toBeVisible();
});

test('NMEA shows verified diagnostics with independent receipts and both speed units', () => {
    const gps = specialist(4, 'NMEA', {
        8: reading(8, DRONE_LINK_MSG_TYPE_FLOAT, [-1, 51, 0]),
        9: reading(9, DRONE_LINK_MSG_TYPE_FLOAT, [7]),
        10: reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [143]),
        11: reading(11, DRONE_LINK_MSG_TYPE_FLOAT, [4.7]),
        12: { ...reading(12, DRONE_LINK_MSG_TYPE_UINT8_T, [8]), lastHeard: 2000, source: 'HTTP' },
        15: reading(15, DRONE_LINK_MSG_TYPE_FLOAT, [-1.5, 52, 10]),
        18: { ...reading(18, DRONE_LINK_MSG_TYPE_FLOAT, [-2, 53, 11]), lastHeard: 3000, source: 'Local' },
        20: { ...reading(20, DRONE_LINK_MSG_TYPE_FLOAT, [0.01, -0.02, 0.03, NaN]), lastHeard: 4000, source: 'HTTP' }
    });
    const view = render(session(node(7, { 4: gps })));
    const summary = within(screen.getByLabelText('Observed readings for channel 4'));
    for (const value of ['4.7 kn', '2.4 m/s', '0.8']) expect(summary.getByText(value)).toBeVisible();
    expect(summary.getByText('7 sats').closest('[data-severity]')).toHaveAttribute('data-severity', 'warning');
    fireEvent.click(screen.getByRole('button', { name: 'Channel 4 reading details' }));
    const details = within(screen.getByRole('dialog', { name: 'Channel 4 reading details' }));
    for (const value of ['52.00000°, -1.50000°', '53.00000°, -2.00000°', 'Δlat -0.020000°, Δlon 0.010000°, Δalt 0.03 m']) {
        expect(details.getByText(value)).toBeVisible();
    }
    expect(details.getByText(/^7>4\.18 · Local/)).toHaveTextContent(new Date(3000).toLocaleString());
    expect(details.getByText(/^7>4\.20 · HTTP/)).toHaveTextContent(new Date(4000).toLocaleString());
    const unknown = { ...gps, params: { ...gps.params, 12: reading(12, DRONE_LINK_MSG_TYPE_UINT8_T, [255]) } };
    view.rerender(session(node(7, { 4: unknown })));
    expect(summary.getByText('HDOP').parentElement).toHaveAttribute('data-unavailable', 'true');
});

test('QMC5883L has a compass Summary and labels value-only Parameters until a NAME arrives', () => {
    const compass = specialist(5, 'QMC5883L', {
        10: reading(10, DRONE_LINK_MSG_TYPE_FLOAT, [0.6663, -4.5451, -4.2222, 623.9265]),
        11: reading(11, DRONE_LINK_MSG_TYPE_FLOAT, [8.2234]),
        13: reading(13, DRONE_LINK_MSG_TYPE_FLOAT, [-6, 0, 6]),
        63: reading(63, DRONE_LINK_MSG_TYPE_FLOAT, [1])
    });
    const view = render(session(node(3, { 5: compass })));
    expect(screen.getByText('8.2°')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show Parameters' }));
    const heading = within(screen.getByRole('article', { name: 'Parameter 3>5.11' }));
    expect(heading.getByText('heading')).toBeVisible();
    expect(heading.getByRole('button')).toHaveAccessibleDescription(/Firmware catalog/);
    expect(within(screen.getByRole('article', { name: 'Parameter 3>5.13' })).getByText('calibX')).toBeVisible();
    expect(within(screen.getByRole('article', { name: 'Parameter 3>5.63' })).getByText('Param 63')).toBeVisible();
    const named = { ...compass, params: { ...compass.params, 11: {
        ...compass.params[11], name: 'Device heading', nameLastHeard: 6000, nameSource: 'Local'
    } } };
    view.rerender(session(node(3, { 5: named })));
    expect(heading.getByText('Device heading')).toBeVisible();
    expect(heading.getByRole('button')).not.toHaveAccessibleDescription(/Firmware catalog/);
});
