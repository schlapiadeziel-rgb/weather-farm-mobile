import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Fence, Flower2, House, Move, RotateCcw, Sprout, Trees, Undo2, Warehouse, X } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import type { FarmLayout, FarmLayoutItemId } from '../lib/farmLayoutTypes';
import { FARM_LAYOUT_BLOCKED_CELLS, FARM_LAYOUT_GRID, FARM_LAYOUT_HEIGHT, FARM_LAYOUT_ITEMS, FARM_LAYOUT_WIDTH, canPlaceFarmLayoutItem, getFarmLayoutItem, initialFarmLayout, moveFarmLayoutItem, normalizeFarmLayout, removeFarmLayoutItem } from '../lib/farmLayout';
import FarmLandscape from './FarmLandscape';
import './farm-layout.css';

export type FarmLayoutEditorProps = {
  game: Game;
  onSave(layout: FarmLayout, expectedLayout: FarmLayout): void;
  onClose(): void;
  notify(message: string): void;
};

type Target = { id: FarmLayoutItemId; x: number; y: number; valid: boolean; reason: string };
type Gesture = { pointerId: number; id: FarmLayoutItemId; startX: number; startY: number; offsetX: number; offsetY: number; direct: boolean; moved: boolean };
const directions = [
  { key: 'left', label: '向左移动', dx: -1, dy: 0, Icon: ArrowLeft },
  { key: 'up', label: '向上移动', dx: 0, dy: -1, Icon: ArrowUp },
  { key: 'down', label: '向下移动', dx: 0, dy: 1, Icon: ArrowDown },
  { key: 'right', label: '向右移动', dx: 1, dy: 0, Icon: ArrowRight },
] as const;

function ItemIcon({ kind, size = 22 }: { kind: (typeof FARM_LAYOUT_ITEMS)[number]['kind']; size?: number }) {
  const Icon = kind === 'house' ? House : kind === 'production' ? Warehouse : kind === 'livestock' ? Sprout : kind === 'flowerbed' ? Flower2 : kind === 'hedge' ? Trees : Fence;
  return <Icon size={size} aria-hidden="true" />;
}

