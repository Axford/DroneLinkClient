import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsFullscreen, Compass, ZoomIn, ZoomOut } from 'react-bootstrap-icons';
import IconButton from '../components/ui/IconButton';
import {
  Axis, BoatPart, MeshPose, Vector, add, cross, direction, dot, jointFrame, jointPlacement, localDirection,
  meshBounds, partPose, scale, subtract, transformPoint,
} from './boatModel';
import { angleDelta, protractorBasis, screenProtractor } from './jointProtractor';
import { HydrostaticPose, hydrostaticRotation, waterlineSegment } from './hydrostaticScene';
import { SailingPose, waterGrid } from './sailing/sailingScene';
import { rotate } from './sailing/sailingPhysics';
import { nearestVisibleVertex } from './viewportPicking';

export type Handle = 'centerOfMass' | 'pivot' | 'axis';
export type AngleHandle = 'neutral' | 'minimum' | 'maximum';
export type EditTool = 'mass' | 'joint' | 'neutral' | 'limits';
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
  neutralDraft: number | null;
  onMoveAngle: (handle: AngleHandle, angle: number) => void;
  onMoveHandle: (handle: Handle, value: Vector) => void;
  onPickVertex: (vertex: Vector) => void;
  hydrostatic?: HydrostaticPose;
  sailing?: SailingPose;
}
interface Marker { handle: Handle; world: Vector; local: Vector; screen: Vector; color: string; label: string; }
type Drag =
  | { kind: 'angle'; handle: AngleHandle; pointerAngle: number; angle: number; pointer: number }
  | { kind: 'handle'; marker: Marker; pose: MeshPose; pivot?: Vector; start: Point; pointer: number }
  | { kind: 'orbit' | 'pan' | 'pick'; start: Point; last: Point; pointer: number; moved: boolean };

const minScale = 0.01, maxScale = 1_000_000;
const clampScale = (value: number) => Math.min(maxScale, Math.max(minScale, value));
function editorPalette() {
  const style = getComputedStyle(document.documentElement);
  const read = (role: string) => style.getPropertyValue('--dw-' + role).trim();
  return {
    canvas: read('color-instrument-face'), outline: read('color-canvas'),
    highlight: read('color-accent'), mesh: read('color-muted'),
    cg: read('color-warning'), up: read('color-text'), forward: read('color-success'),
    font: [read('font-size-meta'), read('font-family')].join(' '),
  };
}

