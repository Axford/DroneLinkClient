import { useEffect, useState } from 'react';
import { DroneLinkMsg, DRONE_LINK_MSG_TYPE_NAME, ProtocolValidationError } from '../dronelink/DroneLinkMsg';
import { DroneLinkState, GlobalState } from '../dronelink/DroneLinkState';

interface Route {
    node: number;
    nextHop: number;
    lastHeardAtMs: number;
    reachable: boolean;
}

interface Feed {
    status: 'connecting' | 'connected' | 'reconnecting';
    routes: Record<number, Route>;
    observations: GlobalState;
}

function isAddress(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 254;
}

function isTimestamp(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

function readRoute(value: unknown, reachable: unknown): Route | undefined {
    if (!value || typeof value !== 'object') return;
    const { node, nextHop, lastHeardAtMs } = value as Record<string, unknown>;
    if (isAddress(node) && isAddress(nextHop) && isTimestamp(lastHeardAtMs) && typeof reachable === 'boolean') {
        return { node, nextHop, lastHeardAtMs, reachable };
    }
}

export function useWorkbenchFeed(): Feed {
    const [feed, setFeed] = useState<Feed>({ status: 'connecting', routes: {}, observations: {} });

    useEffect(() => {
        const observations = new DroneLinkState({ debug: false });
        let routes: Feed['routes'] = {};
        let currentStream: EventSource | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;

        const publish = (status: Feed['status']) => setFeed({
            status, routes, observations: { ...observations.getState() },
        });

        function connect() {
            const stream = new EventSource('/api/workbench/v1/events');
            currentStream = stream;
            let receivedSnapshot = false;
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
                const nextRoutes: Feed['routes'] = {};
                for (const value of payload.routes) {
                    const route = readRoute(value, true);
                    if (!route) return;
                    nextRoutes[route.node] = route;
                }
                routes = nextRoutes;
                observations.reset();
                receivedSnapshot = true;
                publish('connected');
            });
            on('route', payload => {
                const route = readRoute(payload, payload.reachable);
                if (!receivedSnapshot || !route) return;
                if (route.reachable && routes[route.node]?.reachable === false) observations.discardNode(route.node);
                routes = { ...routes, [route.node]: route };
                publish('connected');
            });
            on('observation', ({ packetBase64, receivedAtMs }) => {
                if (!receivedSnapshot || !isTimestamp(receivedAtMs) || typeof packetBase64 !== 'string' || packetBase64.length > 32) return;
                const message = new DroneLinkMsg(Uint8Array.from(atob(packetBase64), character => character.charCodeAt(0)));
                if (message.msgType > DRONE_LINK_MSG_TYPE_NAME || !routes[message.node]?.reachable) return;
                observations.handleLinkMsg(message, false, 'Local', receivedAtMs);
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
            observations.destroy();
        };
    }, []);

    return feed;
}