/** Changes stay in this preview until the player explicitly saves. */
export function FarmLayoutEditor({ game, onSave, onClose, notify }: FarmLayoutEditorProps) {
  const [base] = useState(() => normalizeFarmLayout(game.layout));
  const [draft, setDraft] = useState(() => normalizeFarmLayout(base));
  const [selected, setSelected] = useState<FarmLayoutItemId>('house');
  const [target, setTarget] = useState<Target | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('先选一处地标，拖动或轻点空地，看看新的布置。');
  const titleId = useId();
  const helpId = useId();
  const patternId = `layout-grid-${useId().replace(/:/g, '')}`;
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const draftRef = useRef(draft);
  const selectedRef = useRef(selected);
  const targetRef = useRef<Target | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Set<number>());
  const interruptedRef = useRef(false);
  const savedRef = useRef(false);
  const callbacksRef = useRef({ onSave, onClose, notify });
  callbacksRef.current = { onSave, onClose, notify };
  draftRef.current = draft;
  selectedRef.current = selected;

  const definition = getFarmLayoutItem(selected);
  const placement = draft.placements.find(item => item.id === selected)!;
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  const preview = useMemo(() => target?.valid ? moveFarmLayoutItem(draft, target.id, target.x, target.y) : draft, [draft, target]);

  const showTarget = (value: Target | null) => { targetRef.current = value; setTarget(value); };
  const updateDraft = (value: FarmLayout, message: string) => { draftRef.current = value; setDraft(value); showTarget(null); setStatus(message); };
  const cancelGesture = (message?: string) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDragging(false);
    showTarget(null);
    if (gesture && sceneRef.current?.hasPointerCapture(gesture.pointerId)) {
      try { sceneRef.current.releasePointerCapture(gesture.pointerId); } catch { /* The pointer may already have ended. */ }
    }
    if (message && gesture) setStatus(message);
  };
  const cancelRef = useRef(cancelGesture);
  cancelRef.current = cancelGesture;
  const close = () => { cancelRef.current(); callbacksRef.current.onClose(); };

  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay && !node.contains(overlay));
    const previousInert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRef.current(); callbacksRef.current.onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0]; const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const focusin = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true }); };
    const pointerdown = (event: PointerEvent) => {
      if (pointersRef.current.size === 0) interruptedRef.current = false;
      pointersRef.current.add(event.pointerId);
      if (pointersRef.current.size > 1) {
        interruptedRef.current = true;
        cancelRef.current('已取消这次移动，请用一根手指重新摆放。');
      }
    };
    const pointerend = (event: PointerEvent) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size === 0) interruptedRef.current = false;
    };
    const pointercancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) cancelRef.current('这次移动已取消，布置没有改变。');
      pointerend(event);
    };
    const interrupt = () => {
      interruptedRef.current = true;
      pointersRef.current.clear();
      cancelRef.current('这次移动已取消，布置没有改变。');
    };
    const visibility = () => { if (document.hidden) interrupt(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    document.addEventListener('pointerdown', pointerdown, true);
    document.addEventListener('pointerup', pointerend);
    document.addEventListener('pointercancel', pointercancel, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', interrupt);
    return () => {
      gestureRef.current = null;
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      document.removeEventListener('pointerdown', pointerdown, true);
      document.removeEventListener('pointerup', pointerend);
      document.removeEventListener('pointercancel', pointercancel, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', interrupt);
      siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const pointOnMap = (clientX: number, clientY: number) => {
    const svg = sceneRef.current?.querySelector('svg');
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    try {
      const point = svg.createSVGPoint(); point.x = clientX; point.y = clientY;
      const world = point.matrixTransform(matrix.inverse());
      return Number.isFinite(world.x) && Number.isFinite(world.y) ? { x: world.x, y: world.y } : null;
    } catch { return null; }
  };
  const makeTarget = (id: FarmLayoutItemId, x: number, y: number): Target => {
    const snappedX = Math.round(x / FARM_LAYOUT_GRID) * FARM_LAYOUT_GRID;
    const snappedY = Math.round(y / FARM_LAYOUT_GRID) * FARM_LAYOUT_GRID;
    const result = canPlaceFarmLayoutItem(draftRef.current, id, snappedX, snappedY);
    return { id, x: snappedX, y: snappedY, ...result };
  };
  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || savedRef.current || interruptedRef.current || pointersRef.current.size > 1) return;
    const point = pointOnMap(event.clientX, event.clientY);
    if (!point || point.x < 0 || point.y < 0 || point.x > FARM_LAYOUT_WIDTH || point.y > FARM_LAYOUT_HEIGHT) return;
    event.preventDefault();
    const hit = event.target instanceof Element ? event.target.closest('[data-layout-item]')?.getAttribute('data-layout-item') : null;
    const hitItem = FARM_LAYOUT_ITEMS.find(item => item.id === hit);
    const id = hitItem?.id ?? selectedRef.current;
    const item = getFarmLayoutItem(id);
    const current = draftRef.current.placements.find(value => value.id === id)!;
    if (hitItem) { selectedRef.current = id; setSelected(id); setStatus(`已选中${item.name}，可以拖动或用方向键微调。`); }
    const direct = !hitItem;
    gestureRef.current = { pointerId: event.pointerId, id, startX: event.clientX, startY: event.clientY, offsetX: direct ? item.width / 2 : point.x - current.x, offsetY: direct ? item.height / 2 : point.y - current.y, direct, moved: false };
    setDragging(true);
    if (direct) showTarget(makeTarget(id, point.x - item.width / 2, point.y - item.height / 2));
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { cancelGesture('暂时无法移动，请重新试一次。'); }
    event.currentTarget.focus({ preventScroll: true });
  };
  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || interruptedRef.current) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 5) gesture.moved = true;
    if (!gesture.moved && !gesture.direct) return;
    const point = pointOnMap(event.clientX, event.clientY);
    if (point) showTarget(makeTarget(gesture.id, point.x - gesture.offsetX, point.y - gesture.offsetY));
  };
  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || interruptedRef.current) return;
    event.preventDefault();
    // Use the release coordinates as well; a browser can coalesce all intermediate moves.
    const point = pointOnMap(event.clientX, event.clientY);
    const moved = gesture.moved || Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 5;
    const finalTarget = point && (gesture.direct || moved) ? makeTarget(gesture.id, point.x - gesture.offsetX, point.y - gesture.offsetY) : null;
    cancelGesture();
    if (!finalTarget) return;
    if (!finalTarget.valid) { showTarget(finalTarget); setStatus(finalTarget.reason); return; }
    try { updateDraft(moveFarmLayoutItem(draftRef.current, finalTarget.id, finalTarget.x, finalTarget.y), `${getFarmLayoutItem(finalTarget.id).name}已摆好，保存后回到农场。`); }
    catch (error) { setStatus(error instanceof Error ? error.message : '这里暂时不能摆放，请换个位置。'); }
  };
  const step = (dx: number, dy: number) => {
    if (gestureRef.current || savedRef.current) return;
    const id = selectedRef.current;
    const current = draftRef.current.placements.find(value => value.id === id)!;
    if (!current.placed) { setStatus('先在地图上轻点一处空地，放下这件装饰。'); return; }
    const next = makeTarget(id, current.x + dx * FARM_LAYOUT_GRID, current.y + dy * FARM_LAYOUT_GRID);
    if (!next.valid) { showTarget(next); setStatus(next.reason); return; }
    updateDraft(moveFarmLayoutItem(draftRef.current, id, next.x, next.y), `${getFarmLayoutItem(id).name}已移动一格。`);
  };
  const save = () => {
    if (savedRef.current || gestureRef.current || targetRef.current || !dirty) return;
    savedRef.current = true; setSaving(true); showTarget(null);
    try { callbacksRef.current.onSave(normalizeFarmLayout(draftRef.current), normalizeFarmLayout(base)); }
    catch (error) {
      savedRef.current = false; setSaving(false);
      const message = error instanceof Error ? error.message : '这次布置暂时无法保存，请重试。';
      setStatus(message);
      callbacksRef.current.notify(message);
    }
  };
  const select = (id: FarmLayoutItemId) => {
    if (gestureRef.current || savedRef.current) return;
    selectedRef.current = id; setSelected(id); showTarget(null);
    const placed = draftRef.current.placements.find(item => item.id === id)!.placed;
    setStatus(placed ? `已选中${getFarmLayoutItem(id).name}，拖动或轻点空地移动。` : `已选中${getFarmLayoutItem(id).name}，轻点地图空地摆放。`);
  };
  const placeDecoration = () => {
    if (gestureRef.current || savedRef.current) return;
    const id = selectedRef.current;
    const item = getFarmLayoutItem(id);
    if (item.kind === 'house' || item.kind === 'production' || item.kind === 'livestock') return;
    const candidates: { x: number; y: number }[] = [];
    // Start in the open garden below the fields, then search the rest of the farm.
    for (const y of [550, 600, 500]) for (let x = 450; x <= 850; x += FARM_LAYOUT_GRID) candidates.push({ x, y });
    for (let y = 100; y <= FARM_LAYOUT_HEIGHT - item.height; y += FARM_LAYOUT_GRID) for (let x = 100; x <= FARM_LAYOUT_WIDTH - item.width; x += FARM_LAYOUT_GRID) candidates.push({ x, y });
    const free = candidates.find(point => canPlaceFarmLayoutItem(draftRef.current, id, point.x, point.y).valid);
    if (!free) { setStatus('暂时找不到合适的空地，请先移动地标或收回一些装饰。'); return; }
    updateDraft(moveFarmLayoutItem(draftRef.current, id, free.x, free.y), `${item.name}已放到空地，可用方向键继续微调。`);
  };
  const decorations = draft.placements.filter(item => !['house', 'production', 'livestock'].includes(item.id));

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="fle-overlay" ref={overlayRef}>
    <div className="fle-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={helpId} tabIndex={-1} data-layout-dirty={dirty}>
      <header className="fle-header">
        <span className="fle-seal" aria-hidden="true"><Move size={24} /></span>
        <div className="fle-heading"><span>田野来信 · 你的农场</span><h2 id={titleId}>整理农场</h2></div>
        <span className="fle-free"><Check size={15} />自由布置 · 不扣费用</span>
        <button className="fle-close" ref={closeRef} onClick={close} aria-label="取消整理"><X size={20} /><span>取消</span></button>
      </header>
      <div className="fle-body">
        <section className="fle-stage" aria-label="布置预览">
          <div className="fle-map-heading"><span><Trees size={16} />农场全景</span><small>田地、小镇与水塘保持原位</small></div>
          <div className={`fle-scene${dragging ? ' fle-scene-moving' : ''}`} ref={sceneRef} data-layout-map tabIndex={0} role="region" aria-label="农场布置地图" aria-describedby={helpId} onPointerDown={beginGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={() => cancelGesture('这次移动已取消，布置没有改变。')} onLostPointerCapture={event => { if (gestureRef.current?.pointerId === event.pointerId) cancelGesture('这次移动已取消，布置没有改变。'); }} onKeyDown={event => { const direction = directions.find(item => ({ left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', right: 'ArrowRight' }[item.key]) === event.key); if (direction) { event.preventDefault(); step(direction.dx, direction.dy); } }}>
            <FarmLandscape layout={preview} fit="contain" selectedItem={selected} editing>
              <defs><pattern id={patternId} width={FARM_LAYOUT_GRID} height={FARM_LAYOUT_GRID} patternUnits="userSpaceOnUse"><path d={`M${FARM_LAYOUT_GRID} 0H0V${FARM_LAYOUT_GRID}`} fill="none" stroke="#fff7cc" strokeWidth="1.5" opacity=".38" /></pattern></defs>
              <g className="fle-grid" pointerEvents="none" aria-hidden="true"><rect width={FARM_LAYOUT_WIDTH} height={FARM_LAYOUT_HEIGHT} fill={`url(#${patternId})`} />{FARM_LAYOUT_BLOCKED_CELLS.map(cell => <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={FARM_LAYOUT_GRID} height={FARM_LAYOUT_GRID} fill="#566e47" opacity=".12" />)}</g>
              <g className="fle-footprints" aria-hidden="true">{preview.placements.filter(item => item.placed).map(item => { const itemDefinition = getFarmLayoutItem(item.id); return <rect key={item.id} data-layout-item={item.id} x={item.x} y={item.y} width={itemDefinition.width} height={itemDefinition.height} fill="transparent" />; })}</g>
              {target && <g className={`fle-ghost${target.valid ? ' fle-ghost-valid' : ' fle-ghost-invalid'}`} data-layout-ghost={target.id} data-valid={target.valid} data-x={target.x} data-y={target.y} pointerEvents="none" aria-hidden="true"><rect x={target.x} y={target.y} width={getFarmLayoutItem(target.id).width} height={getFarmLayoutItem(target.id).height} rx="9" /><path d={target.valid ? `m${target.x + 13} ${target.y + 23} 9 8 17-18` : `m${target.x + 14} ${target.y + 13} 20 20m0-20-20 20`} /></g>}
            </FarmLandscape>
            <span className="fle-map-corner" aria-hidden="true">预览</span>
          </div>
          <div className={`fle-status${target && !target.valid ? ' fle-status-warning' : ''}`} role="status" aria-live="polite">{target && !target.valid ? <X size={16} /> : <Move size={16} />}<span>{status}</span></div>
        </section>
        <aside className="fle-sidebar" aria-label="农场布置工具">
          <section className="fle-inspector" aria-label="选中物件">
            <div className="fle-selected-heading"><span className={`fle-item-icon fle-kind-${definition.kind}`}><ItemIcon kind={definition.kind} /></span><div><strong>{definition.name}</strong><small>{placement.placed ? '每次移动一格' : '轻点空地放下'}</small></div></div>
            <div className="fle-directions" aria-label="微调位置">{directions.map(direction => <button key={direction.key} data-layout-step={direction.key} aria-label={`${direction.label}${definition.name}`} onClick={() => step(direction.dx, direction.dy)} disabled={!placement.placed || dragging || saving}><direction.Icon size={20} /></button>)}</div>
            {definition.kind !== 'house' && definition.kind !== 'production' && definition.kind !== 'livestock' && (placement.placed ? <button className="fle-remove" data-layout-action="remove" disabled={dragging || saving} onClick={() => updateDraft(removeFarmLayoutItem(draftRef.current, selectedRef.current), `${definition.name}已收回，随时可以重新摆放。`)}><Undo2 size={16} />收回装饰</button> : <button className="fle-remove" data-layout-action="place" disabled={dragging || saving} onClick={placeDecoration}><Flower2 size={16} />摆到空地</button>)}
          </section>
          <div className="fle-catalog" aria-label="地标与装饰目录">
            <div className="fle-catalog-heading"><strong>农场地标</strong><small>整体移动</small></div>
            {FARM_LAYOUT_ITEMS.filter(item => ['house', 'production', 'livestock'].includes(item.kind)).map(item => <button key={item.id} className={`fle-catalog-item${selected === item.id ? ' fle-catalog-selected' : ''}`} data-layout-catalog={item.id} aria-label={`选择${item.name}`} aria-pressed={selected === item.id} disabled={dragging || saving} onClick={() => select(item.id)}><span className={`fle-item-icon fle-kind-${item.kind}`}><ItemIcon kind={item.kind} size={20} /></span><span><strong>{item.name}</strong><small>已摆放</small></span>{selected === item.id && <Check size={16} />}</button>)}
            <div className="fle-catalog-heading"><strong>花园装饰</strong><small>{decorations.filter(item => item.placed).length} / 6 已摆放</small></div>
            {FARM_LAYOUT_ITEMS.filter(item => !['house', 'production', 'livestock'].includes(item.kind)).map(item => { const placed = draft.placements.find(value => value.id === item.id)!.placed; return <button key={item.id} className={`fle-catalog-item${selected === item.id ? ' fle-catalog-selected' : ''}`} data-layout-catalog={item.id} aria-label={`选择${item.name}`} aria-pressed={selected === item.id} disabled={dragging || saving} onClick={() => select(item.id)}><span className={`fle-item-icon fle-kind-${item.kind}`}><ItemIcon kind={item.kind} size={20} /></span><span><strong>{item.name}</strong><small>{placed ? '已摆放 · 可收回' : '免费装饰 · 可摆放'}</small></span>{selected === item.id && <Check size={16} />}</button>; })}
          </div>
        </aside>
      </div>
      <footer className="fle-footer">
        <button className="fle-reset" aria-label="恢复初始布置" disabled={dragging || saving} onClick={() => updateDraft(initialFarmLayout(), '已预览初始布置。保存才会生效，取消可保留原来的农场。')}><RotateCcw size={17} /><span>恢复初始布置</span></button>
        <p id={helpId}>选地标 → 拖动或点空地 → 保存<span>也可使用方向键微调</span></p>
        <button className="fle-save" onClick={save} disabled={!dirty || dragging || saving || !!target} data-layout-action="save"><Check size={18} />{saving ? '正在保存' : '保存布置'}</button>
      </footer>
    </div>
  </div>, document.body);
}

export default FarmLayoutEditor;
