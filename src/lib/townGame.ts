import { CROPS, ITEMS, LIVESTOCK, MACHINES, RECIPES } from './farmContent';
import { FISHING_LEVEL } from './farmEconomy';
import { getLevel, tickGame } from './game';
import type { Game, ItemId } from './farmTypes';
import { getTownBuilding, getTownFacilityCapacity, getTownUpgradeCost, normalizeTown, townInteger, townTime, townVisitorReward, TOWN_MAX_VISITORS, TOWN_TRAIN_COOLDOWN_MS } from './townState';
import type { TownBuildingId, TownBuildingLevel, TownVisitor } from './townTypes';

export * from './townTypes';
export { initialTown, TOWN_BUILDINGS, TOWN_MAX_VISITORS, TOWN_TRAIN_COOLDOWN_MS, getTownBuilding, getTownFacilityCapacity, getTownUpgradeCost } from './townState';
const names = ['阿禾', '林叔', '小满', '云姨', '阿岚', '麦子', '青松', '小溪', '果果', '南风', '阿陶', '白露'];

function start(game: Game, now: number): Game {
  townTime(now);
  const town = normalizeTown(game.town);
  const next = tickGame(game, now);
  next.town = town;
  return next;
}
function log(game: Game, message: string): void { game.log = [message, ...game.log].slice(0, 12); }
function add(value: number, amount: number, label: string): number { return townInteger(value + amount, label); }
function visitorById(game: Game, id: string): TownVisitor {
  const visitor = game.town.visitors.find(item => item.id === id);
  if (!visitor) throw new Error('找不到这位小镇旅客，可能已经完成接待。');
  return visitor;
}

/** Eligibility follows farm production access, never market news or real records. */
export function getTownAvailableGoods(game: Game): ItemId[] {
  const level = getLevel(game);
  const producible = new Set<ItemId>(CROPS.filter(crop => crop.level <= level).map(crop => crop.id));
  for (const pen of game.animals) {
    const animal = LIVESTOCK.find(item => item.id === pen.animal);
    if (animal && animal.level <= level) producible.add(animal.product);
  }
  for (const tree of game.orchard) if (tree.harvests < 4 && ITEMS.find(item => item.id === tree.fruit)!.level <= level) producible.add(tree.fruit);
  if (level >= FISHING_LEVEL) producible.add('fish_fillet');
  if (game.beehiveBuilt) producible.add('honey');
  const built = new Set(game.machines.filter(machine => MACHINES.find(item => item.id === machine.id)!.level <= level).map(machine => machine.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const recipe of RECIPES) if (!producible.has(recipe.output) && built.has(recipe.machine) && recipe.level <= level && Object.keys(recipe.inputs).every(id => producible.has(id as ItemId))) {
      producible.add(recipe.output); changed = true;
    }
  }
  const goods = ITEMS.filter(item => producible.has(item.id) && ['crop', 'animal', 'product'].includes(item.category)).map(item => item.id);
  return goods.length ? goods : ['wheat'];
}

export function getTownVisitorPhase(visitor: TownVisitor, now = Date.now()): 'waiting' | 'serving' | 'ready' {
  townTime(now);
  if (visitor.startedAt === undefined || visitor.readyAt === undefined) return 'waiting';
  return now >= visitor.readyAt ? 'ready' : 'serving';
}

/** A train is summoned explicitly, including after offline time has elapsed. */
export function arriveTownTrain(game: Game, now = Date.now()): Game {
  const next = start(game, now);
  if (now < next.town.nextTrainAt) throw new Error('下一班小镇列车还没有到站，请等待倒计时。');
  if (next.town.visitors.length >= TOWN_MAX_VISITORS) throw new Error('小镇旅客已满，请先完成接待并收取报酬。');
  const serial = add(next.town.trainSerial, 1, '小镇列车序号');
  const nextTrainAt = townTime(now + TOWN_TRAIN_COOLDOWN_MS);
  const buildings = next.town.buildings.filter(item => item.level > 0);
  const goods = getTownAvailableGoods(next);
  const count = Math.min(3, TOWN_MAX_VISITORS - next.town.visitors.length);
  const visitors: TownVisitor[] = Array.from({ length: count }, (_, index) => {
    const building = buildings[(serial - 1 + index) % buildings.length];
    const first = goods[((serial - 1) % goods.length * 3 + index) % goods.length];
    const requirements: TownVisitor['requirements'] = { [first]: first === 'wheat' ? 2 : 1 };
    if (building.id !== 'store' && goods.length > 1) {
      const second = goods[(goods.indexOf(first) + 1) % goods.length];
      requirements[second] = 1;
    }
    return { id: `town-${serial}-${index}`, name: names[(((serial - 1) % names.length) * 3 + index) % names.length], buildingId: building.id, requirements, ...townVisitorReward(requirements), arrivedAt: now };
  });
  next.town.trainSerial = serial; next.town.nextTrainAt = nextTrainAt; next.town.visitors.push(...visitors);
  log(next, `小镇列车到站，${count} 位模拟旅客前来游玩。`);
  return next;
}

