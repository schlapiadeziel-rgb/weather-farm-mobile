import { ITEMS } from './farmContent';
import type { ItemDefinition, ItemId } from './farmTypes';
import type { FarmVisitor, FarmVisitorProfile, FarmVisitorProfileId, FarmVisitorsState } from './farmVisitorTypes';

export const FARM_VISITOR_COOLDOWN_MS = 120_000;
export const FARM_VISITOR_CROP_RESERVE = 2;
export const FARM_VISITOR_PROFILES: readonly Readonly<FarmVisitorProfile>[] = Object.freeze([
  { id: 'seed_post', name: '邮差阿穗', tagline: '一路捎来好心情', greeting: '送信路过，想带些农场鲜货回家。', color: '#d39a3c' },
  { id: 'reed_basket', name: '竹匠芦叔', tagline: '竹篮里的乡间味道', greeting: '新编的竹篮正好装些好东西，看看你有什么富余。', color: '#638e65' },
  { id: 'morning_kitchen', name: '邻居陶婶', tagline: '灶火等着新鲜食材', greeting: '家里正备着饭，来你这里挑些现成的农场物产。', color: '#bf755b' },
  { id: 'blue_lantern', name: '画师小蓝', tagline: '把田园风景带回家', greeting: '画完今天的田野，想买些好东西犒劳自己。', color: '#638cba' },
].map(profile => Object.freeze(profile as FarmVisitorProfile)));

const MAX_DATE = 8_640_000_000_000_000;
const items = new Map(ITEMS.map(item => [item.id, item]));
const minerals = new Set<ItemId>(['coal', 'iron_ore', 'gold_ore', 'iron_bar', 'gold_bar']);

export function farmVisitorInteger(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}无效。`);
  return value;
}
export function farmVisitorTime(value: unknown): number { return farmVisitorInteger(value, '农场访客计时', 0, MAX_DATE); }
export function farmVisitorResolveAt(now: number): number { return farmVisitorTime(farmVisitorTime(now) + FARM_VISITOR_COOLDOWN_MS); }
export function getFarmVisitorProfile(id: FarmVisitorProfileId): Readonly<FarmVisitorProfile> {
  const profile = FARM_VISITOR_PROFILES.find(candidate => candidate.id === id);
  if (!profile) throw new Error('农场访客身份无效。');
  return profile;
}
export function farmVisitorGood(id: ItemId): ItemDefinition {
  const item = items.get(id);
  if (!item || !['crop', 'animal', 'product', 'fruit', 'fish'].includes(item.category) || minerals.has(id)) throw new Error('这种物品不在农场访客的收购范围内。');
  return item;
}
export function farmVisitorReward(item: ItemId, quantity: number): { coins: number; xp: number } {
  const definition = farmVisitorGood(item);
  farmVisitorInteger(quantity, '访客需求数量', 1, 5);
  return { coins: Math.ceil(definition.price * quantity * 11 / 10), xp: 2 + quantity };
}
export function initialFarmVisitors(): FarmVisitorsState { return { version: 1, serial: 0, nextArrivalAt: 0, visitor: null }; }

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('农场访客存档格式无效。');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('农场访客存档格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value')) || allowed.some(key => !Object.hasOwn(value, key))) throw new Error('农场访客存档字段不受支持或不完整。');
  return value as Record<string, unknown>;
}

/** Pure state validation, shared by game cloning without importing the game engine. */
export function normalizeFarmVisitors(value: unknown): FarmVisitorsState {
  const source = record(value, ['version', 'serial', 'nextArrivalAt', 'visitor']);
  if (source.version !== 1) throw new Error('农场访客存档版本不受支持。');
  const serial = farmVisitorInteger(source.serial, '农场访客序号');
  const nextArrivalAt = farmVisitorTime(source.nextArrivalAt);
  if (serial === 0 && (nextArrivalAt !== 0 || source.visitor !== null)) throw new Error('初始农场访客状态不一致。');
  if (source.visitor === null) {
    if (serial > 0 && nextArrivalAt < FARM_VISITOR_COOLDOWN_MS) throw new Error('农场访客冷却计时不一致。');
    return { version: 1, serial, nextArrivalAt, visitor: null };
  }
  const raw = record(source.visitor, ['id', 'profileId', 'item', 'quantity', 'coins', 'xp', 'arrivedAt']);
  if (raw.id !== `farm-visitor-${serial}` || serial < 1) throw new Error('农场访客编号无效。');
  const profile = FARM_VISITOR_PROFILES[(serial - 1) % FARM_VISITOR_PROFILES.length];
  if (raw.profileId !== profile.id) throw new Error('农场访客身份与序号不一致。');
  const item = farmVisitorGood(raw.item as ItemId).id;
  const quantity = farmVisitorInteger(raw.quantity, '访客需求数量', 1, 5);
  const reward = farmVisitorReward(item, quantity);
  if (raw.coins !== reward.coins || raw.xp !== reward.xp) throw new Error('农场访客报酬与需求不一致。');
  const arrivedAt = farmVisitorTime(raw.arrivedAt);
  farmVisitorResolveAt(arrivedAt);
  if (nextArrivalAt > arrivedAt || (serial === 1 ? nextArrivalAt !== 0 : nextArrivalAt < FARM_VISITOR_COOLDOWN_MS)) throw new Error('农场访客到访计时不一致。');
  const visitor: FarmVisitor = { id: raw.id as string, profileId: profile.id, item, quantity, ...reward, arrivedAt };
  return { version: 1, serial, nextArrivalAt, visitor };
}
