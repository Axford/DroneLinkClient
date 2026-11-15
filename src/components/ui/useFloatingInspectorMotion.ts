import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { animateCardMotion, motionAllowed } from './CardMotion';

function visualContents(panel: HTMLElement) {
    return Array.from(panel.querySelectorAll<HTMLElement>(
        ':scope > :not(.inspector-header, .dw-inspector-outgoing), :scope > .inspector-header > :not(.dw-inspector-size)'
    )).filter(element => !element.hidden);
}

export const FloatingInspector = createContext(false);

export function useFloatingInspectorMotion(size: string, view: string) {
    const floating = useContext(FloatingInspector);
    const ref = useRef<HTMLElement>(null);
    const start = useRef<{ bounds: DOMRect; collapsed: boolean } | undefined>(undefined);
    const last = useRef<DOMRect | undefined>(undefined);
    const lastSize = useRef(size);
    const animation = useRef<Animation | undefined>(undefined);
    const startOpacity = useRef(0);
    const snapshot = useRef<HTMLElement | undefined>(undefined);

    function begin(nextSize: string) {
        const panel = ref.current;
        if (!floating || !panel || !motionAllowed()) return;
        const bounds = panel.getBoundingClientRect();
        start.current = { bounds, collapsed: size === 'collapsed' };
        startOpacity.current = snapshot.current?.isConnected ? Number(getComputedStyle(snapshot.current).opacity) : 0;
        snapshot.current?.remove();
        snapshot.current = undefined;
        if (nextSize !== 'collapsed') return;
        const outgoing = document.createElement('div');
        outgoing.className = 'dw-inspector-outgoing';
        outgoing.inert = true;
        outgoing.setAttribute('aria-hidden', 'true');
        outgoing.style.width = `${panel.offsetWidth}px`;
        for (const element of visualContents(panel)) {
            const clone = element.cloneNode(true) as HTMLElement;
            const contentBounds = element.getBoundingClientRect();
            Object.assign(clone.style, { position: 'absolute', left: `${contentBounds.left - bounds.left}px`,
                top: `${contentBounds.top - bounds.top}px`, width: `${contentBounds.width}px`, height: `${contentBounds.height}px`,
                opacity: getComputedStyle(element).opacity });
            const copies = clone.querySelectorAll('*');
            [element, ...Array.from(element.querySelectorAll('*'))].forEach((current, index) => {
                const copy = index === 0 ? clone : copies[index - 1];
                if (current.scrollTop || current.scrollLeft) {
                    // Scroll offsets only take effect once the copy is attached.
                    copy.setAttribute('data-motion-scroll', `${current.scrollLeft},${current.scrollTop}`);
                }
            });
            outgoing.append(clone);
        }
        outgoing.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        snapshot.current = outgoing;
    }

    useLayoutEffect(() => {
        const panel = ref.current;
        if (!floating || !panel || !motionAllowed()) return;
        const resize = start.current ?? (lastSize.current !== size && last.current
            ? { bounds: last.current, collapsed: lastSize.current === 'collapsed' }
            : undefined);
        lastSize.current = size;
        start.current = undefined;
        const from = resize?.bounds ?? (panel.hasAttribute('data-inspector-resizing') ? panel.getBoundingClientRect() : undefined);
        animation.current?.cancel();
        animation.current = undefined;
        panel.removeAttribute('data-inspector-resizing');
        const opening = !!resize?.collapsed && size !== 'collapsed';
        panel.toggleAttribute('data-inspector-opening', opening);
        const to = panel.getBoundingClientRect();
        const priorLayout = last.current;
        last.current = to;

        function animateGeometry(before: DOMRect, after: DOMRect) {
            if (!after.width || !after.height) return;
            const frame = ({ left, top, width, height }: DOMRect) => ({
                left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
            });
            panel!.setAttribute('data-inspector-resizing', '');
            const next = animateCardMotion(panel!, [frame(before), frame(after)]);
            // Keep the final bounds until the panel is back in normal layout.
            next.effect?.updateTiming({ fill: 'both' });
            animation.current = next;
            next.onfinish = () => {
                if (animation.current !== next) return;
                animation.current = undefined;
                panel!.removeAttribute('data-inspector-resizing');
                panel!.removeAttribute('data-inspector-opening');
                next.cancel();
                last.current = panel!.getBoundingClientRect();
            };
        }

        if (from) {
            animateGeometry(from, to);
            if (size === 'collapsed' && snapshot.current) {
                const outgoing = snapshot.current;
                const layer = panel.closest('.dw-map-panels')!;
                const bounds = layer.getBoundingClientRect();
                Object.assign(outgoing.style, { left: `${from.left - bounds.left}px`, top: `${from.top - bounds.top}px`,
                    height: `${from.height}px` });
                layer.append(outgoing);
                outgoing.querySelectorAll<HTMLElement>('[data-motion-scroll]').forEach(element => {
                    const [left, top] = element.dataset.motionScroll!.split(',').map(Number);
                    element.scrollTo(left, top);
                    delete element.dataset.motionScroll;
                });
                const fade = animateCardMotion(outgoing, [{ opacity: 1 }, { opacity: 0 }]);
                fade.onfinish = () => { outgoing.remove(); if (snapshot.current === outgoing) snapshot.current = undefined; };
            } else if (opening) {
                for (const element of visualContents(panel))
                    animateCardMotion(element, [{ opacity: startOpacity.current }, { opacity: 1 }]);
            }
        } else if (priorLayout && size === 'normal' && Math.abs(priorLayout.height - to.height) > 1) {
            animateGeometry(priorLayout, to);
        } else if (!priorLayout) {
            animation.current = animateCardMotion(panel, [{ opacity: 0, transform: 'scaleY(.92)' },
                { opacity: 1, transform: 'none' }]);
            const entry = animation.current;
            entry.onfinish = () => {
                if (animation.current !== entry) return;
                animation.current = undefined;
                last.current = panel.getBoundingClientRect();
            };
        }
        if (typeof ResizeObserver === 'undefined' || size !== 'normal') return;
        let structureChanged = false;
        const structure = new MutationObserver(records => {
            if (records.some(record => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)]
                .some(node => node.nodeType === Node.ELEMENT_NODE))) structureChanged = true;
        });
        structure.observe(panel, { childList: true, subtree: true });
        const observer = new ResizeObserver(() => {
            const prior = last.current;
            const rect = panel.getBoundingClientRect();
            const changed = structureChanged;
            structureChanged = false;
            if (animation.current) return;
            last.current = rect;
            // Growing child cards already drive the Inspector height during their own transition.
            const childAnimating = panel.getAnimations({ subtree: true }).some(effect => effect.playState === 'running');
            if (prior && changed && !childAnimating && Math.abs(prior.width - rect.width) < 1 && Math.abs(prior.height - rect.height) > 1)
                animateGeometry(prior, rect);
        });
        observer.observe(panel);
        return () => { observer.disconnect(); structure.disconnect(); };
    }, [floating, size, view]);

    useLayoutEffect(() => {
        const panel = ref.current;
        return () => {
            animation.current?.cancel();
            animation.current = undefined;
            panel?.removeAttribute('data-inspector-resizing');
            panel?.removeAttribute('data-inspector-opening');
            last.current = undefined;
            snapshot.current?.remove();
        };
    }, [floating]);

    return { ref, begin };
}
