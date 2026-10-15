/** Read-only game activity. These counters never describe a real farm. */
import { getItem, LIVESTOCK, MACHINES } from './farmContent';
import { storageUsed } from './game';
import type { Game, ItemId, MachineId } from './farmTypes';

export type FarmActivityTarget =
  | { tab: 'farm'; plotId: number }
  | { tab: 'livestock'; penId: number }
  | { tab: 'production'; machineId: MachineId }
  | { tab: 'orders'; kind: 'truck' | 'boat' }
  | { tab: 'storage'; section: 'roadside' };

export interface FarmActivitySection {
  id: FarmActivityTarget['tab'];
  title: string;
  count: number;
  unit: string;
  detail: string;
  target: FarmActivityTarget | null;
}

export interface FarmNextActivity {
  label: string;
  readyAt: number;
  target: FarmActivityTarget;
}

export interface FarmActivity {
  sections: FarmActivitySection[];
  next: FarmNextActivity | null;
  silo: { used: number; capacity: number };
  barn: { used: number; capacity: number };
}

const MAX_DATE = 8_640_000_000_000_000;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE;
const hasTimer = (start: unknown, readyAt: unknown): readyAt is number => isTime(start) && isTime(readyAt) && readyAt >= start;

/** Array order is the tie breaker, matching the order of fields, pens and queues in the game. */
export function getFarmActivity(game: Game, now: number): FarmActivity {
  if (!isTime(now)) throw new Error('农场看板时间无效。');

  let next: FarmNextActivity | null = null;
  const remember = (label: string, readyAt: number, target: FarmActivityTarget): void => {
    if (readyAt > now && (next === null || readyAt < next.readyAt)) next = { label, readyAt, target };
  };

  const fields = game.plots.slice(0, game.unlockedPlots).filter(plot => plot.crop && hasTimer(plot.plantedAt, plot.readyAt));
  const ripe = fields.filter(plot => plot.readyAt! <= now);
  for (const plot of fields) remember(`${plot.id} 号田 · ${getItem(plot.crop!).name}`, plot.readyAt!, { tab: 'farm', plotId: plot.id });

  const fed = game.animals.filter(pen => pen.animal && hasTimer(pen.fedAt, pen.readyAt));
  const products = fed.filter(pen => pen.readyAt! <= now);
  for (const pen of fed) {
    const animal = LIVESTOCK.find(item => item.id === pen.animal)!;
    remember(`${pen.id} 号畜栏 · ${getItem(animal.product).name}`, pen.readyAt!, { tab: 'livestock', penId: pen.id });
  }

  const jobs = game.machines.flatMap(machine => machine.queue
    .filter(job => hasTimer(job.startedAt, job.readyAt))
    .map(job => ({ machineId: machine.id, job })));
  const completed = jobs.filter(({ job }) => job.readyAt <= now);
  for (const { machineId, job } of jobs) {
    const name = MACHINES.find(machine => machine.id === machineId)!.name;
    remember(`${name} · ${getItem(job.recipe).name}`, job.readyAt, { tab: 'production', machineId });
  }

  // Each order is checked against the same current inventory; no stock is reserved or consumed.
  const deliverable = game.orders.filter(order => {
    const requirements = Object.entries(order.requirements);
    return requirements.length > 0 && requirements.every(([item, quantity]) =>
      Number.isSafeInteger(quantity) && quantity! > 0 && (game.inventory[item as ItemId] ?? 0) >= quantity!);
  });

  const listings = game.shopListings.filter(listing => !listing.collected && hasTimer(listing.listedAt, listing.soldAt));
  const sold = listings.filter(listing => listing.soldAt <= now);
  for (const listing of listings) remember(`路边摊 · ${getItem(listing.item).name}`, listing.soldAt, { tab: 'storage', section: 'roadside' });

  const firstPlot = ripe[0];
  const firstPen = products[0];
  const firstJob = completed[0];
  const firstOrder = deliverable[0];
  return {
    sections: [
      {
        id: 'farm', title: '成熟田地', count: ripe.length, unit: '块',
        detail: firstPlot ? `${firstPlot.id} 号田的${getItem(firstPlot.crop!).name}已成熟，收获前留意粮仓空间。` : '还没有成熟作物，播种后按真实计时生长。',
        target: firstPlot ? { tab: 'farm', plotId: firstPlot.id } : null,
      },
      {
        id: 'livestock', title: '动物产物', count: products.length, unit: '栏',
        detail: firstPen ? `${firstPen.id} 号畜栏已有产物，收取前留意货仓空间。` : '还没有待收产物，先喂饲料，再等待产出。',
        target: firstPen ? { tab: 'livestock', penId: firstPen.id } : null,
      },
      {
        id: 'production', title: '工坊成品', count: completed.length, unit: '批',
        detail: firstJob ? `${MACHINES.find(machine => machine.id === firstJob.machineId)!.name}已有成品；这里按生产任务的批数计数。` : '还没有待收成品，可在工坊安排制作。',
        target: firstJob ? { tab: 'production', machineId: firstJob.machineId } : null,
      },
      {
        id: 'orders', title: '可交订单', count: deliverable.length, unit: '份',
        detail: '本机 NPC 订单分别核对库存，交货后重新计算；多份订单可能使用同一批库存。',
        target: firstOrder ? { tab: 'orders', kind: firstOrder.kind } : null,
      },
      {
        id: 'storage', title: '路边摊货款', count: sold.length, unit: '笔',
        detail: sold.length ? '本机 NPC 已模拟购买，前往路边摊收取游戏货款。' : '还没有待收货款；上架后按本机 NPC 购买计时等待。',
        target: sold.length ? { tab: 'storage', section: 'roadside' } : null,
      },
    ],
    next,
    silo: { used: storageUsed(game, 'silo'), capacity: game.siloCapacity },
    barn: { used: storageUsed(game, 'barn'), capacity: game.barnCapacity },
  };
}
