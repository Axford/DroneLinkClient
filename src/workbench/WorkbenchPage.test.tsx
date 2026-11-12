import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';

jest.mock('../DomainDetailPage', () => () => null);
jest.mock('../HomePage', () => () => null);
jest.mock('../InvitePage', () => () => null);

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
const value = btoa(String.fromCharCode(11, 11, 5, 8, 0, 42));
const name = btoa(String.fromCharCode(11, 11, 5, 8, 0x50, 86));

it('uses the local feed only and discards stale readings before route or stream recovery', () => {
    Feed.connections = [];
    jest.useFakeTimers();
    const previousSource = global.EventSource;
    const previousFetch = global.fetch;
    global.EventSource = Feed as unknown as typeof EventSource;
    global.fetch = jest.fn();
    window.history.replaceState({}, '', '/workbench/');
    const view = render(<App />);
    try {
        const stream = Feed.connections[0];
        expect(stream.url).toBe('/api/workbench/v1/events?diagnostics=1');
        act(() => stream.send('snapshot', { routes: [route] }));
        fireEvent.click(screen.getByRole('button', { name: /Node 11 · Reachable/ }));
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();

        act(() => {
            stream.send('observation', { packetBase64: 'bad', receivedAtMs: route.lastHeardAtMs });
            stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs });
            stream.send('observation', { packetBase64: name, receivedAtMs: route.lastHeardAtMs + 1 });
        });
        const parameter = screen.getByRole('article', { name: 'Parameter 11>5.8' });
        expect(within(parameter).getByText('42')).toBeInTheDocument();
        expect(within(parameter).getByText('V')).toBeInTheDocument();
        expect(parameter.querySelector('time')?.dateTime).toBe(new Date(route.lastHeardAtMs).toISOString());

        act(() => stream.send('route', { ...route, reachable: false }));
        expect(screen.getByText('Node 11 · Local · Last seen')).toBeInTheDocument();
        act(() => stream.send('route', { ...route, reachable: true }));
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();
        act(() => stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs + 2 }));
        act(() => stream.onerror?.());
        expect(screen.getByText('Node 11 · Local · Last seen')).toBeInTheDocument();
        act(() => jest.advanceTimersByTime(1000));
        const reconnected = Feed.connections[1];
        act(() => {
            reconnected.send('snapshot', { routes: [route] });
            stream.send('observation', { packetBase64: value, receivedAtMs: route.lastHeardAtMs + 3 });
        });
        expect(screen.getByText('Waiting for publications.')).toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();
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

it('keeps a manual per-node path pinned and switches Auto as the gateway route changes', () => {
    Feed.connections = [];
    const previousSource = global.EventSource;
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
        fireEvent.click(screen.getByRole('button', { name: /Node 11 · Reachable/ }));
        expect(screen.getByText('Node 11 · Local · Serial')).toBeInTheDocument();
        expect(screen.getByText('91')).toBeInTheDocument();
        expect(screen.queryByText('42')).not.toBeInTheDocument();
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
        expect(screen.getByText('Node 11 · Local · Serial · Last seen')).toBeInTheDocument();
        expect(screen.getByText('Serial · Down')).toBeInTheDocument();
        expect(screen.getByText('91')).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox', { name: 'Transport' }), { target: { value: 'auto' } });
        expect(screen.getByText('Node 11 · Local · Wi-Fi')).toBeInTheDocument();
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
        localStorage.removeItem(key);
        window.history.replaceState({}, '', '/');
    }
});