/** Only an explicit service action spends the displayed game goods. */
export function serveTownVisitor(game: Game, id: string, now = Date.now()): Game {
  const next = start(game, now); const visitor = visitorById(next, id);
  if (visitor.startedAt !== undefined) throw new Error('这位旅客已经开始服务，无需重复提交物品。');
  if (now < visitor.arrivedAt) throw new Error('设备时间早于旅客到站时间，请校准后重试。');
  const building = next.town.buildings.find(item => item.id === visitor.buildingId)!;
  const servingCount = next.town.visitors.filter(item => item.buildingId === visitor.buildingId && item.startedAt !== undefined).length;
  if (servingCount >= getTownFacilityCapacity(building.level)) throw new Error('这处设施的服务席位已满，请先完成服务并收取报酬。');
  const readyAt = townTime(now + getTownBuilding(building.id).serviceMs);
  for (const [item, quantity] of Object.entries(visitor.requirements)) {
    const owned = townInteger(next.inventory[item as ItemId] ?? 0, '库存数量');
    if (owned < quantity!) throw new Error(`${ITEMS.find(candidate => candidate.id === item)!.name}库存不足，需要 ${quantity} 份。`);
  }
  for (const [item, quantity] of Object.entries(visitor.requirements)) next.inventory[item as ItemId] = next.inventory[item as ItemId]! - quantity!;
  visitor.startedAt = now; visitor.readyAt = readyAt;
  log(next, `向${visitor.name}提供物品，在${getTownBuilding(building.id).name}开始服务。`);
  return next;
}

/** No automatic rewards: collecting removes the visitor so it can only happen once. */
export function collectTownVisitor(game: Game, id: string, now = Date.now()): Game {
  const next = start(game, now); const visitor = visitorById(next, id);
  if (getTownVisitorPhase(visitor, now) !== 'ready') throw new Error('这位旅客的服务尚未完成。');
  next.coins = add(next.coins, visitor.coins, '金币'); next.xp = add(next.xp, visitor.xp, '经验');
  next.town.reputation = add(next.town.reputation, visitor.reputation, '小镇声望');
  next.town.visitors = next.town.visitors.filter(item => item.id !== id);
  log(next, `完成${visitor.name}的接待，获得 ${visitor.coins} 金币、${visitor.xp} 经验与 ${visitor.reputation} 小镇声望。`);
  return next;
}

export function buildTownFacility(game: Game, id: TownBuildingId, now = Date.now()): Game {
  const definition = getTownBuilding(id); const next = start(game, now);
  const building = next.town.buildings.find(item => item.id === id)!;
  if (building.level > 0) throw new Error('这处小镇设施已经建好了。');
  if (next.town.reputation < definition.unlockReputation) throw new Error(`需要 ${definition.unlockReputation} 小镇声望才能建造。`);
  if (next.coins < definition.buildCost) throw new Error(`金币不足，建造${definition.name}需要 ${definition.buildCost} 金币。`);
  next.coins -= definition.buildCost; building.level = 1;
  log(next, `建造${definition.name}，花费 ${definition.buildCost} 金币。`);
  return next;
}

export function upgradeTownFacility(game: Game, id: TownBuildingId, now = Date.now()): Game {
  const definition = getTownBuilding(id); const next = start(game, now);
  const building = next.town.buildings.find(item => item.id === id)!;
  if (building.level === 0) throw new Error('请先建造这处小镇设施。');
  const cost = getTownUpgradeCost(building.level);
  if (cost === null) throw new Error('小镇设施已达到 3 级上限。');
  if (next.coins < cost) throw new Error(`金币不足，升级需要 ${cost} 金币。`);
  next.coins -= cost; building.level = (building.level + 1) as TownBuildingLevel;
  log(next, `将${definition.name}升级至 ${building.level} 级，花费 ${cost} 金币。`);
  return next;
}
