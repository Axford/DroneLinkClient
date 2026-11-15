import { useEffect, useMemo } from 'react';
import {
    Background, Controls, Handle, MarkerType, Position, ReactFlow, useUpdateNodeInternals,
} from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import { Code, Pencil } from 'react-bootstrap-icons';
import '@xyflow/react/dist/style.css';
import { useMeasuredGraphNodes } from './useMeasuredGraphNodes';
import type { ConfigurationOverview } from './nodeConfiguration';

type Module = ConfigurationOverview['modules'][number];
type Subscription = Module['subscriptions'][number];
type ModuleNode = Node<{
    module: Module;
    outputs: string[];
    onModule: (module: Module) => void;
    onInput?: (module: Module, subscription: Subscription) => void;
    goToLine: (line: number) => void;
}, 'module'>;

function ModuleCard({ id, data }: NodeProps<ModuleNode>) {
    const { module, outputs, onInput, onModule, goToLine } = data;
    const updateHandles = useUpdateNodeInternals();
    const handles = JSON.stringify([module.subscriptions.map(input => [input.line, input.sourceChannel !== undefined]), outputs]);
    useEffect(() => { updateHandles(id); }, [id, handles, updateHandles]);

    return <div className="dw-config-graph-module">
        <div className="dw-config-graph-title">
            <div>
                <button type="button" className="btn btn-sm nodrag nopan p-0 text-start fw-semibold"
                    title={module.name || module.type}
                    onClick={event => { event.stopPropagation(); onModule(module); }}>{module.name || module.type}</button>
                <small title={module.type}>{module.name && `${module.type} · `}Channel {module.channel}</small>
            </div>
            <button type="button" className="btn btn-sm nodrag nopan" aria-label={`Open module in Code at line ${module.line}`}
                title={`Open in Code at line ${module.line}`} onClick={event => { event.stopPropagation(); goToLine(module.line); }}>
                <Code aria-hidden="true" />
            </button>
        </div>
        {!module.subscriptions.length && <div className="dw-config-graph-empty dw-meta">No subscriptions declared</div>}
        {module.subscriptions.map(input =>
            <div className="dw-config-graph-port dw-config-graph-input" key={input.line}>
                {input.sourceChannel !== undefined && <Handle id={String(input.line)} type="target" position={Position.Left} />}
                <div className="dw-config-graph-source">
                    <button type="button" className="btn btn-link btn-sm nodrag nopan p-0 text-start"
                        title={`Open in Code at line ${input.line}`} onClick={event => { event.stopPropagation(); goToLine(input.line); }}>{input.input}</button>
                    <code title={input.source}>{input.source}</code>
                    <small className="dw-meta" title={input.resolution}>{input.resolution}</small>
                </div>
                {onInput && <button type="button" className="btn btn-sm nodrag nopan"
                    aria-label={`Edit source for ${input.input} on channel ${module.channel}`} title="Edit source"
                    onClick={event => { event.stopPropagation(); onInput(module, input); }}><Pencil aria-hidden="true" /></button>}
            </div>)}
        {outputs.map(parameter => <div className="dw-config-graph-port dw-config-graph-output" key={parameter}>
            <span title={parameter}>{parameter}</span><Handle id={parameter} type="source" position={Position.Right} />
        </div>)}
    </div>;
}

const nodeTypes = { module: ModuleCard };

export default function ConfigurationGraph({ modules, selected, onSelect, onModule, onInput, goToLine }: {
    modules: Module[];
    selected?: number;
    onSelect: (channel: number) => void;
    onModule: ModuleNode['data']['onModule'];
    onInput: ModuleNode['data']['onInput'];
    goToLine: ModuleNode['data']['goToLine'];
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

        // Place publishers to the left of subscribers and pack unconnected modules alongside them.
        const nextY = [0, 0, 0];
        const nodes = modules.map((module): ModuleNode => {
            const outputPorts = Array.from(outputs.get(module.channel) ?? []);
            const column = module.subscriptions.length ? 1 : outputPorts.length ? 0 :
                edges.length ? 2 : nextY.indexOf(Math.min(...nextY));
            const y = nextY[column];
            const height = 54 + (module.subscriptions.length ? 64 * module.subscriptions.length : 26) + 26 * outputPorts.length;
            nextY[column] += height + 16;
            return {
                id: String(module.channel), type: 'module', initialWidth: 274, initialHeight: height,
                position: { x: column * 342, y },
                selected: selected === module.channel,
                ariaLabel: `${module.name || module.type}, channel ${module.channel}`,
                data: { module, outputs: outputPorts, onInput, onModule, goToLine },
            };
        });
        return { nodes, edges };
    }, [modules, onInput, onModule, goToLine, selected]);

    const { measuredNodes, rememberMeasurements } = useMeasuredGraphNodes(nodes);

    if (!modules.length) return <p>No valid module declarations in the draft.</p>;

    return <div className="dw-config-graph dw-logical-graph" role="region" aria-label="Subscription graph">
        <ReactFlow nodes={measuredNodes} edges={edges} onNodesChange={rememberMeasurements} nodeTypes={nodeTypes} colorMode="dark"
            fitView fitViewOptions={{ maxZoom: 1 }} minZoom={0.2}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
            onNodeClick={(_, node) => onSelect(Number(node.id))}>
            <Background />
            <Controls showInteractive={false} />
            <div className="dw-config-graph-caption dw-meta">Draft subscriptions · Live connections unverified</div>
        </ReactFlow>
    </div>;
}
