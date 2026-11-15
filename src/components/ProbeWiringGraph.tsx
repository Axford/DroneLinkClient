import React from 'react';
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import MotherboardCard from '../workbench/MotherboardCard';
import type { BoardNode } from '../workbench/MotherboardCard';
import { springPositions } from '../workbench/motherboardDiagrams';
import type { MotherboardDiagram } from '../workbench/motherboardDiagrams';
import { useMeasuredGraphNodes } from '../workbench/useMeasuredGraphNodes';
import { probePinName } from './probeResults';

type PinNode = Node<{ card: React.ReactNode; side: Position }, 'pin'>;

function ConnectedPin({ data }: NodeProps<PinNode>) {
    return <div className="dw-probe-connected-pin">{data.card}<Handle type="target" position={data.side} /></div>;
}

const nodeTypes = { board: MotherboardCard, pin: ConnectedPin };

export default function ProbeWiringGraph({ diagram, pins }: {
    diagram: MotherboardDiagram;
    pins: { gpio: number; card: React.ReactNode }[];
}) {
    const positions = springPositions(pins.map(({ gpio }) => ({ id: String(gpio), connections: [String(gpio)] })), diagram, 112);
    const cardY = Array.from(positions.values(), position => position.y);
    const extent = cardY.length ? Math.max(...cardY) - Math.min(...cardY) + 100 : 0;
    const boardY = extent > diagram.height ? Math.min(...cardY) + (extent - diagram.height) / 2 : 0;
    const nodes: (BoardNode | PinNode)[] = [{
        id: 'board', type: 'board', position: { x: 0, y: boardY },
        data: { diagram, pins: pins.map(pin => String(pin.gpio)) },
    }];
    const edges: Edge[] = [];
    for (const { gpio, card } of pins) {
        const id = String(gpio);
        const position = positions.get(id)!;
        nodes.push({ id, position, type: 'pin', data: { card, side: position.x < 0 ? Position.Right : Position.Left } });
        edges.push({ id: `wire-${id}`, source: 'board', sourceHandle: id, target: id,
            ariaLabel: `Virtual wire to ${probePinName(gpio)}` });
    }
    const { measuredNodes, rememberMeasurements } = useMeasuredGraphNodes(nodes);
    return <div className="dw-probe-graph" role="region" aria-label="Probe wiring graph"
        style={{ maxHeight: Math.max(350, extent * 0.7) }}>
        <ReactFlow nodes={measuredNodes} edges={edges} onNodesChange={rememberMeasurements} nodeTypes={nodeTypes}
            colorMode="dark" fitView fitViewOptions={{ padding: 0.08, maxZoom: 1 }} minZoom={0.1}
            zIndexMode="manual" defaultEdgeOptions={{ zIndex: 1, style: {
                stroke: 'var(--dw-color-instrument-reading)', strokeWidth: 2,
            } }}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false}
            nodesFocusable={false} edgesFocusable={false} elementsSelectable={false} deleteKeyCode={null}
            zoomOnScroll={false}>
            <Background /><Controls position="top-right" showInteractive={false} />
        </ReactFlow>
    </div>;
}
