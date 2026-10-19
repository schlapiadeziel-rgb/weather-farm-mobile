import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import './farm-viewport.css';
import './farm-field-world.css';

type Point = { x: number; y: number };
type Camera = Point & { scale: number };
type TrackedPointer = Point & { start: Point; type: string };
type Pinch = { distance: number; scale: number; anchor: Point };
type WorldGeometry = { width: number; height: number; worldWidth: number; worldHeight: number; offset: Point };

const MIN_ZOOM = 1;
const MAX_ZOOM = 1.8;
const IDENTITY: Camera = { x: 0, y: 0, scale: MIN_ZOOM };
const EMPTY_GEOMETRY: WorldGeometry = { width: 0, height: 0, worldWidth: 0, worldHeight: 0, offset: { x: 0, y: 0 } };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type FarmViewportProps = { children: ReactNode; className?: string };

/** A bounded farm camera. HUDs and scrollable panels belong outside this world. */
export function FarmViewport({ children, className = '' }: FarmViewportProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>(IDENTITY);
  const [camera, setCamera] = useState<Camera>(IDENTITY);
  const geometryRef = useRef<WorldGeometry>(EMPTY_GEOMETRY);
  const [geometry, setGeometry] = useState<WorldGeometry>(EMPTY_GEOMETRY);
  const [moving, setMoving] = useState(false);
  const pointers = useRef(new Map<number, TrackedPointer>());
  const canceledPointers = useRef(new Set<number>());
  const dragBase = useRef<Camera>(IDENTITY);
  const pinch = useRef<Pinch | null>(null);
  const dragged = useRef(false);
  const suppressClickUntil = useRef(0);

  const updateCamera = useCallback((next: Camera) => {
    const { width, height, worldWidth, worldHeight, offset } = geometryRef.current;
    if (!width || !height) return;
    const scale = clamp(next.scale, MIN_ZOOM, MAX_ZOOM);
    const bounded = {
      scale,
      x: clamp(next.x, width - worldWidth * scale - offset.x, -offset.x),
      y: clamp(next.y, height - worldHeight * scale - offset.y, -offset.y),
    };
    cameraRef.current = bounded;
    setCamera(bounded);
  }, []);

  const zoomBy = (amount: number) => {
    const { width, height, offset } = geometryRef.current;
    if (!width || !height) return;
    const current = cameraRef.current;
    const scale = clamp(Math.round((current.scale + amount) * 10) / 10, MIN_ZOOM, MAX_ZOOM);
    const center = { x: width / 2, y: height / 2 };
    updateCamera({ scale, x: center.x - offset.x - (center.x - offset.x - current.x) * scale / current.scale, y: center.y - offset.y - (center.y - offset.y - current.y) * scale / current.scale });
  };

  const localPoint = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const capturePointers = () => {
    const element = viewport.current;
    if (!element) return;
    for (const id of pointers.current.keys()) {
      try { element.setPointerCapture(id); } catch { /* A released pointer cannot be captured. */ }
    }
  };

  const startPinch = () => {
    const [first, second] = [...pointers.current.values()];
    if (!first || !second) return;
    const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const current = cameraRef.current;
    const { offset } = geometryRef.current;
    pinch.current = {
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      scale: current.scale,
      anchor: { x: (center.x - offset.x - current.x) / current.scale, y: (center.y - offset.y - current.y) / current.scale },
    };
    dragged.current = true;
    setMoving(true);
    capturePointers();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('[data-no-camera],input,textarea,select'))) return;
    if (pointers.current.size >= 2) return;
    canceledPointers.current.delete(event.pointerId);
    const point = localPoint(event);
    if (!pointers.current.size) {
      suppressClickUntil.current = 0;
      dragged.current = false;
      dragBase.current = cameraRef.current;
    }
    pointers.current.set(event.pointerId, { ...point, start: point, type: event.pointerType });
    if (pointers.current.size === 2) {
      startPinch();
      event.preventDefault();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = pointers.current.get(event.pointerId);
    if (!pointer) return;
    Object.assign(pointer, localPoint(event));
    if (pointers.current.size === 2 && pinch.current) {
      const [first, second] = [...pointers.current.values()];
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const scale = clamp(pinch.current.scale * Math.hypot(first.x - second.x, first.y - second.y) / pinch.current.distance, MIN_ZOOM, MAX_ZOOM);
      const { offset } = geometryRef.current;
      updateCamera({ scale, x: center.x - offset.x - pinch.current.anchor.x * scale, y: center.y - offset.y - pinch.current.anchor.y * scale });
      event.preventDefault();
      return;
    }
    const dx = pointer.x - pointer.start.x, dy = pointer.y - pointer.start.y;
    if (!dragged.current && Math.hypot(dx, dy) < (pointer.type === 'touch' ? 10 : 7)) return;
    if (!dragged.current) {
      dragged.current = true;
      setMoving(true);
      capturePointers();
    }
    updateCamera({ ...dragBase.current, x: dragBase.current.x + dx, y: dragBase.current.y + dy });
    event.preventDefault();
  };

  const finishPointer = useCallback((id: number) => {
    // Cancellation can precede the physical release by an arbitrary amount of
    // time (for example when rotating with a finger still held on a crop).
    if (canceledPointers.current.delete(id)) suppressClickUntil.current = performance.now() + 700;
    if (!pointers.current.has(id)) return;
    if (dragged.current) suppressClickUntil.current = performance.now() + 700;
    pointers.current.delete(id);
    const element = viewport.current;
    try { if (element?.hasPointerCapture(id)) element.releasePointerCapture(id); } catch { /* Capture may already be released. */ }
    pinch.current = null;
    const remaining = [...pointers.current.values()][0];
    if (remaining) {
      remaining.start = { x: remaining.x, y: remaining.y };
      dragBase.current = cameraRef.current;
    } else {
      dragged.current = false;
      setMoving(false);
    }
  }, []);

  const cancelPointers = useCallback(() => {
    const ids = [...pointers.current.keys()];
    if (ids.length) suppressClickUntil.current = performance.now() + 700;
    for (const id of ids) finishPointer(id);
    for (const id of ids) canceledPointers.current.add(id);
  }, [finishPointer]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const end = (event: PointerEvent) => {
      if (event.type === 'pointercancel' && pointers.current.has(event.pointerId)) cancelPointers();
      finishPointer(event.pointerId);
    };
    const hidden = () => { if (document.hidden) cancelPointers(); };
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      const previous = geometryRef.current;
      if (previous.width === width && previous.height === height) return;
      // Keep the SVG's full logical canvas. The viewport crops a movable world,
      // rather than letting the SVG crop its own artwork before the camera pans.
      const base = Math.max(width / 1200, height / 700);
      const worldWidth = 1200 * base, worldHeight = 700 * base;
      const next = { width, height, worldWidth, worldHeight, offset: { x: (width - worldWidth) / 2, y: (height - worldHeight) / 2 } };
      cancelPointers();
      geometryRef.current = next;
      setGeometry(next);
      updateCamera(cameraRef.current);
      dragBase.current = cameraRef.current;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // Also end a pending tap if it leaves the world before crossing the drag threshold.
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', cancelPointers);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      observer.disconnect();
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('blur', cancelPointers);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [cancelPointers, finishPointer, updateCamera]);

  return <div ref={viewport} className={`farm-viewport ${moving ? 'fv-camera-moving' : ''} ${className}`} data-zoom={camera.scale.toFixed(3)} data-pan-x={camera.x.toFixed(2)} data-pan-y={camera.y.toFixed(2)}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event => finishPointer(event.pointerId)} onPointerCancel={event => finishPointer(event.pointerId)}
    onLostPointerCapture={event => {
      // A child's implicit touch capture is released when the camera takes
      // ownership. Only loss of the viewport's own capture cancels the camera.
      if (event.target === event.currentTarget && pointers.current.has(event.pointerId)) cancelPointers();
    }}
    onClickCapture={event => {
      if (event.detail > 0 && !(event.target instanceof Element && event.target.closest('[data-no-camera]')) && performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    }}>
    <div className="farm-viewport-world" style={{ '--farm-world-base': geometry.worldWidth ? geometry.worldWidth / 1200 : 1, width: geometry.worldWidth || '100%', height: geometry.worldHeight || '100%', transform: `translate3d(${geometry.offset.x + camera.x}px, ${geometry.offset.y + camera.y}px, 0) scale(${camera.scale})` } as CSSProperties}>{children}</div>
    <div className="farm-camera-controls" data-no-camera="true" role="group" aria-label="农场地图视角">
      <button type="button" aria-label="缩小农场地图" title="缩小地图" disabled={camera.scale <= MIN_ZOOM + .001} onClick={() => zoomBy(-.2)}><Minus size={19} /></button>
      <button type="button" aria-label="复位农场地图" title="复位地图" onClick={() => updateCamera(IDENTITY)}><Scan size={19} /><span className="farm-camera-zoom">{Math.round(camera.scale * 100)}%</span></button>
      <button type="button" aria-label="放大农场地图" title="放大地图" disabled={camera.scale >= MAX_ZOOM - .001} onClick={() => zoomBy(.2)}><Plus size={19} /></button>
    </div>
  </div>;
}

export default FarmViewport;
