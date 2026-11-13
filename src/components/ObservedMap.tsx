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
import { ObservedBearing, ObservedPosition, observedPositions, receiptLabel } from '../dronelink/observedPositions';
import { windLines } from '../dronelink/windLines';
import { observedNavigation } from '../dronelink/navigationLegs';
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

const windLayerId = 'dw-wind-lines';
const legLayerId = 'dw-navigation-legs';

function updateHeadingMarker(marker: mapboxgl.Marker | undefined, bearing: ObservedBearing | undefined,
  coordinates: ObservedPosition['coordinates'], map: mapboxgl.Map) {
  if (!bearing) {
    marker?.remove();
    return;
  }
  if (!marker) {
    const element = document.createElement('span');
    element.className = 'dw-map-heading';
    element.setAttribute('aria-hidden', 'true');
    marker = new mapboxgl.Marker({ element, rotationAlignment: 'map' }).setLngLat(coordinates).addTo(map);
  }
  marker.setLngLat(coordinates).setRotation(bearing.degrees);
  return marker;
}

function bearingDescription(nodeId: number, label: string, { degrees, binding }: ObservedBearing, now: number) {
  return ` · ${label} ${degrees}° · Binding ${nodeId}>${binding.channelId}.${binding.parameterId} (${binding.path}, priority ${binding.priority}) · ${binding.reading.source || 'Unknown source'} · Received ${receiptLabel(binding.reading.lastHeard, now)}`;
}

