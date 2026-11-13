import { fireEvent, render, screen } from '@testing-library/react';
import NodeFiles from './NodeFiles';

jest.mock('./ConfigurationEditor', () => ({
    __esModule: true,
    default: ({ text, label, readOnly, onChange }: {
        text: string; label: string; readOnly: boolean; onChange: (text: string) => void;
    }) => <textarea data-testid="configuration-editor" aria-label={label} value={text} readOnly={readOnly} onChange={event => onChange(event.target.value)} />,
}));

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
        fireEvent.click(await screen.findByRole('button', { name: /^sample\.txt/ }));
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
        fireEvent.click(screen.getByRole('button', { name: 'Node actions' }));
        fireEvent.click(screen.getByText('Restart node', { selector: 'button' }));
        expect(await screen.findByText(/Restart requested/)).toBeInTheDocument();
        expect(confirm).toHaveBeenCalledWith('Restart node 11 using its stored configuration?');
        expect(fetchMock.mock.calls[4][0]).toBe('/api/workbench/v1/nodes/11/restart?transport=wifi');
    } finally {
        global.fetch = previousFetch;
        confirm.mockRestore();
    }
});

it('checks the node configuration draft before sending its exact bytes and keeps stale drafts for review', async () => {
    const original = [
        '; preserve this "comment"', 'node = 11', '[Management = 1]', '  interval = 1000',
        '[Nav = 12]', '  $location = @>GPS.location', '[NMEA = 10]', '  name = "GPS"',
        '  futureSetting = "quoted; value"', '',
    ].join('\r\n');
    const edited = original.replace('1000', '2000').replace('@>GPS.location', '@>10.8');
    const config = { ...stored, path: '/config.ini', text: original };
    const reply = (body: object, status = 200) => ({ ok: status < 300, status, json: async () => body });
    const previousFetch = global.fetch;
    const fetchMock = jest.fn()
        .mockResolvedValueOnce(reply(config))
        .mockResolvedValueOnce(reply({ ...config, text: edited, revision: 'b'.repeat(64) }))
        .mockResolvedValueOnce(reply({ error: 'The stored file changed.' }, 409));
    global.fetch = fetchMock;
    try {
        render(<NodeFiles node={11} transport="wifi" available activity={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open node configuration' }));
        const editor = await screen.findByTestId<HTMLTextAreaElement>('configuration-editor');
        const upload = screen.getByRole('button', { name: 'Upload to node' });
        expect(fetchMock.mock.calls[0][0]).toBe('/api/workbench/v1/nodes/11/file?transport=wifi&path=%2Fconfig.ini');
        expect(screen.getByText('No structural issues found.')).toBeInTheDocument();
        fireEvent.change(editor, { target: { value: '; no address' } });
        expect(upload).toBeDisabled();
        expect(screen.getByText(/Declare a valid node address/)).toBeInTheDocument();
        fireEvent.change(editor, { target: { value: original.replace(/\r\n/g, '\n') } });
        fireEvent.change(editor, { target: { value: `${editor.value};${'x'.repeat(2047)}\n` } });
        expect(upload).toBeDisabled();
        expect(screen.getByText(/2048-byte line limit/)).toBeInTheDocument();
        fireEvent.change(editor, { target: { value: original.replace(/\r\n/g, '\n') } });
        fireEvent.change(editor, { target: { value: editor.value.replace('1000', 'fast') } });
        expect(upload).toBeDisabled();
        fireEvent.click(screen.getByText('Fix configuration errors before uploading.'));
        fireEvent.click(screen.getByRole('button', { name: /^Line 4: error/ }));
        fireEvent.change(editor, { target: { value: editor.value.replace('fast', '2000').replace('@>GPS.location', '@>missing.location') } });
        expect(screen.getByText(/source module is not declared/)).toBeInTheDocument();
        expect(upload).toBeEnabled();
        fireEvent.change(editor, { target: { value: editor.value.replace('@>missing.location', '@>10') } });
        expect(upload).toBeDisabled();
        fireEvent.change(editor, { target: { value: edited.replace(/\r\n/g, '\n') } });
        fireEvent.click(upload);
        expect(await screen.findByText(/Stored file verified by readback/)).toBeInTheDocument();
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ path: config.path, revision: config.revision, text: edited });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const laterDraft = editor.value.replace('2000', '3000');
        fireEvent.change(editor, { target: { value: laterDraft } });
        fireEvent.click(upload);
        expect(await screen.findByRole('alert')).toHaveTextContent('The stored file changed.');
        expect(editor).toHaveValue(laterDraft);
        expect(JSON.parse(fetchMock.mock.calls[2][1].body).revision).toBe('b'.repeat(64));
    } finally {
        global.fetch = previousFetch;
    }
});

