import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import { ArrowLeft } from 'react-bootstrap-icons';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import ObservedMap from './components/ObservedMap';
import { Domain, User } from './App';
import DomainCollaboration from './components/DomainCollaboration';
import { accessEvent, affectsDomain, ApiError, authenticatedFetch, authenticatedFetchJson } from './utils/api';
import { useDroneLinkState } from './dronelink/useDroneLinkState';
import InspectorPanel from './components/InspectorPanel';


interface DomainDetailPageProps {}

const DomainDetailPage: React.FC<DomainDetailPageProps> = () => {
    const { domainId } = useParams<{ domainId: string }>();
    const navigate = useNavigate();
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
        const refresh = () => { void refreshDomain().catch(error => { if (active && error instanceof ApiError && [401, 403, 404].includes(error.status)) { stopStreaming(); reset(); setDomain(null); setError(error.message); } }); };
        const accessChanged = (event: Event) => { if (!domainId || !affectsDomain(event, domainId)) return; const status = (event as CustomEvent).detail?.status; if (status === 401 || status === 403) { refreshGeneration.current++; stopStreaming(); reset(); setDomain(null); setError(status === 401 ? 'Sign in again to continue.' : 'Domain access denied.'); } else refresh(); };
        const timer = setInterval(refresh, 15000); window.addEventListener('focus', refresh); window.addEventListener(accessEvent, accessChanged);
        return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(accessEvent, accessChanged); };
    }, [domainId, refreshDomain, stopStreaming, reset]);

    if (loading) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                </Spinner>
            </Container>
        );
    }

    if (error || !domain) {
        return (
            <Container className="mt-5">
                <Alert variant="danger">
                    <Alert.Heading>Error</Alert.Heading>
                    <p>{error || 'Domain not found'}</p>
                    <Button variant="outline-danger" onClick={() => navigate('/private')}>
                        <ArrowLeft className="me-2" />
                        Back to Domains
                    </Button>
                </Alert>
            </Container>
        );
    }

    return (
        <div className="bg-dark text-light" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div className="bg-dark border-secondary px-3 py-2 d-flex align-items-center justify-content-between border-bottom">
                <div className="d-flex align-items-center">
                    <Button 
                        variant="outline-secondary" 
                        size="sm" 
                        onClick={() => navigate('/private')}
                        className="me-3"
                    >
                        <ArrowLeft size={16} />
                    </Button>
                    <h5 className="mb-0 me-3">{domain.name}</h5>
                </div>
                
                <div className="d-flex align-items-center gap-2">
                    {/* DroneLink Status */}
                    <div className="d-flex align-items-center gap-2">
                        <Badge bg="secondary">{droneLinkState.nodeCount} singleton Drones</Badge>
                        <small role="status">Shared updates: {droneLinkState.observationStatus}</small>
                        <small className="text-white">
                            {droneLinkState.stats.received} observed parameters
                        </small>
                    </div>
                    
                    {droneLinkState.isLoading && (
                        <Spinner animation="border" size="sm" />
                    )}
                </div>
            </div>

            {domain.status === 'archived' && <Alert variant="warning" className="mb-0">Archived domain · Read-only retained history. Live updates are stopped.</Alert>}
            <div style={{ maxHeight: '40vh', overflowY: 'auto', flexShrink: 0 }}>
                {user && <DomainCollaboration key={`${domain._id}:${domain.myRole}:${domain.status}`} domain={domain} user={user} onRefresh={refreshDomain} />}
            </div>
            <small className="px-3 py-1 text-white">Observation only · Parameter commands unavailable.</small>
            {/* Resizable Panels */}
            <div style={{ flex: 1, minHeight: 0 }}>
                <PanelGroup direction="horizontal">
                    {/* Map Panel */}
                    <Panel defaultSize={70} minSize={50}>
                        <ObservedMap key={domain._id} token={mapboxToken} user={user} state={droneLinkState.state} onNodeSelect={setSelectedNodeId} />
                    </Panel>

                    {/* Resize Handle */}
                    <PanelResizeHandle 
                        style={{
                            width: '4px',
                            backgroundColor: '#495057',
                            cursor: 'col-resize',
                            borderLeft: '1px solid #343a40',
                            borderRight: '1px solid #343a40'
                        }}
                    />

                    {/* Inspector Panel */}
                    <Panel defaultSize={30} minSize={20} maxSize={50}>
                        <div className="h-100 bg-dark">
                            <InspectorPanel key={`${domain._id}:${selectedNodeId}`} domainId={domainId!} droneLinkState={droneLinkState} canReset={domain.canEdit === true && domain.status !== 'archived'} selectedNodeId={selectedNodeId} onNodeSelect={setSelectedNodeId} />
                        </div>
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
};

export default DomainDetailPage;