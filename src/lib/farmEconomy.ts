/** Local game economy only. NPC trades, help and rewards are simulated, never real orders. */
import { getItem, ITEMS } from './farmContent';
import type { Game, GameOrder, ItemId, OrchardPlot, StorageKind } from './farmTypes';

export const SALE_DELAY_MS = 3 * 60_000;
export const FISHING_COOLDOWN_MS = 10 * 60_000;
export const MINING_COOLDOWN_MS = 5 * 60_000;
export const ORCHARD_REVIVE_MS = 2 * 60_000;
export const ORCHARD_LIMIT = 6;
export const ROADSIDE_LIMIT = 6;
export const MAX_STORAGE_CAPACITY = 1000;
export const FISHING_LEVEL = getItem('fish_fillet').level;
export const MINING_LEVEL = Math.max(getItem('coal').level, getItem('iron_ore').level, getItem('shovel').level);
export const BOAT_LEVEL = 5;
export const BEEKEEPING_LEVEL = 15;
export const BEEHIVE_COST = 1200;
export const HONEY_COOLDOWN_MS = 20 * 60_000;
const MAX_DATE = 8_640_000_000_000_000;
type FruitId = OrchardPlot['fruit'];

function integer(value: number, name: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name}需要有效的整数。`);
  return value;
}
function quantity(value: number): number { return integer(value, '数量', 1, MAX_STORAGE_CAPACITY); }
function atTime(now: number): number { return integer(now, '游戏时间', 0, MAX_DATE); }
function later(now: number, delay: number): number { return atTime(atTime(now) + delay); }
function add(value: number, amount: number, name: string): number { return integer(value + amount, name); }
function level(game: Game): number { return 1 + Math.floor(Math.sqrt(integer(game.xp, '经验') / 20)); }
function log(game: Game, text: string): string[] { return [text, ...game.log].slice(0, 10); }
function stock(game: Game, item: ItemId): number { return integer(game.inventory[item] ?? 0, '库存'); }
function nextSerial(game: Game): number { return add(integer(game.orderSerial, '经营编号'), 1, '经营编号'); }
function guard(game: Game): void {
  if (game.version !== 2) throw new Error('请使用当前版本的游戏存档。');
  for (const field of ['coins', 'gems', 'xp', 'harvests', 'productsCollected', 'ordersDelivered', 'orderSerial'] as const) integer(game[field], field);
  integer(game.siloCapacity, '筒仓容量', 1, MAX_STORAGE_CAPACITY);
  integer(game.barnCapacity, '货仓容量', 1, MAX_STORAGE_CAPACITY);
  if (typeof game.beehiveBuilt !== 'boolean') throw new Error('蜂箱存档状态无效。');
  atTime(game.beehiveReadyAt);
  for (const [item, count] of Object.entries(game.inventory)) {
    getItem(item as ItemId);
    integer(count!, '库存');
  }
}
function pay(game: Game, coins: number): number {
  integer(coins, '费用');
  if (game.coins < coins) throw new Error(`模拟金币不足，需要 ${coins} 金币。`);
  return game.coins - coins;
}
function used(inventory: Game['inventory'], kind: StorageKind): number {
  return Object.entries(inventory).reduce((total, [item, count]) => getItem(item as ItemId).storage === kind ? add(total, count!, '库存总量') : total, 0);
}
/** Validate every ingredient and the final capacity before returning any new inventory. */
function changeInventory(game: Game, consume: Game['inventory'], receive: Game['inventory'] = {}): Game['inventory'] {
  const inventory = { ...game.inventory };
  for (const [item, count] of Object.entries(consume)) {
    const id = getItem(item as ItemId).id;
    quantity(count!);
    if (stock(game, id) < count!) throw new Error(`${getItem(id).name}库存不足，需要 ${count} 份。`);
    inventory[id] = stock(game, id) - count!;
  }
  for (const [item, count] of Object.entries(receive)) {
    const id = getItem(item as ItemId).id;
    quantity(count!);
    inventory[id] = add(inventory[id] ?? 0, count!, '库存');
  }
  for (const kind of ['silo', 'barn'] as const) {
    const before = used(game.inventory, kind);
    const after = used(inventory, kind);
    const capacity = kind === 'silo' ? game.siloCapacity : game.barnCapacity;
    // Selling/delivering can reduce an overfull imported inventory; receiving cannot increase it.
    if (after > capacity && after > before) throw new Error(`${kind === 'silo' ? '筒仓' : '货仓'}空间不足，请先交付、售卖或扩容。`);
  }
  return inventory;
}

/** Deterministic, local NPC orders. serial is a caller-owned, monotonic batch identifier. */
export function generateOrders(gameOrLevel: Game | number, serial: number, kind: GameOrder['kind'] = 'truck'): GameOrder[] {
  const currentLevel = typeof gameOrLevel === 'number' ? integer(gameOrLevel, '等级', 1) : level(gameOrLevel);
  integer(serial, '订单编号');
  if (kind !== 'truck' && kind !== 'boat') throw new Error('订单类型无效。');
  if (kind === 'boat' && currentLevel < BOAT_LEVEL) throw new Error(`船运订单需要 ${BOAT_LEVEL} 级。`);
  const eligible = ITEMS.filter(item => item.level <= currentLevel && ['crop', 'animal', 'product', 'fruit', 'fish'].includes(item.category));
  if (!eligible.length) throw new Error('当前等级没有可交付的游戏商品。');
  const amount = Math.min(8, 1 + Math.floor(currentLevel / 6));
  return Array.from({ length: kind === 'truck' ? 3 : 1 }, (_, index) => {
    const requirements: GameOrder['requirements'] = {};
    const lines = Math.min(eligible.length, kind === 'boat' ? 3 : 2);
    let value = 0;
    for (let line = 0; line < lines; line++) {
      const item = eligible[((serial % eligible.length) + index * lines + line) % eligible.length];
      const count = amount + (kind === 'boat' ? 2 : 0);
      requirements[item.id] = count;
      value += item.price * count;
    }
    return { id: `${kind}-${serial}-${index}`, kind, requirements, coins: integer(Math.max(1, Math.round(value * 1.6)), '订单报酬'), xp: kind === 'boat' ? 24 : 8 };
  });
}

export function ensureOrders(game: Game, kind: GameOrder['kind']): Game {
  guard(game);
  const generated = generateOrders(game, game.orderSerial, kind);
  const existing = game.orders.filter(order => order.kind === kind);
  if (existing.length >= generated.length) throw new Error('本机订单板已经有待完成的订单。');
  const additions = generated.slice(0, generated.length - existing.length);
  if (additions.some(order => game.orders.some(existingOrder => existingOrder.id === order.id))) throw new Error('订单编号重复，请重新读取存档。');
  return { ...game, orders: [...game.orders, ...additions], orderSerial: nextSerial(game), log: log(game, `接到${kind === 'boat' ? '船运' : '卡车'}本机 NPC 订单；没有连接线上玩家。`) };
}

function replacement(game: Game, order: GameOrder): { orders: GameOrder[]; orderSerial: number } {
  const next = generateOrders(game, game.orderSerial, order.kind)[0];
  if (game.orders.some(existing => existing.id === next.id)) throw new Error('订单编号重复，请重新读取存档。');
  return { orders: game.orders.map(existing => existing.id === order.id ? next : existing), orderSerial: nextSerial(game) };
}
export function deliverOrder(game: Game, orderId: string, now = Date.now()): Game {
  guard(game); atTime(now);
  const order = game.orders.find(entry => entry.id === orderId);
  if (!order) throw new Error('这份订单已经交付或不在订单板上。');
  if (!Object.keys(order.requirements).length) throw new Error('订单没有有效的商品要求。');
  integer(order.coins, '订单报酬'); integer(order.xp, '订单经验');
  const inventory = changeInventory(game, order.requirements);
  const next = replacement(game, order);
  return { ...game, ...next, inventory, coins: add(game.coins, order.coins, '金币'), xp: add(game.xp, order.xp, '经验'), ordersDelivered: add(game.ordersDelivered, 1, '交付次数'), log: log(game, `完成本机 NPC ${order.kind === 'boat' ? '船运' : '卡车'}订单，获得 ${order.coins} 模拟金币与 ${order.xp} 经验。`) };
}
export function discardOrder(game: Game, orderId: string, now = Date.now()): Game {
  guard(game); atTime(now);
  const order = game.orders.find(entry => entry.id === orderId);
  if (!order) throw new Error('找不到这份订单，可能已替换。');
  return { ...game, ...replacement(game, order), log: log(game, '替换了一份本机 NPC 订单；没有消耗库存或获得报酬。') };
}

export function listForSale(game: Game, item: ItemId, count: number, unitPrice: number, now = Date.now()): Game {
  guard(game); atTime(now); quantity(count);
  const definition = getItem(item);
  integer(unitPrice, '单价', 1, definition.price * 3);
  if (game.shopListings.filter(entry => !entry.collected).length >= ROADSIDE_LIMIT) throw new Error('路边摊六个货位已满，请先收取已售货款。');
  const inventory = changeInventory(game, { [item]: count });
  const listing = { id: `road-${game.orderSerial}`, item, quantity: count, unitPrice, listedAt: now, soldAt: later(now, SALE_DELAY_MS), collected: false };
  if (game.shopListings.some(entry => entry.id === listing.id)) throw new Error('货位编号重复，请重新读取存档。');
  return { ...game, inventory, orderSerial: nextSerial(game), shopListings: [...game.shopListings.filter(entry => !entry.collected), listing], log: log(game, `路边摊上架 ${count} 份${definition.name}；三分钟后由本机 NPC 模拟购买，不是线上玩家交易。`) };
}
export function collectSale(game: Game, listingId: string, now = Date.now()): Game {
  guard(game); atTime(now);
  const listing = game.shopListings.find(entry => entry.id === listingId);
  if (!listing || listing.collected) throw new Error('这笔货款已收取，或找不到该货位。');
  quantity(listing.quantity); integer(listing.unitPrice, '单价', 1, getItem(listing.item).price * 3);
  atTime(listing.listedAt); atTime(listing.soldAt);
  if (listing.soldAt !== later(listing.listedAt, SALE_DELAY_MS)) throw new Error('货位倒计时无效，请重新读取存档。');
  if (now < listing.soldAt) throw new Error('本机 NPC 尚未购买，请等待真实倒计时结束。');
  const earnings = integer(listing.quantity * listing.unitPrice, '货款');
  return { ...game, coins: add(game.coins, earnings, '金币'), shopListings: game.shopListings.map(entry => entry.id === listingId ? { ...entry, collected: true } : entry), log: log(game, `收取本机 NPC 路边摊货款 ${earnings} 模拟金币；同一笔只能领取一次。`) };
}
export function buySupply(game: Game, item: ItemId, count: number): Game {
  guard(game); quantity(count);
  const definition = getItem(item);
  if (definition.category !== 'crop' && definition.category !== 'feed') throw new Error('补给铺只提供基本种子和饲料；工具及建材来自游戏收获奖励。');
  if (level(game) < definition.level) throw new Error(`${definition.name}需要 ${definition.level} 级。`);
  const cost = integer(definition.price * 3 * count, '补给费用');
  const coins = pay(game, cost);
  const inventory = changeInventory(game, {}, { [item]: count });
  return { ...game, coins, inventory, log: log(game, `向本机补给 NPC 买入 ${count} 份${definition.name}，花费 ${cost} 模拟金币。`) };
}

export function farmExpansionCost(game: Game): { coins: number; level: number; plots: number } {
  integer(game.unlockedPlots, '已解锁地块', 6, 12);
  if (game.unlockedPlots >= 12) throw new Error('十二块田地已全部解锁。');
  const stage = game.unlockedPlots - 5;
  return { coins: 50 + stage * 150, level: stage + 1, plots: game.unlockedPlots + 1 };
}
export function expandFarm(game: Game): Game {
  guard(game);
  const cost = farmExpansionCost(game);
  if (level(game) < cost.level) throw new Error(`下一块田需要 ${cost.level} 级。`);
  if (game.plots.length < cost.plots) throw new Error('存档中缺少要解锁的田地。');
  return { ...game, coins: pay(game, cost.coins), unlockedPlots: cost.plots, log: log(game, `解锁第 ${cost.plots} 块游戏田地，花费 ${cost.coins} 模拟金币。`) };
}
export function storageUpgradeCost(game: Game, kind: StorageKind): { coins: number; materials: Game['inventory']; capacity: number } {
  if (kind !== 'silo' && kind !== 'barn') throw new Error('仓库类型无效。');
  const capacity = integer(kind === 'silo' ? game.siloCapacity : game.barnCapacity, '仓库容量', 1, MAX_STORAGE_CAPACITY);
  if (capacity >= MAX_STORAGE_CAPACITY) throw new Error('仓库已达到本机游戏容量上限。');
  const amount = 1 + Math.floor(Math.max(0, capacity - 80) / 25);
  return { coins: 200 + amount * 100, materials: kind === 'barn' ? { plank: amount, bolt: amount, duct_tape: amount } : { nail: amount, wood_panel: amount, screw: amount }, capacity: Math.min(MAX_STORAGE_CAPACITY, capacity + 25) };
}
export function upgradeStorage(game: Game, kind: StorageKind): Game {
  guard(game);
  const cost = storageUpgradeCost(game, kind);
  const coins = pay(game, cost.coins);
  const inventory = changeInventory(game, cost.materials);
  return { ...game, inventory, coins, ...(kind === 'silo' ? { siloCapacity: cost.capacity } : { barnCapacity: cost.capacity }), log: log(game, `${kind === 'silo' ? '筒仓' : '货仓'}扩容至 ${cost.capacity} 份游戏物品；金币与建材已一起扣除。`) };
}

export const ORCHARD_FRUITS = ([
  { id: 'apple', durationMs: 10 * 60_000, tool: 'saw' },
  { id: 'cherry', durationMs: 15 * 60_000, tool: 'saw' },
  { id: 'raspberry', durationMs: 8 * 60_000, tool: 'axe' },
  { id: 'blackberry', durationMs: 12 * 60_000, tool: 'axe' },
  { id: 'cacao', durationMs: 20 * 60_000, tool: 'saw' },
  { id: 'coffee_bean', durationMs: 15 * 60_000, tool: 'saw' },
] as const).map(entry => {
  const definition = getItem(entry.id);
  return { ...entry, name: definition.name, icon: definition.icon, level: definition.level, cost: definition.price * 15, quantity: 3 };
});
function fruitDefinition(fruit: FruitId) {
  const definition = ORCHARD_FRUITS.find(entry => entry.id === fruit);
  if (!definition) throw new Error('这种果树不在本机游戏中。');
  return definition;
}
function orchardAt(game: Game, id: number): OrchardPlot {
  integer(id, '果园编号', 1);
  const orchard = game.orchard.find(entry => entry.id === id);
  if (!orchard) throw new Error('找不到这棵果树，可能已清理。');
  integer(orchard.harvests, '果树收获次数', 0, 4); atTime(orchard.readyAt);
  fruitDefinition(orchard.fruit);
  if (typeof orchard.needsHelp !== 'boolean' || typeof orchard.revived !== 'boolean') throw new Error('果树状态无效。');
  return orchard;
}
export function plantOrchard(game: Game, fruit: FruitId, now = Date.now()): Game {
  guard(game); atTime(now);
  const definition = fruitDefinition(fruit);
  if (level(game) < definition.level) throw new Error(`${definition.name}需要 ${definition.level} 级。`);
  if (game.orchard.length >= ORCHARD_LIMIT) throw new Error('六个果园位置已满，请先清理枯树。');
  const id = nextSerial(game);
  if (game.orchard.some(entry => entry.id === id)) throw new Error('果园编号重复，请重新读取存档。');
  const tree: OrchardPlot = { id, fruit, harvests: 0, readyAt: later(now, definition.durationMs), needsHelp: false, revived: false };
  return { ...game, coins: pay(game, definition.cost), orderSerial: id, orchard: [...game.orchard, tree], log: log(game, `种下${definition.name}果树，等待真实倒计时成熟；这是游戏果园。`) };
}
export function harvestOrchard(game: Game, id: number, now = Date.now()): Game {
  guard(game); atTime(now);
  const tree = orchardAt(game, id);
  if (tree.needsHelp || tree.harvests >= (tree.revived ? 4 : 3)) throw new Error(tree.revived ? '这棵果树已完成最后一轮收获，需要工具清理。' : '这棵果树需要一次本机模拟帮助后才能再收获。');
  if (now < tree.readyAt) throw new Error('果实尚未成熟，请等待真实倒计时。');
  const definition = fruitDefinition(tree.fruit);
  const inventory = changeInventory(game, {}, { [tree.fruit]: definition.quantity });
  const harvests = tree.harvests + 1;
  const needsHelp = harvests >= (tree.revived ? 4 : 3);
  const next = { ...tree, harvests, needsHelp, readyAt: later(now, definition.durationMs) };
  return { ...game, inventory, xp: add(game.xp, 10, '经验'), harvests: add(game.harvests, 1, '收获次数'), orchard: game.orchard.map(entry => entry.id === id ? next : entry), log: log(game, `收获 ${definition.quantity} 份${definition.name}，果树已收获 ${harvests} 次。`) };
}
export function reviveOrchard(game: Game, id: number, now = Date.now()): Game {
  guard(game); atTime(now);
  const tree = orchardAt(game, id);
  if (!tree.needsHelp || tree.harvests !== 3 || tree.revived) throw new Error('每棵果树仅能在第三轮收获后接受一次本机帮助。');
  const next = { ...tree, revived: true, needsHelp: false, readyAt: later(now, ORCHARD_REVIVE_MS) };
  return { ...game, orchard: game.orchard.map(entry => entry.id === id ? next : entry), log: log(game, '本机 NPC 帮助果树恢复最后一轮；没有连接真实邻居，这次帮助只能使用一次。') };
}
export function clearOrchard(game: Game, id: number): Game {
  guard(game);
  const tree = orchardAt(game, id);
  if (!tree.needsHelp || !tree.revived || tree.harvests !== 4) throw new Error('请先完成三轮收获、本机帮助和最后一轮收获，再清理枯树。');
  const tool = fruitDefinition(tree.fruit).tool;
  const inventory = changeInventory(game, { [tool]: 1 });
  return { ...game, inventory, orchard: game.orchard.filter(entry => entry.id !== id), log: log(game, `消耗一份${getItem(tool).name}清理枯树，果园位置已释放。`) };
}
export function catchFish(game: Game, now = Date.now()): Game {
  guard(game); atTime(now); atTime(game.fishingReadyAt);
  if (level(game) < FISHING_LEVEL) throw new Error(`钓鱼需要 ${FISHING_LEVEL} 级。`);
  if (now < game.fishingReadyAt) throw new Error('鱼塘还在冷却，请等待十分钟真实倒计时。');
  const inventory = changeInventory(game, {}, { fish_fillet: 2 });
  return { ...game, inventory, fishingReadyAt: later(now, FISHING_COOLDOWN_MS), xp: add(game.xp, 10, '经验'), log: log(game, '游戏鱼塘获得两份鱼片；十分钟后可再次钓鱼，不代表现实渔获。') };
}
export function mineOre(game: Game, now = Date.now()): Game {
  guard(game); atTime(now); atTime(game.mineReadyAt);
  if (level(game) < MINING_LEVEL) throw new Error(`矿场需要 ${MINING_LEVEL} 级。`);
  if (now < game.mineReadyAt) throw new Error('矿场还在冷却，请等待五分钟真实倒计时。');
  const tool = stock(game, 'shovel') > 0 ? 'shovel' : stock(game, 'dynamite') > 0 ? 'dynamite' : null;
  if (!tool) throw new Error('开矿需要一份铁铲或炸药，来自游戏收获奖励。');
  const rewards: Game['inventory'] = tool === 'shovel' ? { coal: 1, iron_ore: 1 } : { coal: 2, iron_ore: 2, ...(level(game) >= getItem('gold_ore').level ? { gold_ore: 1 } : {}) };
  const inventory = changeInventory(game, { [tool]: 1 }, rewards);
  return { ...game, inventory, mineReadyAt: later(now, MINING_COOLDOWN_MS), xp: add(game.xp, 12, '经验'), log: log(game, `游戏矿场消耗一份${getItem(tool).name}获得矿石；五分钟后可再次采矿。`) };
}

export function buildBeehive(game: Game, now = Date.now()): Game {
  guard(game); atTime(now);
  if (typeof game.beehiveBuilt !== 'boolean') throw new Error('蜂箱存档状态无效。');
  if (game.beehiveBuilt) throw new Error('已经建造本机游戏蜂箱。');
  if (level(game) < BEEKEEPING_LEVEL) throw new Error(`蜂箱需要 ${BEEKEEPING_LEVEL} 级。`);
  return { ...game, coins: pay(game, BEEHIVE_COST), beehiveBuilt: true, beehiveReadyAt: later(now, HONEY_COOLDOWN_MS), log: log(game, '建造本机游戏蜂箱：蜜蜂在游戏花丛采蜜，二十分钟后可收集蜂蜜；这不是现实蜂群数据。') };
}
export function collectHoney(game: Game, now = Date.now()): Game {
  guard(game); atTime(now); atTime(game.beehiveReadyAt);
  if (!game.beehiveBuilt) throw new Error('请先建造本机游戏蜂箱。');
  if (now < game.beehiveReadyAt) throw new Error('蜜蜂还在游戏花丛采蜜，请等待二十分钟真实倒计时。');
  const inventory = changeInventory(game, {}, { honey: 2 });
  return { ...game, inventory, beehiveReadyAt: later(now, HONEY_COOLDOWN_MS), xp: add(game.xp, 8, '经验'), productsCollected: add(game.productsCollected, 2, '产物数量'), log: log(game, '从本机游戏蜂箱收取两份蜂蜜，下一轮二十分钟后成熟；可用于蜂蜡配方或本机订单。') };
}

type AchievementMetric = 'harvests' | 'productsCollected' | 'ordersDelivered' | 'level' | 'unlockedPlots' | 'machines';
export const ACHIEVEMENTS: readonly { id: string; name: string; description: string; metric: AchievementMetric; target: number; coins: number; gems: number }[] = [
  { id: 'first_harvest', name: '第一份收成', description: '收获一次游戏作物或果实', metric: 'harvests', target: 1, coins: 100, gems: 2 },
  { id: 'field_keeper', name: '田园守望', description: '累计完成三十次游戏收获', metric: 'harvests', target: 30, coins: 500, gems: 5 },
  { id: 'animal_keeper', name: '牧场助手', description: '累计收集十份养殖产物', metric: 'productsCollected', target: 10, coins: 250, gems: 3 },
  { id: 'truck_starter', name: '勤快送货员', description: '完成五份本机 NPC 订单', metric: 'ordersDelivered', target: 5, coins: 300, gems: 3 },
  { id: 'order_master', name: '小镇供应商', description: '完成二十五份本机 NPC 订单', metric: 'ordersDelivered', target: 25, coins: 1000, gems: 8 },
  { id: 'farm_builder', name: '田地拓展者', description: '解锁全部十二块游戏田地', metric: 'unlockedPlots', target: 12, coins: 500, gems: 5 },
  { id: 'artisan', name: '工坊匠人', description: '拥有六种生产机器', metric: 'machines', target: 6, coins: 600, gems: 5 },
  { id: 'level_ten', name: '成长的农场', description: '游戏等级达到十级', metric: 'level', target: 10, coins: 500, gems: 5 },
];
export function achievementProgress(game: Game, id: string): number {
  const achievement = ACHIEVEMENTS.find(entry => entry.id === id);
  if (!achievement) throw new Error('找不到这项成就。');
  return achievement.metric === 'level' ? level(game) : achievement.metric === 'machines' ? new Set(game.machines.map(machine => machine.id)).size : integer(game[achievement.metric], '成就进度');
}
export function claimAchievement(game: Game, id: string): Game {
  guard(game);
  const achievement = ACHIEVEMENTS.find(entry => entry.id === id);
  if (!achievement) throw new Error('找不到这项成就。');
  if (game.achievements.includes(id)) throw new Error('这项成就奖励已经领取。');
  if (achievementProgress(game, id) < achievement.target) throw new Error('尚未完成这项游戏成就。');
  return { ...game, coins: add(game.coins, achievement.coins, '金币'), gems: add(game.gems, achievement.gems, '宝石'), achievements: [...game.achievements, id], log: log(game, `领取“${achievement.name}”奖励：${achievement.coins} 模拟金币、${achievement.gems} 模拟宝石；不可重复领取。`) };
}
