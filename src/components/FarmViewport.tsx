import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import './farm-viewport.css';

type Point = { x: number; y: number };
type Camera = Point & { scale: number };
type TrackedPointer = Point & { start: Point; type: string };
type Pinch = { distance: number; scale: number; anchor: Point };

const MIN_ZOOM = 1;
const MAX_ZOOM = 1.8;
const IDENTITY: Camera = { x: 0, y: 0, scale: MIN_ZOOM };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type FarmViewportProps = { children: ReactNode; className?: string };

/** A bounded farm camera. HUDs and scrollable panels belong outside this world. */
export function FarmViewport({ children, className = '' }: FarmViewportProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>(IDENTITY);
  const [camera, setCamera] = useState<Camera>(IDENTITY);
  const [moving, setMoving] = useState(false);
  const pointers = useRef(new Map<number, TrackedPointer>());
  const dragBase = useRef<Camera>(IDENTITY);
  const pinch = useRef<Pinch | null>(null);
  const dragged = useRef(false);
  const suppressClickUntil = useRef(0);

  const updateCamera = useCallback((next: Camera) => {
    const element = viewport.current;
    if (!element) return;
    const scale = clamp(next.scale, MIN_ZOOM, MAX_ZOOM);
    const bounded = {
      scale,
      x: clamp(next.x, element.clientWidth * (1 - scale), 0),
      y: clamp(next.y, element.clientHeight * (1 - scale), 0),
    };
    cameraRef.current = bounded;
    setCamera(bounded);
  }, []);

  const zoomBy = (amount: number) => {
    const element = viewport.current;
    if (!element) return;
    const current = cameraRef.current;
    const scale = clamp(Math.round((current.scale + amount) * 10) / 10, MIN_ZOOM, MAX_ZOOM);
    const center = { x: element.clientWidth / 2, y: element.clientHeight / 2 };
    updateCamera({ scale, x: center.x - (center.x - current.x) * scale / current.scale, y: center.y - (center.y - current.y) * scale / current.scale });
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
    pinch.current = {
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      scale: current.scale,
      anchor: { x: (center.x - current.x) / current.scale, y: (center.y - current.y) / current.scale },
    };
    dragged.current = true;
    setMoving(true);
    capturePointers();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('[data-no-camera],input,textarea,select'))) return;
    if (pointers.current.size >= 2) return;
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
      updateCamera({ scale, x: center.x - pinch.current.anchor.x * scale, y: center.y - pinch.current.anchor.y * scale });
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

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => updateCamera(cameraRef.current));
    observer.observe(element);
    const end = (event: PointerEvent) => finishPointer(event.pointerId);
    const cancel = () => { for (const id of [...pointers.current.keys()]) finishPointer(id); };
    // Also end a pending tap if it leaves the world before crossing the drag threshold.
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', cancel);
    return () => {
      observer.disconnect();
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', cancel);
    };
  }, [finishPointer, updateCamera]);

  return <div ref={viewport} className={`farm-viewport ${moving ? 'fv-camera-moving' : ''} ${className}`} data-zoom={camera.scale.toFixed(3)} data-pan-x={camera.x.toFixed(2)} data-pan-y={camera.y.toFixed(2)}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={event => finishPointer(event.pointerId)} onPointerCancel={event => finishPointer(event.pointerId)}
    onClickCapture={event => {
      if (event.detail > 0 && !(event.target instanceof Element && event.target.closest('[data-no-camera]')) && performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    }}>
    <div className="farm-viewport-world" style={{ transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})` }}>{children}</div>
    <div className="farm-camera-controls" data-no-camera="true" role="group" aria-label="农场地图视角">
      <button type="button" aria-label="缩小农场地图" title="缩小地图" disabled={camera.scale <= MIN_ZOOM + .001} onClick={() => zoomBy(-.2)}><Minus size={19} /></button>
      <button type="button" aria-label="复位农场地图" title="复位地图" onClick={() => updateCamera(IDENTITY)}><Scan size={19} /><span className="farm-camera-zoom">{Math.round(camera.scale * 100)}%</span></button>
      <button type="button" aria-label="放大农场地图" title="放大地图" disabled={camera.scale >= MAX_ZOOM - .001} onClick={() => zoomBy(.2)}><Plus size={19} /></button>
    </div>
  </div>;
}

export default FarmViewport;
