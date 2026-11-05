import { MACHINES, RECIPES, getItem } from './farmContent';
import { BOAT_LEVEL, farmExpansionCost, storageUpgradeCost } from './farmEconomy';
import { getLevel, storageUsed } from './game';
import type { Game, GameOrder, ItemId, MachineId, StorageKind } from './farmTypes';

export type FarmSeasonStep = 'expand' | 'workshop' | 'delivery';

export type FarmSeasonTarget =
  | { type: 'storage'; section: 'inventory' | 'upgrade' }
  | { type: 'production'; machineId?: MachineId; itemId?: ItemId }
  | { type: 'item'; itemId: ItemId }
  | { type: 'order'; kind: 'truck' | 'boat'; orderId?: string }
  | { type: 'plot'; plotId: number };

export interface FarmSeason {
  completed: number;
  total: 3;
  step: FarmSeasonStep;
  title: string;
  detail: string;
  actionLabel: string;
  target: FarmSeasonTarget;
}

const START_PLOTS = 6;
const START_CAPACITY = 100;
const STABLE_DELIVERIES = 4;

type SeasonCopy = Pick<FarmSeason, 'title' | 'detail' | 'actionLabel' | 'target'>;

function result(title: string, detail: string, actionLabel: string, target: FarmSeasonTarget): SeasonCopy {
  return { title, detail, actionLabel, target };
}

/** Read-only mid-game guidance. It starts after the first journey and adds no save fields or rewards. */
export function getFarmSeason(game: Game, now: number): FarmSeason | null {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) throw new Error('经营引导时间无效。');
  if (!(game.harvests > 0 && game.productsCollected > 0 && game.ordersDelivered > 0)) return null;
  const flags = [expanded(game), workshopSettled(game), game.ordersDelivered >= STABLE_DELIVERIES];
  const completed = flags.filter(Boolean).length;
  if (completed === 3) return null;
  const step: FarmSeasonStep = !flags[0] ? 'expand' : !flags[1] ? 'workshop' : 'delivery';
  const copy = step === 'expand' ? expandGuide(game, now) : step === 'workshop' ? workshopGuide(game) : deliveryGuide(game);
  return { completed, total: 3, step, ...copy };
}

function expanded(game: Game): boolean {
  return game.unlockedPlots > START_PLOTS || game.siloCapacity > START_CAPACITY || game.barnCapacity > START_CAPACITY;
}

/** A second queued job counts while it is still queued. A new workshop or extra slot keeps the step done. */
function workshopSettled(game: Game): boolean {
  return game.machines.length >= 3 || game.machines.some(machine => machine.slots > 2 || machine.queue.length >= 2);
}

function quote(game: Game, kind: StorageKind) {
  try {
    const cost = storageUpgradeCost(game, kind);
    const materials = Object.entries(cost.materials) as [ItemId, number][];
    const ready = game.coins >= cost.coins && materials.every(([id, count]) => (game.inventory[id] ?? 0) >= count);
    return { cost, materials, ready };
  } catch {
    return null;
  }
}

function expandGuide(game: Game, now: number): SeasonCopy {
  const siloUsed = storageUsed(game, 'silo');
  const barnUsed = storageUsed(game, 'barn');
  const siloRatio = siloUsed / game.siloCapacity;
  const barnRatio = barnUsed / game.barnCapacity;
  const siloOffer = quote(game, 'silo');
  const barnOffer = quote(game, 'barn');
  const preferred: StorageKind[] = barnRatio >= siloRatio ? ['barn', 'silo'] : ['silo', 'barn'];
  const readyKind = preferred.find(kind => (kind === 'silo' ? siloOffer : barnOffer)?.ready);
  if (readyKind) {
    const name = readyKind === 'silo' ? '筒仓' : '谷仓';
    return result(`把${name}再扩大一档`, '材料和金币已经够。扩容后，收成和每 5 次收获的扩建材料不容易被满仓挡住。', '去扩容', { type: 'storage', section: 'upgrade' });
  }
  let field: ReturnType<typeof farmExpansionCost> | null = null;
  try { field = farmExpansionCost(game); } catch { field = null; }
  if (field && getLevel(game) >= field.level && game.coins >= field.coins) {
    return result('再开一块田', `第 ${field.plots} 块田需要 ${field.coins} 金币。打开后由你确认，不会自动扣费。`, '查看扩地', { type: 'storage', section: 'upgrade' });
  }
  if (barnUsed >= game.barnCapacity || siloUsed >= game.siloCapacity) {
    const both = barnUsed >= game.barnCapacity && siloUsed >= game.siloCapacity;
    const which = both ? '筒仓和谷仓都满了' : barnUsed >= game.barnCapacity ? '谷仓满了' : '筒仓满了';
    const extra = barnUsed >= game.barnCapacity ? '谷仓没有空位时，这一轮收获的扩建材料会错过。' : '筒仓没有空位时，成熟作物暂时收不下来。';
    return result('先给仓库腾出空位', `${which}。出售、交货或用掉一些物品后再继续。${extra}`, '整理库存', { type: 'storage', section: 'inventory' });
  }
  const missing = (siloOffer?.materials ?? barnOffer?.materials ?? []).filter(([id, count]) => (game.inventory[id] ?? 0) < count);
  const names = missing.slice(0, 3).map(([id]) => getItem(id).name).join('、');
  const plots = game.plots.slice(0, game.unlockedPlots);
  const mature = plots.find(plot => plot.crop && plot.readyAt !== undefined && plot.readyAt <= now);
  const detail = names ? `还缺${names}。每 5 次收获获得 1 份材料，同一种要再等一轮。` : '金币或材料还差一点。每 5 次收获获得 1 份扩建材料。';
  if (mature) return result('继续收获以凑扩建材料', detail, '去收获', { type: 'plot', plotId: mature.id });
  const empty = plots.find(plot => !plot.crop);
  if (empty) return result('种满空地，攒扩建材料', detail, '去播种', { type: 'plot', plotId: empty.id });
  return result('等收成凑齐扩建', '田里都在生长。每 5 次收获获得 1 份扩建材料，谷仓要留出空位。', '查看农田', { type: 'plot', plotId: plots[0]?.id ?? 1 });
}

