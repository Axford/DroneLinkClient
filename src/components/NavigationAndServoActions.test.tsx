import { fireEvent, render, screen, within } from '@testing-library/react';
import { ParameterEditorProvider } from '../commands/ParameterEditor';
import type { ChannelState } from '../dronelink/DroneLinkState';
import ChannelCard from './ChannelCard';

function panel(type: string, param: number, values: number[], msgType: 0 | 3, write: jest.Mock, pathId = 'wifi') {
    const bytesPerValue = msgType === 0 ? 1 : 4;
    const bytes = new Uint8Array(values.length * bytesPerValue);
    if (msgType === 0) bytes.set(values);
    else values.forEach((value, index) => new DataView(bytes.buffer).setFloat32(index * 4, value, true));
    const channel: ChannelState = { channel: 4, type, lastHeard: 1000, params: {
        5: { param: 5, msgType: 4, bytesPerValue: 1, numValues: 1, values: [type], writable: false },
        [param]: { param, msgType, bytesPerValue, numValues: values.length, values, writable: true, lastHeard: 1000 },
    } };
    return <ParameterEditorProvider resolve={target => {
        if (target.param !== param) return;
        const expected = { msgType, payloadBytes: bytes.length, writable: true as const, nodeGeneration: 0, observationEpoch: 'fixture' };
        return { id: pathId, label: pathId, available: true, query: jest.fn(),
            write: (observation, payload) => write(target, observation, payload),
            sample: { observation: { expected, bytes }, value: { msgType, bytes }, receivedAt: 1000 } };
    }}>
        <ChannelCard nodeId={7} channelId={4} channel={channel} expanded systemOpen={false} showParameters={false}
            onToggleExpand={jest.fn()} onToggleSystem={jest.fn()} onShowParameters={jest.fn()} />
    </ParameterEditorProvider>;
}

test.each([
    ['TurnRate', 19, 1, 'Gybe', 2],
    ['Nav', 14, 2, 'Go to', 1],
] as const)('%s writes the validated mode from an intermediate observed state', async (type, param, observed, label, value) => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued' });
    render(panel(type, param, [observed], 0, write));
    fireEvent.click(screen.getByRole('button', { name: label }));
    await screen.findByText(`${label}: Queued`);
    expect(write).toHaveBeenCalledWith({ nodeAddress: 7, channel: 4, param }, expect.anything(), { values: [value] });
});

test.each([
    ['TurnRate', 10],
    ['Sailor', 8],
] as const)('%s edits the target heading through an explicit write', async (type, param) => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued' });
    render(panel(type, param, [42], 3, write));
    fireEvent.click(screen.getByRole('button', { name: 'Set heading' }));
    const editor = within(screen.getByRole('dialog', { name: 'Edit value: Set heading' }));
    fireEvent.change(editor.getByRole('textbox', { name: 'Target heading (°)' }), { target: { value: '361' } });
    fireEvent.click(editor.getByRole('button', { name: 'Submit write' }));
    expect(editor.getByRole('alert')).toHaveTextContent('0 to 360');
    expect(write).not.toHaveBeenCalled();
    fireEvent.change(editor.getByRole('textbox', { name: 'Target heading (°)' }), { target: { value: '180' } });
    fireEvent.click(editor.getByRole('button', { name: 'Submit write' }));
    await editor.findByText('Queued');
    expect(write).toHaveBeenCalledWith({ nodeAddress: 7, channel: 4, param }, expect.anything(), { values: [180] });
});

test('Servo requires a local path and submits the curve as a single four-value write', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued' });
    const view = render(panel('Servo', 12, [30, 60, 90, 120], 3, write, 'cloud'));
    const button = screen.getByRole('button', { name: 'Edit curve' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    view.rerender(panel('Servo', 12, [30, 60, 90, 120], 3, write));
    fireEvent.click(button);
    const editor = within(screen.getByRole('dialog', { name: 'Edit value: Edit curve' }));
    fireEvent.change(editor.getByRole('textbox', { name: 'Point 4 (°)' }), { target: { value: '160' } });
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(editor.getByRole('button', { name: 'Submit write' }));
    await editor.findByText('Queued');
    expect(write).toHaveBeenCalledWith({ nodeAddress: 7, channel: 4, param: 12 }, expect.anything(), { values: [30, 60, 90, 160] });
});
