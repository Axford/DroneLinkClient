import React, { useEffect, useMemo, useState } from 'react';
import { Background, Controls, Handle, Panel, Position, ReactFlow, useReactFlow, useStore } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NodeState } from '../dronelink/DroneLinkState';
import { DRONE_MODULE_PARAM_STATUS, DRONE_LINK_MSG_TYPE_UINT8_T } from '../dronelink/DroneLinkMsg';
import { compactReceiptAge } from '../dronelink/observedPositions';
import { probeBauds, probeModes, readProbeResults } from '../components/probeResults';
import { boardEndpoints, boardHeight, boardWidth, physicalDevices, springPositions } from './physicalDevices';
import type { PhysicalDevice } from './physicalDevices';
import { gpsPort, inspectNodeConfiguration, probePinSettings, setGpsPort, setPhysicalSetting } from './nodeConfiguration';
import type { ConfigurationOverview } from './nodeConfiguration';
import { candidates, canIdentify, hex, responseKey } from './i2cDiscovery';
import type { ResponseAddress, useI2cDiscovery } from './i2cDiscovery';
import './physicalWiring.css';
import boardImage from './DroneLinkV4PinOutSimple.png';

type BoardNode = Node<{ select: (endpoint: string) => void; selected?: string }, 'board'>;
type Detection = 'responded' | 'missing' | 'unchecked';
type DeviceNode = Node<{ device: PhysicalDevice; reading?: string; detection?: Detection; select: () => void }, 'device'>;

function BoardCard({ data }: NodeProps<BoardNode>) {
    return <div className="dw-physical-board" style={{ width: boardWidth, height: boardHeight }}>
        <img src={boardImage} alt="DroneLink V4 motherboard connector diagram" draggable={false} />
        {boardEndpoints.map(point => {
            const style = { left: point.x, top: point.y };
            return <React.Fragment key={point.id}>
                <Handle type="source" position={point.x > boardWidth / 2 ? Position.Right : Position.Left}
                    id={point.id} style={{ ...style, right: 'auto', transform: 'translate(-50%, -50%)' }} />
                <button type="button" className="dw-physical-endpoint nodrag nopan" aria-label={point.label} title={point.label}
                    aria-pressed={data.selected === point.id} style={style} onClick={() => data.select(point.id)} />
            </React.Fragment>;
        })}
    </div>;
}

function DeviceCard({ data }: NodeProps<DeviceNode>) {
    return <button type="button" className="dw-physical-device nodrag nopan" data-detection={data.detection} onClick={data.select}>
        <strong>{data.device.label}</strong>
        <span>Channel {data.device.module.channel}{data.device.gpio !== undefined && ` · ${modeLabel(data.device.mode)}`}{data.device.detail && ` · ${data.device.detail}`}</span>
        {data.reading && <span>{data.reading}</span>}
        <Handle type="target" position={Position.Left} id="left" />
        <Handle type="target" position={Position.Right} id="right" />
    </button>;
}

type GhostNode = Node<{ label: string; detail: string; select: () => void }, 'ghost'>;

function GhostCard({ data }: NodeProps<GhostNode>) {
    return <button type="button" className="dw-physical-device dw-i2c-ghost nodrag nopan" data-detection="responded" onClick={data.select}>
        <strong>{data.label}</strong>
        <span>{data.detail}</span>
        <Handle type="target" position={Position.Left} id="left" />
    </button>;
}

type EvidenceNode = Node<{ content: React.ReactNode }, 'evidence'>;

function EvidenceCard({ data }: NodeProps<EvidenceNode>) {
    return <section className="dw-physical-device dw-i2c-ghost dw-i2c-evidence nodrag nopan nowheel"
        data-detection="responded" aria-label="I²C device evidence">
        <Handle type="target" position={Position.Top} id="evidence" />
        {data.content}
    </section>;
}

function RevealEvidence({ device }: { device?: string }) {
    const { fitView } = useReactFlow();
    const height = useStore(state => state.nodeLookup.get('i2c-evidence')?.measured.height);
    useEffect(() => {
        if (!device || !height) return;
        const frame = requestAnimationFrame(() => {
            void fitView({ nodes: [{ id: 'board' }, { id: device }, { id: 'i2c-evidence' }], maxZoom: 1, duration: 180 });
        });
        return () => cancelAnimationFrame(frame);
    }, [device, fitView, height]);
    return null;
}

