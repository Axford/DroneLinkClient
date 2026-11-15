import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import maplibregl from 'maplibre-gl';
import { ArrowsFullscreen, InfoCircle } from 'react-bootstrap-icons';
import IconButton from './ui/IconButton';
import SettingsDialog from './ui/SettingsDialog';
import SurfacePanel from './ui/SurfacePanel';
import NodeSelector from './NodeSelector';
import MapContextMenu from './MapContextMenu';
import { User } from '../App';
import { GlobalState } from '../dronelink/DroneLinkState';
import { ObservedBearing, ObservedPosition, observedPositions, receiptLabel } from '../dronelink/observedPositions';
import { routeLine, useRoutePreview } from '../dronelink/routePreview';
import { emptyTrails, type TrailLines, type useSnailTrails } from '../dronelink/snailTrails';
import { windLines } from '../dronelink/windLines';
import { observedNavigation } from '../dronelink/navigationLegs';
import { observedTargetMove } from '../dronelink/mapContextActions';
import { message, submit, useCommandJournal, useCommandScope } from '../commands/session';
import { useNodeMapSettings } from './NodeMapSettings';
import { authenticatedFetch } from '../utils/api';
import 'mapbox-gl/dist/mapbox-gl.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './ObservedMap.css';

export interface ObservedMapProps {
  token: string | null;
  domainId?: string;
  local?: boolean;
  selectionDisabled?: boolean;
  nodeStatus?: (nodeId: number) => string;
  user: User | null;
  state: GlobalState;
  trails?: ReturnType<typeof useSnailTrails>;
  viewState?: React.MutableRefObject<User['mapState']>;
  selectedNodeId: number | null;
  onNodeSelect: (nodeId: number) => void | boolean;
}

function positionDescription(position: ObservedPosition, label: string, now: number) {
  return `${position.name} · Drone ${position.droneId || 'identity unavailable'} · Node ${position.nodeId} · Binding ${position.nodeId}>${position.channelId}.${position.parameterId} (${position.path}, priority ${position.priority}) · ${position.reading.source || 'Unknown source'} · Received ${receiptLabel(position.reading.lastHeard, now)} · ${label}`;
}

const cloudMapStyle = 'mapbox://styles/axford/cm0bi93ot00qj01ph7m580lku';

const localMapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    streets: {
      type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#202832' } },
    {
      id: 'streets', type: 'raster', source: 'streets',
      // Reverse tile luminance so pale land becomes dark and street labels stay legible.
      // Rotate the hue before inversion to keep water blue.
      paint: {
        'raster-brightness-min': 0.68,
        'raster-brightness-max': 0.12,
        'raster-hue-rotate': 180,
        'raster-saturation': -0.25,
      },
    },
  ],
};

const trailLayerId = 'dw-snail-trails';
const windLayerId = 'dw-wind-lines';
const routeLayerId = 'dw-route-preview';
const legLayerId = 'dw-navigation-legs';

type ObservationMap = mapboxgl.Map | maplibregl.Map;
type ObservationMarker = mapboxgl.Marker | maplibregl.Marker;
type ObservationSource = mapboxgl.GeoJSONSource | maplibregl.GeoJSONSource;

function geoJSONSource(map: ObservationMap, id: string): ObservationSource | undefined {
  return map instanceof maplibregl.Map ? map.getSource<maplibregl.GeoJSONSource>(id) : map.getSource<mapboxgl.GeoJSONSource>(id);
}

function addMarker(map: ObservationMap, element: HTMLElement, coordinates: [number, number], rotationAlignment?: 'map'): ObservationMarker {
  if (map instanceof maplibregl.Map) {
    return new maplibregl.Marker({ element, rotationAlignment }).setLngLat(coordinates).addTo(map);
  }
  return new mapboxgl.Marker({ element, rotationAlignment }).setLngLat(coordinates).addTo(map);
}

function updateHeadingMarker(marker: ObservationMarker | undefined, bearing: ObservedBearing | undefined,
  coordinates: ObservedPosition['coordinates'], map: ObservationMap) {
  if (!bearing) {
    marker?.remove();
    return;
  }
  if (!marker) {
    const element = document.createElement('span');
    element.className = 'dw-map-heading';
    element.setAttribute('aria-hidden', 'true');
    marker = addMarker(map, element, coordinates, 'map');
  }
  marker.setLngLat(coordinates).setRotation(bearing.degrees);
  return marker;
}

