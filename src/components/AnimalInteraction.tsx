import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Game } from '../lib/farmTypes';
import { applyAnimalStroke, getAnimalStrokeNotice } from '../lib/animalStroke';
import type { AnimalMode } from '../lib/animalStroke';
import './animal-tools.css';

export type AnimalInteractionProps = {
  children: ReactNode;
  game: Game;
  mode: AnimalMode;
  blocked?: boolean;
  onChange(game: Game): void | boolean;
  onNotice?(message: string): void;
  onApplied?(ids: number[], mode: 'feed' | 'collect'): void;
};

type Point = { x: number; y: number };
type Stroke = { pointer: number; mode: 'feed' | 'collect'; ids: number[]; last: Point };

/** A brush gesture commits once; browsing leaves the pen list free to scroll. */
export function AnimalInteraction({ children, game, mode, blocked = false, onChange, onNotice, onApplied }: AnimalInteractionProps) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef({ game, mode, blocked, onChange, onNotice, onApplied });
  current.current = { game, mode, blocked, onChange, onNotice, onApplied };
  const stroke = useRef<Stroke | null>(null);
  const blockedPointers = useRef(new Set<number>());
  const downPointers = useRef(new Set<number>());
  const canceledPointers = useRef(new Set<number>());
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState<number[]>([]);

  const penId = useCallback((target: EventTarget | null): number | null => {
    if (!(target instanceof Element)) return null;
    const pen = target.closest<HTMLElement>('[data-pen-id]');
    if (!pen || !container.current?.contains(pen)) return null;
    const id = Number(pen.dataset.penId);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }, []);

  const penAt = useCallback((point: Point): number | null => {
    // Only brush visible hit targets; the toolbar and dialogs cover pens.
    return penId(document.elementFromPoint(point.x, point.y));
  }, [penId]);

  const cancelStroke = useCallback(() => {
    const active = stroke.current;
    stroke.current = null;
    setPreview([]);
    if (!active) return;
    if (downPointers.current.has(active.pointer)) canceledPointers.current.add(active.pointer);
    suppressClickUntil.current = performance.now() + 800;
    try { if (container.current?.hasPointerCapture(active.pointer)) container.current.releasePointerCapture(active.pointer); } catch { /* Capture may already be released by the OS. */ }
  }, []);

  const submit = useCallback((ids: number[], action: 'feed' | 'collect') => {
    const latest = current.current;
    // Also guard the latest render before a mode/modal effect has run.
    if (latest.blocked || latest.mode !== action) return;
    try {
      const result = applyAnimalStroke(latest.game, action, ids, Date.now());
      const saved = result.changedPenIds.length ? latest.onChange(result.game) : undefined;
      // A second accessible activation can arrive before React paints the
      // parent update. Always base it on the result already committed.
      if (result.changedPenIds.length) latest.game = result.game;
      if (result.changedPenIds.length) latest.onApplied?.([...result.changedPenIds], action);
      const notice = getAnimalStrokeNotice(result, action);
      latest.onNotice?.(saved === false ? `${notice} 本机未能保存，请导出游戏备份。` : notice);
    } catch (error) {
      latest.onNotice?.(error instanceof Error ? error.message : '这次牧场操作未完成，请重试。');
    }
  }, []);

  const appendPoint = useCallback((point: Point) => {
    const active = stroke.current;
    if (!active) return;
    // Sample sparse events too, so fast swipes cannot skip a pen between them.
    const distance = Math.hypot(point.x - active.last.x, point.y - active.last.y);
    const steps = Math.max(1, Math.ceil(distance / 8));
    let changed = false;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const id = penAt({ x: active.last.x + (point.x - active.last.x) * t, y: active.last.y + (point.y - active.last.y) * t });
      if (id !== null && !active.ids.includes(id)) { active.ids.push(id); changed = true; }
    }
    active.last = point;
    if (changed) setPreview([...active.ids]);
  }, [penAt]);

  useEffect(() => { cancelStroke(); }, [mode, blocked, cancelStroke]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const ids = new Set(preview);
    element.querySelectorAll<HTMLElement>('[data-pen-id]').forEach(pen => {
      if (ids.has(Number(pen.dataset.penId))) pen.dataset.animalPreview = mode;
      else delete pen.dataset.animalPreview;
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
      if (stroke.current?.pointer === event.pointerId) cancelStroke();
    };
    const release = (event: PointerEvent) => {
      downPointers.current.delete(event.pointerId);
      blockedPointers.current.delete(event.pointerId);
      if (canceledPointers.current.delete(event.pointerId)) suppressClickUntil.current = performance.now() + 800;
    };
    const cancel = () => { blockedPointers.current.clear(); cancelStroke(); };
    const hidden = () => { if (document.hidden) cancel(); };
    const escape = (event: KeyboardEvent) => {
      // Pointer capture does not move keyboard focus from the toolbar. Observe
      // Escape globally while a stroke is held, wherever that focus remains.
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
    const id = penId(event.target);
    if (id === null) return;
    if (mode === 'browse' && !blocked) { suppressClickUntil.current = 0; return; }
    event.preventDefault();
    event.stopPropagation();
    suppressClickUntil.current = performance.now() + 800;
    if (blocked || mode === 'browse') return;
    if (blockedPointers.current.size > 1 || stroke.current || !event.isPrimary) { cancelStroke(); return; }
    stroke.current = { pointer: event.pointerId, mode, ids: [id], last: { x: event.clientX, y: event.clientY } };
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
    submit(ids, active.mode);
  };

  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && stroke.current) { event.preventDefault(); cancelStroke(); return; }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const id = penId(event.target);
    if (id === null) return;
    if (mode === 'browse' && !blocked) { suppressClickUntil.current = 0; return; }
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || blocked) return;
    cancelStroke();
    suppressClickUntil.current = performance.now() + 800;
    if (mode !== 'browse') submit([id], mode);
  };

  return <div ref={container} className={`animal-interaction animal-mode-${mode}`} data-no-camera={mode === 'browse' ? undefined : 'true'}
    onPointerDownCapture={pointerDown}
    onPointerMove={event => {
      if (stroke.current?.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); appendPoint({ x: event.clientX, y: event.clientY });
    }}
    onPointerUp={pointerUp}
    onPointerCancel={event => { if (stroke.current?.pointer === event.pointerId) { event.stopPropagation(); cancelStroke(); } }}
    onLostPointerCapture={event => { if (stroke.current?.pointer === event.pointerId) cancelStroke(); }}
    onKeyDownCapture={keyDown}
    onKeyUpCapture={event => { if ((mode !== 'browse' || blocked) && (event.key === 'Enter' || event.key === ' ') && penId(event.target) !== null) { event.preventDefault(); event.stopPropagation(); } }}
    onClickCapture={event => {
      const id = penId(event.target);
      if (id === null) return;
      if (mode === 'browse' && !blocked && performance.now() >= suppressClickUntil.current) return;
      event.preventDefault(); event.stopPropagation();
      // Assistive technology can activate a pen with no pointer/key sequence.
      if (!blocked && mode !== 'browse' && event.detail === 0 && performance.now() >= suppressClickUntil.current) submit([id], mode);
    }}>{children}</div>;
}

export default AnimalInteraction;
