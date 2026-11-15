import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import { encodeLinkPacket } from '@dronelink/protocol';
import { DRONE_LINK_MSG_TYPE_CHAR, DRONE_LINK_MSG_TYPE_FLOAT, DRONE_MODULE_PARAM_TYPE } from '../dronelink/DroneLinkMsg';

const mockStyleLoads: Array<() => void> = [];
const mockTrailData = jest.fn();

jest.mock('../DomainDetailPage', () => () => null);
jest.mock('../HomePage', () => () => null);
jest.mock('../InvitePage', () => () => null);
jest.mock('maplibre-gl', () => ({
    Map: class {
        on() {}
        once(event: string, callback: () => void) {
            if (event === 'style.load') mockStyleLoads.push(callback);
        }
        addControl() {}
        addSource() {}
        addLayer() {}
        getSource(id: string) { return { setData: id === 'dw-snail-trails' ? mockTrailData : jest.fn() }; }
        remove() {}
        getCenter() { return { lat: 0, lng: 0 }; }
        getZoom() { return 1; }
    },
    NavigationControl: jest.fn(),
    Marker: class {
        setLngLat() { return this; }
        addTo() { return this; }
        remove() {}
    },
}));
jest.mock('react-resizable-panels', () => ({
    Panel: 'div', PanelGroup: 'div', PanelResizeHandle: 'div',
}));

// jsdom cannot measure React Flow nodes. Wire placement is exercised in Chrome.
const originalResizeObserver = global.ResizeObserver;
beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});
afterAll(() => { global.ResizeObserver = originalResizeObserver; });

class Feed extends EventTarget {
    static connections: Feed[] = [];
    onerror?: () => void;
    close = jest.fn();

    constructor(public url: string) {
        super();
        Feed.connections.push(this);
    }

    send(type: string, data: unknown) {
        this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
}

const route = { node: 11, nextHop: 11, lastHeardAtMs: 1710000000000 };
// Protocol 0.2.0 fixture layout: source, node, channel, packed parameter, type/length, payload.
const value = btoa(String.fromCharCode(11, 11, 5, 0x88, 0, 42));
const name = btoa(String.fromCharCode(11, 11, 5, 8, 0x50, 86));

it('uses the local feed only and discards stale readings before route or stream recovery', async () => {
    Feed.connections = [];
    jest.useFakeTimers();
    const previousSource = global.EventSource;
    const previousFetch = global.fetch;
    global.EventSource = Feed as unknown as typeof EventSource;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ mapboxAccessToken: null }) });
    window.history.replaceState({}, '', '/workbench/');
    const view = render(<App />);
    try {
        const stream = Feed.connections[0];
        expect(stream.url).toBe('/api/workbench/v1/events?diagnostics=1');
        act(() => stream.send('snapshot', { routes: [route] }));
        expect(screen.getByRole('region', { name: 'Node Inspector' })).toHaveAttribute('data-size', 'collapsed');
        fireEvent.click(await screen.findByRole('button', { name: /Node 11 · Reachable/ }));
        expect(screen.getByRole('region', { name: 'Node Inspector' })).toHaveAttribute('data-size', 'normal');
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();

        act(() => {
            stream.send('observation', { packetBase64: 'bad', receivedAtMs: route.lastHeardAtMs });
            stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs });
            stream.send('observation', { packetBase64: name, receivedAtMs: route.lastHeardAtMs + 1 });
        });
        const inspector = screen.getByRole('region', { name: 'Node Inspector' });
        expect(within(inspector).getByRole('heading', { name: 'Node 11' })).toBeVisible();
        expect(within(inspector).getByText('Local · Wi-Fi', { exact: true })).toBeVisible();
        const lenses = within(screen.getByRole('navigation', { name: 'Domain lenses' }));
        expect(lenses.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
        expect(lenses.queryByRole('button', { name: 'Nodes' })).not.toBeInTheDocument();
        expect(within(inspector).getByRole('group', { name: 'Module list controls' })).toContainElement(
            within(inspector).getByRole('button', { name: 'Collapse All' }));
        const parameter = screen.getByRole('article', { name: 'Parameter 11>5.8' });
        expect(within(parameter).getByText('42')).toBeInTheDocument();
        expect(within(parameter).getByText('V')).toBeInTheDocument();
        expect(within(parameter).getByText('11>5.8 · U8 · P2')).toBeVisible();
        expect(parameter.querySelector('time')?.dateTime).toBe(new Date(route.lastHeardAtMs).toISOString());

        act(() => stream.send('route', { ...route, reachable: false }));
        expect(screen.getByText('Local · Wi-Fi · Last seen', { exact: true })).toBeInTheDocument();
        act(() => stream.send('route', { ...route, reachable: true }));
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();
        act(() => stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs + 2 }));
        act(() => stream.onerror?.());
        expect(screen.getByText('Local · Wi-Fi · Last seen', { exact: true })).toBeInTheDocument();
        act(() => jest.advanceTimersByTime(1000));
        const reconnected = Feed.connections[1];
        act(() => {
            reconnected.send('snapshot', { routes: [route] });
            stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs + 3 });
        });
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();
        expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['/api/workbench/v1/map-config']);
        fireEvent.click(within(inspector).getByRole('tab', { name: 'Files' }));
        expect(within(inspector).getByRole('heading', { name: 'Node 11' })).toBeVisible();
        expect(within(inspector).getByText('Local · Wi-Fi', { exact: true })).toBeVisible();
        expect(within(inspector).queryByRole('group', { name: 'Module list controls' })).not.toBeInTheDocument();
        view.unmount();
        expect(reconnected.close).toHaveBeenCalledTimes(1);
    } finally {
        view.unmount();
        global.EventSource = previousSource;
        global.fetch = previousFetch;
        window.history.replaceState({}, '', '/');
        jest.useRealTimers();
    }
});

