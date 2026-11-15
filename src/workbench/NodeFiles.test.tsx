import { act, fireEvent, render, screen } from '@testing-library/react';
import NodeFiles from './NodeFiles';
import type { GlobalState } from '../dronelink/DroneLinkState';

jest.mock('./ConfigurationEditor', () => ({
    __esModule: true,
    default: ({ text, label, readOnly, onChange }: {
        text: string; label: string; readOnly: boolean; onChange: (text: string) => void;
    }) => <textarea data-testid="configuration-editor" aria-label={label} value={text} readOnly={readOnly} onChange={event => onChange(event.target.value)} />,
}));

// jsdom does not calculate graph geometry. The Chrome fixtures exercise the rendered edges.
const originalResizeObserver = global.ResizeObserver;
const originalDOMMatrix = window.DOMMatrixReadOnly;
beforeAll(() => {
    Object.defineProperty(window, "DOMMatrixReadOnly", { configurable: true, value: class { m22 = 1; } });
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});
afterAll(() => {
    global.ResizeObserver = originalResizeObserver;
    Object.defineProperty(window, 'DOMMatrixReadOnly', { configurable: true, value: originalDOMMatrix });
});

const stored = { path: '/sample.txt', text: 'First line\r\n', revision: 'a'.repeat(64), editable: true };

