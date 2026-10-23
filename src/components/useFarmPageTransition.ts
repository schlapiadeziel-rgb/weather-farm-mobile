import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { flushSync } from 'react-dom';
import './farm-page-transition.css';

type Point = { x: number; y: number };
type TransitionMode = 'reveal' | 'open' | 'return';

/** Page decoration only; a newer navigation always wins over an older capture. */
export function useFarmPageTransition<T extends string>(page: T, onNavigate: (next: T) => void) {
  const current = useRef({ page, onNavigate });
  current.current = { page, onNavigate };
  const pointer = useRef<(Point & { time: number }) | null>(null);
  const returnAnchor = useRef<Point | null>(null);
  const active = useRef<ViewTransition | null>(null);
  const serial = useRef(0);

  const clean = () => {
    const root = document.documentElement;
    delete root.dataset.farmPageTransition;
    for (const name of ['--farm-page-x', '--farm-page-y', '--farm-page-radius']) root.style.removeProperty(name);
  };
  useEffect(() => () => { ++serial.current; active.current?.skipTransition(); clean(); }, []);

  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element) || !event.target.closest('button,[role="button"],a')) return;
    pointer.current = { x: event.clientX, y: event.clientY, time: performance.now() };
  };
  const onKeyDownCapture = (_event: KeyboardEvent<HTMLElement>) => { pointer.current = null; };

  const navigate = (next: T, mode: TransitionMode = 'reveal') => {
    const request = ++serial.current;
    active.current?.skipTransition();
    active.current = null;
    clean();
    const width = window.innerWidth, height = window.innerHeight;
    const previousPointer = pointer.current;
    pointer.current = null;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.getBoundingClientRect() : null;
    let origin = previousPointer && performance.now() - previousPointer.time < 1200
      ? { x: previousPointer.x, y: previousPointer.y }
      : focused && focused.width && focused.height ? { x: focused.x + focused.width / 2, y: focused.y + focused.height / 2 } : { x: width / 2, y: height / 2 };
    if (mode === 'return' && returnAnchor.current) origin = { x: returnAnchor.current.x * width, y: returnAnchor.current.y * height };
    origin = { x: Math.min(width, Math.max(0, origin.x)), y: Math.min(height, Math.max(0, origin.y)) };
    if (mode === 'open' && width && height) returnAnchor.current = { x: origin.x / width, y: origin.y / height };

    // Older Android WebViews and reduced-motion users retain immediate navigation.
    if (next === current.current.page || typeof document.startViewTransition !== 'function' || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      current.current.onNavigate(next);
      return;
    }
    const root = document.documentElement;
    root.dataset.farmPageTransition = mode === 'return' ? 'return' : 'reveal';
    root.style.setProperty('--farm-page-x', `${origin.x}px`);
    root.style.setProperty('--farm-page-y', `${origin.y}px`);
    root.style.setProperty('--farm-page-radius', `${Math.ceil(Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y))) + 2}px`);
    let committed = false;
    const commit = () => {
      if (committed || serial.current !== request) return;
      committed = true;
      flushSync(() => current.current.onNavigate(next));
    };
    try {
      const transition = document.startViewTransition(commit);
      active.current = transition;
      // A failed/skipped decoration must not drop the user's navigation.
      void transition.updateCallbackDone.catch(() => { commit(); });
      void transition.ready.catch(() => {});
      void transition.finished.catch(() => {}).finally(() => {
        if (serial.current === request) { active.current = null; clean(); }
      });
    } catch {
      clean();
      commit();
    }
  };
  return { navigate, onPointerDownCapture, onKeyDownCapture };
}
