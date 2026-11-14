import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useContext } from 'react';
import { ParameterEditorContext, ParameterEditorProvider, ParameterPath } from './ParameterEditor';

const target = { nodeAddress: 3, channel: 1, param: 8 };
const observation = { bytes: Uint8Array.of(1), expected: {
    observationEpoch: 'local', nodeGeneration: 0, msgType: 0, payloadBytes: 1, writable: true as const,
} };
function Workspace() {
    const editor = useContext(ParameterEditorContext)!;
    return <>
        <button onClick={event => editor.open(target, 'interval', event.currentTarget)}>Edit value</button>
        <button onClick={event => { event.currentTarget.textContent = 'Selected another node'; }}>Select another node</button>
    </>;
}
test('keeps a non-modal, movable draft pinned and submits when its route returns', async () => {
    const write = jest.fn().mockResolvedValue({ status: 'Queued', receivedAfterMs: 100 });
    const query = jest.fn().mockResolvedValue({});
    const path: ParameterPath = { id: 'wifi', label: 'Local · Wi-Fi', available: true,
        sample: { observation, value: { bytes: observation.bytes, msgType: 0 }, receivedAt: 50 }, write, query };
    const fixture = (selected: string, latest = path.sample) =>
        <ParameterEditorProvider resolve={(_target, pinned) => ({ ...path, id: pinned ?? selected,
            sample: latest, available: !pinned || pinned === selected })}><Workspace /></ParameterEditorProvider>;
    const view = render(fixture('wifi'));
    fireEvent.click(screen.getByText('Edit value'));
    const popup = screen.getByRole('dialog');
    expect(popup).not.toHaveAttribute('aria-modal');
    const field = within(popup).getByRole('textbox');
    fireEvent.change(field, { target: { value: '2' } });
    fireEvent.click(screen.getByText('Select another node'));
    expect(screen.getByText('Selected another node')).toBeVisible();
    fireEvent.keyDown(within(popup).getByLabelText('Move editor with arrow keys'), { key: 'ArrowDown' });
    expect(popup.style.top).toBe('100px');
    view.rerender(fixture('serial'));
    expect(within(popup).getByText('Submit write')).toBeDisabled();
    expect(field).toHaveValue('2');
    view.rerender(fixture('wifi'));
    fireEvent.click(within(popup).getByText('Submit write'));
    await waitFor(() => expect(write).toHaveBeenCalledWith(observation, { values: [2] }));
    await screen.findByText('Queued');
    view.rerender(fixture('wifi', { observation, receivedAt: 111, value: { msgType: 0, bytes: Uint8Array.of(2) } }));
    expect(within(popup).getByText('Newer observation matches')).toBeVisible();
    expect(write).toHaveBeenCalledTimes(1);
});