it('releases the file controls and allows a retry when the local gateway response stalls', async () => {
    const previousFetch = global.fetch;
    const activity = jest.fn();
    jest.useFakeTimers();
    global.fetch = jest.fn()
        .mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ...stored, path: '/config.ini', text: 'node = 11\n' }) });
    try {
        render(<NodeFiles node={11} transport="wifi" available activity={activity} />);
        const openConfiguration = screen.getByRole('button', { name: 'Open node configuration' });
        fireEvent.click(openConfiguration);
        expect(openConfiguration).toBeDisabled();
        await act(async () => { jest.advanceTimersByTime(135_000); });
        expect(screen.getByRole('alert')).toHaveTextContent('The node file request timed out. Try again.');
        expect(openConfiguration).toBeEnabled();
        expect(activity).toHaveBeenLastCalledWith(false, false);
        await act(async () => { fireEvent.click(openConfiguration); });
        expect(screen.getByRole('button', { name: 'Logical' })).toBeVisible();
    } finally {
        global.fetch = previousFetch;
        jest.useRealTimers();
    }
});

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
        .mockResolvedValueOnce(reply({ schemaVersion: 1, node: 11, entries: [] }))
        .mockResolvedValueOnce(reply({ ...config, text: edited, revision: 'b'.repeat(64) }))
        .mockResolvedValueOnce(reply({ error: 'The stored file changed.' }, 409));
    global.fetch = fetchMock;
    try {
        render(<NodeFiles node={11} transport="wifi" available activity={jest.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open node configuration' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Code' }));
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
        expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ path: config.path, revision: config.revision, text: edited });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        const laterDraft = editor.value.replace('2000', '3000');
        fireEvent.change(editor, { target: { value: laterDraft } });
        fireEvent.click(upload);
        expect(await screen.findByRole('alert')).toHaveTextContent('The stored file changed.');
        expect(editor).toHaveValue(laterDraft);
        expect(JSON.parse(fetchMock.mock.calls[3][1].body).revision).toBe('b'.repeat(64));
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
    const fetchMock = jest.fn((url: string, options?: RequestInit) => Promise.resolve({
        ok: true,
        json: async () => url.includes('/module-catalogue') ? { schemaVersion: 1, node: 11, entries: [] } :
            options?.method === 'PUT' ? { ...config, text: edited } : config,
    }));
    const fileCalls = () => fetchMock.mock.calls.filter(([url]) => !url.includes('/module-catalogue'));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
        const props = { node: 11, transport: 'wifi' as const, activity: jest.fn() };
        const view = render(<NodeFiles {...props} available />);
        fireEvent.click(screen.getByRole('button', { name: 'Open node configuration' }));
        expect(await screen.findByRole('button', { name: 'Logical' })).toHaveAttribute('aria-pressed', 'true');
        expect(await screen.findAllByText('Local: GPS Main (channel 10)')).toHaveLength(2);
        expect(screen.getByText('Remote source — unverified')).toBeInTheDocument();
        expect(screen.getByText('Local source module missing')).toBeInTheDocument();
        expect(screen.getByText('Local source module name is ambiguous')).toBeInTheDocument();
        const warning = screen.getByRole('button', { name: /configuration warning.*remote source cannot be verified/i });
        expect(warning.closest('.dw-config-graph-input')).toHaveAttribute('data-warning', 'true');
        expect(screen.getByText('@>GPSMain.location').closest('.dw-config-graph-input')).not.toHaveAttribute('data-warning');
        expect(screen.queryByText(/configuration warning\(s\)/)).not.toBeInTheDocument();
        fireEvent.focus(warning);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('This remote source cannot be verified from the node’s file.');
        fireEvent.blur(warning);
        fireEvent.click(screen.getByRole('button', { name: 'Edit source for $location on channel 12' }));
        const source = screen.getByRole('textbox', { name: 'Source for $location' });
        for (const value of ['invalid ; comment', '+255>1.8', '3>+256.8', '3>1.-1', '@other>10.8']) {
            fireEvent.change(source, { target: { value } });
            expect(screen.getByRole('button', { name: 'Update draft' })).toBeDisabled();
        }
        view.rerender(<NodeFiles {...props} available={false} />);
        fireEvent.change(source, { target: { value: '@>10.8' } });
        fireEvent.click(screen.getByRole('button', { name: 'Update draft' }));
        fireEvent.click(screen.getByRole('button', { name: 'Code' }));
        const editor = await screen.findByTestId<HTMLTextAreaElement>('configuration-editor');
        expect(editor).toHaveValue(edited.replace(/\r\n/g, '\n'));
        expect(screen.getByText('3 configuration warning(s).')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Physical' }));
        expect(screen.queryByText(/configuration warning\(s\)/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Code' }));
        fireEvent.change(editor, { target: { value: editor.value.replace('@>10.8', '@>GPSMain.location') } });
        fireEvent.click(screen.getByRole('button', { name: 'Logical' }));
        expect(await screen.findByText('@>GPSMain.location')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Edit source for $location on channel 12' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Source for $location' }), { target: { value: '@>10.8' } });
        fireEvent.click(screen.getByRole('button', { name: 'Update draft' }));
        expect(fileCalls()).toHaveLength(1);
        const upload = screen.getByRole('button', { name: 'Upload to node' });
        expect(upload).toBeDisabled();
        view.rerender(<NodeFiles {...props} available />);
        fireEvent.click(upload);
        expect(await screen.findByText(/Stored file verified by readback/)).toBeInTheDocument();
        expect(JSON.parse(fileCalls()[1][1]!.body as string)).toEqual({ path: '/config.ini', revision: config.revision, text: edited });
        expect(fileCalls()).toHaveLength(2);
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
        fireEvent.click(await screen.findByRole('button', { name: 'Code' }));
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

it('edits verified Logical parameters and publish declarations in the shared Code draft and resolves current-domain sources', async () => {
    const original = ['node = 11', '[NMEA = 10]', '  name = GPS', '  baud = 9600 ; retain this',
        '  publish = location, packets', '  publish = satellites ; keep this too', '[Nav = 12]', '  name = Pilot',
        '  $target = 65>7.8 ; remote', '  $location = @>10.8', ''].join('\r\n');
    const parameter = (name: string, address: number, type: string, count: number, extra = {}) =>
        ({ name, address, type, count, configurable: false, alwaysPublished: false, runtimeOnly: false, ...extra });
    const catalogue = { schemaVersion: 1, node: 11, metadataStatus: 'marker-match', entries: [
        { type: 'NMEA', support: 'supported', parameters: [
            parameter('location', 8, 'f', 3), parameter('satellites', 9, 'f', 1), parameter('speed', 11, 'f', 1),
            parameter('baud', 14, 'u32', 1, { configurable: true }), parameter('packets', 17, 'u32', 3),
        ] },
        { type: 'Nav', support: 'supported', parameters: [
            parameter('location', 10, 'f', 3, { sourceAddress: 11, configurable: true }),
            parameter('target', 12, 'f', 3, { sourceAddress: 13, configurable: true }),
            parameter('heading', 20, 'f', 1, { sourceAddress: 21 }),
            parameter('moveTarget', 27, 'u32', 3, { runtimeOnly: true }),
        ] },
    ] };
    const snapshot: GlobalState = {
        65: { id: 65, name: 'RaceMark', lastHeard: 1, channels: {
            7: { channel: 7, lastHeard: 1, name: 'Course', params: {
                8: { param: 8, name: 'target', msgType: 0, bytesPerValue: 4, numValues: 3, values: [1, 2, 3], writable: false },
            } },
        } },
    };
    const previousFetch = global.fetch;
    const config = { ...stored, path: '/config.ini', text: original };
    const fetchMock = jest.fn(async (url: string, options?: RequestInit) => ({
        ok: true,
        json: async () => url.includes('/module-catalogue') ? catalogue :
            options?.method === 'PUT' ? { ...config, ...JSON.parse(options.body as string) } : config,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
        const props = { node: 11, transport: 'wifi' as const, activity: jest.fn(), available: true };
        const view = render(<NodeFiles {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Open node configuration' }));
        const target = await screen.findByRole('textbox', { name: 'Pilot target source' });
        const showAll = screen.getByRole('switch', { name: 'Show all parameters' });
        expect(showAll).not.toBeChecked();
        expect(screen.getByRole('textbox', { name: 'Pilot location source' })).toHaveValue('@>10.8');
        expect(screen.getByRole('switch', { name: 'Publish GPS location' })).toBeChecked();
        expect(screen.queryByRole('textbox', { name: 'Pilot heading source' })).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'GPS baud draft value' })).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: 'Publish GPS packets' })).not.toBeInTheDocument();
        expect(screen.getByText('13 · F×3')).toBeInTheDocument();
        expect(screen.getByText('Remote source — unverified')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /remote source cannot be verified/i })).toBeInTheDocument();
        view.rerender(<NodeFiles {...props} snapshot={snapshot} />);
        expect(screen.getByText('RaceMark > Course.target')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /remote source cannot be verified/i })).not.toBeInTheDocument();
        expect(target).toHaveValue('65>7.8');
        view.rerender(<NodeFiles {...props} snapshot={{}} />);
        expect(screen.getByText('Remote source — unverified')).toBeInTheDocument();

        fireEvent.click(showAll);
        expect(screen.getByRole('textbox', { name: 'Pilot heading source' })).toHaveValue('');
        const baud = screen.getByRole('textbox', { name: 'GPS baud draft value' });
        fireEvent.change(baud, { target: { value: 'fast' } });
        fireEvent.keyDown(baud, { key: 'Enter' });
        expect(baud).toHaveAttribute('aria-invalid', 'true');
        fireEvent.change(baud, { target: { value: '4800' } });
        fireEvent.keyDown(baud, { key: 'Enter' });
        fireEvent.click(screen.getByRole('switch', { name: 'Publish GPS packets' }));
        fireEvent.click(screen.getByRole('switch', { name: 'Publish GPS speed' }));
        expect(screen.getByRole('switch', { name: 'Publish Pilot moveTarget' })).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'Code' }));
        expect(screen.queryByRole('switch', { name: 'Show all parameters' })).not.toBeInTheDocument();
        const editor = await screen.findByTestId<HTMLTextAreaElement>('configuration-editor');
        const graphEdits = original.replace('9600', '4800').replace('location, packets', 'location')
            .replace('publish = satellites ; keep this too', 'publish = satellites ; keep this too\r\n  publish = speed');
        expect(editor).toHaveValue(graphEdits.replace(/\r\n/g, '\n'));
        fireEvent.change(editor, { target: { value: editor.value.replace('4800', '19200').replace('65>7.8', '@>GPS.location') } });
        fireEvent.click(screen.getByRole('button', { name: 'Logical' }));
        expect(await screen.findByRole('textbox', { name: 'GPS baud draft value' })).toHaveValue('19200');
        const localTarget = screen.getByRole('textbox', { name: 'Pilot target source' });
        expect(localTarget).toHaveValue('@>GPS.location');
        fireEvent.click(screen.getByRole('switch', { name: 'Show all parameters' }));
        expect(screen.queryByRole('textbox', { name: 'GPS baud draft value' })).not.toBeInTheDocument();
        expect(screen.queryByRole('switch', { name: 'Publish GPS speed' })).not.toBeInTheDocument();
        expect(localTarget).toBeInTheDocument();
        fireEvent.change(localTarget, { target: { value: '65>7.8' } });
        fireEvent.blur(localTarget);
        expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Upload to node' }));
        expect(await screen.findByText(/Stored file verified by readback/)).toBeInTheDocument();
        const upload = fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT');
        expect(JSON.parse(upload![1]!.body as string).text).toBe(graphEdits.replace('4800', '19200'));
    } finally {
        global.fetch = previousFetch;
    }
});

