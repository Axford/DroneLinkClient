import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Spinner, Alert, Badge } from 'react-bootstrap';
import WorkspaceShell from './components/WorkspaceShell';
import PageFeedback from './components/ui/PageFeedback';
import useNarrowLayout from './components/ui/useNarrowLayout';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ObservedMap from './components/ObservedMap';
import { Domain, User } from './App';
import { accessEvent, affectsDomain, ApiError, authenticatedFetch, authenticatedFetchJson } from './utils/api';
import { useDroneLinkState } from './dronelink/useDroneLinkState';
import { CommandScope } from './commands/session';
import InspectorPanel from './components/InspectorPanel';
import { InspectorSessionProvider } from './components/InspectorSession';
import { VisualizationSettingsNotice, VisualizationSettingsProvider } from './components/VisualizationSettings';


interface DomainDetailPageProps {}

const DomainDetailPage: React.FC<DomainDetailPageProps> = () => {
    const { domainId } = useParams<{ domainId: string }>();
    const narrow = useNarrowLayout();
    const mapView = useMemo<React.MutableRefObject<User['mapState']>>(() => ({ current: undefined }), [domainId]);
    const refreshGeneration = useRef(0);
    const statusRef = useRef<string | undefined>(undefined);
    const selectedDomain = useRef(domainId); selectedDomain.current = domainId;
    
    const [domain, setDomain] = useState<Domain | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mapboxToken, setMapboxToken] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
    
    // DroneLink state management
    const droneLinkState = useDroneLinkState();
    const { loadSharedObservations, stopStreaming, reset } = droneLinkState;

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        refreshGeneration.current++;
        setLoading(true); setError(null); setDomain(null); setSelectedNodeId(null); reset();
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

    return <CommandScope.Provider key={`${user._id}:${domain._id}`} value={{
        userId: user._id, domainId: domain._id, canSubmit: domain.status === 'active' && domain.canEdit,
        canSettings: domain.status === 'active' && domain.canManageMembers
    }}><WorkspaceShell user={user} activeDomain={domain}>
        <VisualizationSettingsProvider key={`${user._id}:${domain._id}`} domainId={domain._id} canEdit={domain.canEdit === true && domain.status !== 'archived'}>
            <div className="dw-operations">
                <header className="dw-operations-header">
                    <h1>{domain.name}</h1>
                    <div className="dw-toolbar">
                        <Badge bg="secondary">{droneLinkState.nodeCount} {droneLinkState.nodeCount === 1 ? 'Drone' : 'Drones'}</Badge>
                        <span className="dw-status" role="status" title="Shared observation updates">Shared updates: {droneLinkState.observationStatus}</span>
                        <span className="dw-meta" title="Observed parameters">{droneLinkState.stats.received} parameters</span>
                        {droneLinkState.isLoading && <Spinner animation="border" size="sm" />}
                    </div>
                </header>
                {domain.status === 'archived' && <Alert variant="warning" className="dw-alert">Archived domain · Read-only retained history. Live updates are stopped.</Alert>}
                <VisualizationSettingsNotice />
                <div className="dw-operation-panels">
                    <InspectorSessionProvider key={`${user._id}:${domain._id}`} nodes={droneLinkState.state} inventoryComplete={!droneLinkState.isLoading && ['ready', 'retrying'].includes(droneLinkState.observationStatus)}>
                        <PanelGroup key={narrow ? 'vertical' : 'horizontal'} direction={narrow ? 'vertical' : 'horizontal'}>
                            <Panel defaultSize={narrow ? 50 : 65} minSize={narrow ? 25 : 35}>
                                <ObservedMap key={domain._id} token={mapboxToken} user={user} viewState={mapView} state={droneLinkState.state} selectedNodeId={selectedNodeId} onNodeSelect={setSelectedNodeId} />
                            </Panel>
                            <PanelResizeHandle className={`dw-panel-resize ${narrow ? 'vertical' : ''}`} />
                            <Panel defaultSize={narrow ? 50 : 35} minSize={narrow ? 25 : 25} maxSize={narrow ? 75 : 65}>
                                <InspectorPanel key={`${domain._id}:${selectedNodeId}`} droneLinkState={droneLinkState} canReset={domain.canEdit === true && domain.status !== 'archived'} selectedNodeId={selectedNodeId} />
                            </Panel>
                        </PanelGroup>
                    </InspectorSessionProvider>
                </div>
            </div>
        </VisualizationSettingsProvider>
    </WorkspaceShell></CommandScope.Provider>;
};

export default DomainDetailPage;