it('keeps a manual per-node path pinned and switches Auto as the gateway route changes', async () => {
    Feed.connections = [];
    const previousSource = global.EventSource;
    const previousFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    global.EventSource = Feed as unknown as typeof EventSource;
    window.history.replaceState({}, '', '/workbench/');
    const view = render(<App />);
    const key = 'workbench-transport:254/253:11';
    localStorage.removeItem(key);
    try {
        const stream = Feed.connections[0];
        const wifi = { ...route, transport: 'wifi', metric: 16 };
        const serial = { ...route, transport: 'serial', metric: 2 };
        const status = { up: true, received: 2, sent: 1, rejected: 0, bytesReceived: 20, error: '' };
        const serialStatus = { ...status, transport: 'serial', address: 253, port: '/test/serial', diagnosticRecords: 1, diagnosticRejected: 0 };
        const wifiStatus = { ...status, transport: 'wifi', address: 254 };
        act(() => {
            stream.send('snapshot', { routes: [serial], paths: [wifi, serial], interfaces: [wifiStatus, serialStatus] });
            stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs, transport: 'wifi' });
            stream.send('observation', { packetBase64: btoa(String.fromCharCode(11, 11, 5, 8, 0, 91)), receivedAtMs: route.lastHeardAtMs, transport: 'serial' });
            for (let index = 0; index < 200; index++) stream.send('diagnostic', { text: `Line ${index}`, receivedAtMs: route.lastHeardAtMs });
            stream.send('diagnostic', { text: '<device message>', receivedAtMs: route.lastHeardAtMs });
        });
        fireEvent.click(await screen.findByRole('button', { name: /Node 11 · Reachable/ }));
        expect(screen.getByRole('region', { name: 'Node Inspector' })).toHaveAttribute('data-size', 'normal');
        expect(screen.getByText('Local · Serial', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('91')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Network' }));
        fireEvent.click(screen.getByText('Gateway interfaces and routes'));
        expect(screen.getByText('<device message>')).toBeInTheDocument();
        expect(screen.queryByText('Line 0', { exact: true })).not.toBeInTheDocument();
        expect(within(screen.getByRole('list', { name: 'Recent serial messages' })).getAllByRole('listitem')).toHaveLength(200);
        fireEvent.change(screen.getByRole('combobox', { name: 'Transport' }), { target: { value: 'serial' } });
        expect(localStorage.getItem(key)).toBe('serial');
        expect(screen.getByText(/Hidden by transport selection/)).toBeInTheDocument();
        act(() => {
            stream.send('interface', { ...serialStatus, up: false, error: 'Disconnected' });
            stream.send('path', { ...serial, reachable: false });
            stream.send('route', { ...wifi, reachable: true });
        });
        expect(screen.getByText('Local · Serial · Last seen', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('Serial · Down')).toBeInTheDocument();
        expect(screen.getByText('91')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox', { name: 'Transport' }), { target: { value: 'auto' } });
        expect(screen.getByText('Local · Wi-Fi', { exact: true })).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
        act(() => {
            stream.send('path', { ...serial, reachable: true });
            stream.send('route', { ...serial, reachable: true });
        });
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();
        expect(screen.queryByText('91')).not.toBeInTheDocument();
    } finally {
        view.unmount();
        global.EventSource = previousSource;
        global.fetch = previousFetch;
        localStorage.removeItem(key);
        window.history.replaceState({}, '', '/');
    }
});

it('collects both local trails through lens and transport changes', async () => {
    Feed.connections = [];
    mockTrailData.mockClear();
    mockStyleLoads.length = 0;
    const previousSource = global.EventSource;
    const previousFetch = global.fetch;
    global.EventSource = Feed as unknown as typeof EventSource;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ mapboxAccessToken: null }) });
    window.history.replaceState({}, '', '/workbench/');
    const view = render(<App />);
    try {
        const stream = Feed.connections[0];
        const routes = [11, 12].map(node => ({ ...route, node, nextHop: node, transport: 'wifi' }));
        const serial = { ...routes[0], transport: 'serial' };
        act(() => stream.send('snapshot', { routes, paths: [...routes, serial], interfaces: [] }));
        const publish = (node: number, transport: string, param: number, msgType: number, payload: Uint8Array, offset: number) => {
            const bytes = encodeLinkPacket({
                source: node, node, channel: 4, param, priority: 0,
                msgType, msgLength: payload.length, writable: false,
            }, payload);
            stream.send('observation', {
                packetBase64: btoa(String.fromCharCode(...Array.from(bytes))), transport, receivedAtMs: route.lastHeardAtMs + offset,
            });
        };
        const gps = (node: number, transport: string, lon: number, tick: number) => {
            const payload = new Uint8Array(12);
            const coords = new DataView(payload.buffer);
            coords.setFloat32(0, lon, true);
            coords.setFloat32(4, node + 40, true);
            act(() => {
                publish(node, transport, DRONE_MODULE_PARAM_TYPE, DRONE_LINK_MSG_TYPE_CHAR,
                    Uint8Array.of(78, 77, 69, 65), tick);
                publish(node, transport, 8, DRONE_LINK_MSG_TYPE_FLOAT, payload, tick);
            });
        };
        const lenses = within(await screen.findByRole('navigation', { name: 'Domain lenses' }));
        await screen.findByText('Local fallback basemap');
        act(() => mockStyleLoads.at(-1)!());
        gps(11, 'wifi', -1, 1);
        gps(12, 'wifi', -1, 1);
        fireEvent.click(lenses.getByRole('button', { name: 'Network' }));
        gps(11, 'wifi', -2, 2);
        gps(12, 'wifi', -2, 2);
        act(() => stream.send('route', { ...serial, reachable: true }));
        gps(11, 'serial', -3, 3);
        gps(11, 'serial', -4, 4);
        fireEvent.click(lenses.getByRole('button', { name: 'Map' }));
        await screen.findByRole('button', { name: 'Fit observed positions' });
        act(() => mockStyleLoads.at(-1)!());
        const lines = () => mockTrailData.mock.calls.at(-1)?.[0].features;
        const node11 = lines().filter((line: any) => line.properties.nodeId === 11);
        expect(node11.map((line: any) => line.geometry.coordinates)).toEqual([
            [[-1, 51], [-2, 51]], [[-3, 51], [-4, 51]],
        ]);
        expect(lines().filter((line: any) => line.properties.nodeId === 12)).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: /Node 11 · Reachable/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear trail for node 11' }));
        expect(lines().map((line: any) => line.properties.nodeId)).toEqual([12]);
    } finally {
        view.unmount();
        global.EventSource = previousSource;
        global.fetch = previousFetch;
    }
});
