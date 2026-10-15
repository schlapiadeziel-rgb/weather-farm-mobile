import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Factory, Info, NotebookPen, Store, Timer, Tractor, Truck, Warehouse, Wheat, X } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import { getFarmActivity, type FarmActivityTarget } from '../lib/farmActivity';
import './farm-activity.css';

export interface FarmActivityBoardProps {
  game: Game;
  now: number;
  onClose(): void;
  onVisit(target: FarmActivityTarget): void;
  onJournal(): void;
}

const sectionArt = {
  farm: { Icon: Wheat, action: '去农田', label: '田间收成' },
  livestock: { Icon: Tractor, action: '去牧场', label: '动物产物' },
  production: { Icon: Factory, action: '去工坊', label: '加工成品' },
  orders: { Icon: Truck, action: '去订单板', label: '交货安排' },
  storage: { Icon: Store, action: '去路边小店', label: '小店收款' },
} as const;

function BoardIllustration() {
  return <svg className="fa-board-illustration" viewBox="0 0 206 104" aria-hidden="true" focusable="false">
    <ellipse cx="105" cy="92" rx="94" ry="8" fill="#8c9d58" opacity=".17" />
    <path d="M12 82q42-21 91-8t91 1v17H12Z" fill="#b9c890" />
    <path d="M28 53 55 34l29 19v35H28Z" fill="#c9815a" /><path d="m22 54 33-26 35 26-5 6-30-23-29 22Z" fill="#7b8c62" />
    <path d="M43 63h25v25H43Z" fill="#f4dbab" /><path d="m44 64 23 23m0-23L44 87m11-23v23" fill="none" stroke="#b58c5f" strokeWidth="2" />
    <rect x="48" y="46" width="13" height="11" rx="2" fill="#e9c794" /><path d="M55 46v11m-7-5h13" stroke="#a9724f" strokeWidth="1.5" />
    <path d="M20 71v19m6-21v21m-10-13h17m-17 8h17m53-14v19m9-18v18m-13-12h18m-18 8h18" stroke="#f5e8bd" strokeWidth="3" strokeLinecap="round" />
    <path d="M122 59q2-29 23-30 22 3 27 28" fill="none" stroke="#ad8250" strokeWidth="5" />
    <path d="m109 59 74-1-10 32h-54Z" fill="#c39759" /><path d="m112 61 67-1-7 25h-50Z" fill="#dfb870" />
    <path d="m118 69 58-1m-56 10 54-1m-48-16 5 25m7-26 2 26m10-27-1 27m11-27-4 27m12-27-6 27" stroke="#b78b4f" strokeWidth="2" opacity=".8" />
    <path d="M133 60q-14-15-8-25 13 3 14 20-1-19 10-25 9 11-2 30" fill="#7e9b60" />
    <path d="M128 57q-3-12 8-13 12 4 9 15" fill="#e2a35d" /><path d="M151 59q-7-15 7-20 13 5 7 19" fill="#ddc56c" />
    <path d="M155 41q-5-11 4-17m0 10 9-3" fill="none" stroke="#7c995a" strokeWidth="3" strokeLinecap="round" />
    <path d="m179 43 2-7 2 7 7 2-7 2-2 7-2-7-7-2Z" fill="#efcf7f" /><circle cx="101" cy="41" r="3" fill="#d7be78" />
  </svg>;
}

