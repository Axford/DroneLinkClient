import React, { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { DomainLens, DomainLensPanels, DomainWorkspace } from '../components/DomainWorkspace';
import PrimaryNavBar from '../PrimaryNavBar';
import type { User } from '../App';
import type { GlobalState } from '../dronelink/DroneLinkState';
import ObservedMap from '../components/ObservedMap';
import NodeInspector from '../components/NodeInspector';
import NodeSelector from '../components/NodeSelector';
import NodeFiles from './NodeFiles';
import ChannelList from '../components/ChannelList';
import { InspectorSessionProvider } from '../components/InspectorSession';
import { ObservationNamesContext } from '../components/parameterPresentation';
import { Transport, transportLabel, transports, useWorkbenchFeed, WorkbenchCapture } from './useWorkbenchFeed';
import type { NodeNetworkSnapshot } from './NodeNetwork';
import WorkbenchNetwork from './WorkbenchNetwork';
import { LiveCapture, seriesLimit } from './liveCharts/capture';
import { signalCatalogue, Signal, SignalPlotContext } from './liveCharts/catalogue';
import './workbench.css';

const LiveCharts = lazy(() => import('./liveCharts/LiveCharts'));
type Routing = Parameters<WorkbenchCapture['routes']>;
const transportKey = (gateway: string, node?: number) => `workbench-transport:${gateway}:${node}`;
const gatewayAddresses = (interfaces: Routing[2]) => transports.map(transport => interfaces[transport]?.address ?? '-').join('/');

type Selection = 'auto' | Transport;

function readChoice(key: string): Selection {
    try {
        const choice = window.localStorage.getItem(key);
        if (choice === 'wifi' || choice === 'serial') return choice;
    } catch { /* The current page still works with browser storage disabled. */ }
    return 'auto';
}

function localTime(timestamp: number) {
    const date = new Date(timestamp);
    return <time dateTime={date.toISOString()}>{date.toLocaleTimeString()}</time>;
}

export default function WorkbenchPage() {
    const [capture] = useState(() => new LiveCapture());
    const [capturing, setCapturing] = useState(false);
    const [showCharts, setShowCharts] = useState(false);
    const [inspection, setInspection] = useState<import('./liveCharts/LiveCharts').ChartInspection>({});
    React.useEffect(() => {
        if (!capturing) return;
        const timer = setInterval(() => capture.advance(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [capture, capturing]);
    const [series, setSeries] = useState<Signal[]>([]);
    const [separate, setSeparate] = useState<Record<string, boolean>>({});
    const choices = useRef<Record<string, Selection>>({});
    const retainedSignals = useRef(new Map<string, Signal>());
    const lastRoutes = useRef<Routing | undefined>(undefined);
    const captureFeed = useMemo<WorkbenchCapture>(() => ({
        routes(routes, paths, interfaces) {
            lastRoutes.current = [routes, paths, interfaces];
            const gateway = gatewayAddresses(interfaces);
            for (const id of Array.from(new Set([...Object.keys(routes), ...Object.keys(paths.wifi), ...Object.keys(paths.serial)]))) {
                const node = Number(id);
                const key = transportKey(gateway, node);
                const choice = choices.current[key] ?? readChoice(key);
                const source = choice === 'auto' ? routes[node]?.transport : choice;
                const available = source && paths[source][node]?.reachable && (choice !== 'auto' || routes[node]?.reachable);
                capture.source(node, available ? source : undefined);
            }
        },
        packet(bytes, message, time, transport) {
            capture.record(bytes, message, time, transport);
        },
        disconnect() {
            lastRoutes.current = undefined;
            capture.disconnect();
        },
    }), [capture]);
    const feed = useWorkbenchFeed(undefined, captureFeed);
    const { status, routes, paths, observations, interfaces } = feed;
    const [mapToken, setMapToken] = useState<string | null>();
    const [lens, setLens] = useState<DomainLens>('nodes');
    const mapView = React.useRef<User['mapState']>(undefined);
    const [selectedNode, selectNode] = useState<number>();
    const [files, setFiles] = useState({ busy: false, dirty: false });
    const reportFiles = useCallback((busy: boolean, dirty: boolean) => setFiles({ busy, dirty }), []);
    const [overrides, setOverrides] = useState(choices.current);
    const connected = status === 'connected';
    const gateway = gatewayAddresses(interfaces);
    const key = transportKey(gateway, selectedNode);
    const choiceFor = useCallback((id: number | undefined) => {
        const address = transportKey(gateway, id);
        return overrides[address] ?? readChoice(address);
    }, [gateway, overrides]);
    const choice = choiceFor(selectedNode);
    const autoRoute = selectedNode === undefined ? undefined : routes[selectedNode];
    const active = choice === 'auto' ? autoRoute?.transport : choice;
    const path = active && selectedNode !== undefined ? paths[active][selectedNode] : undefined;
    const node = active && selectedNode !== undefined ? observations[active][selectedNode] : undefined;
    const readNode = connected && active === 'wifi' && path?.reachable && path.nextHop === selectedNode
        ? async (signal: AbortSignal): Promise<NodeNetworkSnapshot> => {
            const response = await fetch(`/api/workbench/v1/nodes/${selectedNode}/network?transport=wifi`, { cache: 'no-store', signal });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || 'Node network snapshot unavailable.');
            return body;
        } : undefined;
    const configured = transports.filter(transport => interfaces[transport]);
    const nodes = useMemo(() => Array.from(new Set([...Object.keys(routes), ...Object.keys(paths.wifi), ...Object.keys(paths.serial)].map(Number)))
        .sort((a, b) => a - b), [routes, paths]);
    const showTransport = configured.length > 0;

    React.useEffect(() => {
        if (lens !== 'map' || mapToken !== undefined) return;
        const controller = new AbortController();
        void fetch('/api/workbench/v1/map-config', { signal: controller.signal, cache: 'no-store' })
            .then(response => response.ok ? response.json() : null)
            .then(config => {
                if (!controller.signal.aborted) setMapToken(typeof config?.mapboxAccessToken === 'string' ? config.mapboxAccessToken : null);
            })
            .catch(() => { if (!controller.signal.aborted) setMapToken(null); });
        return () => controller.abort();
    }, [lens, mapToken]);

    function setChoice(value: Selection) {
        choices.current = { ...choices.current, [key]: value };
        if (lastRoutes.current) captureFeed.routes(...lastRoutes.current);
        setOverrides(choices.current);
        try { window.localStorage.setItem(key, value); }
        catch { /* The selection is retained for this page. */ }
    }

    function select(id: number) {
        if (id === selectedNode) return true;
        if (files.busy || (files.dirty && !window.confirm('Discard the unsaved node file draft?'))) return false;
        selectNode(id);
        return true;
    }

    const localNodes = useMemo<GlobalState>(() => Object.fromEntries(nodes.map(id => {
        const route = routes[id];
        const preference = choiceFor(id);
        const transport = preference === 'auto' ? route?.transport : preference;
        const observed = transport ? observations[transport][id] : undefined;
        return [id, observed ?? { id, channels: {}, lastHeard: route?.lastHeardAtMs ?? 0, interface: 'Local' }];
    })), [nodes, routes, choiceFor, observations]);
    const catalogue = useMemo(() => showCharts || capturing ? signalCatalogue(localNodes) : [], [showCharts, capturing, localNodes]);
    React.useEffect(() => {
        if (!capturing) return;
        for (const signal of catalogue) {
            if (retainedSignals.current.has(signal.id) || retainedSignals.current.size < 4096) retainedSignals.current.set(signal.id, signal);
        }
    }, [catalogue, capturing]);
    function addSignals(signals: Signal[]) {
        setSeries(previous => [...previous, ...signals.filter(signal => !previous.some(item => item.id === signal.id))].slice(0, seriesLimit));
    }
    function plot(node: number, channel: number, parameter: number) {
        const candidates = signalCatalogue(localNodes).filter(signal =>
            signal.node === node && signal.channel === channel && signal.parameter === parameter);
        if (candidates.length === 1) addSignals(candidates);
        setSearch(candidates.length > 1 ? `${node}>${channel}.${parameter}.` : '');
        setShowCharts(true);
    }
    const [search, setSearch] = useState('');
    const selector = <NodeSelector inline local nodes={Object.values(localNodes)}
        selectedNodeId={selectedNode ?? null} onNodeSelect={select} selectionDisabled={files.busy} now={Date.now()}
        status={id => connected ? routes[id]?.reachable ? 'Reachable' : 'Route expired' : 'Gateway disconnected'} />;
    const transportChoice = selectedNode !== undefined && showTransport && <label className="dw-workbench-transport">Transport
        <select className="form-select" value={choice} disabled={files.busy} onChange={event => setChoice(event.target.value as Selection)}>
            <option value="auto">Auto</option>
            {transports.map(transport => <option key={transport} value={transport} disabled={!interfaces[transport]}>{transportLabel[transport]}</option>)}
        </select>
    </label>;
    const modules = selectedNode === undefined ? <p>Select a node to inspect its observations.</p> : <>
        <p>Node {selectedNode} · Local{showTransport && active ? ` · ${transportLabel[active]}` : ''}{node && (!connected || !path?.reachable) ? ' · Last seen' : ''}</p>
        {choice !== 'auto' && transports.filter(transport => transport !== choice).map(transport => {
            const reading = observations[transport][selectedNode];
            return reading && <p className="dw-meta" key={transport}>{transportLabel[transport]} last received {localTime(reading.lastHeard)}. Hidden by transport selection.</p>;
        })}
        {!node && <p>{connected && path?.reachable ? 'Waiting for publications.' : 'Local route unavailable.'}</p>}
        {node && active && <InspectorSessionProvider key={active} nodes={observations[active]} inventoryComplete={false}>
            <ObservationNamesContext.Provider value={observations[active]}>
                <ChannelList key={node.id} node={node} sampleLive={connected && !!path?.reachable} />
            </ObservationNamesContext.Provider>
        </InspectorSessionProvider>}
    </>;



    return <div className="dw-workspace" data-bs-theme="dark"><PrimaryNavBar standalone domains={[]} /><main className="content-wrapper workspace-operations">
        <DomainWorkspace name="Workbench" activeLens={showCharts ? undefined : lens} onLensChange={next => { setShowCharts(false); setLens(next); }}
            lensAction={<button type="button" className={`nav-link ${showCharts ? 'active' : ''}`} aria-pressed={showCharts}
                onClick={() => setShowCharts(current => !current)}>Live charts{capturing && ' · Capturing'}</button>}
            status={<span className="dw-status" role="status">{connected ? 'Local gateway connected' : status === 'connecting' ?
                'Connecting to local gateway…' : 'Local gateway disconnected. Reconnecting…'}</span>}>
            <SignalPlotContext.Provider value={plot}>
            <DomainLensPanels overMap={!showCharts && lens === 'map'} lens={showCharts ? <Suspense fallback={<p role="status">Loading live charts…</p>}>
                <LiveCharts capture={capture} connected={connected} onCapturing={running => {
                        if (running) retainedSignals.current = new Map(catalogue.slice(0, 4096).map(signal => [signal.id, signal]));
                        setCapturing(running);
                    }} catalogue={catalogue} retainedSignals={retainedSignals.current}
                    inspection={inspection} setInspection={setInspection} series={series} addSignal={signal => addSignals([signal])} removeSignal={id => setSeries(previous => previous.filter(signal => signal.id !== id))}
                    separate={separate} setSeparate={(id, value) => setSeparate(previous => ({ ...previous, [id]: value }))}
                    search={search} onSearch={setSearch} />
            </Suspense> : lens === 'map' ? mapToken === undefined ? <p role="status">Loading map…</p> : <ObservedMap local token={mapToken} user={null} viewState={mapView}
                state={localNodes} selectedNodeId={selectedNode ?? null} onNodeSelect={select} selectionDisabled={files.busy} /> : <div className={`dw-workbench-lens dw-workbench-lens-${lens}`}>
                {lens === 'network' ? <WorkbenchNetwork feed={feed} selectedNode={selectedNode} select={select} selectionDisabled={files.busy} nodeTransport={choice === 'auto' ? undefined : choice} inspectedTransport={active || undefined} readNode={readNode} /> : selector}
            </div>} inspector={<NodeInspector key={selectedNode} selected={selectedNode !== undefined}
                context={transportChoice} modules={modules}
                files={selectedNode !== undefined && <NodeFiles node={selectedNode} transport={active}
                    available={connected && !!path?.reachable} uptimeMs={path?.uptimeMs} observed={node} activity={reportFiles} />} />} />
            </SignalPlotContext.Provider>
        </DomainWorkspace>
    </main></div>;
}
