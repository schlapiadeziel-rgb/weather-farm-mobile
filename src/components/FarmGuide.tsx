import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Factory, MapPin, PackageCheck, ShoppingBasket, Sprout, Tractor, TrainFront, Wheat, X } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import { AnimalVisual, CropVisual } from './FarmVisual';
import './farm-guide.css';

export type FarmGuideTab = 'farm' | 'livestock' | 'production' | 'orders' | 'storage' | 'town' | 'assistant';
export type FarmGuideProps = { game: Game; onNavigate(tab: FarmGuideTab): void; onClose(): void };

const chapters = [
  { tab: 'farm', title: '田里留种', subtitle: '从一粒种子开始', Icon: Wheat, action: '去农田试试' },
  { tab: 'livestock', title: '照料动物', subtitle: '饲料换来好收成', Icon: Tractor, action: '去牧场看看' },
  { tab: 'production', title: '开动工坊', subtitle: '原料变成新产品', Icon: Factory, action: '打开生产工坊' },
  { tab: 'orders', title: '送出订单', subtitle: '把收成换成金币', Icon: ShoppingBasket, action: '查看订单板' },
  { tab: 'town', title: '招待来客', subtitle: '把收成带进小镇', Icon: TrainFront, action: '去小镇接待' },
  { tab: 'assistant', title: '农场助手', subtitle: '切换到真实农场', Icon: MapPin, action: '打开农场助手' },
] as const;

function GuideMap() {
  return <svg className="fg-route-map" viewBox="0 0 240 104" aria-hidden="true" focusable="false">
    <path d="M0 55C32 18 65 42 91 35s51-37 90-17 44 16 59 9v77H0Z" fill="#c7d7a4" />
    <path d="M0 76C41 45 72 56 118 65s89-22 122-11v50H0Z" fill="#a9c289" />
    <path d="M17 84C45 44 63 91 93 65s39-23 67-13 48-18 63-33" fill="none" stroke="#f4e8bd" strokeWidth="9" strokeLinecap="round" />
    <path d="m22 53 19-8 24 10-20 9Z" fill="#d8b465" /><path d="m27 53 21 8m-13-11 20 8" stroke="#aa854d" strokeWidth="2" />
    <path d="m88 40 15-6 15 8-15 7Z" fill="#d28d69" /><path d="m90 42 13 7v14l-13-7Zm13 7 13-7v14l-13 7Z" fill="#f8edcc" />
    <path d="m170 22 17-7 17 9-17 7Z" fill="#7a9d76" /><path d="m174 28 13 7v15l-13-7Zm13 7 13-7v15l-13 7Z" fill="#f8edcc" />
    <g fill="#6f9b61"><circle cx="72" cy="38" r="10" /><circle cx="150" cy="76" r="12" /><circle cx="221" cy="66" r="10" /></g>
    <g fill="#99bb76"><circle cx="69" cy="34" r="6" /><circle cx="145" cy="71" r="8" /><circle cx="217" cy="62" r="6" /></g>
    <path d="M72 42v15m78 25v11m71-21v12" stroke="#7e8260" strokeWidth="3" />
    <g fill="#fff4cf" stroke="#b79c66" strokeWidth="1.5"><circle cx="19" cy="82" r="4" /><circle cx="223" cy="20" r="4" /></g>
  </svg>;
}

