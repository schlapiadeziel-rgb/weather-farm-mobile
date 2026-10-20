import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BookOpen, Building2, Check, ClipboardList, CookingPot, Download, Fence, LayoutGrid, Move, NotebookPen, RotateCcw, Settings2, Sparkles, Trees, Truck, Volume2, VolumeX, Warehouse, Wheat, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import './farm-game-menu.css';

export type FarmGameMenuTab = 'farm' | 'livestock' | 'production' | 'orders' | 'explore' | 'town' | 'storage' | 'journal';
export type FarmGameMenuAction = 'activity' | 'layout' | 'guide' | 'update' | 'sound' | 'reset';
export type GameMenuTab = FarmGameMenuTab;
export type GameMenuAction = FarmGameMenuAction;
export type FarmGameMenuProps = {
  game: Game;
  sound: boolean;
  readyTotal: number;
  hasUpdate: boolean;
  onClose(): void;
  onNavigate(tab: FarmGameMenuTab): void;
  onAction(action: FarmGameMenuAction): void;
};

type MenuPage = 'farm' | 'tools';
type MenuEntry<T extends string> = { id: T; label: string; description: string; Icon: LucideIcon; tone: string; badge?: string };

function MenuSeal() {
  return <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M11 49V26l19-13 23 13v23Z" fill="#f8edd0" /><path d="m7 27 23-17 27 17-4 6-23-15-20 15Z" fill="#d8be82" /><path d="M25 49V33h13v16" fill="#89a077" /><path d="M28 36h7v6h-7Z" fill="#c8d8b3" /><path d="M10 48h44" stroke="#d1bb82" strokeWidth="3" strokeLinecap="round" /><path d="M14 49V34m-4 3 8 4m-8-12 8 4m29 16V34m-4 3 8 4m-8-12 8 4" stroke="#d4cb91" strokeWidth="2" strokeLinecap="round" /></svg>;
}

