import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExclamationTriangle } from 'react-bootstrap-icons';
import { message, submit, useCommandJournal, useCommandScope } from '../commands/session';
import { GlobalState } from '../dronelink/DroneLinkState';
import { MapAction, MapContext, mapContextActions } from '../dronelink/mapContextActions';
import { compactReceiptAge, ObservedPosition, receiptLabel } from '../dronelink/observedPositions';
import './MapContextMenu.css';

type Point = [number, number];
interface OpenMenu { context: MapContext; point: Point; keys: Set<string> }
interface Props {
  pane: React.RefObject<HTMLDivElement | null>;
  canvas: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  state: GlobalState;
  positions: ObservedPosition[];
  unproject: (point: Point) => { lng: number; lat: number } | undefined;
  now: number;
  cameraRevision: number;
}

const LONG_PRESS_MS = 550;
// Match the map SDK’s drag threshold.
const TOUCH_SLOP = 3;

function useMapContextGestures({ canvas, enabled, onOpen, onClose, menu, cameraRevision }: {
  canvas: Props['canvas'];
  enabled: boolean;
  cameraRevision: number;
  onOpen: (event: MouseEvent | PointerEvent) => boolean;
  onClose: () => void;
  menu: React.RefObject<HTMLDivElement | null>;
}) {
  const handlers = useRef({ onOpen, onClose, cameraRevision });
  handlers.current = { onOpen, onClose, cameraRevision };

  useEffect(() => {
    const surface = canvas.current;
    if (!surface || !enabled) return;
    let press: { start: PointerEvent; timer: ReturnType<typeof setTimeout>; opened: boolean } | undefined;
    let suppressClick = false;
    const clearPress = () => {
      clearTimeout(press?.timer);
      press = undefined;
    };
    const outside = (event: PointerEvent) => {
      if (press && event.pointerId !== press.start.pointerId && press.opened) handlers.current.onClose();
      clearPress();
      suppressClick = false;
      if (!menu.current?.contains(event.target as Node)) handlers.current.onClose();
    };
    const start = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !event.isPrimary || !isMapSurface(event.target)) return;
      const startRevision = handlers.current.cameraRevision;
      press = { start: event, opened: false, timer: setTimeout(() => {
        if (!press || startRevision !== handlers.current.cameraRevision) return;
        press.opened = handlers.current.onOpen(event);
        suppressClick = press.opened;
      }, LONG_PRESS_MS) };
    };
    const move = (event: PointerEvent) => {
      if (press?.start.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.start.clientX, event.clientY - press.start.clientY) < TOUCH_SLOP) return;
      if (press.opened) handlers.current.onClose();
      clearPress();
    };
    const end = (event: PointerEvent) => {
      if (press?.start.pointerId !== event.pointerId) return;
      if (event.type === 'pointercancel' && press.opened) handlers.current.onClose();
      clearPress();
    };
    const context = (event: MouseEvent) => {
      if (!isMapSurface(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (press || suppressClick || (event as PointerEvent).pointerType === 'touch' || (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents) return;
      handlers.current.onOpen(event);
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const blur = () => { clearPress(); handlers.current.onClose(); };
    surface.addEventListener('contextmenu', context, true);
    surface.addEventListener('pointerdown', start, true);
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('click', click, true);
    window.addEventListener('blur', blur);
    return () => {
      clearPress();
      surface.removeEventListener('contextmenu', context, true);
      surface.removeEventListener('pointerdown', start, true);
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('blur', blur);
    };
  }, [canvas, enabled, menu]);
}

function isMapSurface(target: EventTarget | null): target is Element {
  return target instanceof Element && !target.closest('.mapboxgl-control-container');
}

function useMenuPlacement(pane: Props['pane'], menu: React.RefObject<HTMLDivElement | null>, open: OpenMenu | undefined) {
  useLayoutEffect(() => {
    const parent = pane.current;
    const element = menu.current;
    if (!open || !parent || !element) return;
    const place = () => {
      const padding = 4;
      element.style.left = Math.max(padding, Math.min(open.point[0], parent.clientWidth - element.offsetWidth - padding)) + 'px';
      element.style.top = Math.max(padding, Math.min(open.point[1], parent.clientHeight - element.offsetHeight - padding)) + 'px';
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(place);
    resize.observe(parent);
    resize.observe(element);
    return () => resize.disconnect();
  }, [pane, menu, open]);
}

export default function MapContextMenu({ pane, canvas, enabled, state, positions, unproject, now, cameraRevision }: Props) {
  const scope = useCommandScope();
  const { attempt } = useCommandJournal(scope);
  const allowed = enabled && scope?.canSubmit === true;
  const [open, setOpen] = useState<OpenMenu>();
  const [feedback, setFeedback] = useState('');
  const current = useRef<OpenMenu | undefined>(undefined);
  const menu = useRef<HTMLDivElement>(null);
  const context = open?.context;
  const observations = useMemo(() => ({ nodes: state, positions }), [state, positions]);
  const actions = useMemo(() => allowed && context ? mapContextActions(context, observations) : [], [allowed, context, observations]);
  const groups = actions.map(group => ({ ...group, entries: group.entries.filter(entry => open?.keys.has(entry.key)) }))
    .filter(group => group.entries.length);

  const close = React.useCallback(() => { current.current = undefined; setOpen(undefined); }, []);
  useLayoutEffect(() => {
    // A moving camera can put a different coordinate under a point menu.
    // A marker menu remains tied to its node and revalidates the node's bindings.
    if (current.current?.context.kind === 'background') close();
  }, [close, cameraRevision]);

  // Discard choices that lost their binding, generation or write metadata, even if they later reappear.
  useLayoutEffect(() => {
    if (!open || current.current !== open) return;
    const validKeys = new Set(actions.flatMap(group => group.entries.map(entry => entry.key)));
    const keys = new Set(Array.from(open.keys).filter(key => validKeys.has(key)));
    if (!keys.size) close();
    else if (keys.size !== open.keys.size) {
      current.current = { ...open, keys };
      setOpen(current.current);
    }
  }, [open, actions, close]);

  useMapContextGestures({ canvas, enabled: allowed, menu, cameraRevision, onClose: close, onOpen: event => {
    if (!allowed || !pane.current || !canvas.current || !isMapSurface(event.target)) return false;
    if (attempt && attempt.status !== 'rejected') {
      setFeedback('Resolve the current submission in Domain commands.');
      return false;
    }
    const bounds = pane.current.getBoundingClientRect();
    const point: Point = [event.clientX - bounds.left, event.clientY - bounds.top];
    const marker = event.target.closest<HTMLElement>('[data-map-node]');
    let context: MapContext;
    if (marker) context = { kind: 'marker', nodeId: Number(marker.dataset.mapNode) };
    else {
      const mapBounds = canvas.current.getBoundingClientRect();
      const coordinate = unproject([event.clientX - mapBounds.left, event.clientY - mapBounds.top]);
      if (!coordinate) return false;
      context = { kind: 'background', longitude: coordinate.lng, latitude: coordinate.lat };
    }
    const keys = new Set(mapContextActions(context, observations).flatMap(group => group.entries.map(entry => entry.key)));
    if (!keys.size) return false;
    setFeedback('');
    current.current = { context, point, keys };
    setOpen(current.current);
    return true;
  } });
  useMenuPlacement(pane, menu, open);

  const activate = (entry: MapAction) => {
    if (!allowed || !scope || !current.current?.keys.has(entry.key)) return;
    close();
    setFeedback('Submitting command…');
    void submit(scope, entry.intent).then(
      () => setFeedback('Command accepted. See Domain commands.'),
      error => setFeedback(`${message(error)} See Domain commands.`)
    );
  };

  return <>
    {groups.length > 0 && <div ref={menu} className="dw-map-context" role="group"
      aria-label={context?.kind === 'marker' ? 'Node map actions' : 'Map point actions'}
      onContextMenu={event => event.preventDefault()}>
      {groups.map(group => {
        const recipients = new Map<string, { label?: string; entries: MapAction[] }>();
        for (const entry of group.entries) {
          const key = entry.recipient?.key || '';
          if (!recipients.has(key)) recipients.set(key, { label: entry.recipient?.label, entries: [] });
          recipients.get(key)!.entries.push(entry);
        }
        return <div key={group.label}>
          <div className="dw-map-context-heading">{group.label}</div>
          {Array.from(recipients, ([key, recipient]) => <div key={key} role={recipient.label ? 'group' : undefined} aria-label={recipient.label}>
            {recipient.label && <div className="dw-map-context-recipient">{recipient.label}</div>}
            {recipient.entries.map(entry => <button key={entry.key} type="button" onClick={() => activate(entry)}>
              <span>{entry.label}</span>
              {entry.warning && <span className="dw-map-context-warning" role="img" aria-label={entry.warning} title={entry.warning}><ExclamationTriangle aria-hidden="true" /></span>}
              {entry.receivedAt !== undefined && <span className="dw-map-context-age" aria-label={`Server receipt ${receiptLabel(entry.receivedAt, now)}`}
                title={`Server receipt ${receiptLabel(entry.receivedAt, now)}`}>{compactReceiptAge(entry.receivedAt, now)}</span>}
            </button>)}
          </div>)}
        </div>;
      })}
    </div>}
    {feedback && <div className="dw-map-command-feedback" role="status">{feedback}
      <button type="button" aria-label="Dismiss map command status" onClick={() => setFeedback('')}>×</button>
    </div>}
  </>;
}
