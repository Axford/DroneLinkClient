import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType,
    Panel, Position, ReactFlow, getBezierPath, getViewportForBounds, useReactFlow, useStore,
} from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps, XYPosition } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { gatewayId, networkTopology, nodeId } from './networkTopology';
import type { ReportedHop } from './networkTopology';
import type { NodeNetworkSnapshot } from './NodeNetwork';

const cardWidth = 176;
const cardHeight = 88;
const sides = [Position.Left, Position.Right, Position.Top, Position.Bottom];

function springLayout(ids: string[], links: [string, string][]) {
    // Anchor the gateway. Use springs for observed hops and repulsion for card clearance.
    const radius = Math.max(280, (ids.length - 1) * 43);
    const points = ids.map((id, i) => {
        const angle = (i - 1) / Math.max(1, ids.length - 1) * Math.PI * 2;
        return id === gatewayId ? { x: 0, y: 0 } : { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    const indexes = new Map(ids.map((id, i) => [id, i]));
    const springs = links.map(([from, to]) => [indexes.get(from)!, indexes.get(to)!]);
    for (let pass = 0; pass < 75; pass++) {
        const deltas = points.map(point => ({ x: -point.x * 0.012, y: -point.y * 0.012 }));
        const push = (i: number, j: number, dx: number, dy: number) => {
            deltas[i].x -= dx;
            deltas[i].y -= dy;
            deltas[j].x += dx;
            deltas[j].y += dy;
        };
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const dx = points[j].x - points[i].x;
                const dy = points[j].y - points[i].y;
                const distance = Math.max(1, Math.hypot(dx, dy));
                const repulsion = Math.min(16, 340000 / (distance * distance));
                push(i, j, (dx || (dy === 0 ? 1 : 0)) / distance * repulsion, dy / distance * repulsion);
            }
        }
        for (const [i, j] of springs) {
            const dx = points[j].x - points[i].x;
            const dy = points[j].y - points[i].y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const pull = (Math.max(320, radius * 0.45) - distance) * 0.04;
            push(i, j, dx / distance * pull, dy / distance * pull);
        }
        for (let i = 1; i < points.length; i++) {
            points[i].x += Math.max(-20, Math.min(20, deltas[i].x));
            points[i].y += Math.max(-20, Math.min(20, deltas[i].y));
        }
    }
    // Keep the relaxed positions wherever possible and move any overlapping cards
    // down until they clear the cards already placed, including the fixed gateway.
    for (let i = 1; i < points.length; i++) {
        const point = points[i];
        const neighbors = points.slice(0, i).filter(other => Math.abs(point.x - other.x) < cardWidth + 32);
        neighbors.sort((a, b) => a.y - b.y);
        for (const other of neighbors) {
            if (Math.abs(point.y - other.y) < cardHeight + 36) point.y = other.y + cardHeight + 36;
        }
    }
    return new Map(ids.map((id, i) => [id, points[i]]));
}

interface CardData extends Record<string, unknown> {
    title: string;
    name?: string;
    status: string;
    selected: boolean;
    queue?: NodeNetworkSnapshot['queue'];
    activate?: () => void;
    disabled?: boolean;
}

type GraphNode = Node<CardData, 'network-card'>;
type GraphEdge = Edge<{ label: string; accessibleLabel: string; activate: (trigger: HTMLButtonElement) => void; active: boolean; bend: number }, 'reported-hop'>;

function NetworkCard({ data }: NodeProps<GraphNode>) {
    const { title, name, status, selected, queue, activate, disabled } = data;
    const content = <>
        <strong title={name}>{selected && <span aria-hidden="true">✓ </span>}{title}{name && ` · ${name}`}</strong>
        <span>{status}</span>
        {queue && <span className="dw-network-queue">
            <meter min={0} max={100} value={queue.utilisation} aria-label="Transmit queue utilization" />
            <span>{queue.utilisation}%</span>
        </span>}
    </>;
    return <>
        {sides.map(side => <React.Fragment key={side}>
            <Handle id={side} type="target" position={side} className="dw-network-handle" />
            <Handle id={side} type="source" position={side} className="dw-network-handle" />
        </React.Fragment>)}
        {activate
            ? <button type="button" className="dw-network-card nodrag nopan" aria-pressed={selected}
                disabled={disabled} onClick={activate}>{content}</button>
            : <div className="dw-network-card">{content}</div>}
    </>;
}

function HopEdge(props: EdgeProps<GraphEdge>) {
    if (!props.data) return null;
    const { label, accessibleLabel, activate, active, bend } = props.data;
    const { sourceX, sourceY, targetX, targetY } = props;
    const [curve, middleX, middleY] = getBezierPath(props);
    const distance = Math.max(1, Math.hypot(targetX - sourceX, targetY - sourceY));
    const centerX = (sourceX + targetX) / 2;
    const centerY = (sourceY + targetY) / 2;
    const x = bend ? centerX - (targetY - sourceY) * bend / distance : middleX;
    const y = bend ? centerY + (targetX - sourceX) * bend / distance : middleY;
    const path = bend ? `M ${sourceX},${sourceY} Q ${2 * x - centerX},${2 * y - centerY} ${targetX},${targetY}` : curve;
    return <>
        <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={props.style} />
        <EdgeLabelRenderer>
            <button type="button" className="dw-network-edge-label nodrag nopan" aria-label={accessibleLabel}
                aria-pressed={active} onClick={event => activate(event.currentTarget)}
                style={{ transform: `translate(-50%, -50%) translate(${x}px,${y}px)` }}>{label}</button>
        </EdgeLabelRenderer>
    </>;
}

const nodeTypes = { 'network-card': NetworkCard };
const edgeTypes = { 'reported-hop': HopEdge };

function FitTopology({ layout }: { layout: Map<string, XYPosition> }) {
    const { setViewport, viewportInitialized } = useReactFlow();
    const width = useStore(state => state.width);
    const height = useStore(state => state.height);
    useEffect(() => {
        if (!viewportInitialized || width < 2 || height < 2) return;
        const points = Array.from(layout.values());
        const xs = points.map(point => point.x);
        const ys = points.map(point => point.y);
        const bounds = {
            x: Math.min(...xs) - cardWidth / 2,
            y: Math.min(...ys) - cardHeight / 2,
            width: Math.max(...xs) - Math.min(...xs) + cardWidth,
            height: Math.max(...ys) - Math.min(...ys) + cardHeight,
        };
        void setViewport(getViewportForBounds(bounds, width, height, 0.08, 1, 0.32));
    }, [setViewport, viewportInitialized, width, height, layout]);
    return null;
}

export default function NetworkGraph({ topology, selectedNode, snapshot, stale, connected, selectionDisabled,
    select, refresh, reading, canRead, inspectGateway }: {
    topology: ReturnType<typeof networkTopology>;
    selectedNode?: number;
    snapshot?: NodeNetworkSnapshot;
    stale: boolean;
    connected: boolean;
    selectionDisabled: boolean;
    select: (node: number) => boolean;
    refresh: () => void;
    reading: boolean;
    canRead: boolean;
    inspectGateway: () => void;
}) {
    const [focusedHop, setFocusedHop] = useState<string>();
    const hopTrigger = useRef<HTMLButtonElement>(null);
    const closeHop = () => {
        setFocusedHop(undefined);
        hopTrigger.current?.focus();
    };
    const hop = topology.hops.find(item => item.id === focusedHop);
    const pairs = new Map<string, ReportedHop[]>();
    const pairKey = (item: ReportedHop) => [item.from, item.to].sort().join(':');
    for (const hop of topology.hops) {
        const pair = pairKey(hop);
        const group = pairs.get(pair);
        if (group) group.push(hop);
        else pairs.set(pair, [hop]);
    }
    const layoutKey = JSON.stringify([topology.addresses, Array.from(pairs.keys()).sort()]);
    const layout = useMemo(() => {
        const [addresses, pairs]: [number[], string[]] = JSON.parse(layoutKey);
        return springLayout([gatewayId, ...addresses.map(nodeId)], pairs.map(pair => pair.split(':') as [string, string]));
    }, [layoutKey]);
    const eligible = new Set(topology.hops.flatMap(item => item.from === gatewayId ? item.routes.map(route => route.destination) : []));
    const isSelectedRoute = (item: ReportedHop) => item.routes.some(route =>
        route.inspected) || (item.from === nodeId(selectedNode ?? 0) && !stale);
    const nodes: GraphNode[] = [
        {
            id: gatewayId, type: 'network-card', style: { width: cardWidth, height: cardHeight }, position: layout.get(gatewayId)!,
            data: { title: 'Gateway', status: connected ? 'Connected' : topology.hops.length ? 'Last seen' : 'Waiting for feed', selected: false, activate: inspectGateway },
        },
        ...topology.addresses.map((address): GraphNode => ({
            id: nodeId(address), type: 'network-card', style: { width: cardWidth, height: cardHeight }, position: layout.get(nodeId(address))!,
            data: {
                title: `Node ${address}`, name: topology.names.get(address), selected: address === selectedNode,
                status: snapshot?.node === address
                    ? stale ? 'Node data · Last seen' : 'Node data · Snapshot'
                    : eligible.has(address) ? 'Gateway route' : 'Mentioned in route',
                queue: snapshot?.node === address ? snapshot?.queue : undefined,
                activate: eligible.has(address) || address === selectedNode ? () => {
                    if (select(address)) setFocusedHop(undefined);
                } : undefined,
                disabled: selectionDisabled && address !== selectedNode,
            },
        })),
    ];
    const edges: GraphEdge[] = topology.hops.map(item => {
        const from = layout.get(item.from)!;
        const to = layout.get(item.to)!;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        const sourceHandle = horizontal ? dx >= 0 ? Position.Right : Position.Left : dy >= 0 ? Position.Bottom : Position.Top;
        const targetHandle = horizontal ? dx >= 0 ? Position.Left : Position.Right : dy >= 0 ? Position.Top : Position.Bottom;
        const active = item.id === focusedHop;
        const highlighted = active || isSelectedRoute(item);
        const historical = item.routes.every(route => route.status === 'Last seen' || route.status === 'Expired' || route.status.startsWith('Interface down'));
        const stroke = highlighted ? 'var(--dw-color-accent)' : 'var(--dw-color-muted)';
        const pair = pairs.get(pairKey(item))!;
        const bend = (pair.indexOf(item) - (pair.length - 1) / 2) * 46 * (item.from < item.to ? 1 : -1);
        return {
            id: item.id, source: item.from, target: item.to, sourceHandle, targetHandle, type: 'reported-hop',
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
            style: { stroke, strokeWidth: highlighted ? 2.5 : 1.5, strokeDasharray: historical ? '5 4' : undefined },
            data: { label: item.transport, bend, accessibleLabel: `${item.reporter} to ${item.to === gatewayId ? 'gateway' : item.to.replace('node-', 'node ')} via ${item.transport}`,
                active, activate: trigger => {
                    hopTrigger.current = trigger;
                    setFocusedHop(active ? undefined : item.id);
                } },
        };
    });

    return <>
        <div className="dw-network-graph" aria-label="Observed network routes" role="region">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                nodeOrigin={[0.5, 0.5]} nodesDraggable={false} nodesConnectable={false}
                nodesFocusable={false} edgesFocusable={false} elementsSelectable={false}
                colorMode="dark" minZoom={0.08} maxZoom={2} proOptions={{ hideAttribution: true }}>
                <Background />
                <Controls showInteractive={false} />
                <FitTopology layout={layout} />
                <Panel position="top-left"><span className="dw-network-graph-status">
                    {connected || !topology.hops.length ? 'Observed next hops' : 'Last seen · Observed next hops'}
                </span></Panel>
                {selectedNode !== undefined && <Panel position="top-right">
                    <button type="button" className="btn btn-secondary" disabled={!canRead || reading} onClick={refresh}>
                        {reading ? 'Reading node network…' : 'Refresh node network'}
                    </button>
                </Panel>}
            </ReactFlow>
        </div>
        {hop && <HopDetails hop={hop} close={closeHop} />}
    </>;
}

function HopDetails({ hop, close }: { hop: ReportedHop; close: () => void }) {
    const details = useRef<HTMLElement>(null);
    useEffect(() => { details.current?.focus(); }, [hop.id]);
    return <section ref={details} tabIndex={-1} className="dw-panel mb-3" aria-label="Selected hop">
        <div className="dw-toolbar">
            <h3>{hop.reporter} → {hop.to === gatewayId ? 'Gateway' : hop.to.replace('node-', 'Node ')} · {hop.transport}</h3>
            <button type="button" className="btn btn-secondary" onClick={close}>Close hop details</button>
        </div>
        {hop.from !== gatewayId && <p className="dw-meta">Snapshot received at{' '}
            <time dateTime={new Date(hop.routes[0].receivedAt).toISOString()}>{new Date(hop.routes[0].receivedAt).toLocaleTimeString()}</time>
        </p>}
        <div className="table-responsive"><table className="table table-sm">
            <thead><tr><th>Destination</th><th>Cost</th><th>{hop.from === gatewayId ? 'Last heard' : 'Age at snapshot'}</th><th>Status</th></tr></thead>
            <tbody>{hop.routes.map(route => <tr key={route.destination}>
                <th scope="row">{route.destination}</th><td>{route.cost ?? '—'}</td>
                <td>{route.secondsAtRead === undefined ?
                    <time dateTime={new Date(route.receivedAt).toISOString()}>{new Date(route.receivedAt).toLocaleTimeString()}</time>
                    : `${route.secondsAtRead.toFixed(1)} s`}</td><td>{route.status}</td>
            </tr>)}</tbody>
        </table></div>
    </section>;
}
