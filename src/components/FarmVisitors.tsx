import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Clock3, Coins, DoorOpen, HandHeart, Leaf, Milk, Package, ShoppingBasket, Sparkles, Sprout, Wheat, X } from 'lucide-react';
import type { Game, ItemId } from '../lib/farmTypes';
import type { FarmVisitor } from '../lib/farmVisitorTypes';
import { getItem } from '../lib/farmContent';
import { FARM_VISITOR_CROP_RESERVE, FARM_VISITOR_PROFILES, getFarmVisitorProfile, getFarmVisitorSaleBlock } from '../lib/farmVisitors';
import { FarmVisitorGateArt, FarmVisitorPortrait } from './FarmVisitorArt';
import './farm-visitors.css';

export type FarmVisitorsProps = {
  game: Game;
  now: number;
  onClose(): void;
  onWelcome(): boolean | void;
  onSell(id: string): boolean | void;
  onDismiss(id: string): boolean | void;
  onRequestItem?(item: ItemId): void;
};

type Confirmation = { kind: 'sell' | 'dismiss'; visitor: FarmVisitor };
type Outcome = { kind: 'sold' | 'dismissed'; visitor: FarmVisitor };
type Submitted = { kind: 'sell' | 'dismiss'; visitor: FarmVisitor };

function sameRequest(a: FarmVisitor | null, b: FarmVisitor) {
  return !!a && a.id === b.id && a.profileId === b.profileId && a.item === b.item && a.quantity === b.quantity && a.coins === b.coins && a.xp === b.xp && a.arrivedAt === b.arrivedAt;
}

function countdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function sourceLabel(item: ItemId) {
  const category = getItem(item).category;
  return category === 'crop' ? '去农田补货' : category === 'animal' ? '去牧场收取' : category === 'product' ? '去工坊制作' : '去探索收集';
}

function RequestedItemArt({ item }: { item: ItemId }) {
  const category = getItem(item).category;
  const Icon = category === 'crop' ? Wheat : category === 'animal' ? Milk : category === 'fruit' ? Leaf : Package;
  return <span className={`fvis-item-art fvis-item-art--${category}`}><Icon size={35} strokeWidth={1.5} aria-hidden="true" /><span className="fvis-item-art-shine" /></span>;
}