function bearingDescription(nodeId: number, label: string, { degrees, binding }: ObservedBearing, now: number) {
  return ` · ${label} ${degrees}° · Binding ${nodeId}>${binding.channelId}.${binding.parameterId} (${binding.path}, priority ${binding.priority}) · ${binding.reading.source || 'Unknown source'} · Received ${receiptLabel(binding.reading.lastHeard, now)}`;
}

export default function ObservedMap({ token, domainId, user, state, trails, viewState, selectedNodeId, onNodeSelect, local = false, selectionDisabled, nodeStatus }: ObservedMapProps) {
  const pane = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<ObservationMap | null>(null);
  const [trailSource, setTrailSource] = useState<ObservationSource>();
  const drawnTrails = useRef<{ source: ObservationSource; lines: TrailLines } | undefined>(undefined);
  const [windSource, setWindSource] = useState<ObservationSource>();
  const [routeSource, setRouteSource] = useState<ObservationSource>();
  const route = useRoutePreview(domainId, selectedNodeId === null ? undefined : state[selectedNodeId]);
  const [legSource, setLegSource] = useState<ObservationSource>();
  const waypointMarkers = useRef(new Map<string, ObservationMarker>());
  const draggingWaypoint = useRef<string | undefined>(undefined);
  const markers = useRef(new Map<number, {
    marker: ObservationMarker;
    button: HTMLButtonElement;
    label: HTMLSpanElement;
    heading?: ObservationMarker;
  }>());
  const secondaryMarkers = useRef(new Map<number, { marker: ObservationMarker; button: HTMLButtonElement }>());
  const select = useRef(onNodeSelect); select.current = onNodeSelect;
  const [details, setDetails] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [dragFeedback, setDragFeedback] = useState('');
  const scope = useCommandScope();
  const { attempt } = useCommandJournal(scope);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [now, setNow] = useState(Date.now());
  const positions = React.useMemo(() => observedPositions(state), [state]);
  const secondaryPositions = React.useMemo(() => observedPositions(state, 'location2'), [state]);
  const showPreviousRadius = useNodeMapSettings()?.showPreviousRadius;
  const navigation = React.useMemo(() => observedNavigation(state, showPreviousRadius), [state, showPreviousRadius]);
  const dragState = useRef({ state, navigation, scope, attempt, mapError });
  dragState.current = { state, navigation, scope, attempt, mapError };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const mapContainer = container.current;
    if ((!local && (!token || !user)) || !mapContainer) return;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let current: ObservationMap | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const ownedMarkers = markers.current;
    const ownedSecondaryMarkers = secondaryMarkers.current;
    const ownedWaypointMarkers = waypointMarkers.current;
    const controller = new AbortController();
    setMapError(false); setBasemapError(false);
    try {
      const useLocalBasemap = local && !token;
      const saved = viewState?.current || user?.mapState || { lng: -1.804, lat: 51.575, zoom: 17.5 };
      const camera = { container: mapContainer, center: [saved.lng, saved.lat] as [number, number], zoom: saved.zoom };
      if (useLocalBasemap) {
        current = new maplibregl.Map({ ...camera, style: localMapStyle, attributionControl: { compact: false } });
        current.addControl(new maplibregl.NavigationControl(), 'top-left');
      } else {
        current = new mapboxgl.Map({ ...camera, style: cloudMapStyle, accessToken: token ?? undefined });
        current.addControl(new mapboxgl.NavigationControl(), 'top-left');
      }
      map.current = current; setMapReady(true);
      const activeMap = current;
      const addOverlays = () => {
        activeMap.addSource(trailLayerId, { type: 'geojson', lineMetrics: true, data: emptyTrails });
        const trailColor = getComputedStyle(mapContainer).getPropertyValue('--dw-color-navigation-heading').trim() || '#45d483';
        activeMap.addLayer({
          id: trailLayerId, source: trailLayerId, type: 'line',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-width': 2,
            'line-opacity': 0.65,
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'transparent', 1, trailColor],
            ...(!useLocalBasemap && { 'line-emissive-strength': 1 })
          }
        });
        setTrailSource(geoJSONSource(activeMap, trailLayerId));
        activeMap.addSource(windLayerId, { type: 'geojson', data: windLines([]) });
        activeMap.addLayer({
          id: windLayerId, source: windLayerId, type: 'line',
          paint: {
            'line-color': getComputedStyle(mapContainer).getPropertyValue('--dw-color-navigation-wind').trim(),
            'line-width': 3,
            // Keep the instrument colour readable on dark basemaps with 3D lighting.
            ...(!useLocalBasemap && { 'line-emissive-strength': 1 })
          }
        });
        setWindSource(geoJSONSource(activeMap, windLayerId));
        activeMap.addSource(routeLayerId, { type: 'geojson', data: routeLine() });
        activeMap.addLayer({
          id: routeLayerId, source: routeLayerId, type: 'line',
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: { 'line-color': getComputedStyle(mapContainer).getPropertyValue('--dw-color-muted').trim(),
            'line-width': 2, 'line-opacity': 0.75, ...(!useLocalBasemap && { 'line-emissive-strength': 1 }) }
        }, windLayerId);
        activeMap.addLayer({
          id: `${routeLayerId}-point`, source: routeLayerId, type: 'circle',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-color': getComputedStyle(mapContainer).getPropertyValue('--dw-color-muted').trim(),
            'circle-radius': 4, ...(!useLocalBasemap && { 'circle-emissive-strength': 1 }) }
        }, windLayerId);
        setRouteSource(geoJSONSource(activeMap, routeLayerId));
        activeMap.addSource(legLayerId, { type: 'geojson', data: observedNavigation({}).legs });
        const palette = getComputedStyle(mapContainer);
        const target = palette.getPropertyValue('--dw-color-navigation-target').trim();
        const previous = palette.getPropertyValue('--dw-color-muted').trim();
        for (const kind of ['leg', 'corridor', 'target-radius', 'previous-radius']) {
          activeMap.addLayer({
            id: `${legLayerId}-${kind}`, source: legLayerId, type: 'line',
            filter: ['==', ['get', 'kind'], kind],
            paint: {
              'line-color': kind === 'previous-radius' ? previous : target,
              'line-width': kind === 'leg' ? 2 : 1.5,
              'line-opacity': kind === 'corridor' ? 0.65 : 1,
              ...(kind === 'corridor' ? { 'line-dasharray': [4, 4] } : {})
            }
          }, windLayerId);
        }
        setLegSource(geoJSONSource(activeMap, legLayerId));
      };
      if (activeMap instanceof maplibregl.Map) activeMap.once('style.load', addOverlays);
      else activeMap.on('style.load', addOverlays);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => current?.resize());
        resizeObserver.observe(mapContainer);
      }
      const onMoveStart = () => setCameraRevision(revision => revision + 1);
      const onMoveEnd = () => {
        if (viewState) { const center = current!.getCenter(); viewState.current = { lng: center.lng, lat: center.lat, zoom: current!.getZoom() }; }
        if (local) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (!current) return;
          const center = current.getCenter();
          void authenticatedFetch('/api/user/map-state', { method: 'PUT', signal: controller.signal,
            body: JSON.stringify({ lng: center.lng, lat: center.lat, zoom: current.getZoom() }) })
            .catch(error => { if (!controller.signal.aborted) console.error('Failed to save map state:', error); });
        }, 5000);
      };
      if (activeMap instanceof maplibregl.Map) {
        activeMap.on('error', event => {
          if ('sourceId' in event && event.sourceId === 'streets') setBasemapError(true);
          else console.error('Workbench map rendering failed:', event.error);
        });
        activeMap.on('movestart', onMoveStart);
        activeMap.on('moveend', onMoveEnd);
      } else {
        activeMap.on('error', event => {
          if (local) setBasemapError(true);
          else { console.error('Map rendering failed:', event.error); setMapError(true); }
        });
        activeMap.on('movestart', onMoveStart);
        activeMap.on('moveend', onMoveEnd);
      }
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
      draggingWaypoint.current = undefined;
      if (current && viewState) { const center = current.getCenter(); viewState.current = { lng: center.lng, lat: center.lat, zoom: current.getZoom() }; }
      current?.remove(); map.current = null; setMapReady(false); setTrailSource(undefined); setWindSource(undefined); setLegSource(undefined); setRouteSource(undefined);
    };
  }, [token, user, viewState, local]);

  const trailLines = trails?.lines ?? emptyTrails;
  useEffect(() => {
    if (!trailSource) {
      drawnTrails.current = undefined;
      return;
    }
    const lines = mapError ? emptyTrails : trailLines;
    const previous = drawnTrails.current;
    if (previous?.source === trailSource && previous.lines.features.length === lines.features.length &&
        lines.features.every((line, i) => line.properties.nodeId === previous.lines.features[i].properties.nodeId &&
          line.geometry.coordinates === previous.lines.features[i].geometry.coordinates)) return;
    trailSource.setData(lines);
    drawnTrails.current = { source: trailSource, lines };
  }, [trailSource, trailLines, mapError]);

  useEffect(() => {
    windSource?.setData(windLines(mapError ? [] : positions));
  }, [windSource, positions, mapError]);

  useEffect(() => {
    routeSource?.setData(routeLine(mapError ? undefined : route.coordinates));
  }, [routeSource, route.coordinates, mapError]);

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
        if (waypoint.role === 'target') {
          element.setAttribute('role', 'img');
          element.tabIndex = 0;
        } else {
          element.setAttribute('aria-hidden', 'true');
        }
        const label = document.createElement('span');
        label.textContent = `${waypoint.nodeId} · ${waypoint.role === 'target' ? 'Target' : 'Previous'}`;
        element.append(label);
        marker = addMarker(activeMap, element, waypoint.coordinates);
        const dragMarker = marker;
        if (waypoint.role === 'target') {
          let started: string | undefined;
          dragMarker.on('dragstart', () => {
            const current = dragState.current;
            const active = current.navigation.waypoints.find(point => point.nodeId === waypoint.nodeId && point.role === 'target');
            const action = active && observedTargetMove(active, current.state, ...active.coordinates);
            started = action?.key;
            draggingWaypoint.current = key;
          });
          dragMarker.on('dragend', () => {
            const current = dragState.current;
            const active = current.navigation.waypoints.find(point => point.nodeId === waypoint.nodeId && point.role === 'target');
            const { lng, lat } = dragMarker.getLngLat();
            draggingWaypoint.current = undefined;
            if (active) dragMarker.setLngLat(active.coordinates);
            const action = active && observedTargetMove(active, current.state, lng, lat);
            const commandScope = current.scope;
            if (!started || !action || action.key !== started || current.mapError || !commandScope?.canSubmit ||
              commandScope.canTarget?.(waypoint.nodeId) === false ||
              (current.attempt && current.attempt.status !== 'rejected')) {
              setDragFeedback('Target move unavailable. Check the current node and Domain commands.');
              return;
            }
            setDragFeedback('Submitting target move…');
            void submit(commandScope, action.intent).then(
              () => setDragFeedback('Target move requested. See Domain commands.'),
              error => setDragFeedback(`${message(error)} See Domain commands.`)
            );
          });
        }
        waypointMarkers.current.set(key, marker);
      } else if (draggingWaypoint.current !== key) {
        marker.setLngLat(waypoint.coordinates);
      }
      if (waypoint.role === 'target') {
        const action = scope?.canSubmit && scope.canTarget?.(waypoint.nodeId) !== false &&
          (!attempt || attempt.status === 'rejected') && observedTargetMove(waypoint, state, ...waypoint.coordinates);
        if (draggingWaypoint.current !== key) marker.setDraggable(!!action);
        marker.getElement().dataset.draggable = String(!!action);
        const hint = action ? 'Drag to request a new target' :
          scope?.canSubmit ? 'Target move unavailable for the current source or device firmware' : 'Target is read-only';
        marker.getElement().title = hint;
        marker.getElement().setAttribute('aria-label', `Node ${waypoint.nodeId} active target. ${hint}`);
      }
    }
    waypointMarkers.current.forEach((marker, key) => {
      if (!visible.has(key)) {
        if (draggingWaypoint.current === key) draggingWaypoint.current = undefined;
        marker.remove();
        waypointMarkers.current.delete(key);
      }
    });
  }, [navigation, mapError, mapReady, token, user, viewState, scope, attempt, state]);

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
        entry = { button, label, marker: addMarker(map.current, button, position.coordinates) };
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
        entry = { button, marker: addMarker(currentMap, button, position.coordinates) };
        secondaryMarkers.current.set(position.nodeId, entry);
      }
      entry.marker.setLngLat(position.coordinates);
      entry.button.setAttribute('aria-pressed', String(position.nodeId === selectedNodeId));
      const description = positionDescription(position, 'Last-known secondary position', now);
      entry.button.title = description;
      entry.button.setAttribute('aria-label', description);
    }
  }, [secondaryPositions, now, token, user, selectedNodeId, mapReady, mapError]);

  // The canvas extends beneath the floating Inspector, but camera actions target the unobstructed lens.
  const coveredMapArea = () => ({
    right: Math.max(0, (container.current?.clientWidth ?? 0) - (pane.current?.clientWidth ?? 0)),
    bottom: Math.max(0, (container.current?.clientHeight ?? 0) - (pane.current?.clientHeight ?? 0)),
  });
  const canLocate = (nodeId: number) => mapReady && !mapError && positions.some(position => position.nodeId === nodeId);
  const locateNode = (nodeId: number) => {
    const position = positions.find(position => position.nodeId === nodeId);
    if (!position || !canLocate(nodeId)) return;
    if (onNodeSelect(nodeId) === false) return;
    const { right, bottom } = coveredMapArea();
    map.current?.easeTo({
      center: position.coordinates, duration: 0,
      ...(right || bottom ? { offset: [-right / 2, -bottom / 2] as [number, number] } : {}),
    });
  };

  const fitPositions = () => {
    if (!map.current || !positionCount) return;
    const coordinates = [...positions, ...secondaryPositions].map(position => position.coordinates);
    const { right, bottom } = coveredMapArea();
    const options = { padding: { top: 50, left: 50, right: 50 + right, bottom: 50 + bottom }, maxZoom: 16, duration: 0 };
    if (map.current instanceof maplibregl.Map) {
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach(position => bounds.extend(position));
      map.current.fitBounds(bounds, options);
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(position => bounds.extend(position));
      map.current.fitBounds(bounds, options);
    }
  };

  const routeMessage = {
    loading: 'Checking route backup…',
    matched: 'Verified route preview',
    mismatch: 'Route backup is out of sync',
    unreported: 'Loaded route digest unavailable',
    unavailable: 'Route preview unavailable'
  };
  const positionCount = positions.length + secondaryPositions.length;

  return <div className="dw-map" ref={pane}>
    <div ref={container} aria-label="Observed Drone map" className="dw-map-canvas" />
    <NodeSelector local={local} status={nodeStatus} nodes={Object.values(state)} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect}
      onLocate={locateNode} canLocate={id => canLocate(id) && (!selectionDisabled || id === selectedNodeId)} now={now} selectionDisabled={selectionDisabled} />
    <div className="dw-map-toolbar">
      {!local && !token ? <span role="status">Map unavailable</span> : mapError && <span role="status">Map failed</span>}
      {local && !token && <span className="dw-meta">Local fallback basemap</span>}
      {basemapError && <span role="status">{local && token ? 'Cloud basemap unavailable. Check the Workbench Mapbox token.' : 'Basemap tiles unavailable'}</span>}
      {(token || local) && positionCount > 0 && <IconButton label="Fit observed positions" icon={<ArrowsFullscreen />} disabled={mapError} onClick={fitPositions} />}
      {route.status && <span role="status" title={route.receivedAt ?
        `Route digest received ${new Date(route.receivedAt).toLocaleString()}${route.capturedAt ?
          ` · Backup captured ${new Date(route.capturedAt).toLocaleString()}` : ''}` : undefined}>{routeMessage[route.status]}</span>}
      {(route.status === 'mismatch' || route.status === 'unavailable') &&
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={route.refresh}>Check backup</button>}
      {trails && selectedNodeId !== null && trailLines.features.some(line => line.properties.nodeId === selectedNodeId) &&
        <button type="button" className="btn btn-sm btn-outline-secondary"
          aria-label={`Clear trail for node ${selectedNodeId}`} onClick={() => trails.clear(selectedNodeId)}>Clear trail</button>}
      <IconButton label="Map details" icon={<InfoCircle />} onClick={() => setDetails(true)} />
    </div>
    <MapContextMenu pane={pane} canvas={container} enabled={mapReady && !mapError} state={state} positions={positions}
      cameraRevision={cameraRevision} unproject={point => map.current?.isMoving() ? undefined : map.current?.unproject(point)} now={now} />
    {dragFeedback && <div className="dw-map-command-feedback" role="status">{dragFeedback}
      <button type="button" aria-label="Dismiss target move status" onClick={() => setDragFeedback('')}>×</button>
    </div>}
    <SettingsDialog title="Map details" show={details} onHide={() => setDetails(false)}><SurfacePanel>
      <p>Positions are saved observations; receipt time does not establish a current GPS fix or device connectivity.</p>
      <p>The green chevron at the node position shows its last-known heading. Heading and position can have different sources and receipt times.</p>
      <p>Green trails show primary positions seen during this workspace session. Select a node to clear its trail.</p>
      <p>A blue line extends 10 metres from the node in the last-known wind bearing from its wing sensor.</p>
      <p>The yellow diamond and ring show the observed target and its radius. The dashed corridor extends one target radius to either side of the leg. The grey square marks the previous waypoint. Use Node settings to show its radius.</p>
      <p>The ring shows the last-known secondary GPS position. Select either marker to inspect its node. Locate centres on the primary position, and Fit includes both positions.</p>
      <p>Observations remain available in the inspector when the map is unavailable.</p>
    </SurfacePanel></SettingsDialog>
  </div>;
}