it('wires only verified compatible outputs and adds the publication to the same draft', async () => {
    const original = ['node = 11', '[NMEA = 10]', '  name = GPS', '  publish = satellites ; retain this',
        '[Nav = 12]', '  name = Pilot', '  $target = 65>7.8 ; retain source comment', ''].join('\r\n');
    const parameter = (name: string, address: number, type: string, count: number, extra = {}) =>
        ({ name, address, type, count, configurable: false, alwaysPublished: false, runtimeOnly: false, ...extra });
    const catalogue = { schemaVersion: 1, node: 11, metadataStatus: 'marker-match', entries: [
        { type: 'NMEA', support: 'supported', parameters: [
            parameter('location', 8, 'f', 3), parameter('satellites', 9, 'f', 1),
            parameter('packets', 17, 'u32', 3), parameter('command', 19, 'f', 3, { runtimeOnly: true }),
        ] },
        { type: 'Nav', support: 'supported', parameters: [
            parameter('target', 12, 'f', 3, { sourceAddress: 13 }),
            parameter('mode', 14, 'u8', 1, { sourceAddress: 15 }),
        ] },
    ] };
    const previousFetch = global.fetch;
    const fetchMock = jest.fn(async (url: string, _options?: RequestInit) => ({
        ok: true,
        json: async () => url.includes('/module-catalogue') ? catalogue : { ...stored, path: '/config.ini', text: original },
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
        render(<NodeFiles node={11} transport="wifi" activity={jest.fn()} available />);
        fireEvent.click(screen.getByRole('button', { name: 'Open node configuration' }));
        const connect = await screen.findByRole('button', { name: 'Connect Pilot target' });
        const showAll = screen.getByRole('switch', { name: 'Show all parameters' });
        expect(showAll).not.toBeChecked();

        fireEvent.click(connect);
        expect(connect).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByRole('button', { name: /^Use / }).map(button => button.getAttribute('aria-label')))
            .toEqual(['Use GPS location']);
        expect(screen.getByText('Will publish')).toBeVisible();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('button', { name: 'Use GPS location' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload to node' })).toBeDisabled();

        fireEvent.click(showAll);
        fireEvent.click(screen.getByRole('button', { name: 'Connect Pilot mode' }));
        expect(screen.getByText(/No compatible local outputs for Pilot.mode/)).toBeVisible();
        expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel wiring' }));
        fireEvent.click(showAll);

        fireEvent.click(connect);
        fireEvent.click(screen.getByRole('button', { name: 'Use GPS location' }));
        expect(screen.getByRole('textbox', { name: 'Pilot target source' })).toHaveValue('@>10.8');
        expect(screen.getByRole('switch', { name: 'Publish GPS location' })).toBeChecked();
        expect(screen.queryByRole('button', { name: 'Cancel wiring' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Code' }));
        expect(await screen.findByTestId('configuration-editor')).toHaveValue(
            original.replace(/\r\n/g, '\n').replace('65>7.8', '@>10.8')
                .replace('satellites ; retain this', 'satellites ; retain this\n  publish = location'),
        );
        expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
    } finally {
        global.fetch = previousFetch;
    }
});