function GuideIllustration({ chapter }: { chapter: number }) {
  return <div className={`fg-illustration fg-illustration-${chapter >= 4 ? 4 : chapter}`} aria-hidden="true">
    <span className="fg-art-sun" />
    <span className="fg-art-cloud fg-art-cloud-one" /><span className="fg-art-cloud fg-art-cloud-two" />
    <div className="fg-art-hill fg-art-hill-back" /><div className="fg-art-hill fg-art-hill-front" />
    {chapter === 0 ? <>
      <span className="fg-seed-pouch">种子<span>🌾</span></span>
      <CropVisual crop="wheat" growth={24} health={100} className="fg-art-seedling" />
      <CropVisual crop="wheat" growth={100} health={100} className="fg-art-wheat" />
      <span className="fg-art-note">留一份 · 收两份</span>
    </> : chapter === 1 ? <>
      <span className="fg-art-fence" /><AnimalVisual animal="chicken" healthy className="fg-art-chicken" />
      <span className="fg-art-feed">🌾</span><span className="fg-art-eggs">🥚🥚</span>
      <span className="fg-art-note">吃饱了，等一等</span>
    </> : chapter === 2 ? <>
      <svg className="fg-workshop-art" viewBox="0 0 180 140" focusable="false">
        <ellipse cx="91" cy="124" rx="73" ry="11" fill="#61854d" opacity=".15" />
        <path d="m31 75 63-21 53 28v40l-66 14-50-28Z" fill="#e9d4a0" /><path d="m94 54 53 28v40l-53-28Z" fill="#c9b382" />
        <path d="m22 74 72-40 62 48-75 25Z" fill="#9bb095" /><path d="m22 74 59 33v7L22 82Z" fill="#647f69" />
        <path d="m37 45 16-6 11 6v22l-16 9-11-7Z" fill="#c79172" /><path d="m34 43 20-9 15 10-22 10Z" fill="#dec2a0" />
        <path d="m84 104 27-7v34l-27 6Z" fill="#816d4f" /><path d="m36 89 16 8v17l-16-8Z" fill="#a6c5bf" />
        <path d="m84 104 27-7m-18 3v25" stroke="#d8c18a" strokeWidth="2" />
        <path d="m140 92 9 6v19l-9-5Z" fill="#95aba3" /><path d="m62 116 11 6v8l-11-6Z" fill="#b7975e" />
      </svg><span className="fg-art-bread">🍞</span><span className="fg-art-note">下料 → 排队 → 取货</span>
    </> : chapter === 3 ? <>
      <div className="fg-order-board"><span>订单示例</span><span>🌾 × 4 <Check size={14} /></span><span>🥚 × 2 <Check size={14} /></span><span>🍞 × 1 <Check size={14} /></span></div>
      <span className="fg-art-basket">🧺</span><span className="fg-art-note">备齐货，再出发</span>
    </> : <><GuideMap /><span className="fg-town-pin">{chapter === 4 ? <TrainFront size={29} /> : <MapPin size={29} />}</span><span className="fg-art-note">{chapter === 4 ? '列车进站 · 小镇开张' : '独立助手 · 真实资料'}</span></>}
  </div>;
}

