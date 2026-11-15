import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import type { FeatureCollection, LineString } from 'geojson';
import type { GlobalState } from './DroneLinkState';
import { type Coordinates, initialBearing } from './mapGeometry';
import { type ObservedPosition, observedPositions } from './observedPositions';

interface Fix {
  coordinates: Coordinates;
  binding: string;
  receipt?: number;
}

function selectedFix(position: ObservedPosition, source?: string): Fix | undefined {
  if (source === undefined) return;
  return {
    coordinates: position.coordinates,
    binding: JSON.stringify([source, position.channelId, position.parameterId, position.reading.source]),
    receipt: position.reading.lastHeard,
  };
}

interface Trail {
  segments: Coordinates[][];
  lastFix: Fix;
  interrupted?: boolean;
  generation?: number;
}

const pointLimit = 400;
const radians = Math.PI / 180;
const wrap = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;

function moved([aLng, aLat]: Coordinates, [bLng, bLat]: Coordinates) {
  const x = wrap(bLng - aLng) * Math.cos((aLat + bLat) * radians / 2);
  return Math.hypot(x, bLat - aLat) * radians * 6371e3 > 1;
}

function append(segments: Coordinates[][], point: Coordinates, newSegment: boolean): Coordinates[][] {
  if (newSegment || !segments.length) return trim([...segments, [point]]);
  const last = segments[segments.length - 1];
  const tip = last[last.length - 1];
  if (!moved(tip, point)) return segments;

  // Continue across the antimeridian on the nearest world copy.
  const next: Coordinates = [tip[0] + wrap(point[0] - tip[0]), point[1]];
  const previous = last[last.length - 2];
  const straight = previous && Math.abs(wrap(initialBearing(tip, next) - initialBearing(previous, tip))) < 3;
  return trim([...segments.slice(0, -1), [...(straight ? last.slice(0, -1) : last), next]]);
}

function trim(segments: Coordinates[][]) {
  const excess = segments.reduce((total, segment) => total + segment.length, -pointLimit);
  if (excess <= 0) return segments;
  // One append can evict only one point. An empty segment has no continuity to preserve.
  return segments[0].length === 1 ? segments.slice(1) : [segments[0].slice(1), ...segments.slice(1)];
}

export type TrailLines = FeatureCollection<LineString, { nodeId: number }>;
export const emptyTrails: TrailLines = { type: 'FeatureCollection', features: [] };

/** Owns one workspace session. A missing source means that feed cannot currently extend the trail. */
export function useSnailTrails(scope: string | undefined, state: GlobalState, sourceFor: (nodeId: number) => string | undefined) {
  const [session, setSession] = useState<{ scope?: string; trails: ReadonlyMap<number, Trail> }>({ trails: new Map() });
  const positions = useMemo(() => observedPositions(state), [state]);

  const fixes = useMemo(() => new Map(positions.map(position =>
    [position.nodeId, selectedFix(position, sourceFor(position.nodeId))] as const
  )), [positions, sourceFor]);

  useLayoutEffect(() => {
    const generations = new Map(Object.values(state).map(node => [node.id, node.observationGeneration]));

    setSession(previous => {
      const trails = new Map(previous.scope === scope ? previous.trails : []);
      let changed = previous.scope !== scope;
      if (!scope) return changed ? { scope, trails } : previous;

      const nodes = new Set(trails.keys());
      fixes.forEach((_, id) => nodes.add(id));
      for (const id of Array.from(nodes)) {
        const generation = generations.get(id);
        let trail = trails.get(id);
        if (generation !== undefined && trail?.generation !== undefined && generation !== trail.generation) {
          changed = trails.delete(id) || changed;
          trail = undefined;
        }

        const fix = fixes.get(id);
        const last = trail?.lastFix;
        if (!fix) {
          if (trail && !trail.interrupted) {
            trails.set(id, { ...trail, interrupted: true });
            changed = true;
          }
          continue;
        }

        const sameSource = last?.binding === fix.binding;
        // Recovery may first republish the same saved fix. Wait for a new receipt before joining new points.
        if (last && sameSource && last.receipt === fix.receipt &&
            last.coordinates[0] === fix.coordinates[0] && last.coordinates[1] === fix.coordinates[1]) continue;
        if (last?.receipt !== undefined && fix.receipt !== undefined && sameSource && fix.receipt < last.receipt) continue;

        const segments = append(trail?.segments ?? [], fix.coordinates, !sameSource || trail?.interrupted === true);
        trails.set(id, { segments, lastFix: fix, generation: generation ?? trail?.generation });
        changed = true;
      }
      return changed ? { scope, trails } : previous;
    });
  }, [scope, state, fixes]);

  const lines = useMemo<TrailLines>(() => {
    if (!scope || session.scope !== scope) return emptyTrails;
    return {
      type: 'FeatureCollection',
      features: Array.from(session.trails).flatMap(([nodeId, trail]) => state[nodeId] ? trail.segments
        .filter(coordinates => coordinates.length >= 2)
        .map(coordinates => ({ type: 'Feature', properties: { nodeId }, geometry: { type: 'LineString', coordinates } })) : []),
    };
  }, [session, scope, state]);

  const clear = useCallback((nodeId: number) => {
    const fix = fixes.get(nodeId);
    setSession(previous => {
      const trail = previous.trails.get(nodeId);
      if (!scope || previous.scope !== scope || !trail) return previous;
      const trails = new Map(previous.trails);
      if (fix) trails.set(nodeId, { ...trail, lastFix: fix, segments: [[fix.coordinates]], interrupted: false });
      else trails.delete(nodeId);
      return { scope, trails };
    });
  }, [fixes, scope]);

  return { lines, clear };
}
