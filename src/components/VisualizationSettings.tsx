import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import { accessEvent, ApiError, authenticatedFetchJson } from '../utils/api';
import { VisualizationSetting, VisualizationTarget, VoltageThresholds, visualizationKey } from '../dronelink/visualizationSettings';

interface VisualizationSettingsState {
    canEdit: boolean;
    loadFailed: boolean;
    get: (target: VisualizationTarget) => VisualizationSetting | undefined;
    refresh: () => Promise<VisualizationSetting[] | undefined>;
    save: (target: VisualizationTarget, generation: number, revision: number, thresholds: VoltageThresholds | null) => Promise<void>;
}

const Context = createContext<VisualizationSettingsState | null>(null);
export const useVisualizationSettings = () => useContext(Context);

export function VisualizationSettingsNotice() {
    const settings = useVisualizationSettings();
    if (!settings?.loadFailed) return null;
    return <Alert variant="warning" className="dw-alert d-flex align-items-center justify-content-between gap-2">
        <span>Could not refresh visualization settings.</span>
        <Button variant="secondary" size="sm" onClick={() => { void settings.refresh().catch(() => {}); }}>Retry</Button>
    </Alert>;
}

export function VisualizationSettingsProvider({ domainId, canEdit, children }: {
    domainId: string;
    canEdit: boolean;
    children: React.ReactNode;
}) {
    const url = `/api/domains/${encodeURIComponent(domainId)}/visualization-settings`;
    const [records, setRecords] = useState<Record<string, VisualizationSetting>>({});
    const [ready, setReady] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const reading = useRef<AbortController | undefined>(undefined);
    const writing = useRef(new Set<AbortController>());
    const merge = useCallback((items: VisualizationSetting[]) => {
        setRecords(previous => {
            const next = { ...previous };
            for (const item of items) {
                const key = visualizationKey(item);
                if (item.revision > (next[key]?.revision ?? 0)) next[key] = item;
            }
            return next;
        });
    }, []);

    const refresh = useCallback(async () => {
        reading.current?.abort();
        const controller = new AbortController();
        reading.current = controller;
        const items: VisualizationSetting[] = [];
        try {
            let cursor: string | null = null;
            do {
                const query: string = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
                const result: { data: { items: VisualizationSetting[] }; pagination: { nextCursor: string | null } } =
                    await authenticatedFetchJson(url + query, { signal: controller.signal });
                if (controller.signal.aborted) return;
                items.push(...result.data.items);
                cursor = result.pagination.nextCursor;
            } while (cursor);
            merge(items);
            setReady(true);
            setLoadFailed(false);
            return items;
        } catch (error) {
            if (controller.signal.aborted) return;
            if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
                setRecords({});
                setReady(false);
                setLoadFailed(false);
            } else {
                setLoadFailed(true);
            }
            throw error;
        }
    }, [url, merge]);

    useEffect(() => {
        const refreshOnFocus = () => { void refresh().catch(() => {}); };
        refreshOnFocus();
        window.addEventListener('focus', refreshOnFocus);
        const pendingWrites = writing.current;
        return () => {
            window.removeEventListener('focus', refreshOnFocus);
            reading.current?.abort();
            pendingWrites.forEach(controller => controller.abort());
        };
    }, [refresh]);

    const save: VisualizationSettingsState['save'] = async (target, expectedGeneration, revision, thresholds) => {
        if (!ready || !canEdit) throw new Error('Visualization settings are read-only.');
        const controller = new AbortController();
        writing.current.add(controller);
        try {
            const path = `${url}/${target.nodeAddress}/${target.channel}/${encodeURIComponent(target.moduleType)}`;
            const result: { data: VisualizationSetting } = await authenticatedFetchJson(path, {
                method: 'PUT', body: JSON.stringify({ revision, expectedGeneration, thresholds }),
                signal: controller.signal, notifyForbidden: false
            });
            if (!controller.signal.aborted) merge([result.data]);
        } catch (error) {
            if (error instanceof ApiError && error.status === 403) {
                window.dispatchEvent(new CustomEvent(accessEvent, { detail: { domainId } }));
            }
            throw error;
        } finally {
            writing.current.delete(controller);
        }
    };

    return <Context.Provider value={{ canEdit: ready && canEdit, loadFailed, get: target => records[visualizationKey(target)], refresh, save }}>
        {children}
    </Context.Provider>;
}
