import { useEffect, useId, useRef, useState } from 'react';
import { Apple, ArrowRight, Check, ChevronDown, ChefHat, Clock3, Coins, CookingPot, Diamond, Droplets, Factory, Flame, Hammer, IceCreamBowl, Leaf, LockKeyhole, Package, Plus, Scissors, Sparkles, Sprout, Wheat, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Game, ItemId, MachineDefinition, MachineId, ProductionJob, RecipeDefinition } from '../lib/farmTypes';
import { MACHINES, RECIPES, getItem } from '../lib/farmContent';
import { cancelQueuedProduction, collectProduction, expandProductionSlots, getLevel, productionSlotCost, queueProduction, speedUpMachine, storageUsed, unlockMachine } from '../lib/game';
import GemConfirmation from './GemConfirmation';
import CompletionButton from './CompletionButton';
import './farm-production.css';

type SupplyTab = 'farm' | 'livestock' | 'explore' | 'storage';
export type ProductionFocus = { machineId?: MachineId; item?: ItemId; requestId: number };
export type ProductionPanelProps = { game: Game; onChange(next: Game): boolean | void; notify(message: string): void; now: number; onNavigate?(tab: SupplyTab): void; onRequestItem?(item: ItemId): void; focus?: ProductionFocus };

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


type Confirmation = { kind: 'expand'; machine: MachineId } | { kind: 'speed' | 'cancel'; machine: MachineId; job: string };
function ingredientSource(id: ItemId): { label: string; tab?: SupplyTab; machine?: MachineId } {
  const item = getItem(id);
  if (item.category === 'crop') return { label: '农田', tab: 'farm' };
  if (item.category === 'animal') return { label: '牧场', tab: 'livestock' };
  const recipe = RECIPES.find(entry => entry.output === id);
  if (recipe) return { label: MACHINES.find(entry => entry.id === recipe.machine)?.name ?? '工坊', machine: recipe.machine };
  if (item.category === 'fruit' || item.category === 'fish' || ['honey', 'coal', 'iron_ore', 'gold_ore'].includes(id)) return { label: '探索', tab: 'explore' };
  return { label: '仓库', tab: 'storage' };
}

