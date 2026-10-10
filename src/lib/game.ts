import { CROPS, LIVESTOCK, ITEMS, MACHINES, RECIPES } from './farmContent';
import { generateOrders } from './farmEconomy';
import type { AnimalDefinition, AnimalId, AnimalPen, CropDefinition, CropId, FarmMachine, Game, GameOrder, ItemId, MachineId, OrchardPlot, Plot, ProductionJob, RoadsideSlot, StorageKind } from './farmTypes';
import type { WeatherDay } from './weather';

export * from './farmTypes';
export { CROPS, LIVESTOCK, ITEMS, MACHINES, RECIPES } from './farmContent';
export type { WeatherDay } from './weather';
export type Crop = CropDefinition;
export type Animal = AnimalDefinition;
export type Advice = { id: string; severity: 'warning' | 'tip' | 'good'; title: string; detail: string; action?: 'water'; plotIds?: number[] };

const clamp = (value: number): number => Math.max(0, Math.min(100, value));
const MAX_DATE = 8_640_000_000_000_000;
const number = (value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) throw new Error(`${label}无效。`);
  return value;
};
const timestamp = (value: unknown, label: string): number => number(value, label, 0, MAX_DATE);
const time = (value: number): number => timestamp(value, '计时时间');
const cropById = (id: CropId): CropDefinition => { const result = CROPS.find(item => item.id === id); if (!result) throw new Error('找不到这个作物。'); return result; };
const animalById = (id: AnimalId): AnimalDefinition => { const result = LIVESTOCK.find(item => item.id === id); if (!result) throw new Error('找不到这种动物。'); return result; };
const itemById = (id: ItemId) => { const result = ITEMS.find(item => item.id === id); if (!result) throw new Error('物品编号无效。'); return result; };
const recipeById = (id: ItemId) => { const result = RECIPES.find(item => item.id === id); if (!result) throw new Error('找不到这个配方。'); return result; };
const machineById = (id: MachineId) => { const result = MACHINES.find(item => item.id === id); if (!result) throw new Error('找不到这个加工坊。'); return result; };
const findPlot = (game: Game, id: number): Plot => { const plot = game.plots.find(item => item.id === id); if (!plot) throw new Error('找不到这块田。'); if (game.plots.indexOf(plot) >= game.unlockedPlots) throw new Error('这块田尚未解锁。'); return plot; };
const findPen = (game: Game, id: number): AnimalPen => { const pen = game.animals.find(item => item.id === id); if (!pen) throw new Error('找不到这个畜栏。'); return pen; };
const findMachine = (game: Game, id: MachineId): FarmMachine => { machineById(id); const machine = game.machines.find(item => item.id === id); if (!machine) throw new Error('请先建造这个加工坊。'); return machine; };
const log = (game: Game, entry: string): void => { game.log = [entry, ...game.log].slice(0, 12); };
const clone = (game: Game): Game => ({
  ...game, plots: game.plots.map(item => ({ ...item })), animals: game.animals.map(item => ({ ...item })), inventory: { ...game.inventory }, log: [...game.log],
  machines: game.machines.map(item => ({ ...item, queue: item.queue.map(job => ({ ...job })) })), orders: game.orders.map(item => ({ ...item, requirements: { ...item.requirements } })),
  shopListings: game.shopListings.map(item => ({ ...item })), orchard: game.orchard.map(item => ({ ...item })), achievements: [...game.achievements],
});

