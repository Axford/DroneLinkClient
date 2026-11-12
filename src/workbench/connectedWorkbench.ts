import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedFetchJson } from '../utils/api';
import type { GlobalState } from '../dronelink/DroneLinkState';
import { Transport, WorkbenchStream, useWorkbenchFeed } from './useWorkbenchFeed';

export type NodeSource = 'auto' | 'local' | 'cloud';
interface Pair { domainId: string; gatewayId: string; base: string; key: string }
interface Grant { grant: string; expiresAt: number }

function request(pair: Pick<Pair, 'base' | 'key'>, endpoint: string, grant?: string, signal?: AbortSignal, body?: unknown) {
    const headers: Record<string, string> = { 'X-Workbench-Key': pair.key };
    if (grant) headers['X-Workbench-Grant'] = grant;
    if (body) headers['Content-Type'] = 'application/json';
    const options = { headers, credentials: 'omit', redirect: 'error', cache: 'no-store', targetAddressSpace: 'loopback', signal } as const;
    return fetch(`${pair.base}/${endpoint}`, body ? { ...options, method: 'POST', body: JSON.stringify(body) } : options);
}

async function localError(response: Response) {
    const result = await response.json().catch(() => ({}));
    return new Error(result.error || `The local gateway rejected the request (${response.status}).`);
}

class FetchWorkbenchStream extends EventTarget implements WorkbenchStream {
    onerror: (() => void) | null = null;
    private controller = new AbortController();

    constructor(open: (signal: AbortSignal) => Promise<Response>, denied: (message: string) => void, renew: () => void) {
        super();
        void this.read(open, denied, renew);
    }

    private async read(open: (signal: AbortSignal) => Promise<Response>, denied: (message: string) => void, renew: () => void) {
        const signal = this.controller.signal;
        try {
            const response = await open(signal);
            if (response.status === 403) { const error = await localError(response); if (!signal.aborted) denied(error.message); return; }
            if (!response.ok || !response.body) throw await localError(response);
            const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
            let pending = '';
            try {
                while (!signal.aborted) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    pending += value;
                    let end: number;
                    while ((end = pending.indexOf('\n\n')) !== -1) {
                        const [event, data] = pending.slice(0, end).split('\n');
                        pending = pending.slice(end + 2);
                        if (event === 'event: access-lost') { renew(); break; }
                        if (event.startsWith('event: ') && data?.startsWith('data: ')) {
                            this.dispatchEvent(new MessageEvent(event.slice(7), { data: data.slice(6) }));
                        }
                    }
                    if (pending.length > 262144) throw new Error('The local Workbench event was too large.');
                }
            } finally { await reader.cancel().catch(() => {}); }
        } catch (error) {
            if (error instanceof GatewayGrantDenied && !signal.aborted) { denied(error.message); return; }
        }
        if (!signal.aborted) this.onerror?.();
    }

    close() { this.controller.abort(); }
}

class GatewayGrantDenied extends Error {}

function preferenceKey(pair: Pair, node: number) { return `workbench-source:${pair.domainId}:${pair.gatewayId}:${node}`; }
function readPreference(pair: Pair, node: number): NodeSource {
    try {
        const value = localStorage.getItem(preferenceKey(pair, node));
        if (value === 'cloud' || value === 'local') return value;
    } catch { /* Browser storage is optional. */ }
    return 'auto';
}

