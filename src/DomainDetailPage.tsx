import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import { ArrowLeft, Wifi, WifiOff } from 'react-bootstrap-icons';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import mapboxgl from 'mapbox-gl';
import { Domain, User } from './App';
import { useDroneLinkState } from './dronelink/useDroneLinkState';
import InspectorPanel from './components/InspectorPanel';
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
    
    // DroneLink state management
    const droneLinkState = useDroneLinkState();
    const { loadHistoricalData, stopStreaming } = droneLinkState;

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setLoading(true); setError(null);
        const fetchData = async () => {
            if (!domainId) {
                setError('Domain ID not provided');
                setLoading(false);
                return;
            }

            try {
                // Fetch domain, user, and config in parallel
                const [domainResponse, userResponse, configResponse] = await Promise.all([
                    fetch(`/api/domains/${domainId}`, { signal: controller.signal }),
                    fetch('/api/user', { signal: controller.signal }),
                    fetch('/api/config', { signal: controller.signal })
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
                setDomain(domainResult.data);
                setUser(userResult);
                setMapboxToken(configResult.data.mapboxAccessToken);
                
                console.log('Config loaded:', {
                    hasMapboxToken: !!configResult.data.mapboxAccessToken,
                    token: configResult.data.mapboxAccessToken ? 'present' : 'missing'
                });
                
                // Set Mapbox token if available
                if (configResult.data.mapboxAccessToken) {
                    mapboxgl.accessToken = configResult.data.mapboxAccessToken;
                    console.log('Mapbox access token set');
                } else {
                    console.warn('No Mapbox access token found in config');
                }

                await loadHistoricalData(domainId);
            } catch (err) {
                if (active && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to fetch data');
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchData();
        return () => { active = false; controller.abort(); stopStreaming(); };
    }, [domainId, loadHistoricalData, stopStreaming]);

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

    // Separate effect to initialize map when all conditions are met
    useEffect(() => {
        const initializeMap = () => {
            console.log('Map initialization attempt:', {
                hasContainer: !!mapContainer.current,
                hasMap: !!map.current,
                hasToken: !!mapboxToken,
                hasUser: !!user
            });
            
            if (mapContainer.current && !map.current && mapboxToken && user) {
                try {
                    console.log('Initializing Mapbox map...');
                    // Use user's saved map state or defaults
                    const mapState = user.mapState || { lng: -1.804, lat: 51.575, zoom: 17.5 };
                    console.log('Using map state:', mapState);
                    
                    map.current = new mapboxgl.Map({
                        container: mapContainer.current,
                        style: 'mapbox://styles/axford/cm0bi93ot00qj01ph7m580lku',
                        center: [mapState.lng, mapState.lat],
                        zoom: mapState.zoom
                    });

                    console.log('Map created successfully');

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

                    map.current.on('load', () => {
                        console.log('Map loaded successfully');
                    });

                    map.current.on('error', (e) => {
                        console.error('Map error:', e);
                    });
                } catch (error) {
                    console.error('Failed to initialize Mapbox:', error);
                }
            }
        };

        // Try multiple times with increasing delays to handle timing issues
        const timeouts: NodeJS.Timeout[] = [];
        
        // Immediate attempt
        initializeMap();
        
        // Retry attempts if not successful
        if (mapboxToken && user && !map.current) {
            [50, 200, 500].forEach(delay => {
                timeouts.push(setTimeout(initializeMap, delay));
            });
        }

        return () => {
            // Clear all timeouts
            timeouts.forEach(timeout => clearTimeout(timeout));
            
            // Clear any pending save timeout
            if (saveMapStateTimeoutRef.current) {
                clearTimeout(saveMapStateTimeoutRef.current);
            }
            
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, [loading, mapboxToken, user, saveMapState]);

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
        <div className="bg-dark text-light" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
                        {droneLinkState.nodeCount > 0 ? (
                            <Wifi size={16} className="text-success" />
                        ) : (
                            <WifiOff size={16} className="text-muted" />
                        )}
                        <Badge bg={droneLinkState.nodeCount > 0 ? 'success' : 'secondary'}>
                            {droneLinkState.nodeCount} nodes
                        </Badge>
                        <small className="text-white">
                            {droneLinkState.stats.received} msgs
                        </small>
                    </div>
                    
                    {droneLinkState.isLoading && (
                        <Spinner animation="border" size="sm" />
                    )}
                </div>
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
                                backgroundColor: '#212529'
                            }} 
                        >
                            {!mapboxToken && (
                                <div className="d-flex align-items-center justify-content-center h-100">
                                    <div className="text-center">
                                        <h5 className="text-white">Map View</h5>
                                        <p className="text-white">Mapbox token required to display map</p>
                                        <small className="text-secondary">Add mapboxAccessToken to config.json</small>
                                    </div>
                                </div>
                            )}
                        </div>
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
                            <InspectorPanel domainId={domainId!} droneLinkState={droneLinkState} />
                        </div>
                    </Panel>
                </PanelGroup>
            </div>
        </div>
    );
};

export default DomainDetailPage;