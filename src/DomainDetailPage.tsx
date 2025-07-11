import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Button, Spinner, Alert } from 'react-bootstrap';
import { ArrowLeft } from 'react-bootstrap-icons';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import mapboxgl from 'mapbox-gl';
import { Domain, User } from './App';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox token will be set dynamically from backend config

interface DomainDetailPageProps {}

const DomainDetailPage: React.FC<DomainDetailPageProps> = () => {
    const { domainId } = useParams<{ domainId: string }>();
    const navigate = useNavigate();
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    
    const [domain, setDomain] = useState<Domain | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mapboxToken, setMapboxToken] = useState<string | null>(null);
    const saveMapStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!domainId) {
                setError('Domain ID not provided');
                setLoading(false);
                return;
            }

            try {
                // Fetch domain, user, and config in parallel
                const [domainResponse, userResponse, configResponse] = await Promise.all([
                    fetch(`/api/domains/${domainId}`),
                    fetch('/api/user'),
                    fetch('/api/config')
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

                setDomain(domainResult.data);
                setUser(userResult);
                setMapboxToken(configResult.data.mapboxAccessToken);
                
                // Set Mapbox token if available
                if (configResult.data.mapboxAccessToken) {
                    mapboxgl.accessToken = configResult.data.mapboxAccessToken;
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [domainId]);

    // Debounced function to save map state
    const saveMapState = useCallback((lng: number, lat: number, zoom: number) => {
        // Clear existing timeout
        if (saveMapStateTimeoutRef.current) {
            clearTimeout(saveMapStateTimeoutRef.current);
        }

        // Set new timeout for 5 seconds
        saveMapStateTimeoutRef.current = setTimeout(async () => {
            try {
                await fetch('/api/user/map-state', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ lng, lat, zoom })
                });
            } catch (error) {
                console.error('Failed to save map state:', error);
            }
        }, 5000);
    }, []);

    useEffect(() => {
        if (mapContainer.current && !map.current && mapboxToken && user) {
            try {
                // Use user's saved map state or defaults
                const mapState = user.mapState || { lng: -1.804, lat: 51.575, zoom: 17.5 };
                
                map.current = new mapboxgl.Map({
                    container: mapContainer.current,
                    style: 'mapbox://styles/axford/cm0bi93ot00qj01ph7m580lku',
                    center: [mapState.lng, mapState.lat],
                    zoom: mapState.zoom
                });

                // Add navigation controls
                map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

                // Add event listeners for map movement
                map.current.on('moveend', () => {
                    if (map.current) {
                        const center = map.current.getCenter();
                        const zoom = map.current.getZoom();
                        saveMapState(center.lng, center.lat, zoom);
                    }
                });

                map.current.on('zoomend', () => {
                    if (map.current) {
                        const center = map.current.getCenter();
                        const zoom = map.current.getZoom();
                        saveMapState(center.lng, center.lat, zoom);
                    }
                });
            } catch (error) {
                console.error('Failed to initialize Mapbox:', error);
            }
        }

        return () => {
            // Clear any pending save timeout
            if (saveMapStateTimeoutRef.current) {
                clearTimeout(saveMapStateTimeoutRef.current);
            }
            
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, [mapboxToken, user, saveMapState]);

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
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div className="bg-light border-bottom px-3 py-2 d-flex align-items-center">
                <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    onClick={() => navigate('/private')}
                    className="me-3"
                >
                    <ArrowLeft size={16} />
                </Button>
                <h5 className="mb-0">{domain.name}</h5>
            </div>

            {/* Resizable Panels */}
            <div style={{ flex: 1 }}>
                <PanelGroup direction="horizontal">
                    {/* Map Panel */}
                    <Panel defaultSize={70} minSize={50}>
                        <div 
                            ref={mapContainer} 
                            style={{ 
                                width: '100%', 
                                height: '100%',
                                position: 'relative',
                                backgroundColor: '#f8f9fa'
                            }} 
                        >
                            {!mapboxToken && (
                                <div className="d-flex align-items-center justify-content-center h-100">
                                    <div className="text-center text-muted">
                                        <h5>Map View</h5>
                                        <p>Mapbox token required to display map</p>
                                        <small>Add mapboxAccessToken to config.json</small>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Resize Handle */}
                    <PanelResizeHandle 
                        style={{
                            width: '4px',
                            backgroundColor: '#dee2e6',
                            cursor: 'col-resize',
                            borderLeft: '1px solid #adb5bd',
                            borderRight: '1px solid #adb5bd'
                        }}
                    />

                    {/* Inspector Panel */}
                    <Panel defaultSize={30} minSize={20} maxSize={50}>
                        <div className="h-100 p-3 bg-light">
                            <h6 className="text-muted mb-3">Inspector</h6>
                            
                            <div className="mb-3">
                                <small className="text-muted d-block mb-1">Domain Name</small>
                                <div className="fw-medium">{domain.name}</div>
                            </div>

                            <div className="mb-3">
                                <small className="text-muted d-block mb-1">Domain ID</small>
                                <code className="small">{domain._id}</code>
                            </div>

                            <div className="mb-3">
                                <small className="text-muted d-block mb-1">Statistics</small>
                                <div className="small">
                                    <div>Nodes: {domain.stats?.nodeCount || 0}</div>
                                    <div>Packets: {domain.stats?.packetCount || 0}</div>
                                </div>
                            </div>

                            <div className="mb-3">
                                <small className="text-muted d-block mb-1">Users</small>
                                <div className="small">
                                    {domain.users && domain.users.length > 0 ? (
                                        domain.users.map(user => (
                                            <div key={user._id} className="mb-1">
                                                {user.displayName}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-muted">No users</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
};

export default DomainDetailPage;