export function getLevel(game: Pick<Game, 'xp'>): number { return 1 + Math.floor(Math.sqrt(number(game.xp, '经验') / 20)); }
export function storageUsed(game: Pick<Game, 'inventory'>, kind: StorageKind): number {
  if (kind !== 'silo' && kind !== 'barn') throw new Error('仓库类型无效。');
  return Object.entries(game.inventory).reduce((used, [id, quantity]) => {
    const item = itemById(id as ItemId); const amount = number(quantity, '库存数量');
    return used + (item.storage === kind ? amount : 0);
  }, 0);
}
function resources(game: Game): void {
  number(game.coins, '金币'); number(game.gems, '钻石'); number(game.xp, '经验');
  number(game.day, '游戏天数', 1); number(game.harvests, '收获次数'); number(game.productsCollected, '收集次数'); number(game.waterUsed, '游戏用水');
  number(game.unlockedPlots, '已解锁地块', 1, game.plots.length); number(game.orderSerial, '订单序号'); number(game.ordersDelivered, '已完成订单');
  number(game.siloCapacity, '粮仓容量', 1, 1000); number(game.barnCapacity, '货仓容量', 1, 1000);
  if (storageUsed(game, 'silo') > game.siloCapacity || storageUsed(game, 'barn') > game.barnCapacity) throw new Error('库存超过仓库容量，请核实存档。');
}
function levelRequired(game: Game, level: number): void { if (getLevel(game) < level) throw new Error(`需要达到 ${level} 级才能解锁。`); }
function capacity(game: Game, item: ItemId, quantity: number): void {
  const kind = itemById(item).storage; const maximum = kind === 'silo' ? game.siloCapacity : game.barnCapacity;
  if (storageUsed(game, kind) + quantity > maximum) throw new Error(`${kind === 'silo' ? '粮仓' : '货仓'}空间不足，请先出售或使用库存。`);
}
function take(game: Game, item: ItemId, quantity: number): void {
  number(quantity, '使用数量', 1); itemById(item); const owned = number(game.inventory[item] ?? 0, '库存数量');
  if (owned < quantity) throw new Error(`${itemById(item).name}库存不足，需要 ${quantity} 份。`); game.inventory[item] = owned - quantity;
}
function put(game: Game, item: ItemId, quantity: number): void { number(quantity, '收取数量', 1); capacity(game, item, quantity); game.inventory[item] = number(game.inventory[item] ?? 0, '库存数量') + quantity; }
function progress(start: number, ready: number, now: number): number { return ready <= now ? 100 : Math.round(clamp((now - start) / Math.max(1, ready - start) * 100) * 10) / 10; }
function bonus(game: Game, counter: number, animal = false): void {
  if (counter <= 0 || counter % 5 !== 0 || storageUsed(game, 'barn') >= game.barnCapacity) return;
  const cycle: ItemId[] = animal ? ['axe', 'saw'] : ['plank', 'nail', 'bolt', 'screw', 'duct_tape', 'wood_panel', 'land_deed', 'mallet', 'marker_stake', 'shovel', 'dynamite', 'saw', 'axe'];
  const item = cycle[(counter / 5 - 1) % cycle.length]; put(game, item, 1); log(game, `额外获得 ${itemById(item).name} ×1。`);
}

export function initialGame(now = Date.now()): Game {
  time(now); const wheat = cropById('wheat'); const corn = cropById('corn'); const soybean = cropById('soybean'); const chicken = animalById('chicken');
  const plots: Plot[] = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, crop: null, growth: 0, health: 100, moisture: 50 }));
  plots[0] = { id: 1, crop: 'wheat', growth: 100, health: 100, moisture: 50, plantedAt: Math.max(0, now - wheat.durationMs), readyAt: now };
  plots[1] = { id: 2, crop: 'corn', growth: 0, health: 100, moisture: 50, plantedAt: now, readyAt: time(now + corn.durationMs) };
  plots[2] = { id: 3, crop: 'soybean', growth: 0, health: 100, moisture: 50, plantedAt: now, readyAt: time(now + soybean.durationMs) };
  return {
    version: 2, day: 1, coins: 500, gems: 20, xp: 0, harvests: 0, waterUsed: 0, productsCollected: 0, plots,
    animals: [{ id: 1, animal: 'chicken', health: 100, feed: 100, progress: 100, fedAt: Math.max(0, now - chicken.durationMs), readyAt: now }, { id: 2, animal: null, health: 100, feed: 0, progress: 0 }, { id: 3, animal: null, health: 100, feed: 0, progress: 0 }],
    log: ['欢迎来到田野来信！收获小麦、收取鸡蛋，再试试饲料坊和面包坊。'],
    inventory: { wheat: 12, corn: 10, soybean: 6, radish: 4, chicken_feed: 4, cow_feed: 2, egg: 2, saw: 2, axe: 2, shovel: 2, dynamite: 2, plank: 2, screw: 2, bolt: 2, duct_tape: 2, nail: 2, wood_panel: 2, land_deed: 2, mallet: 2, marker_stake: 2 },
    siloCapacity: 100, barnCapacity: 100, unlockedPlots: 6,
    machines: [{ id: 'feed_mill', slots: 2, queue: [] }, { id: 'bakery', slots: 2, queue: [] }],
    orders: generateOrders(1, 0, 'truck'), ordersDelivered: 0, orderSerial: 1, shopListings: [], orchard: [], fishingReadyAt: 0, mineReadyAt: 0, achievements: [], beehiveBuilt: false, beehiveReadyAt: 0,
  };
}