it('traces draft subscriptions and replaces only one source before a separate verified upload', async () => {
    const original = [
        'node = 11', '[Nav = 12]', ' name = Pilot', ' $location = "@>GPSMain.location"  ; primary fix',
        ' $heading = 11>10.9', ' $remote = 3>1.8', ' $missing = @>Missing.location',
        ' $ambiguous = @>Shared.location', '[NMEA = 10]', ' name = "GPS Main"', ' futureSetting = "quoted; value"',
        '[NMEA = 14]', ' name = Shared', '[NMEA = 15]', ' name = Shared', '',
    ].join('\r\n');
    const edited = original.replace('@>GPSMain.location', '@>10.8');
    const previousFetch = global.fetch;
    const config = { ...stored, path: '/config.ini', text: original };
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => config })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ...config, text: edited }) });
    global.fetch = fetchMock;
    try {
        const props = { node: 11, transport: 'wifi' as const, activity: jest.fn() };
        const view = render(<NodeFiles {...props} available />);
        fireEvent.click(screen.getByRole('button', { name: 'Open node configuration' }));
        const editor = await screen.findByTestId<HTMLTextAreaElement>('configuration-editor');
        fireEvent.click(screen.getByText(/Modules and subscriptions/));
        expect(screen.getAllByText('Local: GPS Main (channel 10)')).toHaveLength(2);
        expect(screen.getByText('Remote source — unverified')).toBeInTheDocument();
        expect(screen.getByText('Local source module missing')).toBeInTheDocument();
        expect(screen.getByText('Local source module name is ambiguous')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Line 4: $location' }));
        fireEvent.click(screen.getByRole('button', { name: 'Edit source for $location on channel 12' }));
        const source = screen.getByRole('textbox', { name: 'Source for $location' });
        for (const value of ['invalid ; comment', '+255>1.8', '3>+256.8', '3>1.-1', '@other>10.8']) {
            fireEvent.change(source, { target: { value } });
            expect(screen.getByRole('button', { name: 'Update draft' })).toBeDisabled();
        }
        view.rerender(<NodeFiles {...props} available={false} />);
        fireEvent.change(source, { target: { value: '@>10.8' } });
        fireEvent.click(screen.getByRole('button', { name: 'Update draft' }));
        expect(editor).toHaveValue(edited.replace(/\r\n/g, '\n'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const upload = screen.getByRole('button', { name: 'Upload to node' });
        expect(upload).toBeDisabled();
        view.rerender(<NodeFiles {...props} available />);
        fireEvent.click(upload);
        expect(await screen.findByText(/Stored file verified by readback/)).toBeInTheDocument();
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ path: '/config.ini', revision: config.revision, text: edited });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
        global.fetch = previousFetch;
    }
});

it('opens archived Cloud files read-only without node or save actions', async () => {
    const previous = global.fetch;
    const entry = { path: '/config.ini', modifiedAt: '2026-11-13T10:00:00Z' };
    const fetchMock = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [entry] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { ...stored, ...entry, text: 'node = 11\n' } }) });
    global.fetch = fetchMock;
    try {
        render(<NodeFiles domainId="archive" node={11} readOnly available={false} activity={jest.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: /^\/config\.ini/ }));
        const editor = await screen.findByTestId('configuration-editor');
        expect(editor).toHaveAttribute('readonly');
        expect(editor).toHaveValue('node = 11\n');
        expect(screen.queryByRole('button', { name: /Save to Cloud|Load into node draft|Node actions|On-node/ })).not.toBeInTheDocument();
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            '/api/domains/archive/nodes/11/cloud-files',
            '/api/domains/archive/nodes/11/cloud-files?path=%2Fconfig.ini',
        ]);
    } finally { global.fetch = previous; }
});
