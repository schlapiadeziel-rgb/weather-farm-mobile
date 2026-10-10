import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Apple, ArrowRight, Check, ChefHat, Clock3, Coins, CookingPot, Diamond, Droplets, Factory, Flame, Hammer, IceCreamBowl, Leaf, LockKeyhole, Package, Scissors, Sparkles, Sprout, Wheat } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Game, ItemId, MachineDefinition, MachineId, ProductionJob, RecipeDefinition } from '../lib/farmTypes';
import { MACHINES, RECIPES, getItem } from '../lib/farmContent';
import { collectProduction, getLevel, queueProduction, speedUpMachine, storageUsed, unlockMachine } from '../lib/game';
import './farm-production.css';

export type ProductionPanelProps = { game: Game; onChange(next: Game): void; notify(message: string): void; now: number };

const workshopLooks: Record<MachineId, { color: string; Icon: LucideIcon; shape: number }> = {
  feed_mill: { color: '#b19755', Icon: Wheat, shape: 0 }, bakery: { color: '#bc7860', Icon: ChefHat, shape: 1 }, dairy: { color: '#7faab0', Icon: Droplets, shape: 2 }, sugar_mill: { color: '#87a571', Icon: Sprout, shape: 0 },
  popcorn_pot: { color: '#c49b46', Icon: Wheat, shape: 3 }, bbq: { color: '#ad7057', Icon: Flame, shape: 3 }, pie_oven: { color: '#b3886d', Icon: ChefHat, shape: 1 }, loom: { color: '#849986', Icon: Scissors, shape: 2 },
  sewing_machine: { color: '#b58892', Icon: Scissors, shape: 2 }, cake_oven: { color: '#c49790', Icon: ChefHat, shape: 1 }, juice_press: { color: '#92aa64', Icon: Apple, shape: 3 }, icecream_maker: { color: '#86a9b1', Icon: IceCreamBowl, shape: 3 },
  jam_maker: { color: '#a97689', Icon: Apple, shape: 1 }, smelter: { color: '#889592', Icon: Flame, shape: 0 }, jeweler: { color: '#91a9ac', Icon: Diamond, shape: 2 }, coffee_kiosk: { color: '#9a8063', Icon: CookingPot, shape: 3 },
  honey_extractor: { color: '#c5a052', Icon: Droplets, shape: 0 }, candy_machine: { color: '#bc879b', Icon: Sparkles, shape: 2 }, sauce_maker: { color: '#a87763', Icon: Droplets, shape: 1 }, sushi_bar: { color: '#74998b', Icon: Leaf, shape: 3 },
  salad_bar: { color: '#86a95f', Icon: Leaf, shape: 3 }, soup_kitchen: { color: '#ba986d', Icon: CookingPot, shape: 1 },
};

