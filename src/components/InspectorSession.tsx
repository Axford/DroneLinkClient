import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GlobalState, NodeState } from '../dronelink/DroneLinkState';
import { observedModuleType } from '../dronelink/moduleVisualizations';

interface Preferences {
    generation?: number;
    order: number[];
    collapsed: number[];
    systemOpen: number[];
    parameters: Record<number, string>;
    reordering: boolean;
}
type SavedPreferences = Record<number, Preferences>;
interface FocusBookmark { nodeId: number | null; generation?: number; control: string }
const defaults = (node: NodeState): Preferences => ({ generation: node.observationGeneration, order: [], collapsed: [], systemOpen: [], parameters: {}, reordering: false });

function reconcile(saved: SavedPreferences, nodes: GlobalState): SavedPreferences {
    let result = saved;
    for (const [key, previous] of Object.entries(saved)) {
        const id = Number(key), node = nodes[id];
        if (!node || node.observationGeneration !== previous.generation) {
            if (result === saved) result = { ...saved };
            delete result[id];
            continue;
        }
        const order = previous.order.filter(channel => node.channels[channel]);
        const collapsed = previous.collapsed.filter(channel => node.channels[channel]);
        const systemOpen = previous.systemOpen.filter(channel => Object.keys(node.channels[channel]?.params ?? {}).some(param => Number(param) < 8));
        const parameterChoices = Object.entries(previous.parameters);
        const parameters = parameterChoices.filter(([channel, type]) => observedModuleType(node.channels[Number(channel)]) === type);
        const reordering = previous.reordering && Object.keys(node.channels).length > 1;
        if (order.length !== previous.order.length || collapsed.length !== previous.collapsed.length || systemOpen.length !== previous.systemOpen.length || parameters.length !== parameterChoices.length || reordering !== previous.reordering) {
            if (result === saved) result = { ...saved };
            result[id] = { ...previous, order, collapsed, systemOpen, parameters: Object.fromEntries(parameters), reordering };
        }
    }
    return result;
}

interface Session {
    saved: SavedPreferences;
    update: (nodeId: number, change: (previous: Preferences) => Preferences) => void;
    focus: React.MutableRefObject<FocusBookmark | null>;
}
const InspectorSession = createContext<Session | null>(null);

/** Mount once per authorised Domain visit, above panels that remount at breakpoints. */
export function InspectorSessionProvider({ nodes, inventoryComplete, children }: { nodes: GlobalState; inventoryComplete: boolean; children: React.ReactNode }) {
    const [stored, setStored] = useState<SavedPreferences>({});
    const focus = useRef<FocusBookmark | null>(null);
    const saved = reconcile(stored, nodes);
    // Loading/resync temporarily exposes no nodes. Only a complete inventory can remove preferences.
    useEffect(() => { if (inventoryComplete) setStored(previous => reconcile(previous, nodes)); }, [inventoryComplete, nodes]);
    const update: Session['update'] = (id, change) => {
        const node = nodes[id];
        if (!node) return;
        setStored(previous => {
            const existing = previous[id] ? reconcile({ [id]: previous[id] }, nodes)[id] : undefined;
            return { ...previous, [id]: change(existing ?? defaults(node)) };
        });
    };
    return <InspectorSession.Provider value={{ saved, update, focus }}>{children}</InspectorSession.Provider>;
}

export function useChannelPresentation(node: NodeState) {
    const session = useContext(InspectorSession);
    if (!session) throw new Error('Channel presentation requires an Inspector session');
    const { order, collapsed, systemOpen, parameters, reordering } = session.saved[node.id] ?? defaults(node);
    const ids = [...order, ...Object.keys(node.channels).map(Number).sort((a, b) => a - b).filter(id => !order.includes(id))];
    const update = (change: (previous: Preferences) => Preferences) => session.update(node.id, change);
    return {
        ids, collapsed, systemOpen, parameters, reordering,
        setShowParameters: (id: number, show: boolean) => {
            const type = observedModuleType(node.channels[id]);
            if (!type) return;
            update(previous => {
                const parameters = { ...previous.parameters };
                if (show) parameters[id] = type;
                else delete parameters[id];
                return { ...previous, parameters };
            });
        },
        toggleChannel: (id: number) => update(previous => ({ ...previous, collapsed: previous.collapsed.includes(id) ? previous.collapsed.filter(item => item !== id) : [...previous.collapsed, id] })),
        setAllCollapsed: (collapse: boolean) => update(previous => ({ ...previous, collapsed: collapse ? ids : [] })),
        setSystemOpen: (id: number, open: boolean) => update(previous => ({ ...previous, systemOpen: [...previous.systemOpen.filter(item => item !== id), ...(open ? [id] : [])] })),
        toggleReordering: () => update(previous => ({ ...previous, reordering: !previous.reordering })),
        move: (id: number, direction: -1 | 1) => {
            const from = ids.indexOf(id), to = from + direction;
            if (from < 0 || to < 0 || to >= ids.length) return;
            const next = [...ids];
            [next[from], next[to]] = [next[to], next[from]];
            update(previous => ({ ...previous, order: next }));
            return to + 1;
        }
    };
}

/** Only transfer focus on a remount of the same node/generation, never across selection or access changes. */
export function useInspectorFocus(nodeId: number | null, generation?: number) {
    const session = useContext(InspectorSession);
    const focus = session?.focus;
    const root = useRef<HTMLDivElement>(null);
    const opener = useRef<string | undefined>(undefined);
    const portalFocus = useRef<HTMLElement | null>(null);
    const onFocusCapture = (event: React.FocusEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.target)) {
            opener.current = event.target.dataset.inspectorFocus;
            portalFocus.current = null;
        } else {
            // React focus events follow ownership through a portal, unlike DOM containment.
            portalFocus.current = event.target;
        }
    };
    useLayoutEffect(() => {
        const element = root.current;
        const bookmark = focus?.current;
        if (focus) focus.current = null;
        if (bookmark?.nodeId === nodeId && bookmark.generation === generation) {
            Array.from(element?.querySelectorAll<HTMLElement>('[data-inspector-focus]') ?? [])
                .find(control => control.dataset.inspectorFocus === bookmark.control)?.focus();
        }
        return () => {
            if (!focus || !document.activeElement) return;
            const active = document.activeElement as HTMLElement;
            const control = element?.contains(active) ? active.dataset.inspectorFocus
                : active === portalFocus.current ? opener.current : undefined;
            if (control) focus.current = { nodeId, generation, control };
        };
    }, [focus, nodeId, generation]);
    return { ref: root, onFocusCapture };
}