function recipeReady(game: Game, machineId: MachineId, itemId: ItemId): boolean {
  const recipe = RECIPES.find(entry => entry.output === itemId && entry.machine === machineId);
  const machine = MACHINES.find(entry => entry.id === machineId);
  const owned = game.machines.find(entry => entry.id === machineId);
  if (!recipe || !machine || !owned || owned.queue.length >= owned.slots) return false;
  if (getLevel(game) < recipe.level || getLevel(game) < machine.level) return false;
  return Object.entries(recipe.inputs).every(([id, count]) => (game.inventory[id as ItemId] ?? 0) >= (count ?? 0));
}

function nextRecipe(game: Game, machineId: MachineId): ItemId | undefined {
  return RECIPES.find(entry => recipeReady(game, machineId, entry.output))?.output;
}

function workshopGuide(game: Game): SeasonCopy {
  const continueOn = game.machines.find(machine => machine.queue.length === 1 && machine.queue.length < machine.slots && nextRecipe(game, machine.id));
  if (continueOn) {
    const itemId = nextRecipe(game, continueOn.id)!;
    const name = MACHINES.find(entry => entry.id === continueOn.id)!.name;
    return result('再排一份，让工坊连上', `${name}还有空位。排上${getItem(itemId).name}后，两份会依次完成。收完队列后，若还没新建工坊或加槽，这条提醒会再出现。`, '去连产', { type: 'production', machineId: continueOn.id, itemId });
  }
  const fresh = game.machines.find(machine => machine.queue.length === 0 && nextRecipe(game, machine.id));
  if (fresh) {
    const itemId = nextRecipe(game, fresh.id)!;
    const name = MACHINES.find(entry => entry.id === fresh.id)!.name;
    return result('先排上两份制作', `${name}可以连续排队。先做${getItem(itemId).name}，再排下一份，不用等收完才开始。`, '去工坊', { type: 'production', machineId: fresh.id, itemId });
  }
  const nextMachine = MACHINES.find(machine => !game.machines.some(entry => entry.id === machine.id) && getLevel(game) >= machine.level && game.coins >= machine.cost);
  if (nextMachine) return result(`可以建造${nextMachine.name}`, `花费 ${nextMachine.cost} 金币。建好后这条目标会留下。`, '查看工坊', { type: 'production', machineId: nextMachine.id });
  const blocked = game.machines.find(machine => machine.queue.length < machine.slots);
  const recipe = blocked && RECIPES.find(entry => entry.machine === blocked.id && getLevel(game) >= entry.level && getLevel(game) >= (MACHINES.find(item => item.id === blocked.id)?.level ?? 99));
  const missing = recipe && (Object.entries(recipe.inputs) as [ItemId, number][]).find(([id, count]) => (game.inventory[id] ?? 0) < count);
  if (missing) return result('先补齐工坊原料', `${getItem(recipe!.output).name}还缺${getItem(missing[0]).name}。备好后可以连续排两份。`, '查看来源', { type: 'item', itemId: missing[0] });
  return result('看看工坊怎么连着做', '同一座工坊排两份，或再建一座工坊，生产就不会断档。', '查看工坊', { type: 'production' });
}

function orderReady(game: Game, order: GameOrder): boolean {
  const needs = Object.entries(order.requirements) as [ItemId, number][];
  return needs.length > 0 && needs.every(([id, count]) => (game.inventory[id] ?? 0) >= count);
}

function deliveryGuide(game: Game): SeasonCopy {
  const remaining = Math.max(1, STABLE_DELIVERIES - game.ordersDelivered);
  const orders = game.orders.filter(order => order.kind === 'truck' || getLevel(game) >= BOAT_LEVEL);
  const order = orders.find(entry => orderReady(game, entry)) ?? orders.find(entry => entry.kind === 'truck') ?? orders[0];
  if (!order) return result('把订单稳定送出去', `再完成 ${remaining} 张卡车或货船订单。打开订单板查看需求。`, '查看订单', { type: 'order', kind: 'truck' });
  const prepared = orderReady(game, order);
  return result(
    prepared ? '有一张订单可以送出' : '为下一张订单备货',
    prepared ? `核对后交货。再完成 ${remaining} 张，这一步就稳了。` : `还差 ${remaining} 张稳定交付。缺货可以查看来源，再回到这张订单。`,
    prepared ? '去交货' : '查看缺货',
    { type: 'order', kind: order.kind, orderId: order.id },
  );
}
