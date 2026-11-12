import { useEffect, useState } from 'react';
import { DroneLinkMsg, DRONE_LINK_MSG_TYPE_NAME, ProtocolValidationError } from '../dronelink/DroneLinkMsg';
import { DroneLinkState, GlobalState } from '../dronelink/DroneLinkState';

export type Transport = 'wifi' | 'serial';
export const transportLabel: Record<Transport, string> = { wifi: 'Wi-Fi', serial: 'Serial' };
export const transports = ['wifi', 'serial'] as const;

interface Route {
    node: number;
    nextHop: number;
    lastHeardAtMs: number;
    reachable: boolean;
    transport: Transport;
    metric?: number;
    uptimeMs?: number;
}

interface InterfaceStatus {
    transport: Transport;
    address: number;
    up: boolean;
    error: string;
    received: number;
    rejected: number;
    sent: number;
    bytesReceived: number;
    port?: string;
    diagnosticRecords?: number;
    diagnosticRejected?: number;
}

interface Diagnostic {
    id: number;
    receivedAtMs: number;
    text: string;
}

type Routes = Record<number, Route>;
interface Feed {
    status: 'connecting' | 'connected' | 'reconnecting';
    routes: Routes;
    paths: Record<Transport, Routes>;
    observations: Record<Transport, GlobalState>;
    interfaces: Partial<Record<Transport, InterfaceStatus>>;
    diagnostics: Diagnostic[];
}

function isAddress(value: unknown): value is number {
    return isCounter(value) && value >= 1 && value <= 254;
}

function isCounter(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
    return isCounter(value) && value <= 8.64e15;
}

function isTransport(value: unknown): value is Transport {
    return value === 'wifi' || value === 'serial';
}

function readRoute(value: unknown, reachable: unknown, enhanced: boolean): Route | undefined {
    if (!value || typeof value !== 'object') return;
    const { node, nextHop, lastHeardAtMs, transport = enhanced ? undefined : 'wifi', metric, uptimeMs } = value as Record<string, unknown>;
    if (isAddress(node) && isAddress(nextHop) && isTimestamp(lastHeardAtMs) && typeof reachable === 'boolean' && isTransport(transport)) {
        return { node, nextHop, lastHeardAtMs, reachable, transport, metric: isCounter(metric) ? metric : undefined, uptimeMs: isCounter(uptimeMs) ? uptimeMs : undefined };
    }
}

function readInterface(value: unknown): InterfaceStatus | undefined {
    if (!value || typeof value !== 'object') return;
    const { transport, address, up, error, received, rejected, sent, bytesReceived, port, diagnosticRecords, diagnosticRejected } = value as Record<string, unknown>;
    if (isTransport(transport) && isAddress(address) && typeof up === 'boolean' && typeof error === 'string' &&
        isCounter(received) && isCounter(rejected) && isCounter(sent) && isCounter(bytesReceived)) {
        return { transport, address, up, error, received, rejected, sent, bytesReceived,
            port: typeof port === 'string' ? port : undefined,
            diagnosticRecords: isCounter(diagnosticRecords) ? diagnosticRecords : undefined,
            diagnosticRejected: isCounter(diagnosticRejected) ? diagnosticRejected : undefined };
    }
}

