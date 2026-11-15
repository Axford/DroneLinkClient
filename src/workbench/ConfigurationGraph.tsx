import { useEffect, useId, useMemo, useState } from 'react';
import {
    Background, Controls, Handle, MarkerType, Position, ReactFlow, useUpdateNodeInternals,
} from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Code, ExclamationTriangleFill, Pencil } from 'react-bootstrap-icons';
import '@xyflow/react/dist/style.css';
import { useMeasuredGraphNodes } from './useMeasuredGraphNodes';
import { draftPublications, editDraftParameter, editDraftSource, moduleSettings, toggleDraftPublication } from './nodeConfiguration';
import type { ConfigurationDiagnostic, ConfigurationOverview } from './nodeConfiguration';
import { matchedCatalogueEntry } from './ModuleCatalogue';
import type { Catalogue } from './ModuleCatalogue';
import type { ConfigurationParameter } from './moduleSettings';
import ConfigurationParameterInput from './ConfigurationParameterInput';

type Module = ConfigurationOverview['modules'][number];
type Subscription = Module['subscriptions'][number];
type ModuleNode = Node<{
    module: Module;
    outputs: string[];
    parameters?: ConfigurationParameter[];
    knownInputs: ConfigurationParameter[];
    legacyInputs: Subscription[];
    visibleOutputs: string[];
    configured: Map<string, string[]>;
    publications: Set<string>;
    editSource?: (key: string, value: string) => boolean;
    editParameter?: (parameter: ConfigurationParameter, value: string) => boolean;
    publish?: (parameter: ConfigurationParameter, enabled: boolean) => boolean;
    warnings: ConfigurationDiagnostic[];
    onModule: (module: Module) => void;
    onInput?: (module: Module, subscription: Subscription) => void;
    goToLine: (line: number) => void;
}, 'module'>;

function WarningIndicator({ warnings, goToLine }: {
    warnings: ConfigurationDiagnostic[];
    goToLine: (line: number) => void;
}) {
    const id = useId();
    if (!warnings.length) return null;
    const messages = warnings.map(({ line, message }) => `Line ${line}: ${message}`);
    return <OverlayTrigger placement="top" overlay={<Tooltip id={id}>
        {messages.map(message => <div key={message}>{message}</div>)}
    </Tooltip>}>
        <button type="button" className="btn btn-sm nodrag nopan dw-config-warning"
            aria-label={`Configuration warning. ${messages.join(' ')}`}
            onClick={event => { event.stopPropagation(); goToLine(warnings[0].line); }}>
            <ExclamationTriangleFill aria-hidden="true" />
        </button>
    </OverlayTrigger>;
}