export function tickGame(game: Game, now = Date.now()): Game {
  time(now); resources(game); const next = clone(game);
  next.plots = next.plots.map(plot => ({ ...plot, health: 100, growth: plot.crop && plot.plantedAt !== undefined && plot.readyAt !== undefined ? progress(plot.plantedAt, plot.readyAt, now) : 0 }));
  next.animals = next.animals.map(pen => ({ ...pen, health: 100, progress: pen.animal && pen.fedAt !== undefined && pen.readyAt !== undefined ? progress(pen.fedAt, pen.readyAt, now) : 0 })); return next;
}
export function plant(game: Game, plotId: number, cropId: CropId, now = Date.now()): Game {
  time(now); resources(game); const plot = findPlot(game, plotId); const crop = cropById(cropId); levelRequired(game, crop.level);
  if (plot.crop) throw new Error('这块田已经有作物了。'); const next = tickGame(game, now); take(next, cropId, 1);
  next.plots = next.plots.map(item => item.id === plotId ? { ...item, crop: cropId, growth: 0, health: 100, plantedAt: now, readyAt: time(now + crop.durationMs) } : item);
  log(next, `在 ${plotId} 号田播种${crop.name}，使用种子 ×1。`); return next;
}
export function harvest(game: Game, plotId: number, now = Date.now()): Game {
  time(now); resources(game); const plot = findPlot(game, plotId); if (!plot.crop) throw new Error('这块田还没有作物。');
  if (plot.readyAt === undefined || plot.readyAt > now) throw new Error('作物还没有成熟，请等待计时结束。');
  const crop = cropById(plot.crop); const next = tickGame(game, now); put(next, crop.id, 2);
  next.plots = next.plots.map(item => item.id === plotId ? { id: item.id, crop: null, growth: 0, health: 100, moisture: item.moisture } : item);
  next.xp += crop.xp; next.harvests += 1; bonus(next, next.harvests); log(next, `收获${crop.name} ×2，获得 ${crop.xp} 经验。`); return next;
}
export function buyAnimal(game: Game, penId: number, animalId: AnimalId): Game {
  resources(game); const pen = findPen(game, penId); const animal = animalById(animalId); levelRequired(game, animal.level);
  if (pen.animal) throw new Error('这个畜栏已经有动物了。'); if (game.coins < animal.cost) throw new Error('金币不足，暂时无法购买动物。');
  const next = clone(game); next.coins -= animal.cost; next.animals = next.animals.map(item => item.id === penId ? { id: item.id, animal: animalId, health: 100, feed: 0, progress: 0 } : item);
  log(next, `购买${animal.name}，花费 ${animal.cost} 金币。`); return next;
}
export function buildPen(game: Game): Game {
  resources(game); const limit = Math.min(15, 3 + (getLevel(game) - 1) * 2);
  if (game.animals.length >= 15) throw new Error('畜栏已达到 15 个上限。'); if (game.animals.length >= limit) throw new Error('提升等级后才能建造更多畜栏。');
  const cost = 100 + Math.max(0, game.animals.length - 3) * 25; if (game.coins < cost) throw new Error(`金币不足，新畜栏需要 ${cost} 金币。`);
  const next = clone(game); next.coins -= cost; next.animals.push({ id: Math.max(0, ...next.animals.map(item => item.id)) + 1, animal: null, health: 100, feed: 0, progress: 0 }); log(next, `建造新畜栏，花费 ${cost} 金币。`); return next;
}
export function feedAnimal(game: Game, penId: number, now = Date.now()): Game {
  time(now); resources(game); const pen = findPen(game, penId); if (!pen.animal) throw new Error('这个畜栏还没有动物。');
  if (pen.readyAt !== undefined) throw new Error(pen.readyAt <= now ? '先收取准备好的产物，再喂食。' : '动物正在产出，暂时不用重复喂食。');
  const animal = animalById(pen.animal); const next = tickGame(game, now); take(next, animal.feedItem, 1);
  next.animals = next.animals.map(item => item.id === penId ? { ...item, health: 100, feed: 100, progress: 0, fedAt: now, readyAt: time(now + animal.durationMs) } : item);
  log(next, `给${animal.name}喂食，使用${itemById(animal.feedItem).name} ×1。`); return next;
}
export function collectProduct(game: Game, penId: number, now = Date.now()): Game {
  time(now); resources(game); const pen = findPen(game, penId); if (!pen.animal) throw new Error('这个畜栏还没有动物。');
  if (pen.readyAt === undefined || pen.readyAt > now) throw new Error('产物还没准备好，请先喂食并等待计时。');
  const animal = animalById(pen.animal); const next = tickGame(game, now); put(next, animal.product, 1);
  next.animals = next.animals.map(item => item.id === penId ? { id: item.id, animal: item.animal, health: 100, feed: 0, progress: 0 } : item);
  next.productsCollected += 1; next.xp += 5; bonus(next, next.productsCollected, true); log(next, `收取${animal.productName} ×1，获得 5 经验。`); return next;
}
export function unlockMachine(game: Game, machineId: MachineId): Game {
  resources(game); const machine = machineById(machineId); levelRequired(game, machine.level);
  if (game.machines.some(item => item.id === machineId)) throw new Error('这个加工坊已经建好了。'); if (game.coins < machine.cost) throw new Error('金币不足，暂时无法建造加工坊。');
  const next = clone(game); next.coins -= machine.cost; next.machines.push({ id: machineId, slots: 2, queue: [] }); log(next, `建造${machine.name}，花费 ${machine.cost} 金币。`); return next;
}
export function queueProduction(game: Game, machineId: MachineId, recipeId: ItemId, now = Date.now()): Game {
  time(now); resources(game); const machine = findMachine(game, machineId); const recipe = recipeById(recipeId);
  if (recipe.machine !== machineId) throw new Error('这个配方不能在此加工坊制作。'); levelRequired(game, recipe.level); levelRequired(game, machineById(machineId).level);
  if (machine.queue.length >= machine.slots) throw new Error('生产队列已满，请先收取成品。');
  const next = tickGame(game, now); for (const [item, quantity] of Object.entries(recipe.inputs)) take(next, item as ItemId, quantity!);
  const target = findMachine(next, machineId); const startedAt = Math.max(now, target.queue.at(-1)?.readyAt ?? now); const readyAt = time(startedAt + recipe.durationMs);
  let serial = 0; let id: string; do { id = `${machineId}-${now}-${game.xp}-${game.gems}-${game.harvests}-${game.productsCollected}-${serial++}`; } while (next.machines.some(item => item.queue.some(job => job.id === id)));
  target.queue.push({ id, recipe: recipeId, startedAt, readyAt }); log(next, `开始制作${itemById(recipe.output).name} ×${recipe.quantity}。`); return next;
}
export function collectProduction(game: Game, machineId: MachineId, jobId: string, now = Date.now()): Game {
  time(now); resources(game); const machine = findMachine(game, machineId); const job = machine.queue.find(item => item.id === jobId);
  if (!job) throw new Error('这个生产任务已经收取或不存在。'); if (job.readyAt > now) throw new Error('成品还没有做好，请等待计时结束。');
  const recipe = recipeById(job.recipe); const next = tickGame(game, now); put(next, recipe.output, recipe.quantity);
  findMachine(next, machineId).queue = findMachine(next, machineId).queue.filter(item => item.id !== jobId); next.xp += recipe.xp; log(next, `收取${itemById(recipe.output).name} ×${recipe.quantity}，获得 ${recipe.xp} 经验。`); return next;
}
function gemCost(readyAt: number, now: number): number { if (readyAt <= now) throw new Error('计时已经结束，无需钻石加速。'); return Math.max(1, Math.ceil((readyAt - now) / 300_000)); }
function spendGems(game: Game, cost: number): void { if (game.gems < cost) throw new Error(`钻石不足，本次加速需要 ${cost} 颗。`); game.gems -= cost; }
export function speedUpCrop(game: Game, plotId: number, now = Date.now()): Game {
  time(now); resources(game); const plot = findPlot(game, plotId); if (!plot.crop || plot.readyAt === undefined) throw new Error('这块田没有正在生长的作物。');
  const cost = gemCost(plot.readyAt, now); const next = tickGame(game, now); spendGems(next, cost);
  next.plots = next.plots.map(item => item.id === plotId ? { ...item, plantedAt: Math.min(item.plantedAt ?? now, now), readyAt: now, growth: 100 } : item); log(next, `花费 ${cost} 钻石加速作物。`); return next;
}
export function speedUpAnimal(game: Game, penId: number, now = Date.now()): Game {
  time(now); resources(game); const pen = findPen(game, penId); if (!pen.animal || pen.readyAt === undefined) throw new Error('先喂食，再加速产出。');
  const cost = gemCost(pen.readyAt, now); const next = tickGame(game, now); spendGems(next, cost);
  next.animals = next.animals.map(item => item.id === penId ? { ...item, fedAt: Math.min(item.fedAt ?? now, now), readyAt: now, progress: 100 } : item); log(next, `花费 ${cost} 钻石加速产出。`); return next;
}
export function speedUpMachine(game: Game, machineId: MachineId, jobId: string, now = Date.now()): Game {
  time(now); resources(game); const machine = findMachine(game, machineId); const job = machine.queue.find(item => item.id === jobId);
  if (!job) throw new Error('找不到这个生产任务。'); if (machine.queue.find(item => item.readyAt > now)?.id !== jobId || job.startedAt > now) throw new Error('只能加速当前正在制作的任务。');
  const cost = gemCost(job.readyAt, now); const savedTime = job.readyAt - now; const next = tickGame(game, now); spendGems(next, cost);
  const target = findMachine(next, machineId); const index = target.queue.findIndex(item => item.id === jobId);
  target.queue = target.queue.map((item, position) => position < index ? item : position === index ? { ...item, startedAt: Math.min(item.startedAt, now), readyAt: now } : { ...item, startedAt: item.startedAt - savedTime, readyAt: item.readyAt - savedTime });
  log(next, `花费 ${cost} 钻石加速加工。`); return next;
}

