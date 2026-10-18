import { ITEMS } from './farmContent';
import type { ItemId } from './farmTypes';
import type { TownBuildingDefinition, TownBuildingId, TownBuildingLevel, TownState, TownVisitor } from './townTypes';

export const TOWN_TRAIN_COOLDOWN_MS = 5 * 60_000;
export const TOWN_MAX_VISITORS = 6;
export const TOWN_BUILDINGS: readonly TownBuildingDefinition[] = [
  { id: 'store', name: '乡间杂货铺', icon: '🛍️', description: '为旅客备好农场鲜货。', unlockReputation: 0, buildCost: 0, serviceMs: 60_000 },
  { id: 'cafe', name: '林荫咖啡馆', icon: '☕', description: '让旅客在树荫下享用农场点心。', unlockReputation: 3, buildCost: 250, serviceMs: 90_000 },
  { id: 'inn', name: '河畔旅舍', icon: '🏡', description: '用农场物产招待来小镇歇脚的旅客。', unlockReputation: 8, buildCost: 500, serviceMs: 180_000 },
];
const MAX_DATE = 8_640_000_000_000_000;
const buildingIds = TOWN_BUILDINGS.map(building => building.id);
const itemMap = new Map(ITEMS.map(item => [item.id, item]));

export function townInteger(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}无效。`);
  return value;
}
export function townTime(value: unknown): number { return townInteger(value, '小镇计时', 0, MAX_DATE); }
export function getTownBuilding(id: TownBuildingId): TownBuildingDefinition {
  const building = TOWN_BUILDINGS.find(item => item.id === id);
  if (!building) throw new Error('小镇设施无效。');
  return building;
}
export function getTownFacilityCapacity(level: TownBuildingLevel): number {
  townInteger(level, '小镇设施等级', 0, 3);
  return level === 0 ? 0 : level + 1;
}
export function getTownUpgradeCost(level: TownBuildingLevel): number | null {
  townInteger(level, '小镇设施等级', 0, 3);
  if (level === 0) return null;
  return level === 1 ? 250 : level === 2 ? 500 : null;
}
export function initialTown(): TownState {
  return { version: 1, reputation: 0, trainSerial: 0, nextTrainAt: 0, buildings: [{ id: 'store', level: 1 }, { id: 'cafe', level: 0 }, { id: 'inn', level: 0 }], visitors: [] };
}
export function townVisitorReward(requirements: TownVisitor['requirements']): { coins: number; xp: number; reputation: number } {
  const entries = Object.entries(requirements);
  return { coins: entries.reduce((total, [id, quantity]) => total + itemMap.get(id as ItemId)!.price * quantity!, 10), xp: 5 + entries.length * 2, reputation: 1 };
}
function record(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('小镇存档格式无效。');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('小镇存档格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value')) || required.some(key => !Object.hasOwn(value, key))) throw new Error('小镇存档字段不受支持或不完整。');
  return value as Record<string, unknown>;
}
function list(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error('小镇存档列表无效。');
  return value;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\u0000-\u001f]/.test(value)) throw new Error('小镇旅客资料无效。');
  return value;
}

/** Strictly validates present town data; missing old-save data is handled by the caller. */
export function normalizeTown(value: unknown): TownState {
  const source = record(value, ['version', 'reputation', 'trainSerial', 'nextTrainAt', 'buildings', 'visitors']);
  if (source.version !== 1) throw new Error('小镇存档版本不受支持。');
  const reputation = townInteger(source.reputation, '小镇声望');
  const trainSerial = townInteger(source.trainSerial, '小镇列车序号');
  const nextTrainAt = townTime(source.nextTrainAt);
  if ((trainSerial === 0 && nextTrainAt !== 0) || (trainSerial > 0 && nextTrainAt < TOWN_TRAIN_COOLDOWN_MS)) throw new Error('小镇列车计时不一致。');
  const buildings = list(source.buildings, 3, 3).map(raw => {
    const building = record(raw, ['id', 'level']);
    if (!buildingIds.includes(building.id as TownBuildingId)) throw new Error('小镇设施无效。');
    const id = building.id as TownBuildingId;
    const level = townInteger(building.level, '小镇设施等级', id === 'store' ? 1 : 0, 3) as TownBuildingLevel;
    if (level > 0 && reputation < getTownBuilding(id).unlockReputation) throw new Error('小镇设施声望不足。');
    return { id, level };
  });
  if (new Set(buildings.map(item => item.id)).size !== 3) throw new Error('小镇设施编号重复。');
  const visitors: TownVisitor[] = list(source.visitors, 0, TOWN_MAX_VISITORS).map(raw => {
    const visitor = record(raw, ['id', 'name', 'buildingId', 'requirements', 'coins', 'xp', 'reputation', 'arrivedAt', 'startedAt', 'readyAt'], ['id', 'name', 'buildingId', 'requirements', 'coins', 'xp', 'reputation', 'arrivedAt']);
    const building = buildings.find(item => item.id === visitor.buildingId);
    if (!building || building.level === 0) throw new Error('旅客目的设施尚未建造。');
    const id = text(visitor.id, 100);
    const match = /^town-(\d+)-([0-2])$/.exec(id);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1 || Number(match[1]) > trainSerial || String(Number(match[1])) !== match[1]) throw new Error('小镇旅客编号无效。');
    const rawRequirements = record(visitor.requirements, ITEMS.filter(item => ['crop', 'animal', 'product'].includes(item.category)).map(item => item.id), []);
    const requirements: TownVisitor['requirements'] = {};
    const keys = Object.keys(rawRequirements);
    if (!keys.length || keys.length > 2) throw new Error('小镇旅客需求无效。');
    for (const id of keys) requirements[id as ItemId] = townInteger(rawRequirements[id], '小镇需求数量', 1, 3);
    const reward = townVisitorReward(requirements);
    if (visitor.coins !== reward.coins || visitor.xp !== reward.xp || visitor.reputation !== reward.reputation) throw new Error('小镇旅客报酬与需求不一致。');
    const arrivedAt = townTime(visitor.arrivedAt);
    if (arrivedAt > nextTrainAt - TOWN_TRAIN_COOLDOWN_MS) throw new Error('小镇旅客到站计时无效。');
    const result: TownVisitor = { id, name: text(visitor.name, 50), buildingId: building.id, requirements, ...reward, arrivedAt };
    const hasStart = Object.hasOwn(visitor, 'startedAt'); const hasReady = Object.hasOwn(visitor, 'readyAt');
    if (hasStart !== hasReady) throw new Error('小镇服务计时不完整。');
    if (hasStart) {
      const startedAt = townTime(visitor.startedAt); const readyAt = townTime(visitor.readyAt);
      if (startedAt < arrivedAt || readyAt - startedAt !== getTownBuilding(building.id).serviceMs) throw new Error('小镇服务计时无效。');
      result.startedAt = startedAt; result.readyAt = readyAt;
    }
    return result;
  });
  if (new Set(visitors.map(item => item.id)).size !== visitors.length) throw new Error('小镇旅客编号重复。');
  for (const building of buildings) if (visitors.filter(item => item.buildingId === building.id && item.startedAt !== undefined).length > getTownFacilityCapacity(building.level)) throw new Error('小镇设施服务人数超出容量。');
  return { version: 1, reputation, trainSerial, nextTrainAt, buildings, visitors };
}