export function ProductionPanel({ game, onChange, notify, now, onNavigate, onRequestItem, focus }: ProductionPanelProps) {
  const [selected, setSelected] = useState<MachineId>('feed_mill');
  const [filter, setFilter] = useState<'built' | 'all'>('built');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [workbenchView, setWorkbenchView] = useState<'recipes' | 'queue'>('recipes');
  const [focusedItem, setFocusedItem] = useState<ItemId | null>(null);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const [lastCollected, setLastCollected] = useState<{ machine: MachineId; recipe: ItemId } | null>(null);
  const [repeatSuccessToken, setRepeatSuccessToken] = useState(0);
  const [lockedRecipesOpen, setLockedRecipesOpen] = useState(false);
  const recipeGroupId = useId();
  const latestGameRef = useRef(game);
  const lastGamePropRef = useRef(game);
  // Local view changes may render before the parent supplies an accepted action.
  // Only a changed game prop replaces the synchronous action state.
  if (lastGamePropRef.current !== game) { lastGamePropRef.current = game; latestGameRef.current = game; }
  const lastFocusRequest = useRef<number | null>(null);
  const recipeRefs = useRef(new Map<ItemId, HTMLElement>());
  const buildSiteRef = useRef<HTMLDivElement>(null);
  const recipesRef = useRef<HTMLDivElement>(null);
  const level = getLevel(game);
  const machine = MACHINES.find(item => item.id === selected) ?? MACHINES[0];
  const owned = game.machines.find(item => item.id === machine.id);
  const recipes = RECIPES.filter(item => item.machine === machine.id);
  const lockedRecipes = recipes.filter(recipe => level < recipe.level);
  const lockedRecipesVisible = lockedRecipesOpen || lockedRecipes.some(recipe => recipe.output === focusedItem);
  const lockedRecipeIds = lockedRecipes.map(recipe => `${recipeGroupId}-${recipe.id}`).join(' ');
  const buildings = filter === 'all' ? MACHINES : MACHINES.filter(item => game.machines.some(built => built.id === item.id));
  const readyCount = game.machines.reduce((count, item) => count + item.queue.filter(job => job.readyAt <= now).length, 0);
  const activeJob = owned?.queue.find(job => job.readyAt > now && job.startedAt <= now);
  const queueCounts = { ready: 0, working: 0, waiting: 0 };
  owned?.queue.forEach(job => { queueCounts[job.readyAt <= now ? 'ready' : job.startedAt > now ? 'waiting' : 'working']++; });
  const confirmJob = confirmation && confirmation.kind !== 'expand' && confirmation.machine === machine.id ? owned?.queue.find(job => job.id === confirmation.job) : undefined;
  const expandCost = owned && owned.slots < 9 ? productionSlotCost(game, machine.id) : 0;
  const repeatRecipe = lastCollected?.machine === machine.id ? recipes.find(recipe => recipe.id === lastCollected.recipe) : undefined;
  const repeatIngredients = Object.entries(repeatRecipe?.inputs ?? {}) as [ItemId, number][];
  const repeatMissing = repeatIngredients.filter(([id, amount]) => (game.inventory[id] ?? 0) < amount);
  const repeatLevel = Math.max(machine.level, repeatRecipe?.level ?? 1);
  const repeatReasons = [
    level < repeatLevel ? `需要 ${repeatLevel} 级，当前 ${level} 级。` : '',
    owned && owned.queue.length >= owned.slots ? `生产位已满（${owned.queue.length}/${owned.slots}），先收取成品或扩位。` : '',
    repeatMissing.length ? '原料不足，补齐后可再做一批。' : '',
  ].filter(Boolean);
  const { Icon } = workshopLooks[machine.id];
  const apply = (action: (latest: Game) => Game, message: string): boolean => {
    try {
      const next = action(latestGameRef.current);
      latestGameRef.current = next;
      const saved = onChange(next);
      notify(saved === false ? `${message}本机未能保存，请在农场日记导出游戏备份。` : message);
      return true;
    } catch (error) { notify(error instanceof Error ? error.message : '这次操作没有完成，请稍后再试。'); return false; }
  };
  const selectMachine = (id: MachineId) => {
    const selectedAt = Date.now();
    const hasReadyProduct = latestGameRef.current.machines.find(item => item.id === id)?.queue.some(job => job.readyAt <= selectedAt);
    setLockedRecipesOpen(false);
    setSelected(id); setConfirmation(null); setFocusedItem(null); setPendingFocus(null); setLastCollected(null);
    setWorkbenchView(hasReadyProduct ? 'queue' : 'recipes');
  };
  useEffect(() => {
    if (!focus || lastFocusRequest.current === focus.requestId) return;
    lastFocusRequest.current = focus.requestId;
    setLockedRecipesOpen(false);
    setLastCollected(null);
    const recipe = focus.item ? RECIPES.find(entry => entry.output === focus.item) : undefined;
    const target = recipe?.machine ?? focus.machineId;
    if (!target || !MACHINES.some(entry => entry.id === target)) return;
    setSelected(target); setConfirmation(null);
    const targetOwned = game.machines.find(entry => entry.id === target);
    setWorkbenchView(!focus.item && targetOwned?.queue.length ? 'queue' : 'recipes');
    setFocusedItem(recipe?.output ?? null); setPendingFocus(focus.requestId);
    if (!game.machines.some(entry => entry.id === target)) setFilter('all');
  }, [focus, game.machines]);
  useEffect(() => {
    if (recipesRef.current) recipesRef.current.scrollTop = 0;
    if (buildSiteRef.current) buildSiteRef.current.scrollTop = 0;
  }, [selected]);
  useEffect(() => {
    if (pendingFocus === null) return;
    const target = focusedItem && owned ? recipeRefs.current.get(focusedItem) : buildSiteRef.current;
    if (target) { target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); setPendingFocus(null); }
    else if (owned) setPendingFocus(null);
  }, [pendingFocus, focusedItem, owned, selected]);
  const changeFilter = (next: 'built' | 'all') => {
    setFilter(next);
    if (next === 'built' && !game.machines.some(item => item.id === selected) && game.machines[0]) selectMachine(game.machines[0].id);
  };
  const goToIngredient = (id: ItemId) => {
    if (onRequestItem) { onRequestItem(id); return; }
    const source = ingredientSource(id);
    if (source.machine) { if (!game.machines.some(item => item.id === source.machine)) setFilter('all'); selectMachine(source.machine); }
    else if (source.tab) onNavigate?.(source.tab);
  };
  const showRecipes = () => { setWorkbenchView('recipes'); setFocusedItem(null); setPendingFocus(null); };
  const makeRecipe = (recipe: RecipeDefinition) => apply(latest => queueProduction(latest, recipe.machine, recipe.id, Date.now()), `${getItem(recipe.output).name}已加入生产队列。`);
  const collect = (job: ProductionJob) => {
    if (apply(latest => collectProduction(latest, machine.id, job.id, Date.now()), `已将${getItem(job.recipe).name}收入仓库。`)) setLastCollected({ machine: machine.id, recipe: job.recipe });
  };
  let confirmationDetails: { cost: number; heading: string; description: string; cancelLabel: string; confirmLabel: string; blockedReason: string; perform(): void } | null = null;
  if (confirmation?.machine === machine.id && owned) {
    if (confirmation.kind === 'expand') {
      confirmationDetails = { cost: expandCost, heading: `为${machine.name}增加一个生产位？`, description: `生产位将从 ${owned.slots} 个增加到 ${Math.min(9, owned.slots + 1)} 个，最多可有 9 个。扩建后可以排更多产品；仍会按顺序逐份制作。`, cancelLabel: '先不扩建', confirmLabel: '确认扩建', blockedReason: owned.slots >= 9 ? '已经有 9 个生产位，无需再扩建。' : game.gems < expandCost ? `还差 ${expandCost - game.gems} 颗游戏钻石。` : '', perform: () => apply(latest => {
        if (productionSlotCost(latest, machine.id) !== expandCost) throw new Error('生产位或钻石报价已变化，请重新确认扩位。');
        return expandProductionSlots(latest, machine.id);
      }, `${machine.name}新增了一个生产位。`) };
    } else if (confirmJob) {
      const name = getItem(confirmJob.recipe).name;
      if (confirmation.kind === 'speed') {
        const cost = gemCost(confirmJob, now);
        confirmationDetails = { cost, heading: '让这份产品提前完成？', description: `立即完成当前的${name}。后续排队产品会提前开始，完成后仍需收取。`, cancelLabel: '继续等待', confirmLabel: '确认加速', blockedReason: confirmJob.readyAt <= now ? '产品已经完成，可以直接收取。' : activeJob?.id !== confirmJob.id ? '只能加速当前正在制作的产品。' : game.gems < cost ? `还差 ${cost - game.gems} 颗游戏钻石。` : '', perform: () => apply(latest => {
          const actionNow = Date.now(), latestJob = latest.machines.find(item => item.id === machine.id)?.queue.find(job => job.id === confirmJob.id);
          if (!latestJob || latestJob.readyAt <= actionNow || gemCost(latestJob, actionNow) !== cost) throw new Error('产品状态或钻石报价已变化，请重新查看并确认。');
          return speedUpMachine(latest, machine.id, confirmJob.id, actionNow);
        }, `已使用 ${cost} 颗游戏钻石，产品可以收取了。`) };
      } else {
        const recipe = RECIPES.find(item => item.id === confirmJob.recipe);
        const refund = Object.entries(recipe?.inputs ?? {}).map(([id, amount]) => `${getItem(id as ItemId).name} ×${amount}`).join('、');
        const refundSpace = (['silo', 'barn'] as const).map(kind => {
          const amount = Object.entries(recipe?.inputs ?? {}).reduce((total, [id, quantity]) => total + (getItem(id as ItemId).storage === kind ? quantity! : 0), 0);
          const shortage = storageUsed(game, kind) + amount - (kind === 'silo' ? game.siloCapacity : game.barnCapacity);
          return shortage > 0 ? `${kind === 'silo' ? '粮仓' : '货仓'}还需留出 ${shortage} 个空位` : '';
        }).filter(Boolean);
        confirmationDetails = { cost: 1, heading: `取消排队中的${name}？`, description: `退回全部原料：${refund}。后续产品会提前开始。粮仓和货仓需要留够空间；已经开始制作的产品不能取消。`, cancelLabel: '保留排队', confirmLabel: '确认取消', blockedReason: confirmJob.startedAt <= now ? '这份产品已经开始制作，不能取消。' : game.gems < 1 ? '还需要 1 颗游戏钻石。' : refundSpace.length ? `${refundSpace.join('，')}。先使用或出售一些库存。` : '', perform: () => apply(latest => cancelQueuedProduction(latest, machine.id, confirmJob.id, Date.now()), `已取消${name}，全部原料退回仓库，使用了 1 颗游戏钻石。`) };
      }
    }
  }
  return <section className="farm-production-panel" aria-label="农场生产工坊">
    <header className="fp-header"><span className="fp-header-icon"><Factory size={24} /></span><div><h2>农场工坊</h2><p>把田里的收获，变成新的好东西</p></div><div className="fp-storage"><span><Sprout size={15} />粮仓 <b>{storageUsed(game, 'silo')}/{game.siloCapacity}</b></span><span><Package size={15} />货仓 <b>{storageUsed(game, 'barn')}/{game.barnCapacity}</b></span></div></header>
    <div className="fp-layout">
      <aside className="fp-park" aria-label="工坊建筑地图"><div className="fp-park-title"><span>工坊街</span><small>{game.machines.length}/{MACHINES.length} 座已建成{readyCount > 0 ? ` · ${readyCount} 份可收取` : ''}</small></div>
        <div className="fp-filters" role="group" aria-label="工坊建筑筛选"><button aria-pressed={filter === 'built'} onClick={() => changeFilter('built')}>已建工坊 <small>{game.machines.length}</small></button><button aria-pressed={filter === 'all'} onClick={() => changeFilter('all')}>全部建筑 <small>{MACHINES.length}</small></button></div>
        <div className="fp-machine-grid">{buildings.map(building => { const built = game.machines.find(item => item.id === building.id), locked = level < building.level, ready = built?.queue.some(job => job.readyAt <= now); return <button key={building.id} className={`fp-machine ${selected === building.id ? 'selected' : ''} ${locked ? 'locked' : ''}`} aria-pressed={selected === building.id} aria-label={`${building.name}，${built ? ready ? '产品可收取' : '已建成' : locked ? `${building.level}级解锁` : `待建造，${building.cost}金币`}`} onClick={() => selectMachine(building.id)}>
          <WorkshopArt machine={building} /><strong>{building.name}</strong><span className={`fp-machine-state ${ready ? 'ready' : ''}`}>{built ? ready ? <><Check size={11} />可收取</> : built.queue.length ? <><Clock3 size={11} />生产中</> : '已建成' : locked ? <><LockKeyhole size={11} />{building.level}级</> : <><Hammer size={11} />待建造</>}</span>
        </button>; })}{buildings.length === 0 && <div className="fp-no-buildings"><p>这里还没有工坊。</p><button onClick={() => changeFilter('all')}>看看可以建什么</button></div>}</div>
      </aside>
      <div className="fp-workbench" data-view={workbenchView}><div className="fp-workbench-heading"><span className="fp-machine-emblem"><Icon size={22} /></span><div><h3>{machine.name}</h3><p>{owned ? `${owned.queue.length}/${owned.slots} 个生产位 · 按顺序逐份制作` : level < machine.level ? `农场达到 ${machine.level} 级后可建造 · 当前 ${level} 级` : '建一座新工坊，开始制作吧'}</p></div>{owned && <span className="fp-level">Lv.{level}</span>}</div>
        {!owned ? <div className="fp-build-site" ref={buildSiteRef}>{focusedItem && <p className="fp-focus-label"><ArrowRight size={12} />正在查看 · {getItem(focusedItem).name}</p>}<WorkshopArt machine={machine} /><span className="fp-build-sign">{level < machine.level ? <LockKeyhole size={20} /> : <Hammer size={20} />}<strong>{level < machine.level ? `${machine.level}级解锁` : '这里等着你的新工坊'}</strong></span><p>{level < machine.level ? `还需提升 ${machine.level - level} 级。收获、收取产品和完成订单，都能获得经验。` : `建成后可制作 ${recipes.length} 种产品；配方随等级逐步开放。`}</p><button className="fp-primary" disabled={level < machine.level || game.coins < machine.cost} onClick={() => apply(latest => unlockMachine(latest, machine.id), `${machine.name}建成了！`)}><Hammer size={17} />建造 · <Coins size={15} />{machine.cost.toLocaleString()}</button>{level >= machine.level && game.coins < machine.cost && <small>还差 {Math.max(0, machine.cost - game.coins).toLocaleString()} 游戏金币，可通过交货和路边摊赚取。</small>}</div> : <>
          <div className="fp-mobile-views" role="group" aria-label="工坊工作台视图"><button aria-pressed={workbenchView === 'recipes'} onClick={() => setWorkbenchView('recipes')}>制作配方</button><button aria-pressed={workbenchView === 'queue'} onClick={() => setWorkbenchView('queue')}>生产队列 <span>{owned.queue.length}/{owned.slots}</span>{owned.queue.some(job => job.readyAt <= now) && <b>可收取</b>}</button></div>
          <div className="fp-recipes" ref={recipesRef} aria-label={`${machine.name}配方`}>
            {lockedRecipes.length > 0 && <button className="fp-recipe-stack" aria-expanded={lockedRecipesVisible} aria-controls={lockedRecipeIds} onClick={() => { setLockedRecipesOpen(!lockedRecipesVisible); if (lockedRecipesVisible) { setFocusedItem(null); setPendingFocus(null); } }}>
              <span className="fp-recipe-stack-art" aria-hidden="true"><LockKeyhole size={18} /></span>
              <span><strong>未解锁配方 · {lockedRecipes.length}</strong><small>{lockedRecipesVisible ? '收起，专注当前制作' : `下一份 ${Math.min(...lockedRecipes.map(recipe => recipe.level))} 级解锁 · 点击翻看`}</small></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>}
            {recipes.map(recipe => { const item = getItem(recipe.output), ingredients = Object.entries(recipe.inputs) as [ItemId, number][], missing = ingredients.filter(([id, amount]) => (game.inventory[id] ?? 0) < amount), locked = level < recipe.level, full = owned.queue.length >= owned.slots; return <article key={recipe.id} id={`${recipeGroupId}-${recipe.id}`} hidden={locked && !lockedRecipesVisible} ref={element => { if (element) recipeRefs.current.set(recipe.output, element); else recipeRefs.current.delete(recipe.output); }} data-recipe-item={recipe.output} className={`fp-recipe ${locked ? 'locked' : ''} ${focusedItem === recipe.output ? 'is-focused' : ''}`} aria-label={focusedItem === recipe.output ? `正在查看${item.name}配方` : undefined}>{focusedItem === recipe.output && <p className="fp-focus-label"><ArrowRight size={12} />正在查看 · {item.name}</p>}<div className="fp-recipe-top"><span className="fp-product-art"><ProductArt item={recipe.output} Icon={Icon} /></span><div><h4>{item.name}<small>×{recipe.quantity}</small></h4><span><Clock3 size={11} />{duration(recipe.durationMs)}<b>+{recipe.xp} XP</b></span></div><span className="fp-stock">库存 {game.inventory[recipe.output] ?? 0}</span></div><div className="fp-ingredients">{ingredients.map(([id, amount]) => <span key={id} className={(game.inventory[id] ?? 0) < amount ? 'short' : ''}><span>{getItem(id).name}</span><b>{game.inventory[id] ?? 0}/{amount}</b></span>)}</div>
              <button className="fp-queue-button" disabled={locked || missing.length > 0 || full} onClick={() => makeRecipe(recipe)}>{locked ? <><LockKeyhole size={14} />{recipe.level}级解锁 · 当前{level}级</> : full ? '生产位已满' : missing.length > 0 ? '补齐原料后制作' : <><ArrowRight size={15} />加入队列</>}</button>
              {locked ? <p className="fp-recipe-help">收获和交货可获得经验，还需提升 {recipe.level - level} 级。</p> : missing.length > 0 ? <div className="fp-missing">{missing.map(([id, amount]) => { const source = ingredientSource(id); return <div key={id}><span>还缺{getItem(id).name} ×{amount - (game.inventory[id] ?? 0)}</span>{source.machine || onNavigate || onRequestItem ? <button onClick={() => goToIngredient(id)} aria-label={`补充${getItem(id).name}，去${source.label}`}>去{source.label}<ArrowRight size={12} /></button> : <small>来自{source.label}</small>}</div>; })}</div> : full && <p className="fp-recipe-help">先收取成品，或扩建一个生产位。</p>}
            </article>; })}
          </div>
          <div className={`fp-production-line${repeatRecipe ? ' has-repeat' : ''}`}><div className="fp-line-title"><strong>生产队列</strong><span>{owned.slots}/9 个生产位</span>{owned.slots < 9 ? <button className="fp-expand" disabled={game.gems < expandCost} title={game.gems < expandCost ? `还差 ${expandCost - game.gems} 颗游戏钻石` : '增加一个生产位，仍按顺序制作'} aria-label={`扩建一个生产位，需要${expandCost}颗游戏钻石${game.gems < expandCost ? `，还差${expandCost - game.gems}颗` : ''}`} onClick={() => setConfirmation({ kind: 'expand', machine: machine.id })}><Plus size={14} />扩位 <Diamond size={13} />{expandCost}</button> : <small className="fp-slots-complete"><Check size={12} />已全部扩建</small>}</div>
            {owned.queue.length > 0 && <div className="fp-queue-summary" role="group" aria-label={`${machine.name}生产状态`}>
              {queueCounts.ready > 0 && <span data-queue-phase="ready"><Check size={12} aria-hidden="true" />待收取 <b>{queueCounts.ready}</b></span>}
              {queueCounts.working > 0 && <span data-queue-phase="working"><CookingPot size={12} aria-hidden="true" />制作中 <b>{queueCounts.working}</b></span>}
              {queueCounts.waiting > 0 && <span data-queue-phase="waiting"><Clock3 size={12} aria-hidden="true" />排队中 <b>{queueCounts.waiting}</b></span>}
            </div>}
            {repeatRecipe && <article className="fp-repeat-card" aria-label={`刚收取的${getItem(repeatRecipe.output).name}配方`}>
              <div className="fp-repeat-heading"><span className="fp-product-art"><ProductArt item={repeatRecipe.output} Icon={Icon} /></span><div><small>刚收取的配方</small><strong>{getItem(repeatRecipe.output).name} ×{repeatRecipe.quantity}</strong></div><CompletionButton key={`${machine.id}:${repeatRecipe.id}`} className="fp-queue-button" successToken={repeatSuccessToken} data-repeat-recipe={repeatRecipe.id} disabled={repeatReasons.length > 0} aria-describedby={repeatReasons.length ? 'fp-repeat-reason' : undefined} aria-label={`再做一批${getItem(repeatRecipe.output).name}，制作${repeatRecipe.quantity}份`} onClick={() => { if (makeRecipe(repeatRecipe)) setRepeatSuccessToken(token => token + 1); }}><Plus size={14} />再做一批</CompletionButton></div>
              <div className="fp-ingredients" aria-label="再做一批所需原料与当前库存">{repeatIngredients.map(([id, amount]) => <span key={id} className={(game.inventory[id] ?? 0) < amount ? 'short' : ''}><span>{getItem(id).name}</span><b>库存 {game.inventory[id] ?? 0} / 需 {amount}</b></span>)}</div>
              {repeatReasons.length > 0 && <p className="fp-repeat-reason" id="fp-repeat-reason">{repeatReasons.join(' ')}</p>}
              {repeatMissing.length > 0 && <div className="fp-missing">{repeatMissing.map(([id, amount]) => { const source = ingredientSource(id); return <div key={id}><span>还缺{getItem(id).name} ×{amount - (game.inventory[id] ?? 0)}</span>{source.machine || onNavigate || onRequestItem ? <button onClick={() => goToIngredient(id)} aria-label={`补充${getItem(id).name}，去${source.label}`}>去{source.label}<ArrowRight size={12} /></button> : <small>来自{source.label}</small>}</div>; })}</div>}
            </article>}
            <div className="fp-jobs" role="group" aria-label="生产任务，滚动查看全部生产位">{owned.queue.map((job, index) => {
              const ready = job.readyAt <= now, waiting = job.startedAt > now, recipe = RECIPES.find(item => item.id === job.recipe), storage = getItem(recipe?.output ?? job.recipe).storage;
              const requiredSpace = Math.max(0, storageUsed(game, storage) + (recipe?.quantity ?? 1) - (storage === 'silo' ? game.siloCapacity : game.barnCapacity));
              const progress = Math.max(0, Math.min(100, (now - job.startedAt) / Math.max(1, job.readyAt - job.startedAt) * 100));
              return <div key={job.id} className={`fp-job ${ready ? 'ready' : ''}`} data-production-phase={ready ? 'ready' : waiting ? 'waiting' : 'working'}><span className="fp-job-number">{index + 1}</span><div><strong>{getItem(job.recipe).name} ×{recipe?.quantity ?? 1}</strong><small>{ready ? '制作完成' : waiting ? `排队中 · ${duration(job.startedAt - now)}后开始` : `制作中 · 剩余${duration(job.readyAt - now)}`}</small>{ready && requiredSpace > 0 && <small className="fp-capacity-needed" id={`fp-space-${job.id}`}>收取需腾出 {requiredSpace} 个{storage === 'silo' ? '粮仓' : '货仓'}空位</small>}{!ready && <span className="fp-progress" role="progressbar" aria-label={`${getItem(job.recipe).name}制作进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)} aria-valuetext={waiting ? '排队中，尚未开始制作' : `已制作 ${Math.floor(progress)}%`}><i style={{ width: `${progress}%` }} /></span>}</div>
                <div className="fp-job-actions">{ready ? <><button onClick={() => collect(job)} disabled={requiredSpace > 0} aria-describedby={requiredSpace > 0 ? `fp-space-${job.id}` : undefined} aria-label={`收取${getItem(job.recipe).name}`}><Check size={14} />收取</button>{requiredSpace > 0 && onNavigate && <button className="fp-job-storage" onClick={() => onNavigate('storage')} aria-label={`前往仓库，为${getItem(job.recipe).name}腾出空间`}><Package size={13} />去仓库</button>}</> : waiting ? <button className="fp-job-cancel" disabled={game.gems < 1} onClick={() => setConfirmation({ kind: 'cancel', machine: machine.id, job: job.id })} aria-label={`取消等待中的${getItem(job.recipe).name}，退回原料，消耗1颗游戏钻石`}><X size={12} />取消 <Diamond size={11} />1</button> : activeJob?.id === job.id && <button className="fp-job-speed" disabled={game.gems < gemCost(job, now)} onClick={() => setConfirmation({ kind: 'speed', machine: machine.id, job: job.id })} aria-label={`使用${gemCost(job, now)}颗游戏钻石加速当前产品`}><Diamond size={13} />{gemCost(job, now)}</button>}</div>
              </div>;
            })}{Array.from({ length: Math.max(0, owned.slots - owned.queue.length) }, (_, index) => <button className="fp-job fp-empty-job" key={`empty-${index}`} onClick={showRecipes} aria-label="选择配方，使用空闲生产位"><span aria-hidden="true">＋</span><small>空闲生产位<br />选择配方</small></button>)}</div>
          </div>
        </>}
      </div>
    </div>
    {confirmationDetails && <GemConfirmation {...confirmationDetails} onCancel={() => setConfirmation(null)} onConfirm={() => { confirmationDetails.perform(); setConfirmation(null); }} />}
  </section>;
}

export default ProductionPanel;