/** Compatibility entries. Timed crops and livestock never need water or death cleanup. */
export function water(game: Game, plotId: number): Game { findPlot(game, plotId); throw new Error('新版作物按真实计时成长，无需浇水。'); }
export function clearPlot(game: Game, plotId: number): Game { findPlot(game, plotId); throw new Error('新版作物不会枯萎，请等待成熟后收获。'); }
export function clearAnimal(game: Game, penId: number): Game { findPen(game, penId); throw new Error('新版动物不会死亡，无需清理畜栏。'); }
function validateWeather(weather: WeatherDay): void { if ([weather.temp, weather.minTemp, weather.maxTemp, weather.humidity, weather.rain, weather.rainChance, weather.wind, weather.et0].some(value => !Number.isFinite(value))) throw new Error('天气数据不完整，请刷新天气。'); }
export function advanceDay(game: Game, weather: WeatherDay, now = Date.now()): Game { validateWeather(weather); const next = tickGame(game, now); next.day += 1; log(next, `记录游戏第 ${next.day} 天，天气仅作背景，作物与动物仍按真实计时。`); return next; }
export function getAdvice(_game: Game, weather: WeatherDay, observedMoisture?: number): Advice[] {
  validateWeather(weather); if (observedMoisture !== undefined) number(observedMoisture, '土壤含水率请输入 0–100', 0, 100, false);
  const advice: Advice[] = [];
  if (weather.maxTemp >= 35) advice.push({ id: 'heat', severity: 'warning', title: '高温天气参考', detail: `预报最高 ${weather.maxTemp}°C。现实田间观察萎蔫；若养殖动物检查饮水、通风与异常喘气，具体情况联系农技或兽医。` });
  if (weather.minTemp < 5) advice.push({ id: 'cold', severity: 'warning', title: '夜间低温参考', detail: `最低 ${weather.minTemp}°C。观察幼苗防寒需求；若养殖动物检查挡风及干燥垫料。` });
  if (weather.humidity >= 80) advice.push({ id: 'humidity', severity: 'warning', title: '空气潮湿，现场检查', detail: `空气湿度 ${weather.humidity}%。检查叶片、通风及畜舍垫料；空气湿度不能诊断病害或替代土壤水分。` });
  if (weather.wind >= 20) advice.push({ id: 'wind', severity: 'warning', title: '风较大，留意设施', detail: `预报风速 ${weather.wind} km/h。检查支架和覆盖物，作业按当地要求选择天气窗口。` });
  if (weather.rainChance >= 65 && weather.rain >= 3) advice.push({ id: 'rain', severity: 'tip', title: '先核对实地降雨', detail: `降雨概率 ${weather.rainChance}%，预计 ${weather.rain} mm。灌溉安排需结合实地雨量、土壤和作物确认。` });
  if (!advice.length) advice.push({ id: 'field-weather', severity: 'tip', title: '当前天气参考', detail: `均温 ${weather.temp}°C，空气湿度 ${weather.humidity}%。结合现场观察和真实实测，不能据此判断生产状态。` });
  return [...advice.slice(0, 3), { id: 'context', severity: 'tip', title: '天气与游戏数据分开', detail: `${weather.date} · ${weather.minTemp}–${weather.maxTemp}°C · 空气湿度 ${weather.humidity}% · 降雨 ${weather.rain} mm。${observedMoisture === undefined ? '没有连接土壤传感器。' : `你输入的土壤含水率 ${observedMoisture}%，未经系统实测，不能套用游戏湿度阈值。`}游戏库存、健康和计时不用于现实建议。` }];
}