export function useConnectedWorkbench(domainId?: string) {
    const [pair, setPair] = useState<Pair>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [overrides, setOverrides] = useState<Record<string, NodeSource>>({});
    const attempt = useRef<AbortController | undefined>(undefined);
    const currentPath = useRef<((node: number) => Transport | undefined) | undefined>(undefined);
    const activePair = pair?.domainId === domainId ? pair : undefined;
    const livePair = useRef(activePair);
    livePair.current = activePair;

    useEffect(() => () => attempt.current?.abort(), [domainId]);
    const disconnect = useCallback(() => {
        attempt.current?.abort();
        livePair.current = undefined;
        setPair(undefined);
        setError('');
        setBusy(false);
    }, []);
    const denied = useCallback((message: string) => { disconnect(); setError(message); }, [disconnect]);

    async function connect(port: string, key: string) {
        if (!domainId || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !/^[A-Za-z0-9_-]{24}$/.test(key.trim())) {
            setError('Enter the gateway port and pairing key printed by the local gateway.');
            return;
        }
        attempt.current?.abort();
        const controller = new AbortController();
        attempt.current = controller;
        const timer = setTimeout(() => controller.abort('timeout'), 12000);
        setError(''); setBusy(true);
        const candidate = { base: `http://127.0.0.1:${Number(port)}/api/workbench/v1/connected`, key: key.trim() };
        try {
            const response = await request(candidate, 'identity', undefined, controller.signal);
            if (!response.ok) throw await localError(response);
            const identity = await response.json();
            if (identity.domainId !== domainId) throw new Error('This gateway is configured for a different Domain.');
            if (typeof identity.gatewayId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(identity.gatewayId)) throw new Error('The gateway did not identify itself.');
            if (!controller.signal.aborted) setPair({ ...candidate, domainId, gatewayId: identity.gatewayId });
        } catch (problem) {
            if (!controller.signal.aborted || controller.signal.reason === 'timeout') setError(problem instanceof TypeError || controller.signal.reason === 'timeout' ? 'Could not reach the local gateway. Check its port and allow loopback access in the browser.' : String((problem as Error).message));
        } finally {
            clearTimeout(timer);
            if (attempt.current === controller) setBusy(false);
        }
    }

    const access = useMemo(() => {
        if (!activePair) return undefined;
        let current: Grant | undefined;
        async function token(signal: AbortSignal) {
            if (current && current.expiresAt > Date.now() + 20000) return current.grant;
            const result = await authenticatedFetchJson(`/api/domains/${encodeURIComponent(activePair!.domainId)}/workbench-grant`, {
                method: 'POST', body: JSON.stringify({ gatewayId: activePair!.gatewayId }), signal, notifyForbidden: false,
            }).catch(error => {
                if ([401, 403, 404, 409].includes(error.status)) throw new GatewayGrantDenied('Current Domain access is required for the connected gateway.');
                throw error;
            });
            current = result.data;
            if (!current || typeof current.grant !== 'string' || !Number.isFinite(current.expiresAt)) throw new Error('Cloud Workbench grant is unavailable.');
            return current.grant;
        }
        return { token, renew: () => { current = undefined; } };
    }, [activePair]);
    const open = useMemo(() => activePair && access ? () => new FetchWorkbenchStream(async signal => {
        const grant = await access.token(signal);
        return request(activePair, 'events', grant, signal);
    }, denied, access.renew) : null, [activePair, access, denied]);
    const feed = useWorkbenchFeed(open);

    const choice = useCallback((node: number): NodeSource => {
        if (!activePair) return 'auto';
        return overrides[preferenceKey(activePair, node)] ?? readPreference(activePair, node);
    }, [activePair, overrides]);
    function choose(node: number, value: NodeSource) {
        if (!activePair) return;
        const key = preferenceKey(activePair, node);
        setOverrides(prior => ({ ...prior, [key]: value }));
        try { localStorage.setItem(key, value); } catch { /* Current page retains the choice. */ }
    }
    const transport = useCallback((node: number): Transport | undefined => {
        const route = feed.routes[node];
        return activePair && feed.status === 'connected' && route?.reachable ? route.transport : undefined;
    }, [activePair, feed]);
    const usesLocal = useCallback((node: number) => {
        const selected = choice(node);
        return selected === 'local' || (selected === 'auto' && !!transport(node));
    }, [choice, transport]);
    currentPath.current = node => usesLocal(node) ? transport(node) : undefined;
    const mixed = useMemo(() => (cloud: GlobalState): GlobalState => {
        if (!activePair) return cloud;
        const result = { ...cloud };
        const ids = new Set([...Object.keys(cloud), ...Object.keys(feed.routes)].map(Number));
        for (const node of Array.from(ids)) {
            if (!usesLocal(node)) continue;
            const route = feed.routes[node];
            const observations = route ? feed.observations[route.transport][node] : undefined;
            result[node] = observations ?? { id: node, channels: {}, interface: 'Local', lastHeard: 0 };
        }
        return result;
    }, [activePair, feed, usesLocal]);
    async function query(node: number, channel: number, parameter: number) {
        const selected = transport(node);
        if (!activePair || !access || !usesLocal(node) || !selected) throw new Error('The selected local route is unavailable.');
        const signal = AbortSignal.timeout(10000);
        const grant = await access.token(signal);
        if (livePair.current !== activePair || currentPath.current?.(node) !== selected) throw new Error('The selected local route changed.');
        const response = await request(activePair, 'query-value', grant, signal, { node, channel, parameter, transport: selected });
        if (!response.ok) throw await localError(response);
    }
    return { paired: !!activePair, status: feed.status, error, busy, connect, disconnect, choice, choose, usesLocal, transport, mixed, query };
}
