import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Axis, BoatPart, MeshPose, Vector, add, cross, direction, dot, jointFrame, localDirection,
  meshBounds, partPose, scale, subtract, transformPoint, turnAboutJoint,
} from './boatModel';
import { nearestVisibleVertex } from './viewportPicking';

export type Handle = 'centerOfMass' | 'pivot' | 'axis';
export type EditTool = 'mass' | 'joint';
export type JointPick = 'origin' | 'direction';
type Point = [number, number];
interface Props {
  parts: BoatPart[];
  selectedId: string;
  hidden: ReadonlySet<string>;
  forward: Axis;
  up: Axis;
  tool: EditTool;
  pick: JointPick | null;
  previewAngle: number | null;
  onMoveHandle: (handle: Handle, value: Vector) => void;
  onPickVertex: (vertex: Vector) => void;
}
interface Marker { handle: Handle; world: Vector; local: Vector; screen: Vector; color: string; label: string; }
type Drag =
  | { kind: 'handle'; marker: Marker; pose: MeshPose; pivot?: Vector; start: Point; pointer: number }
  | { kind: 'orbit' | 'pan' | 'pick'; start: Point; last: Point; pointer: number; moved: boolean };

const minScale = 0.01, maxScale = 1_000_000;
const clampScale = (value: number) => Math.min(maxScale, Math.max(minScale, value));
const colors = { centerOfMass: '#ffe095', pivot: '#83ddff', axis: '#83ddff' };