const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档对象无效。'); return value as Record<string, unknown>; };
const string = (value: unknown, label: string, max = 500): string => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}无效。`); return value; };
const array = (value: unknown, label: string, min = 0, max = 1000): unknown[] => { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label}无效。`); return value; };
const boolean = (value: unknown): boolean => { if (typeof value !== 'boolean') throw new Error('存档状态无效。'); return value; };
function unique(items: readonly { id: string | number }[]): void { if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('存档包含重复编号。'); }
function sequentialIds(items: readonly { id: number }[], label: string): void { if (items.some((item, index) => item.id !== index + 1)) throw new Error(`${label}编号必须从 1 连续排列。`); }
function stock(value: unknown, positive = false): Partial<Record<ItemId, number>> {
  const result: Partial<Record<ItemId, number>> = {};
  for (const [id, amount] of Object.entries(object(value))) { itemById(id as ItemId); result[id as ItemId] = number(amount, '库存数量', positive ? 1 : 0); } return result;
}
function parsePlots(value: unknown, legacy: boolean, now: number): Plot[] {
  const result = array(value, '地块', 12, 12).map(raw => {
    const item = object(raw); const id = number(item.id, '地块编号', 1); const crop = item.crop === null ? null : cropById(item.crop as CropId).id;
    const growth = number(item.growth, '生长进度', 0, 100, false); const health = number(item.health, '健康', 0, 100, false); const moisture = number(item.moisture, '游戏水分', 0, 100, false);
    if (!crop) { if (!legacy && (item.plantedAt !== undefined || item.readyAt !== undefined || growth !== 0)) throw new Error('空地块计时无效。'); return { id, crop, growth: 0, health: 100, moisture }; }
    const duration = cropById(crop).durationMs; const plantedAt = legacy ? Math.max(0, now - Math.round(duration * growth / 100)) : timestamp(item.plantedAt, '播种时间');
    const readyAt = legacy ? time(now + Math.round(duration * (1 - growth / 100))) : timestamp(item.readyAt, '成熟时间'); if (readyAt < plantedAt) throw new Error('作物计时先后无效。');
    return { id, crop, growth, health: legacy ? 100 : health, moisture, plantedAt, readyAt };
  }); unique(result); sequentialIds(result, '地块'); return result;
}
function parseAnimals(value: unknown, legacy: boolean, now: number): AnimalPen[] {
  const result = array(value, '畜栏', 3, 15).map(raw => {
    const item = object(raw); const id = number(item.id, '畜栏编号', 1); const animal = item.animal === null ? null : animalById(item.animal as AnimalId).id;
    const health = number(item.health, '动物健康', 0, 100, false); const feed = number(item.feed, '饱食度', 0, 100, false); const amount = number(item.progress, '产出进度', 0, 100, false);
    if (!animal) { if (!legacy && (item.fedAt !== undefined || item.readyAt !== undefined || amount !== 0)) throw new Error('空畜栏计时无效。'); return { id, animal, health: 100, feed: 0, progress: 0 }; }
    if (legacy && (feed > 0 || amount > 0)) { const duration = animalById(animal).durationMs; return { id, animal, health: 100, feed: 100, progress: amount, fedAt: Math.max(0, now - Math.round(duration * amount / 100)), readyAt: time(now + Math.round(duration * (1 - amount / 100))) }; }
    if (legacy || (item.fedAt === undefined && item.readyAt === undefined)) { if (!legacy && amount !== 0) throw new Error('未喂食动物进度无效。'); return { id, animal, health: 100, feed: 0, progress: 0 }; }
    const fedAt = timestamp(item.fedAt, '喂食时间'); const readyAt = timestamp(item.readyAt, '产出时间'); if (readyAt < fedAt) throw new Error('动物计时先后无效。'); return { id, animal, health, feed, progress: amount, fedAt, readyAt };
  }); unique(result); sequentialIds(result, '畜栏'); return result;
}