/** Original vector architecture, made for this game rather than borrowed assets. */
function WorkshopArt({ machine }: { machine: MachineDefinition }) {
  const paint = `fp-${useId().replace(/:/g, '')}`;
  const { color, Icon, shape } = workshopLooks[machine.id];
  return <svg className="fp-workshop-art" viewBox="0 0 180 130" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${paint}-roof`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={color} /><stop offset="1" stopColor="#5b6653" /></linearGradient><linearGradient id={`${paint}-wall`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff0cf" /><stop offset="1" stopColor="#d9c3a0" /></linearGradient></defs>
    <ellipse cx="90" cy="115" rx="73" ry="12" fill="#567446" opacity=".16" /><path d="m20 109 67-17 76 16-68 18Z" fill="#a9bf76" /><path d="m20 109 75 17 68-18v5l-68 17-75-16Z" fill="#839d59" />
    <path d="M26 106V88m127 21V89" stroke="#7f8754" strokeWidth="2" /><g fill="#789d5a"><circle cx="25" cy="85" r="11" /><circle cx="31" cy="92" r="8" /><circle cx="151" cy="86" r="10" /><circle cx="157" cy="94" r="8" /></g><g fill="#a2bd75"><circle cx="22" cy="82" r="6" /><circle cx="149" cy="82" r="6" /></g>
    <path d="M49 58 111 42l30 18v47l-62 17-30-17Z" fill={`url(#${paint}-wall)`} stroke="#bfa888" strokeWidth=".8" /><path d="m111 42 30 18v47l-30-15Z" fill="#c3b18c" />
    {shape === 0 ? <><path d="M60 55V26l18-6 16 9v23Z" fill="#e3d1ad" /><path d="m55 27 23-15 22 17-23 7Z" fill={`url(#${paint}-roof)`} /><path d="m80 23 15 19-4 23-8 2-11-18Z" fill="#bfa97c" /><path d="M78 35v25m-8-14 18 9" stroke="#8a805c" strokeWidth="1.4" /><path d="m43 59 69-27 36 31-69 20Z" fill={`url(#${paint}-roof)`} /></> : shape === 3 ? <><path d="m43 58 67-21 40 24-70 22Z" fill={`url(#${paint}-roof)`} /><path d="m57 76 63-16 24 15-65 18Z" fill={color} /><path d="m66 74 8-2 22 17-9 2Zm19-5 8-2 22 17-9 2Zm19-5 8-2 22 16-9 3Z" fill="#fff2cd" /><path d="m57 77 22 16v6L57 83Zm22 16 65-18v6L79 99Z" fill="#b39c70" /><path d="m85 96 49-12v24l-49 13Z" fill="#637b63" /></> : <><path d="m42 57 68-31 39 36-70 25Z" fill={`url(#${paint}-roof)`} /><path d="m42 57 37 30v5L42 64Z" fill="#6c7557" /><path d="m53 55 57-26 29 26m-72 7 46-18 32 15" stroke="#ffffff30" strokeWidth="1.2" fill="none" />{shape === 1 && <><path d="M117 45V23l10-2 8 5v30" fill="#baa27b" /><path d="m115 23 13-6 11 9-13 4Z" fill="#8a805f" /><path className="fp-smoke" d="M128 16c-8-7 8-9 2-16" stroke="#fff4db" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".45" /></>}</>}
    {shape !== 3 && <><path d="m91 90 19-5v33l-19 5Z" fill="#8b8d6e" /><path d="m94 91 13-4v12l-13 4Z" fill="#bfd0c0" /><circle cx="106" cy="110" r="1.2" fill="#f9d683" /></>}
    <path d="m59 80 15 6v20l-15-6Zm68-12 8 4v17l-8-4Z" fill="#abc5ba" stroke="#819b90" strokeWidth=".8" /><path d="m66 84 1 19m-8-14 15 6m57-25v17" stroke="#fdf0ce" strokeWidth="1.2" />
    <g transform="translate(88 63)"><rect width="23" height="21" rx="4" fill="#fff3d3" stroke={color} strokeWidth="1" /><Icon x="4" y="3" width="15" height="15" color={color} strokeWidth="1.6" /></g>
    <path d="m50 110 22 8v8l-22-8Z" fill="#b39668" /><path d="m50 110 11-3 22 8-11 3Z" fill="#ddc68e" /><path d="m56 115 10 3" stroke="#8e7958" strokeWidth="2" /><path d="m82 122 18-5 18 4-18 6Z" fill="#ead7aa" />
  </svg>;
}

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}分钟`;
  const totalMinutes = Math.ceil(seconds / 60), hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60;
  return `${hours}小时${minutes ? `${minutes}分` : ''}`;
}
function gemCost(job: ProductionJob, now: number) { return Math.max(1, Math.ceil((job.readyAt - now) / 300000)); }

function ProductArt({ item, Icon }: { item: ItemId; Icon: LucideIcon }) {
  let art;
  if (item.endsWith('_feed')) art = <><path d="m16 12 3-7h11l3 7-4 5 7 16c2 9-24 9-23 0l7-16Z" fill="#d6bd81" stroke="#9e8657" /><path d="M18 14h14m-11 8 8 0m-8 5 8 0m-8 5 8 0" stroke="#9b9e61" strokeWidth="2" /><path d="M23 18v19" stroke="#b28c4c" strokeWidth="1.5" /></>;
  else if (item === 'bread' || item === 'corn_bread') art = <><path d="M7 29c-2-13 10-23 21-21 10 0 19 9 14 20l-5 10H13Z" fill="#ddb26b" stroke="#a47a42" /><path d="m19 11-6 12m15-14-6 13m16-9-6 12" stroke="#f8d999" strokeWidth="3" strokeLinecap="round" /><path d="M13 35h23" stroke="#b7864b" strokeWidth="2" /></>;
  else if (item === 'cookie' || item === 'pancake') art = <><ellipse cx="24" cy="33" rx="19" ry="7" fill="#cfa06a" /><ellipse cx="24" cy="28" rx="19" ry="7" fill="#efd09a" /><ellipse cx="24" cy="22" rx="19" ry="7" fill="#e2b677" />{item === 'cookie' ? <g fill="#8d6645"><circle cx="17" cy="20" r="2" /><circle cx="31" cy="21" r="2" /><circle cx="25" cy="25" r="1.7" /></g> : <path d="m20 16 10 1-2 7-10-1Z" fill="#ffe5a2" />}</>;
  else if (item.includes('cake')) art = <><path d="M9 22h31v16c-4 6-27 6-31 0Z" fill="#e1b383" stroke="#aa865d" /><ellipse cx="24.5" cy="22" rx="15.5" ry="6" fill="#fff0d5" /><path d="M10 22v7l5-2 6 3 6-3 5 2 7-2v-5" fill="#f5e5c2" /><path d="M23 12c-8-3-11 4-6 10 6 6 12-4 9-8Z" fill="#d97c64" /><path d="m21 14 1-5 4 4" fill="#8c9d62" /></>;
  else if (item.includes('pie')) art = <><ellipse cx="24" cy="28" rx="20" ry="11" fill="#b99a6c" /><ellipse cx="24" cy="24" rx="20" ry="10" fill="#e2bb7a" stroke="#a7824b" /><path d="m11 19 25 10M18 16l23 9M8 24l21 9M33 17 14 30m25-10-17 13m1-17L7 26" stroke="#f6d699" strokeWidth="3" /></>;
  else if (item.includes('cheese') || item === 'butter') art = <><path d="m7 22 27-9 9 19-26 9-10-4Z" fill="#f2d27e" stroke="#b89b58" /><path d="m7 22 10 6 26-8-9-7Z" fill="#ffe4a4" /><path d="M17 28v13" stroke="#c1a363" /><g fill="#d4b564"><ellipse cx="26" cy="31" rx="2.5" ry="2" /><ellipse cx="36" cy="29" rx="2" ry="2.5" /></g></>;
  else if (item.includes('icecream') || item === 'ice_cream' || item === 'cherry_popsicle') art = <><path d="m14 24 10 21 10-21Z" fill="#d5ac72" stroke="#a68a58" /><path d="m18 28 10 9m-6-9 9 4m-2-4-8 11" stroke="#b48d56" /><circle cx="24" cy="18" r="12" fill="#f1d6b2" stroke="#c2aa89" /><circle cx="25" cy="14" r="7" fill="#fff0d7" /></>;
  else if (item.includes('sweater') || item.includes('shirt') || item === 'cotton_fabric') art = <><path d="m17 9-12 10 7 9 5-4v17h17V24l5 4 7-9L34 9l-8 5Z" fill={item.includes('cotton') ? '#a9bec5' : '#b5acbd'} stroke="#7e9093" /><path d="M19 10c1 8 13 8 14 0M18 35h15" stroke="#e0e5d7" strokeWidth="2" /></>;
  else if (item.includes('popcorn')) art = <><path d="m11 22 5 21h20l5-21Z" fill="#ebd6a4" stroke="#b7a476" /><path d="m17 24 3 17m8-17v17m7-17-3 17" stroke="#d69564" strokeWidth="4" /><g fill="#fff0bf" stroke="#d8c794"><circle cx="14" cy="19" r="6" /><circle cx="23" cy="14" r="7" /><circle cx="32" cy="17" r="7" /><circle cx="39" cy="21" r="5" /></g></>;
  else if (item.includes('juice') || item.includes('sauce') || item === 'syrup') art = <><path d="M19 6h13v10l6 6v19H13V22l6-6Z" fill={item.includes('tomato') ? '#d1906b' : '#d5b775'} stroke="#a08c5e" /><path d="M19 7h13" stroke="#ede5cc" strokeWidth="5" /><path d="M14 26h23v9H14Z" fill="#f6eccd" /><path d="m19 30 4-5 5 5-5 5Z" fill="#a2b279" /></>;
  else if (item.includes('jam') || item === 'honey' || item === 'cream' || item.includes('sugar')) art = <><rect x="12" y="14" width="26" height="28" rx="5" fill={item.includes('jam') ? '#bc8291' : item === 'cream' ? '#f1e5c8' : '#d7b675'} stroke="#ac967a" /><path d="M12 13h26v6H12Z" fill="#d7ceb0" stroke="#aaa486" /><path d="M16 26h18v10H16Z" fill="#fbedd0" /><path d="M19 31h12" stroke="#9ca46d" strokeWidth="2" /></>;
  else if (item === 'espresso' || item === 'latte' || item === 'hot_chocolate') art = <><path d="M8 17h27v19c-2 8-23 8-27 0Z" fill="#e5e6d0" stroke="#9da58c" /><path d="M35 21c15-2 11 18 0 14" fill="none" stroke="#9da58c" strokeWidth="3" /><ellipse cx="21.5" cy="17" rx="13.5" ry="5" fill="#987458" /><path d="M16 13c-4-4 6-5 2-9m9 9c-4-4 6-5 2-9" fill="none" stroke="#c5baa2" strokeWidth="1.5" /></>;
  else return <Icon size={23} aria-hidden="true" />;
  return <svg className="fp-product-vector" viewBox="0 0 48 48" aria-hidden="true" focusable="false" strokeLinejoin="round" strokeLinecap="round">{art}</svg>;
}

function SpeedConfirmation({ cost, product, onCancel, onConfirm }: { cost: number; product: string; onCancel(): void; onConfirm(): void }) {
  const title = useId(), note = useId();
  const cancelRef = useRef<HTMLButtonElement>(null), confirmRef = useRef<HTMLButtonElement>(null);
  const cancelCallback = useRef(onCancel);
  useEffect(() => { cancelCallback.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelCallback.current(); }
      if (event.key === 'Tab') { event.preventDefault(); if (document.activeElement === cancelRef.current) confirmRef.current?.focus(); else cancelRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler, true);
    return () => { document.removeEventListener('keydown', handler, true); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="fp-confirm-overlay"><div className="fp-confirm" role="alertdialog" aria-modal="true" aria-labelledby={title} aria-describedby={note}>
    <span className="fp-confirm-gem"><Diamond size={30} aria-hidden="true" /></span><h3 id={title}>让这份产品提前完成？</h3><p id={note}>消耗 <strong>{cost} 颗游戏钻石</strong>，立即完成当前的{product}。后续排队产品会提前开始，完成后仍需收取。</p><small>仅使用游戏内钻石，不涉及真实付款。</small>
    <div><button ref={cancelRef} onClick={onCancel}>继续等待</button><button className="fp-confirm-yes" ref={confirmRef} onClick={onConfirm}><Diamond size={16} />确认使用 {cost} 颗</button></div>
  </div></div>, document.body);
}

export function ProductionPanel({ game, onChange, notify, now }: ProductionPanelProps) {
  const [selected, setSelected] = useState<MachineId>('feed_mill');
  const [accelerate, setAccelerate] = useState<string | null>(null);
  const level = getLevel(game);
  const machine = MACHINES.find(item => item.id === selected) ?? MACHINES[0];
  const owned = game.machines.find(item => item.id === machine.id);
  const recipes = RECIPES.filter(item => item.machine === machine.id);
  const readyCount = game.machines.reduce((count, item) => count + item.queue.filter(job => job.readyAt <= now).length, 0);
  const activeJob = owned?.queue.find(job => job.readyAt > now);
  const confirmJob = owned?.queue.find(job => job.id === accelerate && job.readyAt > now);
  const { Icon } = workshopLooks[machine.id];
  const apply = (action: () => Game, message: string) => { try { const next = action(); onChange(next); notify(message); } catch (error) { notify(error instanceof Error ? error.message : '这次操作没有完成，请稍后再试。'); } };
  const makeRecipe = (recipe: RecipeDefinition) => apply(() => queueProduction(game, machine.id, recipe.id, now), `${getItem(recipe.output).name}已加入生产队列。`);
  const collect = (job: ProductionJob) => apply(() => collectProduction(game, machine.id, job.id, now), `已将${getItem(job.recipe).name}收入仓库。`);
  return <section className="farm-production-panel" aria-label="农场生产工坊">
    <header className="fp-header"><span className="fp-header-icon"><Factory size={24} /></span><div><h2>农场工坊</h2><p>把田里的收获，变成新的好东西</p></div><div className="fp-storage"><span><Sprout size={15} />粮仓 <b>{storageUsed(game, 'silo')}/{game.siloCapacity}</b></span><span><Package size={15} />货仓 <b>{storageUsed(game, 'barn')}/{game.barnCapacity}</b></span></div></header>
    <div className="fp-layout">
      <aside className="fp-park" aria-label="工坊建筑地图"><div className="fp-park-title"><span>工坊街</span><small>{game.machines.length}/{MACHINES.length} 座已建成{readyCount > 0 ? ` · ${readyCount} 份可收取` : ''}</small></div><div className="fp-machine-grid">
        {MACHINES.map(building => { const built = game.machines.find(item => item.id === building.id), locked = level < building.level, ready = built?.queue.some(job => job.readyAt <= now); return <button key={building.id} className={`fp-machine ${selected === building.id ? 'selected' : ''} ${locked ? 'locked' : ''}`} aria-pressed={selected === building.id} aria-label={`${building.name}，${built ? ready ? '产品可收取' : '已建成' : locked ? `${building.level}级解锁` : `待建造，${building.cost}金币`}`} onClick={() => { setSelected(building.id); setAccelerate(null); }}>
          <WorkshopArt machine={building} /><strong>{building.name}</strong><span className={`fp-machine-state ${ready ? 'ready' : ''}`}>{built ? ready ? <><Check size={11} />可收取</> : built.queue.length ? <><Clock3 size={11} />生产中</> : '已建成' : locked ? <><LockKeyhole size={11} />{building.level}级</> : <><Hammer size={11} />待建造</>}</span>
        </button>; })}
      </div></aside>
      <div className="fp-workbench"><div className="fp-workbench-heading"><span className="fp-machine-emblem"><Icon size={22} /></span><div><h3>{machine.name}</h3><p>{owned ? `${owned.queue.length}/${owned.slots} 个生产位 · 按顺序逐份制作` : level < machine.level ? `农场达到 ${machine.level} 级后可建造` : '建一座新工坊，开始制作吧'}</p></div>{owned && <span className="fp-level">Lv.{level}</span>}</div>
        {!owned ? <div className="fp-build-site"><WorkshopArt machine={machine} /><span className="fp-build-sign">{level < machine.level ? <LockKeyhole size={20} /> : <Hammer size={20} />}<strong>{level < machine.level ? `${machine.level}级解锁` : '这里等着你的新工坊'}</strong></span><p>{level < machine.level ? '种植、收获和完成订单，都能让农场成长。' : `建成后可制作 ${recipes.length} 种产品；配方随等级逐步开放。`}</p><button className="fp-primary" disabled={level < machine.level || game.coins < machine.cost} onClick={() => apply(() => unlockMachine(game, machine.id), `${machine.name}建成了！`)}><Hammer size={17} />建造 · <Coins size={15} />{machine.cost.toLocaleString()}</button>{level >= machine.level && game.coins < machine.cost && <small>还差 {Math.max(0, machine.cost - game.coins).toLocaleString()} 游戏金币</small>}</div> : <>
          <div className="fp-recipes" aria-label={`${machine.name}配方`}>
            {recipes.map(recipe => { const item = getItem(recipe.output), ingredients = Object.entries(recipe.inputs) as [ItemId, number][], enough = ingredients.every(([id, amount]) => (game.inventory[id] ?? 0) >= amount), locked = level < recipe.level, full = owned.queue.length >= owned.slots; return <article key={recipe.id} className={`fp-recipe ${locked ? 'locked' : ''}`}><div className="fp-recipe-top"><span className="fp-product-art"><ProductArt item={recipe.output} Icon={Icon} /></span><div><h4>{item.name}<small>×{recipe.quantity}</small></h4><span><Clock3 size={11} />{duration(recipe.durationMs)}<b>+{recipe.xp} XP</b></span></div><span className="fp-stock">库存 {game.inventory[recipe.output] ?? 0}</span></div><div className="fp-ingredients">{ingredients.map(([id, amount]) => <span key={id} className={(game.inventory[id] ?? 0) < amount ? 'short' : ''}><span>{getItem(id).name}</span><b>{game.inventory[id] ?? 0}/{amount}</b></span>)}</div><button className="fp-queue-button" disabled={locked || !enough || full} onClick={() => makeRecipe(recipe)}>{locked ? <><LockKeyhole size={14} />{recipe.level}级解锁</> : full ? '生产位已满' : !enough ? '原料不足' : <><ArrowRight size={15} />加入队列</>}</button></article>; })}
          </div>
          <div className="fp-production-line"><div className="fp-line-title"><strong>生产队列</strong><span>{owned.queue.length ? '收取后释放生产位' : '配方上方显示每份耗料'}</span></div><div className="fp-jobs">{owned.queue.map((job, index) => { const ready = job.readyAt <= now, waiting = job.startedAt > now, recipe = RECIPES.find(item => item.id === job.recipe), progress = Math.max(0, Math.min(100, (now - job.startedAt) / Math.max(1, job.readyAt - job.startedAt) * 100)); return <div key={job.id} className={`fp-job ${ready ? 'ready' : ''}`}><span className="fp-job-number">{index + 1}</span><div><strong>{getItem(job.recipe).name} ×{recipe?.quantity ?? 1}</strong><small>{ready ? '制作完成' : waiting ? `排队中 · ${duration(job.startedAt - now)}后开始` : `制作中 · 剩余${duration(job.readyAt - now)}`}</small>{!ready && <span className="fp-progress"><i style={{ width: `${progress}%` }} /></span>}</div>{ready ? <button onClick={() => collect(job)} aria-label={`收取${getItem(job.recipe).name}`}><Check size={14} />收取</button> : activeJob?.id === job.id && <button className="fp-job-speed" disabled={game.gems < gemCost(job, now)} onClick={() => setAccelerate(job.id)} aria-label={`使用${gemCost(job, now)}颗游戏钻石加速当前产品`}><Diamond size={13} />{gemCost(job, now)}</button>}</div>; })}{Array.from({ length: Math.max(0, owned.slots - owned.queue.length) }, (_, index) => <div className="fp-job fp-empty-job" key={`empty-${index}`}><span>＋</span><small>空闲生产位</small></div>)}</div></div>
        </>}
      </div>
    </div>
    {confirmJob && <SpeedConfirmation cost={gemCost(confirmJob, now)} product={getItem(confirmJob.recipe).name} onCancel={() => setAccelerate(null)} onConfirm={() => { const cost = gemCost(confirmJob, now); apply(() => speedUpMachine(game, machine.id, confirmJob.id, now), `已使用 ${cost} 颗游戏钻石，产品可以收取了。`); setAccelerate(null); }} />}
  </section>;
}

export default ProductionPanel;
