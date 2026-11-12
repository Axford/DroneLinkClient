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
    jest.useFakeTimers();
    const previousSource = global.EventSource;
    const previousFetch = global.fetch;
    global.EventSource = Feed as unknown as typeof EventSource;
    global.fetch = jest.fn();
    window.history.replaceState({}, '', '/workbench/');
    const view = render(<App />);
    try {
        const stream = Feed.connections[0];
        expect(stream.url).toBe('/api/workbench/v1/events');
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