export default function ModelViewport({
  parts, selectedId, hidden, forward, up, tool, pick, previewAngle, neutralDraft, onMoveAngle, onMoveHandle, onPickVertex, hydrostatic, sailing,
}: Props) {
  const [palette] = useState(editorPalette);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const fittedSimulation = useRef(false);
  const [[width, height], setSize] = useState<Point>([0, 0]);
  const [azimuth, yaw] = useState(-0.9);
  const [elevation, pitch] = useState(0.42);
  const [pixels, setPixels] = useState(250);
  const [target, setTarget] = useState<Vector>([0, 0, 0]);
  const [limitPreview, setLimitPreview] = useState<number | null>(null);
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
      if (!scene.length || !event.altKey) return;
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
    const follow: Vector = sailing ? [sailing.state.position[0], sailing.state.position[1], 0] : [0, 0, 0];
    const cameraTarget = add(target, follow);
    const project = (vertex: Vector): Vector => {
      const [x, y, z] = view(subtract(vertex, cameraTarget));
      return [width/2 + x*pixels, height/2 - y*pixels, z];
    };
    const joint = selected && jointFrame(selected.part, selected.pose);
    const move = selected ? jointPlacement(selected.part, selected.pose,
      neutralDraft !== null ? neutralDraft - (selected.part.joint?.neutral ?? 0) :
        previewAngle ?? limitPreview ?? 0) : (vertex: Vector) => vertex;

    const attitude = sailing ? (point: Vector) =>
      add(sailing.state.position, rotate(sailing.state.orientation, subtract(point, sailing.center))) :
      hydrostatic && hydrostaticRotation(hydrostatic.heel, hydrostatic.pitch);
    const visible = scene.filter(entry => !hidden.has(entry.part.id)).map(entry => {
      const placement = entry === selected ? move : jointPlacement(entry.part, entry.pose, sailing?.angles[entry.part.id]);
      const vertices = attitude ? entry.vertices.map(vertex => attitude(placement(vertex))) : entry.vertices.map(placement);
      return { ...entry, vertices, projected: vertices.map(project) };
    });
    const faces = visible.flatMap(({ part, projected }) => part.mesh.triangles.map(([a, b, c]) => {
      const vertices: [Vector, Vector, Vector] = [projected[a], projected[b], projected[c]];
      const [p, q, r] = vertices;
      // Convert screen X and inverted Y to the same length scale as depth.
      const normal = cross([(q[0]-p[0])/pixels, (p[1]-q[1])/pixels, q[2]-p[2]],
        [(r[0]-p[0])/pixels, (p[1]-r[1])/pixels, r[2]-p[2]]);
      const norm = Math.hypot(...normal);
      const light = norm ? 0.48 + 0.5 * Math.abs(dot(normal, [-0.3, 0.5, 0.8]) / norm) : 0.48;
      const base = part.id === selectedId ? palette.highlight : palette.mesh;
      const fill = `color-mix(in srgb, ${base} ${Math.round(light * 100)}%, black)`;
      return { vertices, depth: (p[2]+q[2]+r[2])/3, fill };
    })).sort((a, b) => a.depth - b.depth);
    const waterline = hydrostatic?.water?.waterline;
    const sections = waterline === undefined ? [] : visible
      .filter(({ part }) => hydrostatic?.water?.displacementIds.includes(part.id))
      .flatMap(({ part, vertices }) => part.mesh.triangles.flatMap(([a,b,c]) => {
        const segment = waterlineSegment([vertices[a], vertices[b], vertices[c]], waterline);
        return segment ? [segment.map(project)] : [];
      }));
    return { right, vertical, camera, view, project, joint, move, visible, faces, sections, follow, cameraTarget };
  }, [scene, selected, selectedId, hidden, azimuth, elevation, width, height, pixels, target, previewAngle, neutralDraft, limitPreview, palette, hydrostatic, sailing]);
  const { right, vertical, camera, view, project, joint, move, visible, faces, sections, follow, cameraTarget } = frame;
  const pickedPart = visible.find(entry => entry.part.id === selectedId);

  const angleMode = tool === 'neutral' || tool === 'limits';
  const markers: Marker[] = [];
  function marker(handle: Handle, world: Vector, local: Vector, label: string) {
    markers.push({ handle, world, local, screen: project(world), color: handle === 'centerOfMass' ? palette.cg : palette.highlight, label });
  }
  if (selected && tool === 'mass') {
    const centerOfMass = selected.part.centerOfMass ?? [0, 0, 0];
    marker('centerOfMass', move(transformPoint(selected.pose, centerOfMass)), centerOfMass,
      selected.part.centerOfMass ? 'CG' : 'Set CG');
  }
  if (!angleMode && selected?.part.joint && joint) {
    marker('pivot', joint.pivot, selected.part.joint.pivot, 'Pivot');
    if (joint.axis) marker('axis', add(joint.pivot, scale(joint.axis, 74 / pixels)), selected.part.joint.axis, 'Axis');
  }

  const settings = selected?.part.joint;
  const savedZero = settings?.neutral ?? 0;
  const protractor = angleMode && joint?.axis && settings ? (() => {
    const center = project(joint.pivot);
    const basis = protractorBasis(joint.axis).map(vector =>
      subtract(project(add(joint.pivot, scale(vector, 92 / pixels))), center));
    return screenProtractor(center, [basis[0][0], basis[0][1]], [basis[1][0], basis[1][1]]);
  })() : undefined;
  const angleHandles = protractor && settings ? (tool === 'neutral'
    ? [{ handle: 'neutral' as const, angle: neutralDraft ?? savedZero, point: protractor.point(neutralDraft ?? savedZero), label: 'Zero' }]
    : [
      { handle: 'minimum' as const, angle: settings.minimum, point: protractor.point(savedZero + settings.minimum, 0.82), label: 'Min' },
      { handle: 'maximum' as const, angle: settings.maximum, point: protractor.point(savedZero + settings.maximum), label: 'Max' },
    ]) : [];

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || !width || !height) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const bitmapWidth = Math.round(width * density), bitmapHeight = Math.round(height * density);
    if (element.width !== bitmapWidth) element.width = bitmapWidth;
    if (element.height !== bitmapHeight) element.height = bitmapHeight;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.fillStyle = palette.canvas;
    context.fillRect(0, 0, width, height);
    const water = hydrostatic?.water;
    const bounds = water && meshBounds(visible.flatMap(entry => entry.vertices));
    const extent = bounds ? Math.max(...subtract(bounds.max, bounds.min), 0.01) : 0;
    if (water && bounds) {
      const [x, y] = scale(add(bounds.min, bounds.max), 0.5);
      const radius = extent * 0.68;
      const [a,b,c,d] = [
        [x-radius, y-radius, water.waterline], [x+radius, y-radius, water.waterline],
        [x+radius, y+radius, water.waterline], [x-radius, y+radius, water.waterline],
      ].map(vertex => project(vertex as Vector));
      context.beginPath();
      context.moveTo(a[0], a[1]);
      for (const corner of [b,c,d]) context.lineTo(corner[0], corner[1]);
      context.closePath();
      context.fillStyle = 'color-mix(in srgb, ' + palette.highlight + ' 18%, transparent)';
      context.fill();
      context.strokeStyle = 'color-mix(in srgb, ' + palette.highlight + ' 60%, transparent)';
      context.lineWidth = 1;
      context.stroke();
      for (let index = 1; index < 8; index++) {
        const step = index * radius / 4;
        const h1 = project([x-radius, y-radius+step, water.waterline]);
        const h2 = project([x+radius, y-radius+step, water.waterline]);
        const v1 = project([x-radius+step, y-radius, water.waterline]);
        const v2 = project([x-radius+step, y+radius, water.waterline]);
        const gridColor = 'color-mix(in srgb, ' + palette.highlight + ' 27%, transparent)';
        line([h1[0],h1[1]], [h2[0],h2[1]], gridColor);
        line([v1[0],v1[1]], [v2[0],v2[1]], gridColor);
      }
    }
    if (sailing) {
      const grid = waterGrid(cameraTarget, sailing.state.time, sailing.water, Math.max(width,height) / pixels);
      const color = 'color-mix(in srgb, ' + palette.highlight + ' 30%, transparent)';
      for (const row of grid) {
        context.beginPath();
        for (let index = 0; index < row.length; index++) {
          const [x,y] = project(row[index]);
          if (index === 0) context.moveTo(x,y); else context.lineTo(x,y);
        }
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.stroke();
      }
    }
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
    for (const [a,b] of sections) line([a[0],a[1]], [b[0],b[1]], palette.highlight, 2);
    function arrow(world: Vector, tip: Vector, color: string, label: string, offset = -8) {
      if (!context) return;
      const [x,y] = project(world), [endX,endY] = project(tip);
      const dx = endX - x, dy = endY - y;
      const length = Math.hypot(dx, dy);
      line([x,y], [endX,endY], color, 2.5);
      if (length >= 1) {
        const ux = dx / length, uy = dy / length;
        const head = Math.min(length*0.5, 9), width = head*0.45;
        line([endX,endY], [endX - head*ux + width*uy, endY - head*uy - width*ux], color, 2.5);
        line([endX,endY], [endX - head*ux - width*uy, endY - head*uy + width*ux], color, 2.5);
      }
      context.beginPath();
      context.arc(x, y, 4, 0, 2*Math.PI);
      context.fillStyle = color;
      context.fill();
      context.font = '600 ' + palette.font;
      context.strokeStyle = palette.outline;
      context.lineWidth = 4;
      context.strokeText(label, x+10, y+offset);
      context.fillText(label, x+10, y+offset);
    }
    if (water) {
      arrow(water.cg, add(water.cg,[0,0,-extent*0.22]), palette.cg, 'CG', 15);
      arrow(water.cp, add(water.cp,[0,0,extent*0.22]), palette.highlight, 'CP');
    }
    for (const vector of sailing?.vectors ?? [])
      arrow(vector.start, vector.end, palette[vector.color], vector.label);
    if (scene.length) {
      const origin: Point = [50, height - 45];
      context.font = palette.font;
      const rotateAxes = sailing ? (axis: Vector) => rotate(sailing.state.orientation, axis) :
        hydrostatic && hydrostaticRotation(hydrostatic.heel, hydrostatic.pitch);
      for (const [axis, color, label] of [
        [[1, 0, 0], palette.forward, 'Fwd'], [[0, 1, 0], palette.highlight, 'Port'], [[0, 0, 1], palette.up, 'Up'],
      ] as [Vector, string, string][]) {
        const direction = rotateAxes ? rotateAxes(axis) : axis;
        const x = origin[0] + 26 * dot(direction, right), y = origin[1] - 26 * dot(direction, vertical);
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
      context.strokeStyle = palette.outline;
      context.lineWidth = 2;
      context.stroke();
      context.font = '600 ' + palette.font;
      context.strokeStyle = palette.outline;
      context.lineWidth = 4;
      context.strokeText(item.label, x + 10, y - 8);
      context.fillText(item.label, x + 10, y - 8);
    }
    if (protractor && settings) {
      const center: Point = [protractor.center[0], protractor.center[1]];
      const arc = (start: number, span: number, color: string, width: number) => {
        if (!context) return;
        const segments = Math.max(2, Math.ceil(Math.abs(span) / 5));
        context.beginPath();
        for (let i = 0; i <= segments; i++) {
          const [x, y] = protractor!.point(start + span * i / segments);
          if (!i) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.strokeStyle = color;
        context.lineWidth = width;
        context.stroke();
      };
      context.font = '600 ' + palette.font;
      context.strokeStyle = palette.outline;
      arc(0, 360, palette.mesh, 1);
      context.beginPath();
      context.arc(center[0], center[1], 3, 0, 2*Math.PI);
      context.fillStyle = palette.up;
      context.fill();
      for (let degree = 0; degree < 360; degree += 15) {
        const [a, b] = protractor.point(savedZero + degree, degree % 45 === 0 ? 0.87 : 0.94);
        const [x, y] = protractor.point(savedZero + degree);
        line([a, b], [x, y], palette.mesh);
      }
      if (tool === 'limits') {
        const [x, y] = protractor.point(savedZero);
        line(center, [x, y], palette.up);
        context.fillStyle = palette.up;
        context.fillText('0°', x+4, y-6);
        if (settings.maximum >= settings.minimum)
          arc(savedZero + settings.minimum, Math.min(360, settings.maximum - settings.minimum), palette.highlight, 3);
      }
      for (const { point, label, angle } of angleHandles) {
        const [x, y] = point;
        const color = label === 'Min' ? palette.cg : palette.highlight;
        line(center, [x, y], color, 2);
        context.beginPath();
        context.arc(x, y, 7, 0, 2*Math.PI);
        context.fillStyle = color;
        context.fill();
        const text = label + ' ' + angle.toFixed(1) + '°';
        context.strokeStyle = palette.outline;
        context.lineWidth = 4;
        context.strokeText(text, x+10, y-8);
        context.fillText(text, x+10, y-8);
      }
    }
    const candidate = pick && hover && pickedPart?.part.id === hover.id
      ? pickedPart.projected[hover.index] : undefined;
    if (candidate) {
      context.beginPath();
      context.arc(candidate[0], candidate[1], 8, 0, 2*Math.PI);
      context.strokeStyle = palette.cg;
      context.lineWidth = 2;
      context.stroke();
    }
  });

  function position(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function fitView(margin = 1) {
    const points = visible.flatMap(entry => entry.vertices.map(view));
    if (!points.length) return;
    const { min, max } = meshBounds(points);
    const [x, y, z] = scale(add(min, max), 0.5);
    setTarget(subtract(add(add(scale(right, x), scale(vertical, y)), scale(camera, z)), follow));
    setPixels(clampScale(margin * Math.min((width-48) / Math.max(0.0001, max[0]-min[0]),
      (height-70) / Math.max(0.0001, max[1]-min[1]))));
  }

  useEffect(() => {
    if ((hydrostatic || sailing) && !fittedSimulation.current && width > 80 && height > 100 && visible.length) {
      fittedSimulation.current = true;
      fitView(0.75);
    }
  });

  const zoomBy = (amount: number) => setPixels(previous => clampScale(previous * amount));
  return <>
    <div className="dreamer-viewport-tools dw-toolbar" role="group" aria-label="View controls">
      <IconButton type="button" label="Zoom in" icon={<ZoomIn />} disabled={!scene.length || pixels >= maxScale} onClick={() => zoomBy(1.4)} />
      <IconButton type="button" label="Zoom out" icon={<ZoomOut />} disabled={!scene.length || pixels <= minScale} onClick={() => zoomBy(1/1.4)} />
      {angleMode && joint?.axis && <IconButton type="button" label="Look along joint axis" icon={<Compass />} onClick={() => {
        if (!joint?.axis) return;
        yaw(Math.atan2(joint.axis[1], joint.axis[0]));
        pitch(Math.asin(Math.max(-1, Math.min(1, joint.axis[2]))));
        setTarget(joint.pivot);
      }} />}
      <IconButton type="button" label="Fit view" icon={<ArrowsFullscreen />} disabled={!visible.length} onClick={() => fitView(hydrostatic || sailing ? 0.75 : 1)} />
    </div>
    <canvas ref={canvas} className={pick ? 'dreamer-model-viewport dreamer-picking' : 'dreamer-model-viewport'}
      aria-label={(sailing ? 'Live 3D sailing view.' : hydrostatic ? '3D hydrostatic preview.' : '3D boat assembly.') + ' Right-drag to orbit, middle-drag to pan, Alt or Option plus scroll to zoom.'} tabIndex={0}
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
        const handle = event.button === 0 && !pick && !angleMode && previewAngle === null
          ? markers.filter(item => tool === 'mass' ? item.handle === 'centerOfMass' : item.handle !== 'centerOfMass')
            .map(item => ({ item, distance: Math.hypot(item.screen[0]-start[0], item.screen[1]-start[1]) }))
            .filter(hit => hit.distance <= 11).sort((a, b) => a.distance - b.distance)[0]?.item : undefined;
        const angular = event.button === 0 && protractor?.draggable
          ? angleHandles.map(item => ({ item, distance: Math.hypot(item.point[0]-start[0], item.point[1]-start[1]) }))
            .filter(hit => hit.distance <= 12).sort((a, b) => a.distance - b.distance)[0]?.item : undefined;
        const pointerAngle = angular && protractor?.angle(start);
        if (angular && pointerAngle !== undefined) {
          drag.current = { kind: 'angle', handle: angular.handle, angle: angular.angle, pointerAngle, pointer: event.pointerId };
        } else if (handle && selected) {
          const pose = selected.pose;
          const handlePose: MeshPose = handle.handle === 'centerOfMass' && joint?.axis
            ? [subtract(move(add(pose[0], pose[3])), move(pose[3])),
              subtract(move(add(pose[1], pose[3])), move(pose[3])),
              subtract(move(add(pose[2], pose[3])), move(pose[3])), pose[3]] : pose;
          drag.current = { kind: 'handle', marker: handle, pose: handlePose, pivot: joint?.pivot, start, pointer: event.pointerId };
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
        setLimitPreview(null);
        if (pick && gesture.kind === 'pick' && !gesture.moved && pickedPart) {
          const index = nearestVisibleVertex(...position(event), pickedPart.projected, faces);
          if (index !== undefined) onPickVertex(pickedPart.part.mesh.vertices[index]);
          setHover(undefined);
        }
      }}
      onLostPointerCapture={event => {
        drag.current = undefined;
        setLimitPreview(null);
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
        if (gesture.kind === 'angle' && settings) {
          const angle = protractor?.angle(point);
          if (angle === undefined) return;
          const next = gesture.angle + angleDelta(gesture.pointerAngle, angle);
          gesture.pointerAngle = angle;
          gesture.angle = gesture.handle === 'minimum' ? Math.min(next, settings.maximum) :
            gesture.handle === 'maximum' ? Math.max(next, settings.minimum) : next;
          const rounded = Math.round(gesture.angle * 10) / 10;
          const value = gesture.handle === 'minimum' ? Math.min(rounded, settings.maximum) :
            gesture.handle === 'maximum' ? Math.max(rounded, settings.minimum) : rounded;
          onMoveAngle(gesture.handle, value);
          if (gesture.handle !== 'neutral') setLimitPreview(value);
          return;
        }
        if (gesture.kind === 'angle') return;
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