function ChapterContent({ chapter, game }: { chapter: number; game: Game }) {
  if (chapter === 0) return <>
    <p className="fg-lead">播种消耗 1 份作物，成熟后收获 2 份。把下一轮的种子留在粮仓里，田地就能一季接一季。</p>
    <ol className="fg-instructions"><li>选择已解锁的空地，挑选库存中还有的种子。</li><li>等倒计时结束，再收获成熟作物；收成进入粮仓。</li><li>留下一些作物种子，余下的送去加工或交订单。</li></ol>
    <div className="fg-field-tip"><span className="fg-tip-title"><Sprout size={17} /> 一只手也能打理田地</span><p>浏览模式拖动地图，双指可以缩放。切到播种或收获模式，划过地块后松手操作；轻点地块也可以。只会处理符合条件的地块。</p></div>
    <p className="fg-page-note">粮仓满了，先交货或扩容再收获。种子用完时，可以去仓库购买补给。</p>
    <p className="fg-durable"><Check size={15} /> 已收获作物 {game.harvests.toLocaleString('zh-CN')} 次</p>
  </>;
  if (chapter === 1) return <>
    <p className="fg-lead">动物吃饱后开始生产。先准备匹配的饲料，再等产物成熟；领取后记得喂下一餐。</p>
    <ol className="fg-instructions"><li>鸡吃鸡饲料，牛、猪、羊、山羊也各有自己的饲料。</li><li>在饲料厂制作饲料，或去仓库购买补给，再给动物喂食。</li><li>倒计时结束后领取鸡蛋、牛奶等产物，收入货仓。</li></ol>
    <div className="fg-field-tip"><span className="fg-tip-title"><PackageCheck size={17} /> 把饲料先备好</span><p>鸡饲料配方用到小麦和玉米。先留种，再拿多余的作物做饲料，种植与养殖就能接起来。</p></div>
    <p className="fg-page-note">领取产物不会直接增加金币。真实动物出现异常时，可切换到农场助手，在 AI 诊所提供实拍与症状信息。</p>
    <p className="fg-durable"><Check size={15} /> 已领取养殖产物 {game.productsCollected.toLocaleString('zh-CN')} 次</p>
  </>;
  if (chapter === 2) return <>
    <p className="fg-lead">工坊把原料变成饲料与商品。把配方排入队列后，原料立即扣除，机器按顺序制作。</p>
    <ol className="fg-instructions"><li>打开已建成的机器，查看配方缺哪些原料。</li><li>备齐原料再排队，等待当前商品制作完成。</li><li>点取货，把成品放入货仓；然后才可以用于订单。</li></ol>
    <div className="fg-field-tip"><span className="fg-tip-title"><Factory size={17} /> 让生产顺着订单走</span><p>例如先收小麦，再做面包。先看订单需求，避免把所有种子都拿去加工。配方里的来源入口可以带你去准备缺少的原料。</p></div>
    <p className="fg-page-note">扩生产位、加速、取消待制商品可能消耗宝石，请先看清确认提示。货仓满了会影响取货。</p>
  </>;
  if (chapter === 3) return <>
    <p className="fg-lead">收成放进仓库，备齐后送出订单，才会获得对应的金币与经验。金币可以用来建设和补给。</p>
    <ol className="fg-instructions"><li>在订单板查看每张订单的货物数量与奖励。</li><li>缺作物去农田，缺产物去牧场，缺成品去工坊。</li><li>备齐后交货。路边小店也能出售商品，成交后记得收款。</li></ol>
    <div className="fg-field-tip"><span className="fg-tip-title"><ShoppingBasket size={17} /> 接得住的订单更划算</span><p>刚起步时先做手头能完成的订单。仓库里既要有交货的商品，也要留下一轮的种子与饲料。</p></div>
    <p className="fg-page-note">订单与路边小店是单机游戏交易，使用游戏金币；不代表真实买家、真实需求或现实收入。</p>
    <p className="fg-durable"><Check size={15} /> 已交付订单 {game.ordersDelivered.toLocaleString('zh-CN')} 单</p>
  </>;
  if (chapter === 4) return <>
    <p className="fg-lead">列车带来游戏访客，杂货铺、咖啡馆和旅店等着你来经营。备好农场商品，接待来客，再把报酬带回农场。</p>
    <ol className="fg-instructions"><li>在小镇查看列车状态，有空位时接待进站的访客。</li><li>查看访客想去的店铺与所需商品；备齐后开始服务，商品会从游戏仓库扣除。</li><li>服务倒计时结束后，手动领取报酬，再接待下一位来客。</li></ol>
    <div className="fg-field-tip"><span className="fg-tip-title"><ShoppingBasket size={17} /> 给来客留一份收成</span><p>缺少商品时，顺着需求去农田、牧场或工坊备货。先看看留种、饲料和现有订单，别把下一轮经营所需的库存全用完。</p></div>
    <p className="fg-page-note">小镇访客与店铺使用游戏商品和游戏货币。现实中的种养记录、天气、问诊和行情，请从顶部入口切换到独立的农场助手。</p>
  </>;
  return <>
    <p className="fg-lead">农场助手是为真实农场主准备的独立界面。气象、诊所、行情与记录随时开放，不需要游戏等级，也不扣游戏金币。</p>
    <ol className="fg-instructions"><li>从顶部“农场助手”切换界面，在气象站核对真实农场位置，再查看当地天气与农时参考。</li><li>在 AI 诊所提供真实照片、视频或症状描述，获得辅助研判；本地模型需先下载到支持的安卓设备。</li><li>在农场工作室记录真实地块、养殖与任务；查看行情、农技知识与有来源的农业资讯。</li></ol>
    <div className="fg-field-tip"><span className="fg-tip-title"><MapPin size={17} /> 先看清数据来源</span><p>天气定位要与真实农场一致，行情要核对地区、单位和时间。AI 建议是辅助参考，严重或快速扩散的病情应联系当地农技人员或兽医。</p></div>
    <p className="fg-page-note">游戏里的作物状态、库存、金币和订单不是真实生产数据；真实农场记录独立保存。</p>
  </>;
}