function remainingTime(readyAt: number, now: number): string {
  const seconds = Math.max(1, Math.ceil((readyAt - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${rest} 秒`;
  return `${rest} 秒`;
}

function StorageMeter({ title, used, capacity, kind }: { title: string; used: number; capacity: number; kind: 'silo' | 'barn' }) {
  const full = used >= capacity;
  const percent = capacity > 0 ? Math.max(0, Math.min(100, used / capacity * 100)) : 0;
  return <div className={`fa-capacity fa-capacity-${kind}${full ? ' fa-capacity-full' : ''}`}>
    <div><span><Warehouse size={14} aria-hidden="true" />{title}</span><strong>{used.toLocaleString('zh-CN')}<small> / {capacity.toLocaleString('zh-CN')}</small></strong></div>
    <span className="fa-capacity-track" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
    <span className="fa-capacity-label">{full ? '已满，先腾出空间' : `可用 ${(Math.max(0, capacity - used)).toLocaleString('zh-CN')} 份空间`}</span>
  </div>;
}

export function FarmActivityBoard({ game, now, onClose, onVisit, onJournal }: FarmActivityBoardProps) {
  const activity = getFarmActivity(game, now);
  const titleId = useId();
  const descriptionId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const focusin = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true }); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(<div className="fa-board-overlay" ref={overlayRef} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="fa-board-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <header className="fa-board-header">
        <span className="fa-board-seal" aria-hidden="true"><Wheat size={26} /></span>
        <div className="fa-board-heading"><span className="fa-board-eyebrow">田野来信 · 经营小帮手</span><h2 id={titleId}>农场看板</h2><p id={descriptionId}>看看哪里已就绪，安排下一步</p></div>
        <BoardIllustration />
        <button className="fa-board-close" ref={closeRef} onClick={onClose} aria-label="关闭农场看板"><X size={20} /><span>收起看板</span></button>
      </header>
      <div className="fa-board-content" tabIndex={0} aria-label="农场就绪状态与经营安排">
        <div className="fa-board-overview">
          <div className={`fa-next${activity.next ? '' : ' fa-next-quiet'}`}>
            <span className="fa-next-icon" aria-hidden="true"><Timer size={21} /></span>
            <div><span className="fa-next-kicker">{activity.next ? '下一份期待' : '按自己的节奏经营'}</span>{activity.next ? <><strong>{activity.next.label}</strong><p>还有 <time dateTime={`PT${Math.max(1, Math.ceil((activity.next.readyAt - now) / 1000))}S`}>{remainingTime(activity.next.readyAt, now)}</time></p></> : <><strong>暂时没有等待中的计时</strong><p>先看看下面的就绪事项</p></>}</div>
            {activity.next && <button className="fa-next-visit" onClick={() => activity.next && onVisit(activity.next.target)} aria-label={`前往查看${activity.next.label}`}><ArrowRight size={19} /><span>去看看</span></button>}
          </div>
          <div className="fa-storage-overview" aria-label="游戏仓库容量"><StorageMeter title="粮仓" kind="silo" {...activity.silo} /><StorageMeter title="货仓" kind="barn" {...activity.barn} /></div>
        </div>
        <div className="fa-section-intro"><h3>已就绪事项</h3><span>前往查看后，再决定如何操作</span></div>
        <div className="fa-board-sections">
          {activity.sections.map(section => {
            const art = sectionArt[section.id];
            const ready = section.count > 0;
            return <section key={section.id} className={`fa-activity-card fa-activity-${section.id}${ready ? ' fa-activity-ready' : ''}`} aria-label={section.title} data-activity-section={section.id}>
              <span className="fa-activity-icon" aria-hidden="true"><art.Icon size={25} /></span>
              <div className="fa-activity-copy"><span className="fa-activity-kicker">{art.label}</span><h4>{section.title}</h4><p>{section.detail}</p></div>
              <div className="fa-activity-status"><span className="fa-activity-count" data-activity-count={section.count}><strong>{section.count.toLocaleString('zh-CN')}</strong>{section.unit}</span><span className={`fa-activity-badge${ready ? ' fa-badge-ready' : ''}`}>{ready ? '已就绪' : '暂无就绪'}</span></div>
              {ready && section.target ? <button className="fa-activity-visit" data-activity-action={section.id} onClick={() => section.target && onVisit(section.target)}>{art.action}<ArrowRight size={16} aria-hidden="true" /></button> : <span className="fa-activity-rest">慢慢来，好收成值得等待</span>}
            </section>;
          })}
        </div>
        <p className="fa-board-order-note"><Info size={15} aria-hidden="true" /><span>订单按每份需求分别核对当前库存；多单可能需要同一批货，交付一单后其余就绪数会变化。</span></p>
      </div>
      <footer className="fa-board-footer"><p>仅查看游戏经营状态，真实农业资料请到小镇。</p><button onClick={onJournal}><NotebookPen size={18} aria-hidden="true" />农场日记与备份<ArrowRight size={16} aria-hidden="true" /></button></footer>
    </div>
  </div>, document.body);
}

export default FarmActivityBoard;