export default function ModelViewport({
  parts, selectedId, hidden, forward, up, tool, pick, previewAngle, onMoveHandle, onPickVertex,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const [[width, height], setSize] = useState<Point>([0, 0]);
  const [azimuth, yaw] = useState(-0.9);
  const [elevation, pitch] = useState(0.42);
  const [pixels, setPixels] = useState(250);
  const [target, setTarget] = useState<Vector>([0, 0, 0]);
  const [hover, setHover] = useState<{ id: string; index: number }>();
  const scene = useMemo(() => parts.map(part => {
    const pose = partPose(part, forward, up);
    return { part, pose, vertices: part.mesh.vertices.map(vertex => transformPoint(pose, vertex)) };
  }), [parts, forward, up]);
  const selected = scene.find(entry => entry.part.id === selectedId && !hidden.has(selectedId));

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize([entry.contentRect.width, entry.contentRect.height]);
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (!scene.length) return;
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : 1;
      setPixels(value => clampScale(value * Math.exp(-event.deltaY * units * 0.002)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, [scene.length]);

  const frame = useMemo(() => {
    const [ca, sa, ce, se] = [Math.cos(azimuth), Math.sin(azimuth), Math.cos(elevation), Math.sin(elevation)];
    const camera: Vector = [ce*ca, ce*sa, se];
    const right: Vector = [-sa, ca, 0], vertical = cross(camera, right);
    const view = (vertex: Vector): Vector => [dot(vertex, right), dot(vertex, vertical), dot(vertex, camera)];
    const project = (vertex: Vector): Vector => {
      const [x, y, z] = view(subtract(vertex, target));
      return [width/2 + x*pixels, height/2 - y*pixels, z];
    };
    const joint = selected && jointFrame(selected.part, selected.pose);
    const jointAxis = joint?.axis;
    const jointPivot = joint?.pivot;
    const move = (vertex: Vector) => previewAngle !== null && jointAxis && jointPivot
      ? turnAboutJoint(vertex, jointPivot, jointAxis, previewAngle) : vertex;

    const visible = scene.filter(entry => !hidden.has(entry.part.id)).map(entry => ({
      ...entry,
      projected: entry === selected ? entry.vertices.map(vertex => project(move(vertex))) : entry.vertices.map(project),
    }));
    const faces = visible.flatMap(({ part, projected }) => part.mesh.triangles.map(([a, b, c]) => {
      const vertices: [Vector, Vector, Vector] = [projected[a], projected[b], projected[c]];
      const [p, q, r] = vertices;
      // Convert screen X and inverted Y to the same length scale as depth.
      const normal = cross([(q[0]-p[0])/pixels, (p[1]-q[1])/pixels, q[2]-p[2]],
        [(r[0]-p[0])/pixels, (p[1]-r[1])/pixels, r[2]-p[2]]);
      const norm = Math.hypot(...normal);
      const light = norm ? 0.48 + 0.5 * Math.abs(dot(normal, [-0.3, 0.5, 0.8]) / norm) : 0.48;
      const color = (part.id === selectedId ? [152, 236, 203] : [114, 163, 188]).map(value => Math.round(value * light));
      return { vertices, depth: (p[2]+q[2]+r[2])/3, fill: 'rgb(' + color.join(',') + ')' };
    })).sort((a, b) => a.depth - b.depth);
    return { right, vertical, camera, view, project, joint, move, visible, faces };
  }, [scene, selected, selectedId, hidden, azimuth, elevation, width, height, pixels, target, previewAngle]);
  const { right, vertical, camera, view, project, joint, move, visible, faces } = frame;
  const pickedPart = visible.find(entry => entry.part.id === selectedId);

  const markers: Marker[] = [];
  function marker(handle: Handle, world: Vector, local: Vector, label: string) {
    markers.push({ handle, world, local, screen: project(world), color: colors[handle], label });
  }
  if (selected && tool === 'mass') {
    const { centerOfMass } = selected.part;
    marker('centerOfMass', move(transformPoint(selected.pose, centerOfMass)), centerOfMass, 'CG');
  }
  if (selected?.part.joint && joint) {
    marker('pivot', joint.pivot, selected.part.joint.pivot, 'Pivot');
    if (joint.axis) marker('axis', add(joint.pivot, scale(joint.axis, 74 / pixels)), selected.part.joint.axis, 'Axis');
  }

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || !width || !height) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const bitmapWidth = Math.round(width * density), bitmapHeight = Math.round(height * density);
    if (element.width !== bitmapWidth) element.width = bitmapWidth;
    if (element.height !== bitmapHeight) element.height = bitmapHeight;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.fillStyle = '#142630';
    context.fillRect(0, 0, width, height);
    for (const { vertices, fill } of faces) {
      context.beginPath();
      context.moveTo(vertices[0][0], vertices[0][1]);
      context.lineTo(vertices[1][0], vertices[1][1]);
      context.lineTo(vertices[2][0], vertices[2][1]);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
    }

    function line(from: Point, to: Point, color: string, width = 1) {
      if (!context) return;
      context.beginPath();
      context.moveTo(...from);
      context.lineTo(...to);
      context.strokeStyle = color;
      context.lineWidth = width;
      context.stroke();
    }
    if (scene.length) {
      const origin: Point = [50, height - 45];
      context.font = '12px system-ui';
      for (const [axis, color, label] of [
        [[1, 0, 0], '#a9ebc8', 'Fwd'], [[0, 1, 0], '#9cc6f4', 'Port'], [[0, 0, 1], '#f6d7a0', 'Up'],
      ] as [Vector, string, string][]) {
        const x = origin[0] + 26 * dot(axis, right), y = origin[1] - 26 * dot(axis, vertical);
        line(origin, [x, y], color);
        context.fillStyle = color;
        context.fillText(label, x + 4, y);
      }
    }
    const pivot = markers.find(item => item.handle === 'pivot');
    const axis = markers.find(item => item.handle === 'axis');
    if (pivot && axis) line([pivot.screen[0], pivot.screen[1]], [axis.screen[0], axis.screen[1]], axis.color, 2);
    for (const item of markers) {
      const active = item.handle === 'centerOfMass' ? tool === 'mass' : tool === 'joint';
      const [x, y] = item.screen;
      const radius = active && !pick ? 7 : 4;
      context.beginPath();
      context.arc(x, y, radius, 0, 2*Math.PI);
      context.fillStyle = item.color;
      context.fill();
      context.strokeStyle = '#142630';
      context.lineWidth = 2;
      context.stroke();
      context.font = '600 12px system-ui';
      context.strokeStyle = '#142630';
      context.lineWidth = 4;
      context.strokeText(item.label, x + 10, y - 8);
      context.fillText(item.label, x + 10, y - 8);
    }
    const candidate = pick && hover && pickedPart?.part.id === hover.id
      ? pickedPart.projected[hover.index] : undefined;
    if (candidate) {
      context.beginPath();
      context.arc(candidate[0], candidate[1], 8, 0, 2*Math.PI);
      context.strokeStyle = '#fff4ae';
      context.lineWidth = 2;
      context.stroke();
    }
  });

  function position(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function fitView() {
    const points = visible.flatMap(entry => entry.vertices.map(view));
    if (!points.length) return;
    const { min, max } = meshBounds(points);
    const [x, y, z] = scale(add(min, max), 0.5);
    setTarget(add(add(scale(right, x), scale(vertical, y)), scale(camera, z)));
    setPixels(clampScale(Math.min((width-48) / Math.max(0.0001, max[0]-min[0]),
      (height-70) / Math.max(0.0001, max[1]-min[1]))));
  }

  const zoomBy = (amount: number) => setPixels(previous => clampScale(previous * amount));
  return <>
    <div className="dreamer-viewport-tools" role="group" aria-label="View controls">
      <button type="button" aria-label="Zoom in" disabled={!scene.length || pixels >= maxScale} onClick={() => zoomBy(1.4)}>+</button>
      <button type="button" aria-label="Zoom out" disabled={!scene.length || pixels <= minScale} onClick={() => zoomBy(1/1.4)}>−</button>
      <button type="button" disabled={!visible.length} onClick={fitView}>Fit view</button>
    </div>
    <canvas ref={canvas} className={pick ? 'dreamer-model-viewport dreamer-picking' : 'dreamer-model-viewport'}
      aria-label="3D boat assembly. Right-drag to orbit, middle-drag to pan, scroll to zoom." tabIndex={0}
      onContextMenu={event => event.preventDefault()}
      onAuxClick={event => event.preventDefault()}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === '+' || event.key === '=') zoomBy(1.4);
        else if (event.key === '-') zoomBy(1/1.4);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') yaw(previous => previous + (event.key === 'ArrowLeft' ? 0.12 : -0.12));
        else pitch(previous => Math.max(-1.5, Math.min(1.5, previous + (event.key === 'ArrowUp' ? 0.1 : -0.1))));
      }}
      onPointerDown={event => {
        if (event.button < 0 || event.button > 2 || drag.current) return;
        const start = position(event);
        const handle = event.button === 0 && !pick && previewAngle === null
          ? markers.filter(item => tool === 'mass' ? item.handle === 'centerOfMass' : item.handle !== 'centerOfMass')
            .map(item => ({ item, distance: Math.hypot(item.screen[0]-start[0], item.screen[1]-start[1]) }))
            .filter(hit => hit.distance <= 11).sort((a, b) => a.distance - b.distance)[0]?.item : undefined;
        if (handle && selected) {
          drag.current = { kind: 'handle', marker: handle, pose: selected.pose, pivot: joint?.pivot, start, pointer: event.pointerId };
        } else {
          if (event.button === 0 && !pick) return;
          const kind = event.button === 1 ? 'pan' : event.button === 2 ? 'orbit' : 'pick';
          drag.current = { kind, start, last: start, pointer: event.pointerId, moved: false };
        }
        if (event.button !== 0) event.preventDefault();
        event.currentTarget.dataset.gesture = drag.current.kind;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={event => {
        const gesture = drag.current;
        if (gesture?.pointer !== event.pointerId) return;
        drag.current = undefined;
        if (pick && gesture.kind === 'pick' && !gesture.moved && pickedPart) {
          const index = nearestVisibleVertex(...position(event), pickedPart.projected, faces);
          if (index !== undefined) onPickVertex(pickedPart.part.mesh.vertices[index]);
          setHover(undefined);
        }
      }}
      onLostPointerCapture={event => {
        drag.current = undefined;
        delete event.currentTarget.dataset.gesture;
      }}
      onPointerLeave={() => setHover(undefined)}
      onPointerMove={event => {
        const point = position(event);
        const gesture = drag.current;
        if (!gesture) {
          if (pick && pickedPart) {
            const index = nearestVisibleVertex(...point, pickedPart.projected, faces);
            setHover(previous => index === undefined ? undefined :
              previous?.id === selectedId && previous.index === index ? previous : { id: selectedId, index });
          }
          return;
        }
        if (gesture.pointer !== event.pointerId) return;
        if (gesture.kind === 'handle') {
          const dx = (point[0] - gesture.start[0]) / pixels;
          const dy = (gesture.start[1] - point[1]) / pixels;
          const delta = add(scale(right, dx), scale(vertical, dy));
          const { marker: item, pivot, pose } = gesture;
          const target = item.handle === 'axis' && pivot ? subtract(add(item.world, delta), pivot) : delta;
          const local = localDirection(pose, target);
          if (!local) return;
          const value = item.handle === 'axis' ? direction(local) : add(item.local, local);
          if (value) onMoveHandle(item.handle, value);
          return;
        }
        if (!gesture.moved && Math.hypot(point[0]-gesture.start[0], point[1]-gesture.start[1]) < 4) return;
        const [dx, dy] = [point[0]-gesture.last[0], point[1]-gesture.last[1]];
        gesture.moved = true;
        gesture.last = point;
        setHover(undefined);
        if (gesture.kind === 'pan') {
          const delta = add(scale(right, -dx / pixels), scale(vertical, dy / pixels));
          setTarget(previous => add(previous, delta));
        } else if (gesture.kind === 'orbit') {
          yaw(previous => previous - dx * 0.007);
          pitch(previous => Math.max(-1.5, Math.min(1.5, previous + dy * 0.007)));
        }
      }} />
  </>;
}
