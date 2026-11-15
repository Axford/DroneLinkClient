import { ParameterEditorProvider } from './commands/ParameterEditor';
import { cloudParameterPath, localParameterPath } from './commands/parameterPaths';
import type { Scope } from './commands/session';
import type { RouteTraceResult } from './workbench/RouteTrace';
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import WorkspaceShell from './components/WorkspaceShell';
import PageFeedback from './components/ui/PageFeedback';
import { DomainLens, DomainLensPanels, DomainWorkspace, WorkspaceStatus } from './components/DomainWorkspace';
import NodeSelector from './components/NodeSelector';
import type { NodeNetworkSnapshot } from './workbench/NodeNetwork';
import WorkbenchNetwork from './workbench/WorkbenchNetwork';
import ObservedMap from './components/ObservedMap';
import { NodeMapSettings, NodeMapSettingsProvider } from './components/NodeMapSettings';
import { Domain, User } from './App';
import { accessEvent, affectsDomain, ApiError, authenticatedFetch, authenticatedFetchJson } from './utils/api';
import { useDroneLinkState } from './dronelink/useDroneLinkState';
import { CommandScope } from './commands/session';
import InspectorPanel from './components/InspectorPanel';
import { InspectorSessionProvider } from './components/InspectorSession';
import NodeFiles from './workbench/NodeFiles';
import { transportLabel } from './workbench/useWorkbenchFeed';
import { useConnectedWorkbench } from './workbench/connectedWorkbench';
import { ConnectedLocalInspector, GatewayConnection, SourceChoice } from './workbench/ConnectedWorkbenchControls';
import { VisualizationSettingsNotice, VisualizationSettingsProvider } from './components/VisualizationSettings';


interface DomainDetailPageProps {}

