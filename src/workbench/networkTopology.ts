import type { Transport } from './useWorkbenchFeed';
import type { NodeNetworkSnapshot } from './NodeNetwork';
import { transportLabel, transports, useWorkbenchFeed } from './useWorkbenchFeed';

type Feed = ReturnType<typeof useWorkbenchFeed>;

export interface ReportedRoute {
    destination: number;
    cost?: number;
    secondsAtRead?: number;
    receivedAt: number;
    status: string;
    inspected: boolean;
}

export interface ReportedHop {
    id: string;
    from: string;
    to: string;
    reporter: string;
    transport: string;
    routes: ReportedRoute[];
}

export const gatewayId = 'gateway';
export const nodeId = (address: number) => `node-${address}`;

export function gatewayRouteStatus(feed: Feed, transport: Transport, destination: number) {
    const route = feed.paths[transport][destination];
    if (feed.status !== 'connected') return 'Last seen';
    if (feed.interfaces[transport]?.up === false) return 'Interface down';
    if (!route.reachable) return 'Expired';
    return feed.routes[destination]?.transport === transport && feed.routes[destination].reachable
        ? 'Selected route' : 'Reachable';
}

export function networkTopology(feed: Feed, selectedNode?: number, snapshot?: NodeNetworkSnapshot, stale = false,
    inspectedTransport?: Transport) {
    const gatewayAddresses = transports.map(transport => feed.interfaces[transport]?.address);
    const addresses = new Set<number>();
    const hops = new Map<string, ReportedHop>();
    const names = new Map<number, string>();
    const target = (address: number) => gatewayAddresses.includes(address) ? gatewayId : nodeId(address);

    function addAddress(address: number) {
        if (target(address) === gatewayId) return;
        addresses.add(address);
        const name = transports.map(source => feed.observations[source][address]?.name).find(Boolean);
        if (name) names.set(address, name);
    }

    function addRoute(from: string, reporter: string, nextHop: number, transport: string, route: ReportedRoute) {
        addAddress(route.destination);
        addAddress(nextHop);
        const to = target(nextHop);
        if (from === to) return;
        const id = JSON.stringify([from, to, transport]);
        const hop = hops.get(id);
        if (hop) hop.routes.push(route);
        else hops.set(id, { id, from, to, reporter, transport, routes: [route] });
    }

    for (const transport of transports) {
        for (const route of Object.values(feed.paths[transport])) {
            const status = gatewayRouteStatus(feed, transport, route.node);
            addRoute(gatewayId, 'Gateway', route.nextHop, transportLabel[transport], {
                destination: route.node, cost: route.metric, receivedAt: route.lastHeardAtMs, status,
                inspected: route.node === selectedNode && transport === inspectedTransport &&
                    (status === 'Selected route' || status === 'Reachable'),
            });
        }
    }

    if (selectedNode !== undefined) addAddress(selectedNode);
    if (snapshot && selectedNode === snapshot.node) {
        for (const route of snapshot.routes) {
            const iface = snapshot.interfaces.find(item => item.channel === route.channel);
            const transport = iface ? `${iface.type} · ch ${iface.channel}` : route.channel === undefined ? 'Unknown interface' : `Channel ${route.channel}`;
            addRoute(nodeId(snapshot.node), `Node ${snapshot.node}`, route.nextHop, transport, {
                destination: route.destination, cost: route.cost, receivedAt: snapshot.receivedAt,
                secondsAtRead: route.ageMs / 1000, inspected: false, status: stale ? 'Last seen' : iface?.up === false ? 'Interface down at snapshot' : 'At snapshot',
            });
        }
    }
    return { addresses: Array.from(addresses).sort((a, b) => a - b), names, hops: Array.from(hops.values()) };
}
