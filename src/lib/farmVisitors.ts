import { ITEMS } from './farmContent';
import { getLevel, tickGame } from './game';
import type { Game } from './farmTypes';
import type { FarmVisitor } from './farmVisitorTypes';
import { FARM_VISITOR_CROP_RESERVE, FARM_VISITOR_PROFILES, farmVisitorGood, farmVisitorInteger, farmVisitorResolveAt, farmVisitorReward, farmVisitorTime, getFarmVisitorProfile, normalizeFarmVisitors } from './farmVisitorState';

export * from './farmVisitorTypes';
export { FARM_VISITOR_COOLDOWN_MS, FARM_VISITOR_CROP_RESERVE, FARM_VISITOR_PROFILES, getFarmVisitorProfile, initialFarmVisitors, normalizeFarmVisitors } from './farmVisitorState';

function start(game: Game, now: number): Game {
  farmVisitorTime(now);
  const state = normalizeFarmVisitors(game.farmVisitors);
  const next = tickGame(game, now);
  next.farmVisitors = state;
  return next;
}
function log(game: Game, message: string): void { game.log = [message, ...game.log].slice(0, 12); }
function currentVisitor(game: Game, id: string, now: number): FarmVisitor {
  const visitor = game.farmVisitors.visitor;
  if (!visitor || visitor.id !== id) throw new Error('这位农场访客已经离开，请查看当前来客。');
  if (now < visitor.arrivedAt) throw new Error('设备时间早于访客到访时间，请校准后重试。');
  farmVisitorResolveAt(now);
  return visitor;
}
function saleVisitor(game: Game, id: string, now: number): FarmVisitor {
  const visitor = currentVisitor(game, id, now);
  const item = farmVisitorGood(visitor.item);
  if (getLevel(game) < item.level) throw new Error('这份访客需求尚未解锁，请提升等级或送客。');
  const owned = farmVisitorInteger(game.inventory[item.id] ?? 0, '库存数量');
  if (owned < visitor.quantity) throw new Error(`${item.name}库存不足，需要 ${visitor.quantity} 份。`);
  if (item.category === 'crop' && owned - visitor.quantity < FARM_VISITOR_CROP_RESERVE) throw new Error(`${item.name}需要保留 ${FARM_VISITOR_CROP_RESERVE} 份作种子，请补充库存后再出售。`);
  farmVisitorInteger(game.coins + visitor.coins, '成交后金币');
  farmVisitorInteger(game.xp + visitor.xp, '成交后经验');
  return visitor;
}

/** Explicitly invites one local simulated customer; waiting/offline time never trades. */
export function welcomeFarmVisitor(game: Game, now = Date.now()): Game {
  const next = start(game, now);
  if (next.farmVisitors.visitor) throw new Error('门口已有一位访客，请先出售物品或送客。');
  if (now < next.farmVisitors.nextArrivalAt) throw new Error('下一位访客还在路上，请等待倒计时。');
  farmVisitorResolveAt(now);
  const serial = farmVisitorInteger(next.farmVisitors.serial + 1, '农场访客序号', 1);
  const level = getLevel(next);
  const eligible = ITEMS.flatMap((item, index) => {
    try { farmVisitorGood(item.id); } catch { return []; }
    const owned = farmVisitorInteger(next.inventory[item.id] ?? 0, '库存数量');
    const available = owned - (item.category === 'crop' ? FARM_VISITOR_CROP_RESERVE : 0);
    return item.level <= level && available > 0 ? [{ item, available, index }] : [];
  }).sort((a, b) => b.available - a.available || a.index - b.index).slice(0, 3);
  if (!eligible.length) throw new Error('暂时没有可出售的已解锁物产；作物需先留足 2 份种子，饲料和材料不参与收购。');
  const choice = eligible[(serial - 1) % eligible.length];
  const quantity = Math.min(5, choice.available, 2 + (serial - 1) % 4);
  const profile = FARM_VISITOR_PROFILES[(serial - 1) % FARM_VISITOR_PROFILES.length];
  next.farmVisitors = { ...next.farmVisitors, serial, visitor: { id: `farm-visitor-${serial}`, profileId: profile.id, item: choice.item.id, quantity, ...farmVisitorReward(choice.item.id, quantity), arrivedAt: now } };
  log(next, `${profile.name}来到农场门口，想收购${choice.item.name} ×${quantity}。`);
  return next;
}

/** Empty means ready; the operation repeats the same guards against the latest state. */
export function getFarmVisitorSaleBlock(game: Game, id: string, now = Date.now()): string {
  try { saleVisitor(start(game, now), id, now); return ''; } catch (error) { return error instanceof Error ? error.message : '暂时无法向这位访客出售物品。'; }
}

/** Exactly one explicit sale removes inventory and grants its fixed displayed reward. */
export function sellToFarmVisitor(game: Game, id: string, now = Date.now()): Game {
  const next = start(game, now); const visitor = saleVisitor(next, id, now);
  next.inventory[visitor.item] = next.inventory[visitor.item]! - visitor.quantity;
  next.coins += visitor.coins; next.xp += visitor.xp;
  next.farmVisitors.visitor = null;
  next.farmVisitors.nextArrivalAt = farmVisitorResolveAt(now);
  log(next, `向${getFarmVisitorProfile(visitor.profileId).name}出售${farmVisitorGood(visitor.item).name} ×${visitor.quantity}，获得 ${visitor.coins} 金币与 ${visitor.xp} 经验。`);
  return next;
}

/** Sending a visitor away spends nothing and grants nothing. */
export function dismissFarmVisitor(game: Game, id: string, now = Date.now()): Game {
  const next = start(game, now); const visitor = currentVisitor(next, id, now);
  next.farmVisitors.visitor = null;
  next.farmVisitors.nextArrivalAt = farmVisitorResolveAt(now);
  log(next, `送别${getFarmVisitorProfile(visitor.profileId).name}，等待下一位农场访客。`);
  return next;
}
