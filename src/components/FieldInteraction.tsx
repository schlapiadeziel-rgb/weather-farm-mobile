import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { CropId, Game } from '../lib/farmTypes';
import { applyFieldStroke, getFieldStrokeNotice } from '../lib/fieldStroke';
import type { FieldMode } from '../lib/fieldStroke';
import './field-tools.css';

export type FieldInteractionProps = {
  children: ReactNode;
  game: Game;
  mode: FieldMode;
  seed: CropId;
  blocked?: boolean;
  onChange(game: Game): void | boolean;
  onNotice?(message: string): void;
};

type Point = { x: number; y: number };
type Stroke = { pointer: number; mode: 'plant' | 'harvest'; seed: CropId; ids: number[]; last: Point };

/** One pointer stroke is one inventory transaction and one user notification. */
export function FieldInteraction({ children, game, mode, seed, blocked = false, onChange, onNotice }: FieldInteractionProps) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef({ game, mode, seed, blocked, onChange, onNotice });
  current.current = { game, mode, seed, blocked, onChange, onNotice };
  const stroke = useRef<Stroke | null>(null);
  const blockedPointers = useRef(new Set<number>());
  const downPointers = useRef(new Set<number>());
  const canceledPointers = useRef(new Set<number>());
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState<number[]>([]);

  const plotId = useCallback((target: EventTarget | null): number | null => {
    if (!(target instanceof Element)) return null;
    const plot = target.closest<HTMLElement>('[data-plot-id]');
    if (!plot || !container.current?.contains(plot)) return null;
    const id = Number(plot.dataset.plotId);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }, []);

  const plotAt = useCallback((point: Point): number | null => {
    // Honor the actual topmost hit target: HUDs, popovers and other controls
    // must not let this brush paint a field hidden behind them.
    return plotId(document.elementFromPoint(point.x, point.y));
  }, [plotId]);

  const cancelStroke = useCallback(() => {
    const active = stroke.current;
    stroke.current = null;
    setPreview([]);
    if (!active) return;
    if (downPointers.current.has(active.pointer)) canceledPointers.current.add(active.pointer);
    suppressClickUntil.current = performance.now() + 800;
    try { if (container.current?.hasPointerCapture(active.pointer)) container.current.releasePointerCapture(active.pointer); } catch { /* The OS may already have released capture. */ }
  }, []);

  const submit = useCallback((ids: number[], action: 'plant' | 'harvest', chosenSeed: CropId) => {
    const latest = current.current;
    if (latest.blocked) return;
    try {
      const result = applyFieldStroke(latest.game, action, ids, chosenSeed, Date.now());
      const saved = result.changedPlotIds.length ? latest.onChange(result.game) : undefined;
      const notice = getFieldStrokeNotice(result, action, chosenSeed);
      latest.onNotice?.(saved === false ? `${notice} 本机未能保存，请导出游戏备份。` : notice);
    } catch (error) {
      latest.onNotice?.(error instanceof Error ? error.message : '这次田地操作未完成，请重试。');
    }
  }, []);

  const appendPoint = useCallback((point: Point) => {
    const active = stroke.current;
    if (!active) return;
    // Sample the segment as well as the event endpoint, so a quick swipe cannot
    // skip a plot between two sparse browser pointermove events.
    const distance = Math.hypot(point.x - active.last.x, point.y - active.last.y);
    const steps = Math.max(1, Math.ceil(distance / 8));
    let changed = false;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const id = plotAt({ x: active.last.x + (point.x - active.last.x) * t, y: active.last.y + (point.y - active.last.y) * t });
      if (id !== null && !active.ids.includes(id)) { active.ids.push(id); changed = true; }
    }
    active.last = point;
    if (changed) setPreview([...active.ids]);
  }, [plotAt]);

  useEffect(() => {
    cancelStroke();
  }, [mode, seed, blocked, cancelStroke]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const ids = new Set(preview);
    element.querySelectorAll<HTMLElement>('[data-plot-id]').forEach(plot => {
      if (ids.has(Number(plot.dataset.plotId))) plot.dataset.fieldPreview = mode;
      else delete plot.dataset.fieldPreview;
    });
  }, [preview, mode, children]);

  useEffect(() => {
    const down = (event: PointerEvent) => {
      downPointers.current.add(event.pointerId);
      canceledPointers.current.delete(event.pointerId);
      if (current.current.mode === 'browse' || event.pointerType !== 'touch') return;
      blockedPointers.current.add(event.pointerId);
      if (blockedPointers.current.size > 1) cancelStroke();
    };
    const end = (event: PointerEvent) => {
      blockedPointers.current.delete(event.pointerId);
      // Releasing outside the captured world never leaves a pending stroke.
      if (stroke.current?.pointer === event.pointerId) cancelStroke();
    };
    // React handlers stop bubbling to keep the camera from claiming the stroke;
    // clean the multi-touch tracker during capture so it cannot retain old IDs.
    const release = (event: PointerEvent) => {
      downPointers.current.delete(event.pointerId);
      blockedPointers.current.delete(event.pointerId);
      if (canceledPointers.current.delete(event.pointerId)) suppressClickUntil.current = performance.now() + 800;
    };
    const cancel = () => { blockedPointers.current.clear(); cancelStroke(); };
    const hidden = () => { if (document.hidden) cancel(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !stroke.current) return;
      event.preventDefault(); event.stopPropagation(); cancelStroke();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', hidden);
      const active = stroke.current;
      stroke.current = null;
      try { if (active && container.current?.hasPointerCapture(active.pointer)) container.current.releasePointerCapture(active.pointer); } catch { /* Unmount may release capture. */ }
    };
  }, [cancelStroke]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const id = plotId(event.target);
    if (id === null) return;
    if (mode === 'browse' && !blocked) { suppressClickUntil.current = 0; return; }
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil.current = performance.now() + 800;
    if (blocked || mode === 'browse') return;
    if (blockedPointers.current.size > 1 || stroke.current || !event.isPrimary) { cancelStroke(); return; }
    stroke.current = { pointer: event.pointerId, mode, seed, ids: [id], last: { x: event.clientX, y: event.clientY } };
    setPreview([id]);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { cancelStroke(); }
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = stroke.current;
    if (!active || active.pointer !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    appendPoint({ x: event.clientX, y: event.clientY });
    const ids = [...active.ids];
    cancelStroke();
    submit(ids, active.mode, active.seed);
  };

  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && stroke.current) { event.preventDefault(); cancelStroke(); return; }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const id = plotId(event.target);
    if (id === null) return;
    if (mode === 'browse' && !blocked) { suppressClickUntil.current = 0; return; }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || blocked) return;
    cancelStroke();
    suppressClickUntil.current = performance.now() + 800;
    if (mode !== 'browse') submit([id], mode, seed);
  };

  return <div ref={container} className={`field-interaction field-mode-${mode}`} data-no-camera={mode === 'browse' ? undefined : 'true'}
    onPointerDownCapture={pointerDown}
    onPointerMove={event => {
      if (stroke.current?.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); appendPoint({ x: event.clientX, y: event.clientY });
    }}
    onPointerUp={pointerUp}
    onPointerCancel={event => { if (stroke.current?.pointer === event.pointerId) { event.stopPropagation(); cancelStroke(); } }}
    onLostPointerCapture={event => { if (stroke.current?.pointer === event.pointerId) cancelStroke(); }}
    onKeyDownCapture={keyDown}
    onKeyUpCapture={event => { if ((mode !== 'browse' || blocked) && (event.key === 'Enter' || event.key === ' ') && plotId(event.target) !== null) { event.preventDefault(); event.stopPropagation(); } }}
    onClickCapture={event => {
      const id = plotId(event.target);
      if (id === null) return;
      if (mode === 'browse' && !blocked && performance.now() >= suppressClickUntil.current) return;
      event.preventDefault(); event.stopPropagation();
      // Screen readers may activate a button with a click and no pointer/key.
      if (!blocked && mode !== 'browse' && event.detail === 0 && performance.now() >= suppressClickUntil.current) submit([id], mode, seed);
    }}>{children}</div>;
}

export default FieldInteraction;
