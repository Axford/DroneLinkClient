import { fireEvent, render, screen } from '@testing-library/react';
import NodeFiles from './NodeFiles';

const stored = { path: '/sample.txt', text: 'First line\r\n', revision: 'a'.repeat(64), editable: true };

it('opens a stored file, keeps a rejected draft, preserves line endings, and sends Restart separately', async () => {
    const previousFetch = global.fetch;
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const reply = (body: object, status = 200) => ({ ok: status < 300, status, json: async () => body });
    const fetchMock = jest.fn()
        .mockResolvedValueOnce(reply({ path: '/', entries: [{ path: stored.path, directory: false, bytes: 12 }], truncated: false }))
        .mockResolvedValueOnce(reply(stored))
        .mockResolvedValueOnce(reply({ error: 'The selected route is unavailable.' }, 503))
        .mockResolvedValueOnce(reply({ ...stored, text: 'Second line\r\n', revision: 'b'.repeat(64) }))
        .mockResolvedValueOnce(reply({ status: 'queued' }, 202));
    global.fetch = fetchMock;
    const activity = jest.fn();
    try {
        const view = render(<NodeFiles node={11} transport="wifi" available activity={activity} />);
        fireEvent.click(screen.getByRole('button', { name: 'List files' }));
        fireEvent.click(await screen.findByRole('button', { name: 'sample.txt' }));
        const editor = await screen.findByRole('textbox', { name: /Stored file/ });
        expect(editor).toHaveValue('First line\n');
        fireEvent.change(editor, { target: { value: 'Second line\n' } });
        fireEvent.click(screen.getByRole('button', { name: 'Upload to node' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('The selected route is unavailable.');
        expect(editor).toHaveValue('Second line\n');
        view.rerender(<NodeFiles node={11} transport="wifi" available={false} activity={activity} />);
        expect(screen.getByRole('button', { name: 'Upload to node' })).toBeDisabled();
        expect(editor).toHaveValue('Second line\n');
        view.rerender(<NodeFiles node={11} transport="wifi" available activity={activity} />);
        fireEvent.click(screen.getByRole('button', { name: 'Upload to node' }));
        expect(await screen.findByText(/Stored file verified by readback/)).toBeInTheDocument();
        expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ path: stored.path, revision: stored.revision, text: 'Second line\r\n' });
        expect(fetchMock).toHaveBeenCalledTimes(4);
        fireEvent.click(screen.getByRole('button', { name: 'Restart node' }));
        expect(await screen.findByText(/Restart requested/)).toBeInTheDocument();
        expect(confirm).toHaveBeenCalledWith('Restart node 11 using its stored configuration?');
        expect(fetchMock.mock.calls[4][0]).toBe('/api/workbench/v1/nodes/11/restart?transport=wifi');
    } finally {
        global.fetch = previousFetch;
        confirm.mockRestore();
    }
});