function ModuleCard({ id, data }: NodeProps<ModuleNode>) {
    const { module, outputs, parameters, knownInputs, legacyInputs, visibleOutputs, configured, publications,
        editSource, editParameter, publish, warnings, onInput, onModule, goToLine } = data;
    const name = module.name || module.type;
    const [rejectedPublication, setRejectedPublication] = useState<string>();
    const headerWarnings = warnings.filter(warning => !module.subscriptions.some(input => input.line === warning.line));
    const updateHandles = useUpdateNodeInternals();
    const handles = JSON.stringify([module.subscriptions.map(input => [input.line, input.sourceChannel !== undefined]), outputs,
        visibleOutputs, knownInputs.map(parameter => parameter.sourceAddress)]);
    useEffect(() => { updateHandles(id); }, [id, handles, updateHandles]);

    return <div className="dw-config-graph-module" data-parameters={!!parameters || undefined}>
        <div className="dw-config-graph-title" data-warning={headerWarnings.length > 0 || undefined}>
            <div>
                <button type="button" className="btn btn-sm nodrag nopan p-0 text-start fw-semibold"
                    title={module.name || module.type}
                    onClick={event => { event.stopPropagation(); onModule(module); }}>{parameters && <span aria-hidden="true" className="dw-config-channel">{module.channel} · </span>}{name}</button>
                <small title={module.type}>{parameters ? module.type : `${module.name ? module.type + ' · ' : ''}Channel ${module.channel}`}</small>
            </div>
            <span className="dw-config-graph-actions">
                <WarningIndicator warnings={headerWarnings} goToLine={goToLine} />
                <button type="button" className="btn btn-sm nodrag nopan" aria-label={`Open module in Code at line ${module.line}`}
                    title={`Open in Code at line ${module.line}`} onClick={event => { event.stopPropagation(); goToLine(module.line); }}>
                    <Code aria-hidden="true" />
                </button>
            </span>
        </div>
        {!parameters && !module.subscriptions.length && !visibleOutputs.length &&
            <div className="dw-config-graph-empty dw-meta">No subscriptions declared</div>}
        {parameters && (knownInputs.length > 0 || legacyInputs.length > 0) && <div className="dw-config-graph-section">Inputs</div>}
        {knownInputs.map(parameter => {
            const key = '$' + parameter.name;
            const input = module.subscriptions.find(item => item.input === key);
            const inputWarnings = warnings.filter(warning => warning.line === input?.line);
            const ambiguous = module.subscriptions.filter(item => item.input === key).length > 1;
            return <div key={key} className="dw-config-graph-port dw-config-typed-input" data-warning={inputWarnings.length > 0 || undefined}>
                {input?.sourceChannel !== undefined && <Handle id={String(input.line)} type="target" position={Position.Left} />}
                <div className="dw-config-graph-source">
                    <strong>{parameter.name}</strong>
                    <small className="dw-meta" title={`Value parameter ID ${parameter.address}`}>{parameter.sourceAddress} · {parameterShape(parameter)}</small>
                </div>
                <div className="dw-config-graph-source">
                    <ConfigurationParameterInput label={`${name} ${parameter.name} source`} value={input?.source ?? ''}
                        placeholder="Unbound" disabled={!editSource || ambiguous} onCommit={value => !!editSource?.(key, value)} />
                    {input && <small className="dw-meta" title={input.resolution}>{input.resolution}</small>}
                </div>
                <WarningIndicator warnings={inputWarnings} goToLine={goToLine} />
            </div>;
        })}
        {legacyInputs.map(input => {
            const inputWarnings = warnings.filter(warning => warning.line === input.line);
            return <div className="dw-config-graph-port dw-config-graph-input" key={input.line} data-warning={inputWarnings.length > 0 || undefined}>
                {input.sourceChannel !== undefined && <Handle id={String(input.line)} type="target" position={Position.Left} />}
                <div className="dw-config-graph-source">
                    <button type="button" className="btn btn-link btn-sm nodrag nopan p-0 text-start"
                        title={`Open in Code at line ${input.line}`} onClick={event => { event.stopPropagation(); goToLine(input.line); }}>{input.input}</button>
                    <code title={input.source}>{input.source}</code>
                    <small className="dw-meta" title={input.resolution}>{input.resolution}</small>
                </div>
                <span className="dw-config-graph-actions">
                    <WarningIndicator warnings={inputWarnings} goToLine={goToLine} />
                    {onInput && <button type="button" className="btn btn-sm nodrag nopan"
                        aria-label={`Edit source for ${input.input} on channel ${module.channel}`} title="Edit source"
                        onClick={event => { event.stopPropagation(); onInput(module, input); }}><Pencil aria-hidden="true" /></button>}
                </span>
            </div>;
        })}
        {parameters && visibleOutputs.length > 0 && <>
            <div className="dw-config-graph-section">Outputs</div>
            <div className="dw-config-parameter-columns dw-config-parameter-labels" aria-hidden="true">
                <span>ID</span><span>Name</span><span>Shape</span><span>Draft value</span><span>Pub</span>
            </div>
        </>}
        {visibleOutputs.map(output => {
            const parameter = parameters?.find(item => item.name === output);
            const wired = outputs.includes(output);
            const handle = wired && <Handle id={output} type="source" position={Position.Right} />;
            if (!parameters) return <div className="dw-config-graph-port dw-config-graph-output" key={output}>
                <span title={output}>{output}</span>{handle}
            </div>;
            const values = configured.get(output) ?? [];
            const published = parameter?.alwaysPublished === true || publications.has(output);
            const ambiguous = values.length > 1;
            return <div className="dw-config-graph-port dw-config-parameter-columns" key={output}>
                <span className="dw-meta">{parameter?.address ?? '—'}</span>
                <span className="dw-config-parameter-name" title={output}>{output}</span>
                <span className="dw-meta">{parameter ? parameterShape(parameter) : '—'}</span>
                {parameter?.configurable && !parameter.runtimeOnly ?
                    <ConfigurationParameterInput label={`${name} ${output} draft value`} value={values[0] ?? ''}
                        placeholder={parameter.defaultValue ?? '—'} hint={parameter.defaultValue && `Firmware default: ${parameter.defaultValue}`} disabled={!editParameter || ambiguous}
                        onCommit={value => !!editParameter?.(parameter, value)} /> :
                    <span className="dw-meta" title={parameter?.runtimeOnly ? 'Runtime command' : 'No editable draft value'}>{values[0] ?? '—'}</span>}
                {parameter ? <button type="button" role="switch" className="nodrag nopan dw-config-publish"
                    aria-label={`Publish ${name} ${output}`} aria-checked={published}
                    aria-disabled={!publish || parameter.alwaysPublished || parameter.runtimeOnly}
                    title={parameter.alwaysPublished ? 'Always published by the firmware' : parameter.runtimeOnly ? 'Runtime command' : 'Publish in the draft'}
                    onClick={event => {
                        event.stopPropagation();
                        if (!publish || parameter.alwaysPublished || parameter.runtimeOnly) return;
                        setRejectedPublication(publish(parameter, !published) ? undefined : output);
                    }} /> : <span className="dw-meta" title={published ? 'Declared in publish' : undefined}>{published ? 'On' : '—'}</span>}
                {rejectedPublication === output && <small role="status" className="dw-config-publish-error">Review this publish list in Code.</small>}
                {handle}
            </div>;
        })}
    </div>;
}