const nodeTypes = { board: BoardCard, device: DeviceCard, ghost: GhostCard, evidence: EvidenceCard };
const modeLabel = (mode?: string) => mode === 'digital' ? 'Digital' : mode === 'analog' ? 'Analog' :
    mode === 'analog,voltage' ? 'Analog with voltage estimate' : mode?.startsWith('serial,') ? `Serial · ${mode.split(',')[1]} baud` : 'Check mode in Code';

function readingFor(device: PhysicalDevice, observed: NodeState | undefined, available: boolean, now: number, since: number, storedPins: ReadonlyMap<string, string | undefined>) {
    if (device.gpio === undefined) return;
    if (!device.mode || !probeModes(device.gpio).includes(device.mode)) return 'Check mode in Code';
    const channel = observed?.channels[device.module.channel];
    if (!available) return 'Local observations unavailable';
    if (storedPins.get(device.id) !== device.mode) return 'Draft only · Upload and Restart to run';
    if (!channel || channel.type !== 'Probe') return 'Waiting for running Probe';
    const { rows, interval } = readProbeResults(channel);
    const row = rows.find(item => item.gpio === device.gpio);
    if (!row || !row.result.lastHeard || row.result.lastHeard < since) return 'Waiting for sample';
    const observedMode = row.mode === 1 ? 'digital' : row.mode === 2 ? 'analog' : row.mode === 3 ? `serial,${row.baud}` : undefined;
    if (observedMode !== device.mode.replace('analog,voltage', 'analog')) return 'Waiting for sample in draft mode';
    const activePins = rows.filter(item => item.mode && item.status !== 5).length;
    const maxAge = Math.max(5000, (interval || 1000) * Math.max(1, activePins) * 2);
    const status = channel.params[DRONE_MODULE_PARAM_STATUS];
    const disabled = status?.msgType === DRONE_LINK_MSG_TYPE_UINT8_T && status.values.length === 1 && status.values[0] === 0;
    const stale = disabled || now - row.result.lastHeard > maxAge;
    const state = stale ? 'Stale' : row.status === 5 ? 'Occupied or unavailable' : row.status === 0 ? 'Waiting' :
        row.status === 4 ? 'Incomplete' : row.status === 6 ? 'Failed' :
        row.description.endsWith('unavailable') && !row.description.includes('ADC counts') ? 'Invalid result' : 'Live';
    const voltage = row.mode === 2 ? ' · Voltage configuration unverified' : '';
    return `${state} · ${row.description} · ${compactReceiptAge(row.result.lastHeard, now)}${voltage}`;
}

function ProbeSettings({ gpio, value, onApply, editable }: {
    gpio: number; value?: string; onApply: (mode: string) => boolean; editable: boolean;
}) {
    const [mode, setMode] = useState(value?.split(',')[0] ?? 'digital');
    const [baud, setBaud] = useState(value?.startsWith('serial,') ? value.split(',')[1] : '9600');
    const [voltage, setVoltage] = useState(value === 'analog,voltage');
    const [failed, setFailed] = useState(false);
    const proposed = mode === 'serial' ? `serial,${baud}` : mode === 'analog' && voltage ? 'analog,voltage' : mode;
    const modes = probeModes(gpio);
    return <form onSubmit={event => { event.preventDefault(); setFailed(!onApply(proposed)); }}>
        <label className="d-block">Probe mode
            <select className="form-select" value={mode} disabled={!editable} onChange={event => setMode(event.target.value)}>
                <option value="digital">Digital</option>
                {modes.includes('analog') && <option value="analog">Analog</option>}
                <option value="serial">Serial</option>
            </select>
        </label>
        {mode === 'analog' && <label><input type="checkbox" checked={voltage} disabled={!editable}
            onChange={event => setVoltage(event.target.checked)} /> Estimate voltage</label>}
        {mode === 'serial' && <label className="d-block">Baud rate
            <select className="form-select" value={baud} disabled={!editable} onChange={event => setBaud(event.target.value)}>
                {probeBauds.map(rate => <option key={rate}>{rate}</option>)}
            </select>
        </label>}
        <button type="submit" className="btn btn-outline-secondary mt-2"
            disabled={!editable || proposed === value || !modes.includes(proposed)}>Set Probe mode in draft</button>
        {failed && <p role="alert">Could not update this declaration. Check the configuration in Code.</p>}
    </form>;
}

