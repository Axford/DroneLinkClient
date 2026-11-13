import { useEffect, useState } from 'react';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { authenticatedFetchJson } from '../utils/api';
import { NodeState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_CHAR as CHAR, DRONE_LINK_MSG_TYPE_UINT8_T as UINT8,
  DRONE_MODULE_PARAM_TYPE as MODULE_TYPE } from './DroneLinkMsg';

type Coordinates = [number, number];
type Result = { status: 'matched'; coordinates: Coordinates[]; capturedAt: string } |
  { status: 'unreported' | 'mismatch' | 'unavailable' };

function routeObservation(node: NodeState | undefined) {
  if (!node) return;
  const modules = Object.values(node.channels).filter(channel => {
    const type = channel.params[MODULE_TYPE];
    return type?.msgType === CHAR && !type.unavailable?.value && type.values[0] === 'Waypoint';
  });
  if (modules.length > 1) return { ambiguous: true };
  if (!modules.length) return;
  const channel = modules[0];
  const value = channel.params[17];
  if (value?.msgType !== UINT8 || value.writable || !value.lastHeard || value.unavailable?.value ||
      value.values.length !== 16 || !Array.from<number | string>(value.values).every(byte =>
        typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255) ||
      !value.values.some(byte => byte !== 0)) return { channel: channel.channel };

  return {
    channel: channel.channel, receivedAt: value.lastHeard,
    digest: value.values.map(byte => Number(byte).toString(16).padStart(2, '0')).join('')
  };
}

export function useRoutePreview(domainId: string | undefined, node: NodeState | undefined) {
  const observation = routeObservation(node);
  const digest = observation?.digest;
  const query = domainId && node && digest &&
    `/api/domains/${encodeURIComponent(domainId)}/nodes/${node.id}/route-preview?channel=${observation.channel}&digest=${digest}`;
  const key = query && JSON.stringify([query, node?.droneId, node?.observationGeneration]);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ key: string; retry: number; data: Result }>();
  useEffect(() => {
    if (!key || !query) return;
    const controller = new AbortController();
    void authenticatedFetchJson(query, { signal: controller.signal }).then(
      result => {
        if (!controller.signal.aborted) setResponse({ key, retry, data: result.data });
      },
      () => {
        if (!controller.signal.aborted) setResponse({ key, retry, data: { status: 'unavailable' } });
      }
    );
    return () => controller.abort();
  }, [key, query, retry]);

  const result = response?.key === key && response?.retry === retry ? response.data : undefined;
  const status: Result['status'] | 'loading' | undefined = result?.status ??
    (query ? 'loading' : observation?.ambiguous ? 'unavailable' : observation ? 'unreported' : undefined);
  return {
    status,
    coordinates: result?.status === 'matched' ? result.coordinates : undefined,
    capturedAt: result?.status === 'matched' ? result.capturedAt : undefined,
    receivedAt: observation?.receivedAt,
    refresh: () => setRetry(current => current + 1)
  };
}

export function routeLine(points: Coordinates[] = []): FeatureCollection<LineString | Point> {
  const coordinates: Coordinates[] = [];
  for (const [longitude, latitude] of points) {
    const previous = coordinates.at(-1)?.[0];
    coordinates.push([previous === undefined ? longitude :
      previous + ((((longitude - previous + 180) % 360) + 360) % 360) - 180, latitude]);
  }
  if (coordinates.length === 1) return { type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: coordinates[0] }, properties: {} }] };
  return { type: 'FeatureCollection', features: coordinates.length > 1 ?
    [{ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }] : [] };
}