export default function ObservedMap({ token, user, state, viewState, selectedNodeId, onNodeSelect }: ObservedMapProps) {
  const pane = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [windSource, setWindSource] = useState<mapboxgl.GeoJSONSource>();
  const [legSource, setLegSource] = useState<mapboxgl.GeoJSONSource>();
  const waypointMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const markers = useRef(new Map<number, {
    marker: mapboxgl.Marker;
    button: HTMLButtonElement;
    label: HTMLSpanElement;
    heading?: mapboxgl.Marker;
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
  const navigation = React.useMemo(() => observedNavigation(state), [state]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const mapContainer = container.current;
    if (!token || !user || !mapContainer) return;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let current: mapboxgl.Map | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const ownedMarkers = markers.current;
    const ownedSecondaryMarkers = secondaryMarkers.current;
    const ownedWaypointMarkers = waypointMarkers.current;
    const controller = new AbortController();
    setMapError(false);
    try {
      mapboxgl.accessToken = token;
      const saved = viewState?.current || user.mapState || { lng: -1.804, lat: 51.575, zoom: 17.5 };
      current = new mapboxgl.Map({ container: mapContainer,
        style: 'mapbox://styles/axford/cm0bi93ot00qj01ph7m580lku', center: [saved.lng, saved.lat], zoom: saved.zoom });
      map.current = current; setMapReady(true);
      const activeMap = current;
      activeMap.on('style.load', () => {
        activeMap.addSource(windLayerId, { type: 'geojson', data: windLines([]) });
        activeMap.addLayer({
          id: windLayerId, source: windLayerId, type: 'line',
          paint: { 'line-color': getComputedStyle(mapContainer).getPropertyValue('--dw-color-navigation-wind').trim(), 'line-width': 3 }
        });
        setWindSource(activeMap.getSource<mapboxgl.GeoJSONSource>(windLayerId));
        activeMap.addSource(legLayerId, { type: 'geojson', data: observedNavigation({}).legs });
        activeMap.addLayer({
          id: legLayerId, source: legLayerId, type: 'line',
          paint: {
            'line-color': getComputedStyle(mapContainer).getPropertyValue('--dw-color-navigation-target').trim(),
            'line-width': 2, 'line-dasharray': [2, 2]
          }
        }, windLayerId);
        setLegSource(activeMap.getSource<mapboxgl.GeoJSONSource>(legLayerId));
      });
      current.addControl(new mapboxgl.NavigationControl(), 'top-right');
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => current?.resize());
        resizeObserver.observe(mapContainer);
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
      ownedMarkers.forEach(({ marker, heading }) => {
        marker.remove();
        heading?.remove();
      });
      ownedMarkers.clear();
      ownedSecondaryMarkers.forEach(({ marker }) => marker.remove()); ownedSecondaryMarkers.clear();
      ownedWaypointMarkers.forEach(marker => marker.remove()); ownedWaypointMarkers.clear();
      if (current && viewState) { const center = current.getCenter(); viewState.current = { lng: center.lng, lat: center.lat, zoom: current.getZoom() }; }
      current?.remove(); map.current = null; setMapReady(false); setWindSource(undefined); setLegSource(undefined);
    };
  }, [token, user, viewState]);

  useEffect(() => {
    windSource?.setData(windLines(mapError ? [] : positions));
  }, [windSource, positions, mapError]);

  useEffect(() => {
    legSource?.setData(mapError ? observedNavigation({}).legs : navigation.legs);
  }, [legSource, navigation, mapError]);

  useEffect(() => {
    const activeMap = map.current;
    if (!activeMap) return;
    const visible = new Set<string>();
    for (const waypoint of mapError ? [] : navigation.waypoints) {
      const key = `${waypoint.nodeId}:${waypoint.role}`;
      visible.add(key);
      let marker = waypointMarkers.current.get(key);
      if (!marker) {
        const element = document.createElement('span');
        element.className = 'dw-map-waypoint';
        element.dataset.waypoint = waypoint.role;
        element.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = `${waypoint.nodeId} · ${waypoint.role === 'target' ? 'Target' : 'Previous'}`;
        element.append(label);
        marker = new mapboxgl.Marker({ element }).setLngLat(waypoint.coordinates).addTo(activeMap);
        waypointMarkers.current.set(key, marker);
      } else {
        marker.setLngLat(waypoint.coordinates);
      }
    }
    waypointMarkers.current.forEach((marker, key) => {
      if (!visible.has(key)) {
        marker.remove();
        waypointMarkers.current.delete(key);
      }
    });
  }, [navigation, mapError, mapReady, token, user, viewState]);

  useEffect(() => {
    if (!map.current) return;
    const visible = new Set(positions.map(position => position.nodeId));
    for (const [id, entry] of Array.from(markers.current)) {
      if (!visible.has(id)) {
        entry.marker.remove();
        entry.heading?.remove();
        markers.current.delete(id);
      }
    }
    for (const position of positions) {
      let entry = markers.current.get(position.nodeId);
      if (!entry) {
        const button = document.createElement('button');
        button.dataset.mapNode = String(position.nodeId);
        button.type = 'button'; button.setAttribute('role', 'button'); button.className = 'dw-map-marker';
        const label = document.createElement('span');
        label.className = 'dw-map-node-label';
        button.append(label);
        button.addEventListener('click', () => select.current(position.nodeId));
        entry = { button, label, marker: new mapboxgl.Marker({ element: button }).setLngLat(position.coordinates).addTo(map.current) };
        markers.current.set(position.nodeId, entry);
      }
      entry.marker.setLngLat(position.coordinates);
      entry.label.textContent = position.name;
      entry.button.setAttribute('aria-pressed', String(position.nodeId === selectedNodeId));
      let description = positionDescription(position, 'Last-known position', now);
      const heading = mapError ? undefined : position.heading;
      entry.heading = updateHeadingMarker(entry.heading, heading, position.coordinates, map.current);
      if (heading) description += bearingDescription(position.nodeId, 'Last-known heading', heading, now);
      if (position.wind && !mapError) description += bearingDescription(position.nodeId, 'Last-known wind bearing', position.wind, now);
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
      <p>The green chevron at the node position shows its last-known heading. Heading and position can have different sources and receipt times.</p>
      <p>A blue line extends 10 metres from the node in the last-known wind bearing from its wing sensor.</p>
      <p>The yellow diamond marks the observed target and the square marks the previous waypoint. A dashed line joins them when both come from the same Nav channel. Map source bindings lists their source and receipt time.</p>
      <p>The ring shows the last-known secondary GPS position. Select either marker to inspect its node. Locate centres on the primary position, and Fit includes both positions.</p>
      <p>Observations remain available in the inspector when the map is unavailable.</p>
    </SurfacePanel></SettingsDialog>
  </div>;
}
