import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Axis, BoatPart, Vector, cross, dot, meshBounds, placedVertices } from './boatModel';

interface Props { parts: BoatPart[]; selectedId: string; forward: Axis; up: Axis }

export default function ModelViewport({ parts, selectedId, forward, up }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [azimuth, yaw] = useState(-0.9);
  const [elevation, pitch] = useState(0.42);
  const drag = useRef<{ x: number; y: number; pointer: number } | undefined>(undefined);
  const scene = useMemo(() => parts.map(part => ({
    id: part.id, vertices: placedVertices(part, forward, up), triangles: part.mesh.triangles,
  })), [parts, forward, up]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    const context = ctx;
    const [ca, sa, ce, se] = [Math.cos(azimuth), Math.sin(azimuth), Math.cos(elevation), Math.sin(elevation)];
    const camera: Vector = [ce*ca, ce*sa, se];
    const right: Vector = [-sa, ca, 0], vertical = cross(camera, right);
    const projected = scene.map(part => ({
      ...part, screen: part.vertices.map((vertex): Vector => [dot(vertex, right), dot(vertex, vertical), dot(vertex, camera)]),
    }));
    const limits = meshBounds(projected.flatMap(part => part.screen));
    const { min, max } = limits;
    const faces = projected.flatMap(part => part.triangles.map(([a, b, c]) => {
      const vertices = [part.screen[a], part.screen[b], part.screen[c]];
      const [p, q, r] = vertices;
      const normal = cross([q[0]-p[0], q[1]-p[1], q[2]-p[2]], [r[0]-p[0], r[1]-p[1], r[2]-p[2]]);
      const norm = Math.hypot(...normal);
      const light = norm ? 0.48 + 0.5 * Math.abs(dot(normal, [-0.3, 0.5, 0.8]) / norm) : 0.48;
      const color = (part.id === selectedId ? [152, 236, 203] : [114, 163, 188]).map(value => Math.round(value * light));
      return { vertices, depth: (p[2]+q[2]+r[2])/3, fill: 'rgb(' + color.join(',') + ')' };
    })).sort((a, b) => a.depth - b.depth);

    function draw() {
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      const density = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * density);
      element.height = Math.round(height * density);
      context.setTransform(density, 0, 0, density, 0, 0);
      context.fillStyle = '#142630';
      context.fillRect(0, 0, width, height);
      if (!faces.length) return;
      const pixels = Math.min((width - 40) / Math.max(0.01, max[0]-min[0]), (height - 60) / Math.max(0.01, max[1]-min[1]));
      const cx = (min[0]+max[0])/2, cy = (min[1]+max[1])/2;
      for (const { vertices, fill } of faces) {
        context.beginPath();
        vertices.forEach(([x, y], index) => {
          const dx = width/2 + (x-cx)*pixels, dy = height/2 - (y-cy)*pixels;
          if (index === 0) context.moveTo(dx, dy);
          else context.lineTo(dx, dy);
        });
        context.closePath();
        context.fillStyle = fill;
        context.fill();
      }
      const origin = [50, height - 45];
      context.font = '12px system-ui';
      for (const [axis, color, label] of [
        [[1, 0, 0], '#a9ebc8', 'Fwd'], [[0, 1, 0], '#9cc6f4', 'Port'], [[0, 0, 1], '#f6d7a0', 'Up'],
      ] as [Vector, string, string][]) {
        const x = origin[0] + 26 * dot(axis, right), y = origin[1] - 26 * dot(axis, vertical);
        context.beginPath();
        context.moveTo(origin[0], origin[1]);
        context.lineTo(x, y);
        context.strokeStyle = color;
        context.stroke();
        context.fillStyle = color;
        context.fillText(label, x + 4, y);
      }
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene, selectedId, azimuth, elevation]);

  return <canvas ref={canvas} className="dreamer-model-viewport" aria-label="3D boat assembly, drag to orbit" tabIndex={0}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') yaw(previous => previous + (event.key === 'ArrowLeft' ? 0.12 : -0.12));
      else pitch(previous => Math.max(-1.2, Math.min(1.2, previous + (event.key === 'ArrowUp' ? 0.1 : -0.1))));
    }}
    onPointerDown={event => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    }}
    onLostPointerCapture={() => { drag.current = undefined; }}
    onPointerMove={event => {
      if (drag.current?.pointer !== event.pointerId) return;
      const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
      drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
      yaw(previous => previous - dx * 0.007);
      pitch(previous => Math.max(-1.2, Math.min(1.2, previous + dy * 0.007)));
    }} />;
}