/** Invalid saves throw; callers can preserve the original backup before resetting. */
export function restoreGame(saved: unknown, now = Date.now()): Game {
  time(now); const source = object(saved); if (source.version !== 1 && source.version !== 2) throw new Error('游戏存档版本不受支持。');
  const legacy = source.version === 1; const game = initialGame(now);
  game.day = number(source.day, '游戏天数', 1); game.coins = number(source.coins, '金币'); game.xp = number(source.xp, '经验'); game.harvests = number(source.harvests, '收获次数');
  game.waterUsed = number(source.waterUsed === undefined && legacy ? 0 : source.waterUsed, '游戏用水'); game.productsCollected = number(source.productsCollected === undefined && legacy ? 0 : source.productsCollected, '收集次数');
  game.plots = parsePlots(source.plots, legacy, now); game.animals = legacy && source.animals === undefined ? game.animals : parseAnimals(source.animals, legacy, now);
  game.log = array(source.log, '日记', 0, 100).map(entry => string(entry, '日记')).slice(0, 12);
  if (legacy) { game.unlockedPlots = game.plots.length; log(game, '旧农场已迁移：金币、经验、地块与动物保留，改为库存和真实计时，不再发生死亡。'); return tickGame(game, now); }
  game.gems = number(source.gems, '钻石'); game.inventory = stock(source.inventory); game.siloCapacity = number(source.siloCapacity, '粮仓容量', 1, 1000); game.barnCapacity = number(source.barnCapacity, '货仓容量', 1, 1000); game.unlockedPlots = number(source.unlockedPlots, '已解锁地块', 1, game.plots.length);
  game.machines = array(source.machines, '加工坊', 0, MACHINES.length).map(raw => {
    const item = object(raw); const id = machineById(item.id as MachineId).id; const slots = number(item.slots, '生产槽位', 1, 20);
    const queue: ProductionJob[] = array(item.queue, '生产队列', 0, slots).map(rawJob => {
      const job = object(rawJob); const recipe = recipeById(job.recipe as ItemId); if (recipe.machine !== id) throw new Error('生产配方与加工坊不匹配。');
      const startedAt = timestamp(job.startedAt, '生产开始时间'); const readyAt = timestamp(job.readyAt, '生产完成时间'); if (readyAt < startedAt) throw new Error('生产计时无效。');
      return { id: string(job.id, '生产任务编号', 200), recipe: recipe.id, startedAt, readyAt };
    }); unique(queue); for (let index = 1; index < queue.length; index++) if (queue[index].startedAt < queue[index - 1].readyAt) throw new Error('生产队列时间重叠。'); return { id, slots, queue };
  }); unique(game.machines); unique(game.machines.flatMap(machine => machine.queue));
  game.orders = array(source.orders, '订单', 0, 20).map(raw => { const item = object(raw); if (item.kind !== 'truck' && item.kind !== 'boat') throw new Error('订单类型无效。'); const requirements = stock(item.requirements, true); if (!Object.keys(requirements).length) throw new Error('订单需求不能为空。'); return { id: string(item.id, '订单编号', 200), kind: item.kind, requirements, coins: number(item.coins, '订单金币'), xp: number(item.xp, '订单经验') } as GameOrder; }); unique(game.orders);
  game.ordersDelivered = number(source.ordersDelivered, '已完成订单'); game.orderSerial = number(source.orderSerial, '订单序号');
  game.shopListings = array(source.shopListings, '货架', 0, 100).map(raw => { const item = object(raw); const id = itemById(item.item as ItemId).id; const listedAt = timestamp(item.listedAt, '上架时间'); const soldAt = timestamp(item.soldAt, '售出时间'); if (soldAt < listedAt) throw new Error('货架计时无效。'); return { id: string(item.id, '货架编号', 200), item: id, quantity: number(item.quantity, '上架数量', 1), unitPrice: number(item.unitPrice, '出售单价', 1), listedAt, soldAt, collected: boolean(item.collected) } as RoadsideSlot; }); unique(game.shopListings);
  game.orchard = array(source.orchard, '果园', 0, 6).map(raw => {
    const item = object(raw); if (!['apple', 'cherry', 'raspberry', 'blackberry', 'cacao', 'coffee_bean'].includes(item.fruit as string)) throw new Error('果园品种无效。');
    const harvests = number(item.harvests, '果树收获次数', 0, 4); const needsHelp = boolean(item.needsHelp); const revived = boolean(item.revived);
    if ((harvests < 3 && (needsHelp || revived)) || (harvests === 3 && needsHelp === revived) || (harvests === 4 && (!needsHelp || !revived))) throw new Error('果树收获与帮助状态不一致。');
    return { id: number(item.id, '果树编号', 1), fruit: item.fruit, harvests, readyAt: timestamp(item.readyAt, '果树计时'), needsHelp, revived } as OrchardPlot;
  }); unique(game.orchard);
  game.fishingReadyAt = timestamp(source.fishingReadyAt, '钓鱼计时'); game.mineReadyAt = timestamp(source.mineReadyAt, '矿产计时'); game.achievements = array(source.achievements, '成就', 0, 500).map(item => string(item, '成就', 100)); if (new Set(game.achievements).size !== game.achievements.length) throw new Error('成就编号重复。');
  game.beehiveBuilt = source.beehiveBuilt === undefined ? false : boolean(source.beehiveBuilt); game.beehiveReadyAt = timestamp(source.beehiveReadyAt === undefined ? 0 : source.beehiveReadyAt, '蜂箱计时'); if (!game.beehiveBuilt && game.beehiveReadyAt !== 0) throw new Error('未建造蜂箱却有生产计时。');
  resources(game); return tickGame(game, now);
}