export function FarmGuide({ game, onNavigate, onClose }: FarmGuideProps) {
  const [chapter, setChapter] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  const pageId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
    const index = indexRef.current;
    const selected = index?.querySelector('.fg-selected');
    if (!index || !selected) return;
    const bounds = index.getBoundingClientRect();
    const active = selected.getBoundingClientRect();
    if (active.bottom > bounds.bottom - 6) index.scrollTop += active.bottom - bounds.bottom + 6;
    else if (active.top < bounds.top + 6) index.scrollTop -= bounds.top - active.top + 6;
    if (active.right > bounds.right - 6) index.scrollLeft += active.right - bounds.right + 6;
    else if (active.left < bounds.left + 6) index.scrollLeft -= bounds.left - active.left + 6;
  }, [chapter]);

  if (typeof document === 'undefined') return null;
  const current = chapters[chapter];
  const visits = [game.harvests > 0, game.productsCollected > 0, false, game.ordersDelivered > 0, false, false];
  const visit = (tab: FarmGuideTab) => { onClose(); onNavigate(tab); };
  return createPortal(<div className="fg-overlay" ref={overlayRef} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="fg-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <header className="fg-header">
        <span className="fg-book-seal" aria-hidden="true"><BookOpen size={27} /></span>
        <div className="fg-heading"><span className="fg-eyebrow">田野来信 · 随身图鉴</span><h2 id={titleId}>农场手册</h2><p id={descriptionId}>从留种到交货，再到小镇接待</p></div>
        <button ref={closeRef} className="fg-close" onClick={onClose} aria-label="关闭农场手册"><X size={20} /><span>收起手册</span></button>
      </header>
      <div className="fg-body">
        <aside className="fg-index" ref={indexRef} aria-label="农场手册目录">
          <GuideMap /><span className="fg-index-title">一条农场小路</span>
          <nav>{chapters.map((item, index) => <button key={item.tab} className={`fg-chapter-link${index === chapter ? ' fg-selected' : ''}`} aria-current={index === chapter ? 'step' : undefined} aria-controls={pageId} onClick={() => setChapter(index)}>
            <span className="fg-chapter-number" aria-hidden="true">{index + 1}</span><span className="fg-chapter-label"><strong>{item.title}</strong><small>{visits[index] ? <><Check size={12} /> {index === 3 ? '已有交货记录' : index === 1 ? '已有养殖记录' : '已有收获记录'}</> : item.subtitle}</small></span><item.Icon size={18} aria-hidden="true" />
          </button>)}</nav>
          <p className="fg-index-note">慢慢经营，随时翻阅。<br />手册不发奖励，也不扣费用。</p>
        </aside>
        <div className="fg-page" ref={pageRef} id={pageId} tabIndex={0} aria-label={`${current.title}玩法说明`}>
          <div className="fg-page-heading"><span className="fg-page-number">{String(chapter + 1).padStart(2, '0')}</span><div><span className="fg-page-kicker">{current.subtitle}</span><h3>{current.title}</h3></div><current.Icon size={27} aria-hidden="true" /></div>
          <div className="fg-page-layout"><GuideIllustration chapter={chapter} /><div className="fg-copy"><ChapterContent chapter={chapter} game={game} /></div></div>
          {chapter === 5 ? <div className="fg-supply-note"><MapPin size={18} aria-hidden="true" /><span>真实资料独立保存，返回游戏可继续经营。</span><button onClick={() => visit('assistant')}>农场助手 <ArrowRight size={15} /></button></div> : <div className="fg-supply-note"><ShoppingBasket size={18} aria-hidden="true" /><span>找不到原料，先看看库存与补给。</span><button onClick={() => visit('storage')}>去仓库 <ArrowRight size={15} /></button></div>}
        </div>
      </div>
      <footer className="fg-footer">
        <div className="fg-page-controls"><button onClick={() => setChapter(value => value - 1)} disabled={chapter === 0} aria-label="手册上一页"><ChevronLeft size={19} /></button><span aria-live="polite">{chapter + 1} / {chapters.length}</span><button onClick={() => setChapter(value => value + 1)} disabled={chapter === chapters.length - 1} aria-label="手册下一页"><ChevronRight size={19} /></button></div>
        <span className="fg-footer-note">按自己的节奏，下一步就在身边</span>
        <button className="fg-go" onClick={() => visit(current.tab)}>{current.action}<ArrowRight size={18} /></button>
      </footer>
    </div>
  </div>, document.body);
}

export default FarmGuide;
