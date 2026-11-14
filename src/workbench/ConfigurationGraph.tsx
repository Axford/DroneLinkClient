import { useEffect, useMemo } from 'react';
import {
    Background, Controls, Handle, MarkerType, Position, ReactFlow, useUpdateNodeInternals,
} from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMeasuredGraphNodes } from './useMeasuredGraphNodes';
import type { ConfigurationOverview } from './nodeConfiguration';

type Module = ConfigurationOverview['modules'][number];
type Subscription = Module['subscriptions'][number];
type ModuleNode = Node<{
    module: Module;
    outputs: string[];
    onSelect: (channel: number) => void;
    onInput: (module: Module, subscription: Subscription) => void;
}, 'module'>;

function ModuleCard({ id, data }: NodeProps<ModuleNode>) {
    const { module, outputs, onInput, onSelect } = data;
    const updateHandles = useUpdateNodeInternals();
    const handles = JSON.stringify([module.subscriptions.map(input => [input.line, input.sourceChannel !== undefined]), outputs]);
    useEffect(() => { updateHandles(id); }, [id, handles, updateHandles]);

    return <div className="dw-config-graph-module">
        <div className="dw-config-graph-title">
            <button type="button" className="btn btn-sm nodrag nopan p-0 text-start fw-semibold"
                onClick={event => { event.stopPropagation(); onSelect(module.channel); }}>{module.name || module.type}</button>
            <small>{module.name && `${module.type} · `}Channel {module.channel}</small>
        </div>
        {module.subscriptions.map(input =>
            <div className="dw-config-graph-port" key={input.line}>
                {input.sourceChannel !== undefined && <Handle id={String(input.line)} type="target" position={Position.Left} />}
                <button type="button" className="btn btn-sm nodrag nopan" onClick={() => onInput(module, input)}
                    title={`${input.source} · ${input.resolution}`}>
                    {input.input}{input.sourceChannel === undefined && ' ↗'}
                </button>
            </div>)}
        {outputs.map(parameter => <div className="dw-config-graph-port dw-config-graph-output" key={parameter}>
            {parameter}<Handle id={parameter} type="source" position={Position.Right} />
        </div>)}
    </div>;
}

const nodeTypes = { module: ModuleCard };

export default function ConfigurationGraph({ modules, selected, onSelect, onInput }: {
    modules: Module[];
    selected?: number;
    onSelect: (channel: number) => void;
    onInput: ModuleNode['data']['onInput'];
}) {
    const { nodes, edges } = useMemo(() => {
        const outputs = new Map<number, Set<string>>();
        const edges: Edge[] = [];
        for (const target of modules) {
            for (const input of target.subscriptions) {
                if (input.sourceChannel === undefined) continue;
                const { parameter } = input.address;
                const ports = outputs.get(input.sourceChannel) ?? new Set<string>();
                ports.add(parameter);
                outputs.set(input.sourceChannel, ports);
                const active = target.channel === selected || input.sourceChannel === selected;
                const stroke = active ? 'var(--dw-color-text)' : 'var(--dw-color-primary)';
                edges.push({
                    id: String(input.line), source: String(input.sourceChannel), target: String(target.channel),
                    sourceHandle: parameter, targetHandle: String(input.line),
                    ariaLabel: `${input.resolution}, parameter ${parameter}, to channel ${target.channel} ${input.input}`,
                    style: { stroke, strokeWidth: active ? 3 : 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
                });
            }
        }

        // Place publishers to the left of subscribers. Allow a module to be both.
        const nextY = [0, 0];
        const nodes = modules.map((module): ModuleNode => {
            const column = module.subscriptions.length ? 1 : 0;
            const outputPorts = Array.from(outputs.get(module.channel) ?? []);
            const y = nextY[column];
            nextY[column] += 84 + 32 * (module.subscriptions.length + outputPorts.length);
            return {
                id: String(module.channel), type: 'module',
                position: { x: column * 295, y },
                selected: selected === module.channel,
                ariaLabel: `${module.name || module.type}, channel ${module.channel}`,
                data: { module, outputs: outputPorts, onInput, onSelect },
            };
        });
        return { nodes, edges };
    }, [modules, onInput, onSelect, selected]);

    const { measuredNodes, rememberMeasurements } = useMeasuredGraphNodes(nodes);

    if (!modules.length) return <p>No valid module declarations in the draft.</p>;

    return <div className="dw-config-graph" role="region" aria-label="Subscription graph">
        <ReactFlow nodes={measuredNodes} edges={edges} onNodesChange={rememberMeasurements} nodeTypes={nodeTypes} colorMode="dark"
            fitView fitViewOptions={{ maxZoom: 1 }} minZoom={0.2}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
            onNodeClick={(_, node) => onSelect(Number(node.id))}>
            <Background />
            <Controls showInteractive={false} />
        </ReactFlow>
    </div>;
}
