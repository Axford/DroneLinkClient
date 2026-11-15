import React, { createContext, ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './CardMotion.css';

export function motionAllowed() {
    return typeof Element.prototype.animate === 'function' &&
        !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function motionTiming(element: Element): KeyframeAnimationOptions {
    const style = getComputedStyle(element);
    const time = style.getPropertyValue('--dw-card-motion-duration').trim();
    const duration = parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
    return { duration: Number.isFinite(duration) ? duration : 500,
        easing: style.getPropertyValue('--dw-card-motion-easing').trim() || 'ease-out' };
}

/** Let a change to reduced motion finish any programmatic transition already in flight. */
export function animateCardMotion(element: HTMLElement, frames: Keyframe[]) {
    const animation = element.animate(frames, motionTiming(element));
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const finish = (event: MediaQueryListEvent) => { if (event.matches) animation.finish(); };
    const cleanup = () => preference?.removeEventListener?.('change', finish);
    preference?.addEventListener?.('change', finish);
    animation.addEventListener('finish', cleanup, { once: true });
    animation.addEventListener('cancel', cleanup, { once: true });
    return animation;
}

export const MotionExiting = createContext(false);

interface Item { key: string; element: ReactElement; selected?: boolean; previousIndex?: number }
interface Presence { active: Item[]; leaving: Item[] }

export function CardMotionList({ items, as: Tag = 'div', crossfade = false }: {
    items: Item[];
    as?: 'div' | 'li';
    crossfade?: boolean;
}) {
    const latest = useRef(items);
    const [presence, setPresence] = useState<Presence>({ active: items, leaving: [] });
    const current = items.map(item => item.key);
    if (current.join('\u0000') !== presence.active.map(item => item.key).join('\u0000')) {
        const leaving = [...presence.leaving, ...latest.current.flatMap((item, previousIndex) => current.includes(item.key) ? [] : [{ ...item, previousIndex }])]
            .filter(item => !current.includes(item.key));
        setPresence({ active: items, leaving: motionAllowed() ? leaving : [] });
    }
    useLayoutEffect(() => { latest.current = items; }, [items]);

    const rendered = [...items];
    for (const item of presence.leaving) {
        rendered.splice(item.previousIndex ?? rendered.length, 0, item);
    }
    return <>{rendered.map(item => <MotionItem key={item.key} item={item} as={Tag} crossfade={crossfade}
        leaving={!current.includes(item.key)} remove={() =>
            setPresence(previous => ({ ...previous, leaving: previous.leaving.filter(entry => entry.key !== item.key) }))} />)}</>;

}

function MotionItem({ item, as: Tag, crossfade, leaving, remove }: {
    item: Item; as: 'div' | 'li'; crossfade: boolean; leaving: boolean; remove: () => void;
}) {
    const ref = useRef<HTMLElement | null>(null);
    const onRemove = useRef(remove);
    onRemove.current = remove;
    useEffect(() => {
        if (!leaving || !ref.current) return;
        // Hidden ancestors and preference changes can cancel a transition without an end event.
        const timer = setTimeout(() => onRemove.current(), Number(motionTiming(ref.current).duration));
        return () => clearTimeout(timer);
    }, [leaving]);
    return <Tag ref={(element: HTMLElement | null) => { ref.current = element; }} className={crossfade ? 'dw-motion-view' : 'dw-motion-card'}
        data-motion-view={crossfade ? item.key : undefined} data-selected={item.selected} data-motion-exit={leaving ? 'true' : undefined} inert={leaving || undefined}
        aria-hidden={leaving || undefined}
        onTransitionEnd={event => {
            if (leaving && event.currentTarget === event.target && event.propertyName === 'opacity') remove();
        }}>
        <MotionExiting.Consumer>{ancestor => <MotionExiting.Provider value={ancestor || leaving}>{item.element}</MotionExiting.Provider>}</MotionExiting.Consumer>
    </Tag>;
}

/** Measure the incoming view at its natural height while the outgoing view fades above it. */
export function CardView({ view, children }: { view: string; children: ReactElement }) {
    const frame = useRef<HTMLDivElement>(null);
    const previous = useRef<{ view: string; height: number } | undefined>(undefined);
    const animation = useRef<Animation | undefined>(undefined);
    useLayoutEffect(() => {
        const element = frame.current!;
        const incoming = element.querySelector<HTMLElement>('.dw-motion-view:not([data-motion-exit])')!;
        const old = previous.current;
        const height = incoming.offsetHeight;
        if (old && old.view !== view && motionAllowed()) {
            const outgoing = Array.from(element.children).find(child => (child as HTMLElement).dataset.motionView === old.view);
            const from = animation.current ? element.getBoundingClientRect().height : outgoing?.getBoundingClientRect().height ?? old.height;
            animation.current?.cancel();
            const next = animateCardMotion(element, [{ height: `${from}px`, overflow: 'clip' }, { height: `${height}px`, overflow: 'clip' }]);
            animation.current = next;
            next.onfinish = () => { if (animation.current === next) animation.current = undefined; };
        }
        previous.current = { view, height };
    });
    useLayoutEffect(() => () => animation.current?.cancel(), []);
    return <div className="dw-motion-view-frame" ref={frame}><CardMotionList crossfade items={[{ key: view, element: children }]} /></div>;
}
