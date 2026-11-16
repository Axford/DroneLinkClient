import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalState } from '../dronelink/DroneLinkState';
import { authenticatedFetchJson } from '../utils/api';

export interface Composition {
  droneId: string;
  revision: number;
  memberAddresses: number[];
  masterAddress: number | null;
}
export interface Drone extends Omit<Composition, 'masterAddress'> {
  masterAddress: number;
  transport?: string;
}
export interface Grouping {
  drones: Drone[];
  assignments: Record<number, string>;
}
export interface GroupingChange {
  sequence: number;
  committedAt: string;
  before: Composition[];
  after: Composition[];
}

export const groupingRoot = (domainId: string) => '/api/domains/' + encodeURIComponent(domainId);
export const GroupingContext = createContext<{ grouping?: Grouping; nodes: GlobalState }>({ nodes: {} });

export function nodeLabel(nodes: GlobalState, address: number): string {
  const name = nodes[address]?.name;
  return name && name !== `Node ${address}` ? `${name} · Node ${address}` : `Node ${address}`;
}

interface IdentityResponse {
  data: {
    nodes: Array<{ address: number; droneId: string }>;
    drones: Array<{ _id: string; groupingRevision?: number; memberAddresses: number[]; masterAddress: number; activeCommandTransport?: string }>;
  };
}

export function useGrouping(domainId?: string, scope?: string) {
  const [snapshot, setSnapshot] = useState<{ scope: string; grouping?: Grouping; error?: string }>();
  const request = useRef<AbortController | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (!domainId || !scope) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const result: IdentityResponse = await authenticatedFetchJson(groupingRoot(domainId) + '/identities', { signal: controller.signal });
      if (request.current !== controller) return;
      const grouping: Grouping = {
        assignments: Object.fromEntries(result.data.nodes.map(node => [node.address, node.droneId])),
        drones: result.data.drones.map(drone => ({
          droneId: drone._id, revision: drone.groupingRevision ?? 0, memberAddresses: drone.memberAddresses,
          masterAddress: drone.masterAddress, transport: drone.activeCommandTransport,
        })).sort((a, b) => a.masterAddress - b.masterAddress),
      };
      setSnapshot(previous => previous?.scope === scope && !previous.error &&
        JSON.stringify(previous.grouping) === JSON.stringify(grouping) ? previous : { scope, grouping });
      return grouping;
    } catch {
      if (request.current === controller) {
        setSnapshot(previous => ({ scope, grouping: previous?.scope === scope ? previous.grouping : undefined, error: 'Drone groups could not be refreshed.' }));
      }
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) request.current = undefined;
    }
  }, [domainId, scope]);
  useEffect(() => {
    if (!scope) return;
    const update = () => { if (!request.current) void refresh(); };
    update();
    const timer = setInterval(update, 5000);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      const pending = request.current;
      request.current = undefined;
      pending?.abort();
    };
  }, [refresh, scope]);
  return { ...(snapshot?.scope === scope ? snapshot : undefined), refresh };
}

export function applyDroneAssignments(nodes: GlobalState, grouping?: Grouping): GlobalState {
  if (!grouping) return nodes;
  let updated = nodes;
  for (const node of Object.values(nodes)) {
    const droneId = grouping.assignments[node.id];
    if (!droneId || droneId === node.droneId) continue;
    if (updated === nodes) updated = { ...nodes };
    updated[node.id] = { ...node, droneId };
  }
  return updated;
}