export default function PhysicalConfiguration({ board, onBoard, overview, text, node, observed, available, editable,
    selectedChannel, onSelect, onChange, goToLine, since, storedText, onCatalogue, selectedPin, setSelectedPin, diagnosticsAvailable, discovery, onI2cCatalogue }: {
    board: boolean;
    diagnosticsAvailable: boolean;
    onI2cCatalogue?: (target: ResponseAddress & { candidates: string[] }) => void;
    discovery: ReturnType<typeof useI2cDiscovery>;
    selectedPin?: string;
    setSelectedPin: (pin: string | undefined) => void;
    onBoard: (selected: boolean) => void;
    overview: ConfigurationOverview;
    text: string;
    node: number;
    observed?: NodeState;
    available: boolean;
    editable: boolean;
    selectedChannel?: number;
    onSelect: (channel: number | undefined) => void;
    onChange: (text: string) => void;
    goToLine: (line: number) => void;
    since: number;
    storedText?: string;
    onCatalogue?: (search: string, gpsConnector?: 1 | 2) => void;
}) {
    const [selectedGhost, setSelectedGhost] = useState<string>();
    const [selectedDevice, setSelectedDevice] = useState<string>();
    const [probeChannel, setProbeChannel] = useState<number>();
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    const devices = useMemo(() => physicalDevices(text, overview.modules), [text, overview]);
    const scan = discovery.scan;
    const responses = useMemo(() => scan?.channels.flatMap(({ channel, addresses }) =>
        addresses.map(address => ({ channel, address }))) ?? [], [scan]);
    const ghosts = useMemo(() => responses.filter(response => !devices.some(device => device.i2cAddress &&
        responseKey(device.i2cAddress) === responseKey(response))).map(response => ({
        ...response, id: `i2c:${responseKey(response)}`, connections: [`i${response.channel}`],
    })), [responses, devices]);
    const positions = useMemo(() => springPositions([...devices, ...ghosts]), [devices, ghosts]);
    const ghost = ghosts.find(item => item.id === selectedGhost);
    const selected = ghost ? undefined : devices.find(device => device.id === selectedDevice) ??
        (!selectedPin ? devices.find(device => device.module.channel === selectedChannel) : undefined);
    const point = boardEndpoints.find(endpoint => endpoint.id === selectedPin);
    const storedPins = useMemo(() => new Map(storedText ? physicalDevices(storedText, inspectNodeConfiguration(storedText, node).modules)
        .filter(device => device.gpio !== undefined).map(device => [device.id, device.mode]) : []), [storedText, node]);
    const readings = new Map(devices.map(device => [device.id, readingFor(device, observed, available, now, since, storedPins)]));
    const probes = overview.modules.filter(module => module.type === 'Probe');
    const gpio = selected?.gpio ?? point?.gpio;
    const probe = selected?.gpio !== undefined ? selected.module :
        probes.find(module => module.channel === probeChannel) ?? probes[0];
    const pinValues = probe && gpio !== undefined ? probePinSettings(text, probe).get(gpio)?.values : undefined;
    const mode = pinValues?.length === 1 ? pinValues[0] : undefined;
    const otherProbe = gpio === undefined ? undefined : devices.find(device => device.gpio === gpio && device.module.channel !== probe?.channel);
    const suggestedModule = point?.id.startsWith('i') ? undefined : point?.id === '13' || point?.id === '16' ? 'GPS' :
        gpio !== undefined && probeModes(gpio).length ? 'Probe' : undefined;
    const occupants = point ? devices.filter(device => device.gpio === undefined && device.connections.includes(point.id)) : [];

    const selectedAddress = ghost ?? selected?.i2cAddress;
    const target = selectedAddress && responses.find(response => responseKey(response) === responseKey(selectedAddress));
    const identification = target && discovery.results[responseKey(target)];
    const selectedBus = point?.id.startsWith('i') ? Number(point.id.slice(1)) : undefined;

    function chooseGhost(id: string) {
        setSelectedGhost(id);
        setSelectedDevice(undefined);
        setSelectedPin(undefined);
        onSelect(undefined);
    }

    function chooseDevice(device: PhysicalDevice) {
        setSelectedGhost(undefined);
        setSelectedDevice(device.id);
        setSelectedPin(undefined);
        setFailed(false);
        onSelect(device.module.channel);
    }

    function update(edit: { text: string } | undefined) {
        setFailed(!edit);
        if (!edit) return false;
        onChange(edit.text);
        return true;
    }

    const nodes: (BoardNode | DeviceNode | GhostNode | EvidenceNode)[] = [{ id: 'board', type: 'board', position: { x: 0, y: 0 }, data: {
        selected: selectedPin, select: id => { setSelectedPin(id); setSelectedGhost(undefined); setSelectedDevice(undefined); onSelect(undefined); setFailed(false); },
    } }];
    function detectionFor(device: PhysicalDevice): Detection | undefined {
        const address = device.i2cAddress;
        if (!address || !scan) return;
        if (responses.some(response => responseKey(response) === responseKey(address))) return 'responded';
        return scan.channels[address.channel]?.status === 'complete' && address.address !== scan.multiplexer
            ? 'missing' : 'unchecked';
    }

    function deviceEvidence(device: PhysicalDevice, detection?: Detection) {
        if (detection === 'missing') return 'No response on configured channel';
        if (detection === 'unchecked') return 'Address not checked';
        if (detection !== 'responded' || !device.i2cAddress) return;
        const result = discovery.results[responseKey(device.i2cAddress)];
        if (!result) return 'Address responded';
        return result.match ? `Signature matches ${result.match}` : 'Address responded · Identification inconclusive';
    }

    const edges: Edge[] = devices.flatMap(device => {
        const position = positions.get(device.id)!;
        const right = position.x > 0;
        const detection = detectionFor(device);
        nodes.push({ id: device.id, type: 'device', position, selected: selected?.id === device.id, data: {
            device, detection, reading: readings.get(device.id) ?? deviceEvidence(device, detection), select: () => chooseDevice(device),
        } });
        return Array.from(new Set(device.connections)).filter(id => boardEndpoints.some(endpoint => endpoint.id === id))
            .map(id => ({ id: `${id}-${device.id}`, source: 'board', sourceHandle: id, target: device.id,
                targetHandle: right ? 'left' : 'right', ariaLabel: `${boardEndpoints.find(endpoint => endpoint.id === id)!.label} to ${device.label}`,
                style: { stroke: device.gpio === undefined ? 'var(--dw-color-primary)' : 'var(--dw-color-text)', strokeWidth: 2 } }));
    });

    for (const item of ghosts) {
        const match = discovery.results[responseKey(item)]?.match;
        const names = candidates(item.address);
        const label = `Detected ${hex(item.address)}`;
        nodes.push({ id: item.id, type: 'ghost', position: positions.get(item.id)!, selected: ghost?.id === item.id, data: {
            label, detail: match ? `Signature matches ${match}` : names.length ? `Possible: ${names.join(', ')}` : 'Unknown device',
            select: () => chooseGhost(item.id),
        } });
        edges.push({ id: item.id, source: 'board', sourceHandle: item.connections[0], target: item.id, targetHandle: 'left',
            ariaLabel: `I²C channel ${item.channel} to detected ${hex(item.address)}`,
            style: { stroke: 'var(--dw-color-text)', strokeWidth: 2, strokeDasharray: '5 4' } });
    }

    const evidenceDevice = target ? ghost?.id ?? selected?.id : undefined;
    if (target && evidenceDevice) {
        nodes.push({ id: 'i2c-evidence', type: 'evidence', position: { x: 55, y: boardHeight + 26 }, data: {
            content: <>
                <strong>I²C channel {target.channel} · {hex(target.address)}</strong>
                <p className="dw-meta">Address responded · {new Date(scan!.receivedAt).toLocaleTimeString()}</p>
                {candidates(target.address).length > 0 && <p>Possible: {candidates(target.address).join(', ')}</p>}
                <button type="button" className="btn btn-outline-secondary"
                    disabled={!diagnosticsAvailable || !!discovery.busy || !canIdentify(target.address)}
                    onClick={() => discovery.identify(target)}>Identify device</button>
                {ghost && onI2cCatalogue && candidates(target.address).length > 0 &&
                    <button type="button" className="btn btn-outline-secondary ms-2" onClick={() =>
                        onI2cCatalogue({ ...target, candidates: identification?.match ? [identification.match] : candidates(target.address) })}>
                        Review module assignment
                    </button>}
                {!canIdentify(target.address) && <p className="dw-meta">No reviewed register signature for this address.</p>}
                {discovery.busy?.startsWith('Reading') && <span role="status">Reading register…</span>}
                {identification && <>
                    <p>{identification.match ? `Matched ${identification.match}` : 'Identification inconclusive'}
                        {' · '}{new Date(identification.receivedAt).toLocaleTimeString()}</p>
                    {identification.error && <p role="alert">{identification.error}</p>}
                    <ul>{identification.reads.map(read => <li key={read.register}>
                        Register {hex(read.register)} · {read.status.replace(/-/g, ' ')}{read.bytes.length ? ` · ${read.bytes.map(hex).join(' ')}` : ''}
                    </li>)}</ul>
                    <a href={identification.source} target="_blank" rel="noreferrer">Signature datasheet</a>
                </>}
            </>,
        } });
        edges.push({ id: 'i2c-evidence-link', source: 'board', sourceHandle: `i${target.channel}`, target: 'i2c-evidence',
            targetHandle: 'evidence', ariaLabel: `I²C channel ${target.channel} register evidence`,
            style: { stroke: 'var(--dw-color-success)', strokeDasharray: '5 4' } });
    }

    const serial = selected?.module.type === 'NMEA' ? gpsPort(text, selected.module) : undefined;
    const i2c = selected?.bus === true;

    return <section aria-label="Physical configuration">
        <label className="d-block mb-2">Motherboard
            <select className="form-select" value={board ? 'v4' : ''} onChange={event => onBoard(event.target.value === 'v4')}>
                <option value="">Select motherboard</option>
                <option value="v4">DroneLink V4</option>
            </select>
        </label>
        {board && <>
            <p className="dw-meta">V4 selected manually. Wires show draft assignments. Probe readings come from the running node.</p>
            <div className="dw-toolbar mb-2">
                <button type="button" className="btn btn-outline-secondary" disabled={!diagnosticsAvailable || !!discovery.busy}
                    onClick={discovery.scanAll}>Scan I²C</button>
                {!diagnosticsAvailable && <span className="dw-meta">I²C diagnostics require an available local Wi-Fi route.</span>}
                {discovery.busy?.startsWith('Scanning') && <span role="status">{discovery.busy}</span>}
            </div>
            {discovery.error && <p role="alert">{discovery.error}</p>}
            <div className="dw-config-graph dw-physical-graph" role="region" aria-label="Physical wiring graph">
                <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="dark" fitView minZoom={0.08}
                    nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null}>
                    <Background /><Controls showInteractive={false} />
                    <RevealEvidence device={evidenceDevice} />
                    {scan && <Panel position="top-left" className="dw-i2c-coverage">
                        <div>{scan.channels.filter(channel => channel.status === 'complete').length}/8 channels complete</div>
                        {scan.channels.filter(channel => channel.status !== 'complete').map(channel =>
                            <div key={channel.channel} className="text-warning">Channel {channel.channel} · {channel.status.replace(/-/g, ' ')}</div>)}
                    </Panel>}
                </ReactFlow>
            </div>
            <div className="dw-toolbar mb-2">
                <label>Find connector
                    <select className="form-select" value={selectedPin ?? ''} onChange={event => {
                        setSelectedPin(event.target.value || undefined); setSelectedGhost(undefined); setSelectedDevice(undefined); onSelect(undefined); setFailed(false);
                    }}>
                        <option value="">Select connector</option>
                        {boardEndpoints.map(endpoint => <option key={endpoint.id} value={endpoint.id}>{endpoint.label}</option>)}
                    </select>
                </label>
                <label>Find wired module
                    <select className="form-select" value={selected?.id ?? ''} onChange={event => {
                        const device = devices.find(item => item.id === event.target.value);
                        if (device) chooseDevice(device);
                        else { setSelectedDevice(undefined); onSelect(undefined); }
                    }}>
                        <option value="">Select module</option>
                        {devices.map(device => <option key={device.id} value={device.id}>{device.label} · Channel {device.module.channel}</option>)}
                    </select>
                </label>
                {ghosts.length > 0 && <label>Find detected device
                    <select className="form-select" value={ghost?.id ?? ''} onChange={event => chooseGhost(event.target.value)}>
                        <option value="">Select detected device</option>
                        {ghosts.map(item => <option key={item.id} value={item.id}>I²C channel {item.channel} · {hex(item.address)}</option>)}
                    </select>
                </label>}
            </div>
            {point && <p className="dw-meta">{point.label}{occupants.length > 0 &&
                ` · Assigned in draft to ${occupants.map(device => `${device.label} (channel ${device.module.channel})`).join(', ')}`}</p>}
            {point && suggestedModule && onCatalogue && <button type="button" className="btn btn-outline-secondary mb-2"
                onClick={() => onCatalogue(suggestedModule, point.id === '13' ? 1 : point.id === '16' ? 2 : undefined)}>Find {suggestedModule} in catalogue</button>}
            {selectedBus !== undefined && scan && <p className="dw-meta">
                Last scan: {scan.channels[selectedBus]?.status.replace(/-/g, ' ')}
            </p>}
            {otherProbe && <p className="dw-meta">GPIO {gpio} also has a Probe declaration on channel {otherProbe.module.channel}.</p>}
            {selected && <div className="dw-config-module">
                <strong>{selected.label} · Channel {selected.module.channel}</strong>
                <p className="dw-meta mb-1">{selected.mode ? modeLabel(selected.mode) : selected.detail}</p>
                {readings.get(selected.id) && <p className="dw-meta">{readings.get(selected.id)}</p>}
                {selected.connections.some(id => !boardEndpoints.some(endpoint => endpoint.id === id)) &&
                    <p className="dw-meta">A configured pin has no marked connector on this pinout.</p>}
                {serial !== undefined && <label>GPS serial port
                    <select className="form-select" disabled={!editable} value={serial} onChange={event =>
                        update(setGpsPort(text, node, selected.module.channel, event.target.value))}>
                        {serial === 'default' && <option value="default">Serial 1 (firmware default)</option>}
                        <option value="1">Serial 1</option><option value="2">Serial 2</option>
                    </select>
                </label>}
                {i2c && <label>I²C channel
                    <select className="form-select" aria-label="I²C channel" disabled={!editable} value={selected.connections[0]?.slice(1) ?? ''}
                        onChange={event => update(setPhysicalSetting(text, node, selected.module.channel, { bus: Number(event.target.value) }))}>
                        <option value="" disabled>Check bus in Code</option>
                        {Array.from({ length: 8 }, (_, channel) => <option key={channel} value={channel}>{channel}</option>)}
                    </select>
                </label>}
                <button type="button" className="btn btn-link" onClick={() => goToLine(selected.module.line)}>View declaration in Code</button>
                {failed && <p role="alert">Could not update this declaration. Check the configuration in Code.</p>}
            </div>}
            {gpio !== undefined && !!probeModes(gpio).length && <>
                {!probe ? <p className="dw-meta">Add a Probe module to configure GPIO {gpio}.</p> : <>
                    {probes.length > 1 && selected?.gpio === undefined && <label>Probe channel
                        <select className="form-select" value={probe.channel} onChange={event => setProbeChannel(Number(event.target.value))}>
                            {probes.map(module => <option key={module.channel} value={module.channel}>{module.name || module.type} · {module.channel}</option>)}
                        </select>
                    </label>}
                    {pinValues && !mode ? <p className="dw-meta">Check repeated pin declarations in Code.</p> :
                        <ProbeSettings key={`${probe.channel}:${gpio}:${mode}`} gpio={gpio} value={mode}
                            editable={editable && ((!occupants.length && !otherProbe) || !!mode)}
                            onApply={value => {
                                const applied = update(setPhysicalSetting(text, node, probe.channel, { gpio, mode: value }));
                                if (applied) { setSelectedPin(undefined); setSelectedDevice(`${probe.channel}:${gpio}`); onSelect(probe.channel); }
                                return applied;
                            }} />}
                </>}
            </>}
        </>}
    </section>;
}
