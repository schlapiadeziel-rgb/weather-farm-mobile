import { CROPS, LIVESTOCK, getItem } from './farmContent';
import { getLevel, storageUsed } from './game';
import { BOAT_LEVEL } from './farmEconomy';
import type { AnimalId, CropId, Game, GameOrder, ItemId } from './farmTypes';

export type FarmJourneyTarget =
  | { type: 'plot'; plotId: number; cropId?: CropId }
  | { type: 'pen'; penId: number; animalId?: AnimalId }
  | { type: 'item'; itemId: ItemId }
  | { type: 'storage' }
  | { type: 'order'; kind: 'truck' | 'boat'; orderId?: string }
  | { type: 'guide' };

export interface FarmJourney {
  completed: number;
  total: 3;
  step: 'harvest' | 'animal' | 'order';
  title: string;
  detail: string;
  actionLabel: string;
  target: FarmJourneyTarget;
}

/** Read-only guidance derived from actual milestones. No rewards or save fields. */
export function getFarmJourney(game: Game, now: number): FarmJourney | null {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) throw new Error('经营引导时间无效。');
  const completed = Number(game.harvests > 0) + Number(game.productsCollected > 0) + Number(game.ordersDelivered > 0);
  if (completed === 3) return null;
  const step = game.harvests === 0 ? 'harvest' : game.productsCollected === 0 ? 'animal' : 'order';
  const result = (title: string, detail: string, actionLabel: string, target: FarmJourneyTarget): FarmJourney => ({ completed, total: 3, step, title, detail, actionLabel, target });
  const needsSpace = (itemId: ItemId, quantity: number) => {
    const kind = getItem(itemId).storage;
    return Math.max(0, storageUsed(game, kind) + quantity - (kind === 'silo' ? game.siloCapacity : game.barnCapacity));
  };
  const full = (itemId: ItemId, quantity: number) => result('先给收成腾出空间', `还需 ${needsSpace(itemId, quantity)} 个${getItem(itemId).storage === 'silo' ? '筒仓' : '谷仓'}空位，再收取${getItem(itemId).name}。`, '整理库存', { type: 'storage' });
  const waiting = (readyAt: number) => `还需约 ${Math.max(1, Math.ceil((readyAt - now) / 60000))} 分钟，可以先看看其他经营项目。`;

  if (step === 'harvest') {
    const plots = game.plots.slice(0, game.unlockedPlots);
    const mature = plots.find(plot => plot.crop && plot.readyAt !== undefined && plot.readyAt <= now);
    if (mature?.crop) {
      if (needsSpace(mature.crop, 2)) return full(mature.crop, 2);
      return result('收获第一份作物', `${getItem(mature.crop).name}已经成熟，收获 2 份后记得留种。`, '去收获', { type: 'plot', plotId: mature.id });
    }
    const growing = plots.filter(plot => plot.crop && plot.readyAt !== undefined && plot.readyAt > now).sort((a, b) => a.readyAt! - b.readyAt!)[0];
    if (growing?.crop) return result('等第一份作物成熟', waiting(growing.readyAt!), '查看作物', { type: 'plot', plotId: growing.id });
    const empty = plots.find(plot => !plot.crop);
    const seed = CROPS.find(crop => crop.level <= getLevel(game) && (game.inventory[crop.id] ?? 0) > 0);
    if (empty && seed) return result('种下第一份期待', `播种${seed.name}用 1 份种子，成熟后收获 2 份。`, '去播种', { type: 'plot', plotId: empty.id, cropId: seed.id });
    if (empty) return result('先准备一份种子', '到仓库查看库存和补给，备好种子后再回农田。', '查看仓库', { type: 'storage' });
    return result('看看农田如何经营', '目前没有可操作的田地，先查看手册中的播种与收获步骤。', '查看手册', { type: 'guide' });
  }

  if (step === 'animal') {
    const pens = game.animals.filter(pen => pen.animal);
    const mature = pens.find(pen => pen.readyAt !== undefined && pen.readyAt <= now);
    if (mature?.animal) {
      const animal = LIVESTOCK.find(entry => entry.id === mature.animal)!;
      if (needsSpace(animal.product, 1)) return full(animal.product, 1);
      return result('收取第一份养殖产物', `${animal.productName}已经准备好，收取后再为${animal.name}喂下一餐。`, '去收取', { type: 'pen', penId: mature.id });
    }
    const fed = pens.find(pen => pen.readyAt === undefined && (game.inventory[LIVESTOCK.find(entry => entry.id === pen.animal)!.feedItem] ?? 0) > 0);
    if (fed?.animal) {
      const animal = LIVESTOCK.find(entry => entry.id === fed.animal)!;
      return result('给动物喂下一餐', `投喂 1 份${getItem(animal.feedItem).name}，等待后即可收取${animal.productName}。`, '去喂食', { type: 'pen', penId: fed.id });
    }
    const producing = pens.filter(pen => pen.readyAt !== undefined && pen.readyAt > now).sort((a, b) => a.readyAt! - b.readyAt!)[0];
    if (producing) return result('等待第一份养殖产物', waiting(producing.readyAt!), '查看动物', { type: 'pen', penId: producing.id });
    const hungry = pens.find(pen => pen.readyAt === undefined);
    if (hungry?.animal) {
      const animal = LIVESTOCK.find(entry => entry.id === hungry.animal)!;
      return result('先为动物备好饲料', `${animal.name}需要${getItem(animal.feedItem).name}，可以沿配方准备原料。`, '准备饲料', { type: 'item', itemId: animal.feedItem });
    }
    const empty = game.animals.find(pen => !pen.animal);
    const animal = LIVESTOCK.find(entry => entry.level <= getLevel(game) && entry.cost <= game.coins);
    if (empty && animal) return result('迎来第一位牧场伙伴', `购买${animal.name}需要 ${animal.cost} 金币；查看后由你确认购买。`, '查看牧场', { type: 'pen', penId: empty.id, animalId: animal.id });
    return result('准备开始养殖', '先了解畜栏、动物和饲料需要的条件，再安排下一步。', '查看手册', { type: 'guide' });
  }

  const ready = (order: GameOrder) => {
    const needs = Object.entries(order.requirements) as [ItemId, number][];
    return needs.length > 0 && needs.every(([id, count]) => (game.inventory[id] ?? 0) >= count);
  };
  const orders = game.orders.filter(order => order.kind === 'truck' || getLevel(game) >= BOAT_LEVEL);
  const order = orders.find(ready) ?? orders[0];
  if (!order) return result('送出第一张订单', '打开订单板查看需求，备齐商品后再确认交货。', '查看订单', { type: 'order', kind: 'truck' });
  return result(ready(order) ? '第一张订单已备齐' : '为第一张订单备货', ready(order) ? '核对货物与报酬后确认交货，完成第一轮经营。' : '订单里的“查看来源”可以带你备货，再返回原订单。', ready(order) ? '去交货' : '查看缺货', { type: 'order', kind: order.kind, orderId: order.id });
}
