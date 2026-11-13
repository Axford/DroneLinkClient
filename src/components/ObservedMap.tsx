import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { ArrowsFullscreen, InfoCircle } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';
import NodeSelector from './NodeSelector';
import MapContextMenu from './MapContextMenu';
import { User } from '../App';
import { GlobalState } from '../dronelink/DroneLinkState';
import { ObservedPosition, observedPositions, receiptLabel } from '../dronelink/observedPositions';
import { authenticatedFetch } from '../utils/api';
import 'mapbox-gl/dist/mapbox-gl.css';
import './ObservedMap.css';

export interface ObservedMapProps {
  token: string | null;
  user: User | null;
  state: GlobalState;
  viewState?: React.MutableRefObject<User['mapState']>;
  selectedNodeId: number | null;
  onNodeSelect: (nodeId: number) => void;
}

function positionDescription(position: ObservedPosition, label: string, now: number) {
  return `${position.name} · Drone ${position.droneId || 'identity unavailable'} · Node ${position.nodeId} · Binding ${position.nodeId}>${position.channelId}.${position.parameterId} (${position.path}, priority ${position.priority}) · ${position.reading.source || 'Unknown source'} · Received ${receiptLabel(position.reading.lastHeard, now)} · ${label}`;
}

export default function ObservedMap({ token, user, state, viewState, selectedNodeId, onNodeSelect }: ObservedMapProps) {
  const pane = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef(new Map<number, {
    marker: mapboxgl.Marker;
    button: HTMLButtonElement;
    headingMarker?: mapboxgl.Marker;
  }>());
  const secondaryMarkers = useRef(new Map<number, { marker: mapboxgl.Marker; button: HTMLButtonElement }>());
  const select = useRef(onNodeSelect); select.current = onNodeSelect;
  const [details, setDetails] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const positions = React.useMemo(() => observedPositions(state), [state]);
  const secondaryPositions = React.useMemo(() => observedPositions(state, 'location2'), [state]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token || !user || !container.current) return;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let current: mapboxgl.Map | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const ownedMarkers = markers.current;
    const ownedSecondaryMarkers = secondaryMarkers.current;
    const controller = new AbortController();
    setMapError(false);
    try {
      mapboxgl.accessToken = token;
      const saved = viewState?.current || user.mapState || { lng: -1.804, lat: 51.575, zoom: 17.5 };
      current = new mapboxgl.Map({ container: container.current,
        style: 'mapbox://styles/axford/cm0bi93ot00qj01ph7m580lku', center: [saved.lng, saved.lat], zoom: saved.zoom });
      map.current = current; setMapReady(true);
      current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => current?.resize());
        resizeObserver.observe(container.current);
      }
      current.on('error', event => { console.error('Map rendering failed:', event.error); setMapError(true); });
      current.on('movestart', () => setCameraRevision(revision => revision + 1));
      current.on('moveend', () => {
        if (viewState) { const center = current!.getCenter(); viewState.current = { lng: center.lng, lat: center.lat, zoom: current!.getZoom() }; }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (!current) return;
          const center = current.getCenter();
          void authenticatedFetch('/api/user/map-state', { method: 'PUT', signal: controller.signal,
            body: JSON.stringify({ lng: center.lng, lat: center.lat, zoom: current.getZoom() }) })
            .catch(error => { if (!controller.signal.aborted) console.error('Failed to save map state:', error); });
        }, 5000);
      });
    } catch (error) { console.error('Map initialization failed:', error); setMapError(true); }
    return () => {
      clearTimeout(saveTimer); controller.abort(); resizeObserver?.disconnect();
      ownedMarkers.forEach(({ marker, headingMarker }) => { marker.remove(); headingMarker?.remove(); }); ownedMarkers.clear();
      ownedSecondaryMarkers.forEach(({ marker }) => marker.remove()); ownedSecondaryMarkers.clear();
      if (current && viewState) { const center = current.getCenter(); viewState.current = { lng: center.lng, lat: center.lat, zoom: current.getZoom() }; }
      current?.remove(); map.current = null; setMapReady(false);
    };
  }, [token, user, viewState]);

  useEffect(() => {
    if (!map.current) return;
    const visible = new Set(positions.map(position => position.nodeId));
    for (const [id, entry] of Array.from(markers.current)) {
      if (!visible.has(id)) {
        entry.marker.remove();
        entry.headingMarker?.remove();
        markers.current.delete(id);
      }
    }
    for (const position of positions) {
      let entry = markers.current.get(position.nodeId);
      if (!entry) {
        const button = document.createElement('button');
        button.dataset.mapNode = String(position.nodeId);
        button.type = 'button'; button.setAttribute('role', 'button'); button.className = 'btn btn-primary btn-sm dw-map-marker';
        button.addEventListener('click', () => select.current(position.nodeId));
        entry = { button, marker: new mapboxgl.Marker({ element: button }).setLngLat(position.coordinates).addTo(map.current) };
        markers.current.set(position.nodeId, entry);
      }
      entry.marker.setLngLat(position.coordinates);
      entry.button.textContent = position.name;
      entry.button.setAttribute('aria-pressed', String(position.nodeId === selectedNodeId));
      let description = positionDescription(position, 'Last-known position', now);
      if (position.heading && !mapError) {
        const { degrees, binding } = position.heading;
        if (!entry.headingMarker) {
          const arrow = document.createElement('span');
          arrow.className = 'dw-map-heading';
          arrow.setAttribute('aria-hidden', 'true');
          entry.headingMarker = new mapboxgl.Marker({ element: arrow, rotationAlignment: 'map' })
            .setLngLat(position.coordinates).addTo(map.current);
        }
        entry.headingMarker.setLngLat(position.coordinates).setRotation(degrees);
        description += ` · Last-known heading ${degrees}° · Binding ${position.nodeId}>${binding.channelId}.${binding.parameterId} (${binding.path}, priority ${binding.priority}) · ${binding.reading.source || 'Unknown source'} · Received ${receiptLabel(binding.reading.lastHeard, now)}`;
      } else {
        entry.headingMarker?.remove();
        entry.headingMarker = undefined;
      }
      entry.button.title = description; entry.button.setAttribute('aria-label', description);
    }
  }, [positions, now, token, user, selectedNodeId, mapReady, mapError]);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap) return;
    const visible = mapError ? [] : secondaryPositions;
    const visibleIds = new Set(visible.map(position => position.nodeId));
    for (const [id, entry] of Array.from(secondaryMarkers.current)) {
      if (!visibleIds.has(id)) {
        entry.marker.remove();
        secondaryMarkers.current.delete(id);
      }
    }
    for (const position of visible) {
      let entry = secondaryMarkers.current.get(position.nodeId);
      if (!entry) {
        const button = document.createElement('button');
        button.dataset.mapNode = String(position.nodeId);
        button.type = 'button';
        button.setAttribute('role', 'button');
        button.className = 'dw-map-secondary';
        button.addEventListener('click', () => select.current(position.nodeId));
        entry = { button, marker: new mapboxgl.Marker({ element: button }).setLngLat(position.coordinates).addTo(currentMap) };
        secondaryMarkers.current.set(position.nodeId, entry);
      }
      entry.marker.setLngLat(position.coordinates);
      entry.button.setAttribute('aria-pressed', String(position.nodeId === selectedNodeId));
      const description = positionDescription(position, 'Last-known secondary position', now);
      entry.button.title = description;
      entry.button.setAttribute('aria-label', description);
    }
  }, [secondaryPositions, now, token, user, selectedNodeId, mapReady, mapError]);

  const canLocate = (nodeId: number) => mapReady && !mapError && positions.some(position => position.nodeId === nodeId);
  const locateNode = (nodeId: number) => {
    const position = positions.find(position => position.nodeId === nodeId);
    if (!position || !canLocate(nodeId)) return;
    onNodeSelect(nodeId);
    map.current?.easeTo({ center: position.coordinates, duration: 0 });
  };

  const fitPositions = () => {
    if (!map.current || !positionCount) return;
    const bounds = new mapboxgl.LngLatBounds();
    positions.forEach(position => bounds.extend(position.coordinates));
    secondaryPositions.forEach(position => bounds.extend(position.coordinates));
    map.current.fitBounds(bounds, { padding: 50, maxZoom: 16, duration: 0 });
  };

  const positionCount = positions.length + secondaryPositions.length;

  return <div className="dw-map" ref={pane}>
    <div ref={container} aria-label="Observed Drone map" className="dw-map-canvas" />
    <NodeSelector nodes={Object.values(state)} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect}
      onLocate={locateNode} canLocate={canLocate} now={now} />
    <div className="dw-map-toolbar">
      <span role="status">{!token ? 'Map unavailable' : mapError ? 'Map failed' : `${positionCount} last-known positions`}</span>
      {token && positionCount > 0 && <IconButton label="Fit observed positions" icon={<ArrowsFullscreen />} disabled={mapError} onClick={fitPositions} />}
      <IconButton label="Map details" icon={<InfoCircle />} onClick={() => setDetails(true)} />
    </div>
    <MapContextMenu pane={pane} canvas={container} enabled={mapReady && !mapError} state={state} positions={positions}
      cameraRevision={cameraRevision} unproject={point => map.current?.isMoving() ? undefined : map.current?.unproject(point)} now={now} />
    <SettingsDialog title="Map details" show={details} onHide={() => setDetails(false)}><SurfacePanel>
      <p>Positions are saved observations; receipt time does not establish a current GPS fix or device connectivity.</p>
      <p>The arrow shows the last-known heading when available. Heading and position can come from different sources and have different receipt times.</p>
      <p>The ring shows the last-known secondary GPS position. Select either marker to inspect its node. Locate centres on the primary position, and Fit includes both positions.</p>
      <p>Observations remain available in the inspector when the map is unavailable.</p>
    </SurfacePanel></SettingsDialog>
  </div>;
}