function parameterShape(parameter: ConfigurationParameter) {
    return `${parameter.type === 'c' ? 'CHAR' : parameter.type.toUpperCase()}×${parameter.count}`;
}

const nodeTypes = { module: ModuleCard };

export default function ConfigurationGraph({ overview, text, node, catalogue, showAllParameters, editable, onChange, selected, onSelect, onModule, onInput, goToLine }: {
    overview: ConfigurationOverview;
    text: string;
    node: number;
    catalogue?: Catalogue;
    showAllParameters: boolean;
    editable: boolean;
    onChange: (text: string) => void;
    selected?: number;
    onSelect: (channel: number) => void;
    onModule: ModuleNode['data']['onModule'];
    onInput: ModuleNode['data']['onInput'];
    goToLine: ModuleNode['data']['goToLine'];
}) {
    const { modules, diagnostics } = overview;
    const { nodes, edges, fileWarnings } = useMemo(() => {
        const warningsByModule = new Map<number, ConfigurationDiagnostic[]>();
        const fileWarnings: ConfigurationDiagnostic[] = [];
        for (const diagnostic of diagnostics) {
            if (diagnostic.severity !== 'warning') continue;
            if (diagnostic.moduleChannel === undefined) {
                fileWarnings.push(diagnostic);
            } else {
                const warnings = warningsByModule.get(diagnostic.moduleChannel) ?? [];
                warnings.push(diagnostic);
                warningsByModule.set(diagnostic.moduleChannel, warnings);
            }
        }
        const parametersByChannel = new Map(modules.map(module =>
            [module.channel, matchedCatalogueEntry(catalogue, module.type)?.parameters]));
        const outputs = new Map<number, Set<string>>();
        const edges: Edge[] = [];
        for (const target of modules) {
            for (const input of target.subscriptions) {
                if (input.sourceChannel === undefined) continue;
                const { parameter } = input.address;
                const sourceParameters = parametersByChannel.get(input.sourceChannel);
                const output = sourceParameters?.find(item => item.name === parameter || String(item.address) === parameter)?.name ?? parameter;
                const ports = outputs.get(input.sourceChannel) ?? new Set<string>();
                ports.add(output);
                outputs.set(input.sourceChannel, ports);
                const active = target.channel === selected || input.sourceChannel === selected;
                const stroke = active ? 'var(--dw-color-text)' : 'var(--dw-color-primary)';
                edges.push({
                    id: String(input.line), source: String(input.sourceChannel), target: String(target.channel),
                    sourceHandle: output, targetHandle: String(input.line),
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
            const parameters = parametersByChannel.get(module.channel);
            const configured = moduleSettings(text, module);
            const publications = draftPublications(configured);
            const subscribedKeys = new Set(module.subscriptions.map(input => input.input));
            const visibleOutputs = Array.from(new Set([
                ...(parameters ?? []).filter(parameter => showAllParameters || outputPorts.includes(parameter.name))
                    .map(parameter => parameter.name),
                ...(showAllParameters ? Array.from(publications) : []),
                ...outputPorts,
            ]));
            const knownInputs = parameters?.filter(parameter => parameter.sourceAddress !== undefined &&
                (showAllParameters || subscribedKeys.has('$' + parameter.name))) ?? [];
            const knownKeys = new Set(knownInputs.map(parameter => '$' + parameter.name));
            const legacyInputs = module.subscriptions.filter(input => !knownKeys.has(input.input));
            const inputCount = knownInputs.length + legacyInputs.length;
            const column = module.subscriptions.length ? 1 : outputPorts.length ? 0 :
                edges.length ? 2 : nextY.indexOf(Math.min(...nextY));
            const y = nextY[column];
            const height = parameters
                ? 54 + (inputCount ? 25 : 0) + knownInputs.length * 58 + legacyInputs.length * 64 +
                    (visibleOutputs.length ? 49 + visibleOutputs.length * 34 : 0)
                : 54 + inputCount * 64 + (inputCount || visibleOutputs.length ? 0 : 26) + visibleOutputs.length * 26;
            nextY[column] += height + 18;
            function apply(result: string | undefined) {
                if (result === undefined) return false;
                if (result !== text) onChange(result);
                return true;
            }
            return {
                id: String(module.channel), type: 'module', initialWidth: parameters ? 340 : 274, initialHeight: height,
                position: { x: column * 408, y },
                selected: selected === module.channel,
                ariaLabel: `${module.name || module.type}, channel ${module.channel}`,
                data: { module, outputs: outputPorts, parameters, knownInputs, legacyInputs, visibleOutputs, configured, publications,
                    editSource: editable ? (key, value) => apply(editDraftSource(text, node, module.channel, key, value)) : undefined,
                    editParameter: editable ? (parameter, value) => apply(editDraftParameter(text, node, module.channel, parameter, value)) : undefined,
                    publish: editable ? (parameter, enabled) => apply(toggleDraftPublication(text, node, module.channel, parameter, enabled)) : undefined,
                    warnings: warningsByModule.get(module.channel) ?? [], onInput, onModule, goToLine },
            };
        });
        return { nodes, edges, fileWarnings };
    }, [modules, diagnostics, catalogue, editable, showAllParameters, node, text, onChange, onInput, onModule, goToLine, selected]);

    const { measuredNodes, rememberMeasurements } = useMeasuredGraphNodes(nodes);

    if (!modules.length) return <p>No valid module declarations in the draft.
        <WarningIndicator warnings={fileWarnings} goToLine={goToLine} />
    </p>;

    return <div className="dw-config-graph dw-logical-graph" role="region" aria-label="Subscription graph">
        <ReactFlow nodes={measuredNodes} edges={edges} onNodesChange={rememberMeasurements} nodeTypes={nodeTypes} colorMode="dark"
            fitView fitViewOptions={{ maxZoom: 1 }} minZoom={0.2}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}
            onNodeClick={(_, node) => onSelect(Number(node.id))}>
            <Background />
            <Controls showInteractive={false} />
            <div className="dw-config-graph-caption dw-meta" data-warning={fileWarnings.length > 0 || undefined}>
                Draft subscriptions · Live connections unverified
                <WarningIndicator warnings={fileWarnings} goToLine={goToLine} />
            </div>
        </ReactFlow>
    </div>;
}