/** Keeps the farm scene clear while every destination remains one menu away. */
export default function FarmGameMenu({ game, sound, readyTotal, hasUpdate, onClose, onNavigate, onAction }: FarmGameMenuProps) {
  const [page, setPage] = useState<MenuPage>('farm');
  const titleId = useId();
  const descriptionId = useId();
  const farmTabId = useId();
  const toolsTabId = useId();
  const panelId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const farmTabRef = useRef<HTMLButtonElement>(null);
  const toolsTabRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onClose, onNavigate, onAction });
  callbacksRef.current = { onClose, onNavigate, onAction };

  const destinations: MenuEntry<FarmGameMenuTab>[] = [
    { id: 'farm', label: '农田', description: game.farmVisitors.visitor ? '门口邻居等你' : '播种与收获', Icon: Wheat, tone: 'wheat' },
    { id: 'livestock', label: '牧场', description: '喂养与收取', Icon: Fence, tone: 'pasture' },
    { id: 'production', label: '工坊', description: '制作与生产队列', Icon: CookingPot, tone: 'workshop' },
    { id: 'orders', label: '订单', description: '装车与送货', Icon: Truck, tone: 'orders' },
    { id: 'explore', label: '探索', description: '果园、钓鱼与矿洞', Icon: Trees, tone: 'pasture' },
    { id: 'town', label: '小镇', description: '街区与小镇经营', Icon: Building2, tone: 'town' },
    { id: 'storage', label: '仓库', description: '库存、补给与摊位', Icon: Warehouse, tone: 'wheat' },
    { id: 'journal', label: '农场日记', description: '经营进度与游戏备份', Icon: NotebookPen, tone: 'journal' },
  ];
  const tools: MenuEntry<FarmGameMenuAction>[] = [
    { id: 'activity', label: '农场看板', description: '看看今天能做什么', Icon: ClipboardList, tone: 'pasture' },
    { id: 'layout', label: '整理农场', description: '搬动地标、摆放装饰', Icon: Move, tone: 'wheat' },
    { id: 'guide', label: '农场手册', description: '玩法介绍与操作帮助', Icon: BookOpen, tone: 'journal' },
    { id: 'update', label: '检查更新', description: hasUpdate ? '有新版可以查看' : '查看游戏版本与更新', Icon: Download, tone: 'town', badge: hasUpdate ? '有更新' : undefined },
    { id: 'sound', label: sound ? '音效已开启' : '音效已关闭', description: sound ? '轻点关闭游戏音效' : '轻点开启游戏音效', Icon: sound ? Volume2 : VolumeX, tone: 'orders' },
    { id: 'reset', label: '重新开始', description: '先查看重开确认', Icon: RotateCcw, tone: 'reset' },
  ];

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
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"]):not(button)')).filter(node => node.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); callbacksRef.current.onClose(); return; }
      if (event.key !== 'Tab') return;
      const available = controls(); const first = available[0]; const last = available[available.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const keepFocus = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true }); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', keepFocus);
      siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const selectPage = (next: MenuPage, focus = false) => {
    setPage(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (focus) (next === 'farm' ? farmTabRef : toolsTabRef).current?.focus({ preventScroll: true });
  };
  const tabKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    selectPage(event.key === 'Home' ? 'farm' : event.key === 'End' ? 'tools' : page === 'farm' ? 'tools' : 'farm', true);
  };

  return createPortal(<div className="fgm-overlay" ref={overlayRef}>
    <section className="fgm-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <header className="fgm-header"><span className="fgm-seal"><MenuSeal /></span><div className="fgm-heading"><span>田野来信 · 我的农场</span><h2 id={titleId}>农场菜单</h2></div>{readyTotal > 0 && <span className="fgm-ready"><Sparkles size={14} aria-hidden="true" />{readyTotal} 份收成待收</span>}<button ref={closeRef} type="button" className="fgm-close" aria-label="关闭农场菜单" onClick={() => callbacksRef.current.onClose()}><X size={20} aria-hidden="true" /></button></header>
      <p id={descriptionId} className="fgm-sr-only">选择经营入口，或打开工具与设置。关闭菜单后继续照看农场。</p>
      <div className="fgm-tabs" role="tablist" aria-label="农场菜单分类" onKeyDown={tabKeys}><button ref={farmTabRef} type="button" role="tab" id={farmTabId} aria-controls={panelId} aria-selected={page === 'farm'} tabIndex={page === 'farm' ? 0 : -1} data-game-menu-page="farm" onClick={() => selectPage('farm')}><LayoutGrid size={17} aria-hidden="true" />经营入口</button><button ref={toolsTabRef} type="button" role="tab" id={toolsTabId} aria-controls={panelId} aria-selected={page === 'tools'} tabIndex={page === 'tools' ? 0 : -1} data-game-menu-page="tools" onClick={() => selectPage('tools')}><Settings2 size={17} aria-hidden="true" />工具与设置{hasUpdate && <span className="fgm-update-dot" />}</button></div>
      <div className="fgm-scroll" ref={scrollRef} role="tabpanel" id={panelId} aria-labelledby={page === 'farm' ? farmTabId : toolsTabId} data-game-menu-panel={page}>
        <div className={`fgm-grid${page === 'tools' ? ' fgm-grid--tools' : ''}`}>
          {page === 'farm' ? destinations.map(({ id, label, description, Icon, tone }) => <button type="button" key={id} className={`fgm-tile fgm-tone--${tone}`} data-game-menu-nav={id} onClick={() => callbacksRef.current.onNavigate(id)}><span className="fgm-icon"><Icon size={25} strokeWidth={1.6} aria-hidden="true" /></span><span className="fgm-copy"><strong>{label}</strong><small>{description}</small></span><ArrowRight className="fgm-tile-arrow" size={16} aria-hidden="true" /></button>) : tools.map(({ id, label, description, Icon, tone, badge }) => <button type="button" key={id} className={`fgm-tile fgm-tone--${tone}`} data-game-menu-action={id} onClick={() => callbacksRef.current.onAction(id)} aria-label={id === 'sound' ? sound ? '关闭游戏音效' : '开启游戏音效' : undefined}><span className="fgm-icon"><Icon size={25} strokeWidth={1.6} aria-hidden="true" /></span><span className="fgm-copy"><strong>{label}{badge && <span className="fgm-tile-badge">{badge}</span>}</strong><small>{description}</small></span>{id === 'sound' ? <span className={`fgm-sound-state${sound ? ' is-on' : ''}`} aria-hidden="true">{sound && <Check size={11} />}</span> : <ArrowRight className="fgm-tile-arrow" size={16} aria-hidden="true" />}</button>)}
        </div>
      </div>
      <footer className="fgm-footer"><Wheat size={13} aria-hidden="true" /><span>选好去处，继续今天的田园时光。</span><span>{page === 'farm' ? '8 处经营入口' : '6 项工具与设置'}</span></footer>
    </section>
  </div>, document.body);
}