export function useWorkbenchFeed(): Feed {
    const [feed, setFeed] = useState<Feed>({ status: 'connecting', routes: {}, paths: { wifi: {}, serial: {} },
        observations: { wifi: {}, serial: {} }, interfaces: {}, diagnostics: [] });

    useEffect(() => {
        const observations = { wifi: new DroneLinkState({ debug: false }), serial: new DroneLinkState({ debug: false }) };
        let routes: Routes = {};
        let paths: Feed['paths'] = { wifi: {}, serial: {} };
        let interfaces: Feed['interfaces'] = {};
        let diagnostics: Diagnostic[] = [];
        let diagnosticId = 0;
        let currentStream: EventSource | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;

        const publish = (status: Feed['status']) => setFeed({ status, routes, paths, interfaces, diagnostics,
            observations: { wifi: { ...observations.wifi.getState() }, serial: { ...observations.serial.getState() } },
        });

        function setPath(route: Route) {
            const { node, transport } = route;
            if (route.reachable && paths[transport][node]?.reachable === false) observations[transport].discardNode(node);
            paths = { ...paths, [transport]: { ...paths[transport], [node]: route } };
        }

        function connect() {
            const stream = new EventSource('/api/workbench/v1/events?diagnostics=1');
            currentStream = stream;
            let receivedSnapshot = false;
            let enhanced = false;
            const on = (type: string, handle: (payload: Record<string, unknown>) => void) => {
                stream.addEventListener(type, (event: MessageEvent<string>) => {
                    if (currentStream !== stream) return;
                    try {
                        const payload: unknown = JSON.parse(event.data);
                        if (payload && typeof payload === 'object') handle(payload as Record<string, unknown>);
                    } catch (error) {
                        if (!(error instanceof SyntaxError || error instanceof DOMException || error instanceof ProtocolValidationError)) throw error;
                    }
                });
            };

            on('snapshot', payload => {
                if (receivedSnapshot || !Array.isArray(payload.routes)) return;
                enhanced = Array.isArray(payload.paths) && Array.isArray(payload.interfaces);
                const nextRoutes: Routes = {};
                const nextPaths: Feed['paths'] = { wifi: {}, serial: {} };
                const nextInterfaces: Feed['interfaces'] = {};
                for (const value of payload.routes) {
                    const route = readRoute(value, true, enhanced);
                    if (!route) return;
                    nextRoutes[route.node] = route;
                }
                for (const value of Array.isArray(payload.paths) ? payload.paths : payload.routes) {
                    const route = readRoute(value, true, enhanced);
                    if (!route) return;
                    nextPaths[route.transport][route.node] = route;
                }
                for (const value of Array.isArray(payload.interfaces) ? payload.interfaces : []) {
                    const status = readInterface(value);
                    if (!status) return;
                    nextInterfaces[status.transport] = status;
                }
                routes = nextRoutes;
                paths = nextPaths;
                interfaces = nextInterfaces;
                diagnostics = [];
                observations.wifi.reset();
                observations.serial.reset();
                receivedSnapshot = true;
                publish('connected');
            });
            on('route', payload => {
                const route = readRoute(payload, payload.reachable, enhanced);
                if (!receivedSnapshot || !route) return;
                if (!enhanced) setPath(route);
                routes = { ...routes, [route.node]: route };
                publish('connected');
            });
            on('path', payload => {
                const route = readRoute(payload, payload.reachable, true);
                if (!receivedSnapshot || !enhanced || !route) return;
                setPath(route);
                publish('connected');
            });
            on('interface', payload => {
                const status = readInterface(payload);
                if (!receivedSnapshot || !enhanced || !status) return;
                interfaces = { ...interfaces, [status.transport]: status };
                publish('connected');
            });
            on('diagnostic', ({ text, receivedAtMs }) => {
                if (!receivedSnapshot || !enhanced || typeof text !== 'string' || text.length > 550 || !isTimestamp(receivedAtMs)) return;
                diagnostics = [...diagnostics.slice(-199), { id: ++diagnosticId, text, receivedAtMs }];
                publish('connected');
            });
            on('observation', ({ packetBase64, receivedAtMs, transport = enhanced ? undefined : 'wifi' }) => {
                if (!receivedSnapshot || !isTransport(transport) || !isTimestamp(receivedAtMs) || typeof packetBase64 !== 'string' || packetBase64.length > 32) return;
                const message = new DroneLinkMsg(Uint8Array.from(atob(packetBase64), character => character.charCodeAt(0)));
                if (message.msgType > DRONE_LINK_MSG_TYPE_NAME || !paths[transport][message.node]?.reachable) return;
                observations[transport].handleLinkMsg(message, false, 'Local', receivedAtMs);
                publish('connected');
            });
            stream.onerror = () => {
                if (currentStream !== stream) return;
                currentStream = undefined;
                stream.close();
                publish('reconnecting');
                retry = setTimeout(connect, 1000);
            };
        }

        connect();
        return () => {
            clearTimeout(retry);
            const stream = currentStream;
            currentStream = undefined;
            stream?.close();
            observations.wifi.destroy();
            observations.serial.destroy();
        };
    }, []);

    return feed;
}