/** A conversation never performs a transaction until the player confirms its exact offer. */
export default function FarmVisitors({ game, now, onClose, onWelcome, onSell, onDismiss, onRequestItem }: FarmVisitorsProps) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [message, setMessage] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const confirmationId = useId();
  const blockedId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const offerRef = useRef<HTMLButtonElement>(null);
  const submittedRef = useRef<Submitted | null>(null);
  const welcomePendingRef = useRef(false);
  const dataRef = useRef({ game, now, confirmation });
  const callbackRef = useRef({ onClose, onWelcome, onSell, onDismiss, onRequestItem });
  dataRef.current = { game, now, confirmation };
  callbackRef.current = { onClose, onWelcome, onSell, onDismiss, onRequestItem };
  const visitor = game.farmVisitors.visitor;
  const shownVisitor = confirmation?.visitor ?? visitor;
  const profile = shownVisitor ? getFarmVisitorProfile(shownVisitor.profileId) : null;
  const item = shownVisitor ? getItem(shownVisitor.item) : null;
  const stock = shownVisitor ? game.inventory[shownVisitor.item] ?? 0 : 0;
  const remaining = shownVisitor ? stock - shownVisitor.quantity : 0;
  const reserve = item?.category === 'crop' ? FARM_VISITOR_CROP_RESERVE : 0;
  const requiredStock = shownVisitor ? shownVisitor.quantity + reserve : 0;
  const shortage = Math.max(0, requiredStock - stock);
  const preparedStock = Math.min(stock, requiredStock);
  const wait = Math.max(0, game.farmVisitors.nextArrivalAt - now);
  const staleConfirmation = !!confirmation && !sameRequest(visitor, confirmation.visitor);
  const saleBlock = shownVisitor ? staleConfirmation ? '这位邻居的请求已经改变，请返回重新查看。' : getFarmVisitorSaleBlock(game, shownVisitor.id, now) : '';

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
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (dataRef.current.confirmation) { setConfirmation(null); setMessage(''); requestAnimationFrame(() => offerRef.current?.focus({ preventScroll: true })); }
        else callbackRef.current.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const available = controls();
      const first = available[0]; const last = available[available.length - 1];
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

  useEffect(() => {
    if (confirmation) backRef.current?.focus({ preventScroll: true });
  }, [confirmation]);

  useEffect(() => {
    const submitted = submittedRef.current;
    if (submitted && !visitor) {
      // Only an explicitly submitted action may create this receipt; ticking a clock cannot.
      submittedRef.current = null;
      setConfirmation(null);
      setOutcome({ kind: submitted.kind === 'sell' ? 'sold' : 'dismissed', visitor: submitted.visitor });
      setMessage('');
      requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    } else if (submitted && visitor && visitor.id !== submitted.visitor.id) {
      submittedRef.current = null;
    }
    if (welcomePendingRef.current && visitor) {
      welcomePendingRef.current = false;
      setOutcome(null); setMessage('');
    }
  }, [visitor]);

  const beginConfirmation = (kind: Confirmation['kind']) => {
    const latest = dataRef.current.game.farmVisitors.visitor;
    if (!latest) { setMessage('门口的请求已改变，请重新查看。'); return; }
    submittedRef.current = null;
    setMessage('');
    setConfirmation({ kind, visitor: { ...latest } });
  };
  const back = () => { submittedRef.current = null; setConfirmation(null); setMessage(''); requestAnimationFrame(() => offerRef.current?.focus({ preventScroll: true })); };
  const confirm = () => {
    const latest = dataRef.current;
    const chosen = latest.confirmation;
    if (!chosen || submittedRef.current) return;
    if (!sameRequest(latest.game.farmVisitors.visitor, chosen.visitor)) { setMessage('这位邻居的请求已经改变，请返回重新查看。'); return; }
    if (chosen.kind === 'sell') {
      const block = getFarmVisitorSaleBlock(latest.game, chosen.visitor.id, latest.now);
      if (block) { setMessage(block); return; }
    }
    // Keep the ID and quote that the player saw. Never substitute a newly arrived visitor.
    submittedRef.current = { kind: chosen.kind, visitor: { ...chosen.visitor } };
    try {
      const result = chosen.kind === 'sell' ? callbackRef.current.onSell(chosen.visitor.id) : callbackRef.current.onDismiss(chosen.visitor.id);
      if (result === false) { submittedRef.current = null; setMessage('这次操作没有完成，请检查当前请求后重试。'); }
    } catch (error) { submittedRef.current = null; setMessage(error instanceof Error ? error.message : '这次操作没有完成，请稍后重试。'); }
  };
  const welcome = () => {
    if (welcomePendingRef.current || dataRef.current.game.farmVisitors.visitor || dataRef.current.game.farmVisitors.nextArrivalAt > dataRef.current.now) return;
    welcomePendingRef.current = true;
    setMessage('');
    try {
      if (callbackRef.current.onWelcome() === false) { welcomePendingRef.current = false; setMessage('还没能迎接邻居，请稍后再试。'); }
    } catch (error) { welcomePendingRef.current = false; setMessage(error instanceof Error ? error.message : '暂时无法迎接邻居，请稍后再试。'); }
  };
  const requestItem = () => {
    const latest = dataRef.current.game.farmVisitors.visitor;
    if (!latest || dataRef.current.confirmation) return;
    callbackRef.current.onRequestItem?.(latest.item);
  };

  const outcomeProfile = outcome ? getFarmVisitorProfile(outcome.visitor.profileId) : null;
  return createPortal(<div className="fvis-overlay" ref={overlayRef}>
    <section className="fvis-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} data-visitor-state={confirmation?.kind ?? (visitor ? 'waiting' : outcome?.kind ?? (wait ? 'cooldown' : 'ready'))}>
      <header className="fvis-header">
        <span className="fvis-header-seal"><ShoppingBasket size={25} strokeWidth={1.7} aria-hidden="true" /></span>
        <div className="fvis-heading"><span>一扇农场门 · 几位老朋友</span><h2 id={titleId}>农场来客</h2></div>
        <span className="fvis-header-note"><Leaf size={14} aria-hidden="true" />把好收成分享给邻居</span>
        <button ref={closeRef} type="button" className="fvis-close" data-visitor-action="close" onClick={() => callbackRef.current.onClose()} aria-label="关闭农场来客"><X size={20} aria-hidden="true" /></button>
      </header>
      <p id={descriptionId} className="fvis-sr-only">查看邻居的收购请求。出售和送别都会先让你确认；关闭窗口不会出售物品，也不会赶走正在等待的邻居。</p>

      {shownVisitor && profile && item ? <div className="fvis-body fvis-body--conversation">
        <aside className="fvis-neighbour" style={{ '--fvis-person-color': profile.color } as CSSProperties}>
          <span className="fvis-portrait-badge"><span />今日来客</span>
          <div className="fvis-neighbour-portrait"><FarmVisitorPortrait profileId={profile.id} /></div>
          <div className="fvis-neighbour-caption"><span>{profile.tagline}</span><h3>{profile.name}</h3><p>{confirmation?.kind === 'dismiss' ? '改天再来，也是一份好心意。' : '不着急，你先忙田里的事。'}</p></div>
        </aside>
        <div className="fvis-conversation-scroll" key={confirmation ? `${confirmation.kind}-${confirmation.visitor.id}` : visitor?.id}>
          <div className={`fvis-conversation${confirmation ? ' fvis-conversation--confirm' : ''}`}>
            {confirmation ? <div className="fvis-confirm-heading"><span><HandHeart size={17} aria-hidden="true" />{confirmation.kind === 'sell' ? '再核对一下这份心意' : '和邻居道声下次见'}</span><h3 id={confirmationId}>{confirmation.kind === 'sell' ? `出售${item.name} ×${shownVisitor.quantity}？` : `送别${profile.name}？`}</h3><p>{confirmation.kind === 'sell' ? `这份${item.name}将交给${profile.name}，金币和经验会立即入账。` : '不会扣除物品、金币或经验。下一位邻居稍后再来。'}</p></div> : <div className="fvis-greeting"><span className="fvis-eyebrow">门口传来了招呼声</span><h3>“{profile.greeting}”</h3><p>想带走一点你的好收成。</p></div>}

            <article className={`fvis-receipt${confirmation?.kind === 'dismiss' ? ' fvis-receipt--dismiss' : ''}`} aria-label={`${item.name}收购清单`}>
              <div className="fvis-receipt-top"><span>{confirmation?.kind === 'dismiss' ? '原收购请求' : '田边小买卖'}</span><span>{confirmation?.kind === 'dismiss' ? '仅查看，不会出售' : '一口价 · 游戏金币'}</span></div>
              <div className="fvis-requested-item"><RequestedItemArt item={shownVisitor.item} /><div><small>想买一点</small><h4>{item.name}<span>×{shownVisitor.quantity}</span></h4></div><span className="fvis-request-stamp">邻里<br />好收成</span></div>
              <dl className="fvis-stock-list"><div><dt>当前库存</dt><dd>{stock}<small> 份</small></dd></div><div><dt>{confirmation?.kind === 'dismiss' ? '本次交付' : '本次出售'}</dt><dd>{confirmation?.kind === 'dismiss' ? '0' : `−${shownVisitor.quantity}`}<small> 份</small></dd></div><div className={confirmation?.kind !== 'dismiss' && remaining < reserve ? 'fvis-stock-low' : ''}><dt>{confirmation?.kind === 'dismiss' ? '送别后库存' : '售出后剩余'}</dt><dd>{confirmation?.kind === 'dismiss' ? <>{stock}<small> 份</small></> : remaining < 0 ? '库存不足' : <>{remaining}<small> 份</small></>}</dd></div></dl>
              {confirmation?.kind !== 'dismiss' && <div className={`fvis-preparation${shortage ? ' fvis-preparation--short' : ''}`}>
                <div><span>{shortage ? `还需补充 ${shortage} 份${item.name}` : '收成已备齐'}</span><small>{stock} / {requiredStock} 份</small></div>
                <div className="fvis-preparation-track" role="progressbar" aria-label={`${item.name}备货进度${reserve ? '，含保留种子' : ''}`} aria-valuemin={0} aria-valuemax={requiredStock} aria-valuenow={preparedStock} aria-valuetext={`库存 ${stock} 份，需要 ${requiredStock} 份${reserve ? `，含 ${reserve} 份种子` : ''}`}><span style={{ width: `${requiredStock ? preparedStock / requiredStock * 100 : 0}%` }} /></div>
                <p>出售 {shownVisitor.quantity} 份{reserve ? ` ＋ 留种 ${reserve} 份` : ''}；{shortage ? '补齐后再回来成交。' : '确认后才会交付。'}</p>
              </div>}
              <div className="fvis-rewards"><span><Coins size={21} aria-hidden="true" /><strong>+{shownVisitor.coins}</strong><small>金币</small></span><span className="fvis-reward-xp"><Sparkles size={19} aria-hidden="true" /><strong>+{shownVisitor.xp}</strong><small>经验</small></span></div>
              <p className="fvis-seed-note"><Sprout size={15} aria-hidden="true" />{confirmation?.kind === 'dismiss' ? '送别后，所有物品照常留在仓库。' : item.category === 'crop' ? `作物至少留下 ${reserve} 份，下一轮播种有着落。` : '只交出清单上的物品，其他收成继续留在仓库。'}</p>
            </article>

            {confirmation?.kind === 'dismiss' && !staleConfirmation ? <p className="fvis-dismiss-note"><Leaf size={16} aria-hidden="true" />谢绝不会受到惩罚；已经播种和排队的生产照常进行。</p> : saleBlock ? <p id={blockedId} className="fvis-blocked" role="status"><Package size={17} aria-hidden="true" />{saleBlock}</p> : !confirmation && <p className="fvis-patience"><Clock3 size={14} aria-hidden="true" />邻居会一直等你。先去收获，回来再聊也没关系。</p>}
            {message && <p className="fvis-message" role="status">{message}</p>}
            {confirmation ? <div className="fvis-confirm-actions"><button ref={backRef} type="button" className="fvis-button fvis-button--paper" data-visitor-action="cancel" onClick={back}><ArrowLeft size={16} aria-hidden="true" />返回看看</button><button type="button" className={`fvis-button ${confirmation.kind === 'dismiss' ? 'fvis-button--farewell' : 'fvis-button--green'}`} aria-describedby={staleConfirmation || (confirmation.kind === 'sell' && saleBlock) ? blockedId : undefined} data-visitor-action="confirm" disabled={staleConfirmation || (confirmation.kind === 'sell' && !!saleBlock)} onClick={confirm}>{confirmation.kind === 'sell' ? <><Check size={18} aria-hidden="true" />确认出售</> : <><DoorOpen size={18} aria-hidden="true" />确认送别</>}</button></div> : <div className="fvis-offer-actions"><button ref={offerRef} type="button" className="fvis-button fvis-button--green" disabled={!!saleBlock} aria-describedby={saleBlock ? blockedId : undefined} data-visitor-action="sell" onClick={() => beginConfirmation('sell')}><HandHeart size={19} aria-hidden="true" />{saleBlock ? '备齐收成再出售' : '答应这笔小买卖'}</button>{onRequestItem && <button type="button" className="fvis-button fvis-button--paper" data-visitor-action="source" onClick={requestItem}>{sourceLabel(shownVisitor.item)}<ArrowRight size={16} aria-hidden="true" /></button>}<div className="fvis-secondary-actions"><button type="button" onClick={() => callbackRef.current.onClose()}>稍后再说</button><button type="button" data-visitor-action="dismiss" onClick={() => beginConfirmation('dismiss')}>这次先谢绝</button></div></div>}
          </div>
        </div>
      </div> : <div className="fvis-body fvis-body--empty">
        <div className="fvis-empty-illustration"><FarmVisitorGateArt /><span className="fvis-gate-caption">田野路上，总有好朋友</span></div>
        <div className="fvis-empty-scroll"><div className="fvis-empty-content">
          {outcome && outcomeProfile ? <div className="fvis-outcome" role="status"><span className="fvis-success-seal">{outcome.kind === 'sold' ? <Check size={23} aria-hidden="true" /> : <HandHeart size={23} aria-hidden="true" />}</span><span className="fvis-eyebrow">{outcome.kind === 'sold' ? '一份收成，一份心意' : '下次见，老朋友'}</span><h3>{outcome.kind === 'sold' ? `${outcomeProfile.name}满载而归` : `已和${outcomeProfile.name}道别`}</h3><p>{outcome.kind === 'sold' ? `${getItem(outcome.visitor.item).name} ×${outcome.visitor.quantity} 已交付。` : '这次没有出售物品，也没有扣除金币或经验。'}</p>{outcome.kind === 'sold' && <div className="fvis-outcome-rewards"><span><Coins size={17} aria-hidden="true" />+{outcome.visitor.coins} 金币</span><span><Sparkles size={16} aria-hidden="true" />+{outcome.visitor.xp} 经验</span></div>}</div> : <div className="fvis-empty-heading"><span className="fvis-eyebrow">农场门口的小故事</span><h3>{wait ? '邻居还在田野路上' : '看看谁来串门了'}</h3><p>邮差送完信，竹匠收了工。<br />一声招呼，就能聊聊今天的好收成。</p></div>}
          <div className="fvis-next-visit">{wait ? <><span className="fvis-countdown"><Clock3 size={18} aria-hidden="true" /><strong>{countdown(wait)}</strong></span><p>下一位邻居稍后到访<br /><small>你可以先照看田地和牧场。</small></p></> : <><span className="fvis-ready-leaf"><Leaf size={22} aria-hidden="true" /></span><p>田野路上有了脚步声<br /><small>打声招呼，迎接一位邻居。</small></p></>}</div>
          {message && <p className="fvis-message" role="status">{message}</p>}
          <button type="button" className="fvis-button fvis-button--green fvis-welcome" data-visitor-action="welcome" onClick={welcome} disabled={wait > 0}><DoorOpen size={19} aria-hidden="true" />{wait ? '等邻居走近一些' : '看看谁来了'}</button>
          <button type="button" className="fvis-empty-later" onClick={() => callbackRef.current.onClose()}>先去照看农场<ArrowRight size={15} aria-hidden="true" /></button>
          {!outcome && <div className="fvis-neighbour-lineup" aria-label="会来串门的四位邻居">{FARM_VISITOR_PROFILES.map(neighbour => <span key={neighbour.id} title={neighbour.name}><FarmVisitorPortrait profileId={neighbour.id} compact /><small>{neighbour.name}</small></span>)}</div>}
        </div></div>
      </div>}
      <footer className="fvis-footer"><Sprout size={13} aria-hidden="true" /><span>田里忙时不用赶，等你有空再招呼。</span><span>邻里收购</span></footer>
    </section>
  </div>, document.body);
}