const DomainDetailPage: React.FC<DomainDetailPageProps> = () => {
    const { domainId } = useParams<{ domainId: string }>();
    const mapView = useMemo<React.MutableRefObject<User['mapState']>>(() => ({ current: undefined }), [domainId]);
    const refreshGeneration = useRef(0);
    const statusRef = useRef<string | undefined>(undefined);
    const selectedDomain = useRef(domainId); selectedDomain.current = domainId;
    
    const [domain, setDomain] = useState<Domain | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mapboxToken, setMapboxToken] = useState<string | null>(null);
    const [gatewayOpen, setGatewayOpen] = useState(false);
    const [lens, setLens] = useState<DomainLens>('map');
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    
    const fileActivity = useRef({ busy: false, dirty: false });
    const [filesBusy, setFilesBusy] = useState(false);
    const recordFileActivity = useCallback((busy: boolean, dirty: boolean) => { fileActivity.current = { busy, dirty }; setFilesBusy(busy); }, []);
    function selectNode(node: number | null) {
        if (node === selectedNodeId) return true;
        if (fileActivity.current.busy || (fileActivity.current.dirty && !window.confirm('Discard the unsaved node file draft?'))) return false;
        setSelectedNodeId(node);
        return true;
    }
    const workbench = useConnectedWorkbench(domain?.status === 'active' && domain._id === domainId && user ? domainId : undefined);
    const currentLocal = useRef(workbench.usesLocal);
    currentLocal.current = workbench.usesLocal;
    const canCloudTarget = useCallback((node: number) => !currentLocal.current(node), []);

    const editableDomain = !loading && !error && domain?._id === domainId && domain?.status === 'active' &&
        domain.canEdit === true && user ? JSON.stringify([user._id, domain._id]) : undefined;
    const editAuthority = useRef<{ scope: string } | undefined>(undefined);
    useLayoutEffect(() => {
        if (!editableDomain) editAuthority.current = undefined;
        else if (editAuthority.current?.scope !== editableDomain) editAuthority.current = { scope: editableDomain };
    }, [editableDomain, domain]);
    useLayoutEffect(() => () => { editAuthority.current = undefined; }, []);

    // DroneLink state management
    const droneLinkState = useDroneLinkState();
    const { loadSharedObservations, stopStreaming, reset } = droneLinkState;

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        refreshGeneration.current++;
        setLoading(true); setError(null); setDomain(null); setSelectedNodeId(null); setLens('map'); setGatewayOpen(false); reset();
        const fetchData = async () => {
            if (!domainId) {
                setError('Domain ID not provided');
                setLoading(false);
                return;
            }

            try {
                // Fetch domain, user, and config in parallel
                const [domainResponse, userResponse, configResponse] = await Promise.all([
                    authenticatedFetch(`/api/domains/${domainId}`, { signal: controller.signal }),
                    authenticatedFetch('/api/user', { signal: controller.signal }),
                    authenticatedFetch('/api/config', { signal: controller.signal })
                ]);

                const domainResult = await domainResponse.json();
                const userResult = await userResponse.json();
                const configResult = await configResponse.json();

                if (!domainResponse.ok) {
                    throw new Error(domainResult.message || 'Failed to fetch domain');
                }

                if (!userResponse.ok) {
                    throw new Error('Failed to fetch user data');
                }

                if (!configResponse.ok) {
                    throw new Error(configResult.message || 'Failed to fetch config');
                }

                if (!active) return;
                setDomain(domainResult.data); statusRef.current = domainResult.data.status;
                setUser(userResult);
                setMapboxToken(configResult.data.mapboxAccessToken);
                
                await loadSharedObservations(domainId, domainResult.data.status !== 'archived');
            } catch (err) {
                if (active && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to fetch data');
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchData();
        return () => { active = false; controller.abort(); stopStreaming(); };
    }, [domainId, loadSharedObservations, stopStreaming, reset]);

    const refreshDomain = useCallback(async () => {
        if (!domainId) return;
        const generation = ++refreshGeneration.current;
        let result: { data: Domain };
        try { result = await authenticatedFetchJson(`/api/domains/${domainId}`); }
        catch (error) {
            if (selectedDomain.current !== domainId || generation !== refreshGeneration.current) return;
            throw error;
        }
        if (selectedDomain.current !== domainId || generation !== refreshGeneration.current) return;
        if (result.data.status !== 'active' || !result.data.canEdit) editAuthority.current = undefined;
        const wasArchived = statusRef.current === 'archived'; statusRef.current = result.data.status;
        setDomain(previous => previous?._id === result.data._id ? result.data : previous);
        if (result.data.status === 'archived') stopStreaming();
        else if (wasArchived) await loadSharedObservations(domainId);
    }, [domainId, stopStreaming, loadSharedObservations]);
    useEffect(() => {
        let active = true;
        const refresh = () => { void refreshDomain().catch(error => { if (active && error instanceof ApiError && [401, 403, 404].includes(error.status)) { stopStreaming(); reset(); setSelectedNodeId(null); setDomain(null); setError(error.message); } }); };
        const accessChanged = (event: Event) => {
            if (!domainId || !affectsDomain(event, domainId)) return;
            const { status, url, method } = (event as CustomEvent).detail || {};
            const commandMutation = typeof url === 'string' && /\/command(?:s|-(?:submissions|settings))(?:\/|$)/.test(url) &&
                ['POST', 'PATCH'].includes(method);
            if (status === 401 || status === 403) editAuthority.current = undefined;
            if (status === 403 && commandMutation) {
                setDomain(previous => previous && { ...previous, canEdit: false, canManageMembers: false });
                refresh();
                return;
            }
            if (status === 401 || status === 403) {
                refreshGeneration.current++; stopStreaming(); reset(); setSelectedNodeId(null); setDomain(null);
                setError(status === 401 ? 'Sign in again to continue.' : 'Domain access denied.');
            } else refresh();
        };
        const timer = setInterval(refresh, 15000); window.addEventListener('focus', refresh); window.addEventListener(accessEvent, accessChanged);
        return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(accessEvent, accessChanged); };
    }, [domainId, refreshDomain, stopStreaming, reset]);

    if (loading || (domain !== null && domain._id !== domainId)) return <PageFeedback loading message="Loading observations…" />;
    if (error || !domain || !user) return <PageFeedback message={error || 'Domain not found'}><Link to="/private/">Home</Link></PageFeedback>;

    const state = workbench.mixed(droneLinkState.state);
    const local = selectedNodeId !== null && workbench.usesLocal(selectedNodeId);
    const archived = domain.status === 'archived';
    const showGateway = domain.status === 'active' && window.isSecureContext;
    const sharedUpdates = droneLinkState.observationStatus;
    const gatewayStatus = workbench.paired ? (workbench.status === 'connected' ? 'Local gateway connected'
        : workbench.status === 'reconnecting' ? 'Local gateway reconnecting…' : 'Connecting to local gateway…') : '';
    const statusLabel = archived ? 'Archived · Read-only' : workbench.error ? 'Local gateway connection issue'
        : sharedUpdates === 'ready' && gatewayStatus ? gatewayStatus : `Shared updates: ${sharedUpdates}`;
    const compactUpdates: Record<string, string> = {
        idle: 'Updates idle', loading: 'Loading updates', resynchronising: 'Resyncing',
        ready: 'Updates ready', retrying: 'Retrying', stopped: 'Updates stopped',
    };
    const shortStatus = archived ? 'Read-only' : workbench.error ? 'Gateway issue'
        : sharedUpdates === 'ready' && gatewayStatus ? 'Gateway ' + workbench.status
        : compactUpdates[sharedUpdates] ?? sharedUpdates;
    const canReadFiles = archived
        ? user.isPlatformAdmin === true || domain.myRole === 'owner' || domain.myRole === 'editor'
        : domain.canEdit;
    const localTransport = selectedNodeId === null ? undefined : workbench.transport(selectedNodeId);
    const localObservation = local && localTransport && selectedNodeId !== null
        ? workbench.network?.observations[localTransport][selectedNodeId] : undefined;
    const files = selectedNodeId === null || !canReadFiles
        ? <div className="inspector-content">{selectedNodeId === null
            ? 'Select a node to browse its files.'
            : 'Node files are available to Domain Owners, Editors and Platform Admins.'}</div>
        : <NodeFiles key={`${domain._id}:${archived ? 'archived' : 'active'}`} node={selectedNodeId} activity={recordFileActivity} domainId={domain._id}
            readOnly={archived} available={!archived && workbench.fileBackups && local && !!workbench.transport(selectedNodeId)}
            transport={archived ? undefined : localTransport} observed={archived ? undefined : localObservation} snapshot={state}
            connected={!archived && workbench.fileBackups ? { request: (endpoint, options, path) =>
                workbench.fileRequest(selectedNodeId, endpoint, options, path) } : undefined} />;
    const lensContent = lens === 'map'
        ? <ObservedMap key={domain._id} domainId={domain._id} token={mapboxToken}
            user={user} viewState={mapView} state={state} selectedNodeId={selectedNodeId} onNodeSelect={selectNode} selectionDisabled={filesBusy} />
        : <div className="dw-workbench-lens">
            {workbench.network
                ? <WorkbenchNetwork key={workbench.networkSession?.key} feed={workbench.network} selectedNode={selectedNodeId ?? undefined} select={selectNode}
                    selectionDisabled={filesBusy} inspectedTransport={local ? localTransport : undefined}
                    traceRoute={editableDomain && local && localTransport && selectedNodeId !== null
                        ? signal => workbench.traceRoute<RouteTraceResult>(selectedNodeId, signal) : undefined}
                    readNode={!archived && local && localTransport === 'wifi' && selectedNodeId !== null &&
                        workbench.network.status === 'connected' && workbench.network.paths.wifi[selectedNodeId]?.reachable &&
                        workbench.network.paths.wifi[selectedNodeId].nextHop === selectedNodeId
                        ? signal => workbench.readNetwork<NodeNetworkSnapshot>(selectedNodeId, signal) : undefined} />
                : <p>{archived ? 'Live gateway routes are unavailable for archived Domains. Select a node to inspect retained observations.'
                    : 'Pair a local gateway to see live routes.'}</p>}
            <NodeSelector inline nodes={Object.values(state)} selectedNodeId={selectedNodeId} onNodeSelect={selectNode}
                selectionDisabled={filesBusy} now={Date.now()} />
        </div>;
    const commandScope: Scope = {
        userId: user._id, domainId: domain._id, canSubmit: editableDomain !== undefined, captureEditAccess: () => {
            const authority = editAuthority.current;
            return () => authority !== undefined && editAuthority.current === authority;
        },
        canSettings: domain.status === 'active' && domain.canManageMembers, canTarget: canCloudTarget
    };
    return <CommandScope.Provider key={`${user._id}:${domain._id}`} value={commandScope}><WorkspaceShell user={user} activeDomain={domain}>
        <ParameterEditorProvider resolve={(target, pinned) => {
            const node = target.nodeAddress;
            const local = workbench.usesLocal(node);
            if (pinned === 'cloud' || (!pinned && !local)) return cloudParameterPath(commandScope, droneLinkState.state, target, local);
            const selected = workbench.transport(node);
            const pair = workbench.networkSession;
            const transport = pinned ? pinned.endsWith(':wifi') ? 'wifi' : 'serial' : selected;
            if (!pair || !transport) return;
            const id = `${pair.key}:${transport}`;
            return localParameterPath(target, { id, transport,
                available: commandScope.canSubmit && local && selected === transport && (!pinned || pinned === id),
                state: workbench.network?.lastKnown[transport] ?? {},
                send: (endpoint, body) => workbench.parameterAction(node, transport, endpoint, body),
            });
        }}>
        <VisualizationSettingsProvider key={`${user._id}:${domain._id}`} domainId={domain._id} canEdit={domain.canEdit === true && domain.status !== 'archived'}>
            <DomainWorkspace name={domain.name} activeLens={lens} onLensChange={setLens} status={
                <WorkspaceStatus
                    label={statusLabel}
                    shortLabel={shortStatus}
                    warning={archived || sharedUpdates === 'retrying' || !!workbench.error || (workbench.paired && workbench.status === 'reconnecting')}>
                    {!archived && <p>Shared updates: {sharedUpdates}</p>}
                    {archived && <p>Archived domain · Read-only retained history. Live updates are stopped.</p>}
                    <p className="dw-meta">{droneLinkState.nodeCount} {droneLinkState.nodeCount === 1 ? 'Drone' : 'Drones'} · {droneLinkState.stats.received} parameters</p>
                    {showGateway && <>
                        {gatewayStatus && <p>{gatewayStatus}</p>}
                        <Dropdown.Item as="button" eventKey="gateway" onClick={() => setGatewayOpen(true)}>
                            {workbench.paired || workbench.error ? 'Local gateway settings' : 'Connect local gateway'}
                        </Dropdown.Item>
                    </>}
                </WorkspaceStatus>
            } notices={<VisualizationSettingsNotice />}>
                    {showGateway && <GatewayConnection workbench={workbench} open={gatewayOpen} onClose={() => setGatewayOpen(false)} />}
                    <NodeMapSettingsProvider key={`${user._id}:${domain._id}`} userId={user._id} domainId={domain._id}>
                    <InspectorSessionProvider key={`${user._id}:${domain._id}`} nodes={state} inventoryComplete={!droneLinkState.isLoading && ['ready', 'retrying'].includes(droneLinkState.observationStatus)}>
                        <DomainLensPanels nodeSelected={selectedNodeId !== null} overMap={lens === 'map'} lens={lensContent}
                            inspector={<InspectorPanel key={`${domain._id}:${selectedNodeId}`} selectedNodeId={selectedNodeId}
                                droneLinkState={{ ...droneLinkState, state }} liveDomain={domain.status === 'active'}
                                canReset={domain.canEdit === true && domain.status !== 'archived'}
                                sourceChoice={workbench.paired && selectedNodeId !== null && <SourceChoice node={selectedNodeId} workbench={workbench} />}
                                localSource={local ? { label: 'Local', transport: localTransport ? transportLabel[localTransport] : undefined,
                                    lastSeen: !localTransport } : undefined}
                                localModules={local && selectedNodeId !== null ? <ConnectedLocalInspector node={selectedNodeId}
                                    workbench={workbench} state={state} canQuery={domain.canEdit} /> : undefined}
                                localActions={selectedNodeId !== null && <NodeMapSettings nodeId={selectedNodeId} />}
                                files={files} />} />
                    </InspectorSessionProvider>
                    </NodeMapSettingsProvider>
            </DomainWorkspace>
        </VisualizationSettingsProvider>
        </ParameterEditorProvider>
    </WorkspaceShell></CommandScope.Provider>;
};

export default DomainDetailPage;
