import { CROPS, LIVESTOCK, speedUpAnimal, speedUpCrop } from './game';
import type { Game } from './farmTypes';

export type SpeedUpKind = 'crop' | 'animal';
export interface GameSpeedRequest {
  readonly kind: SpeedUpKind;
  readonly id: number;
  readonly subject: string;
  readonly label: string;
  readonly readyAt: number;
  readonly startedAt?: number;
  readonly maximumCost: number;
}
export interface GameSpeedQuote { cost: number; blockedReason: string }

const MAX_DATE = 8_640_000_000_000_000;
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE;
const validCost = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const costAt = (readyAt: number, now: number): number => Math.max(1, Math.ceil((readyAt - now) / 300000));
const finished = (kind: SpeedUpKind): string => kind === 'crop' ? '作物已完成生长，无需钻石，请直接收获。' : '产物已完成，无需钻石，请直接收集。';

interface TimedTarget { subject: string; label: string; readyAt: number; startedAt?: number }

function currentTarget(game: Game, kind: SpeedUpKind, id: number): TimedTarget {
  if (kind !== 'crop' && kind !== 'animal') throw new Error('加速类型无效。');
  if (!validId(id)) throw new Error('加速目标编号无效。');
  if (!game || typeof game !== 'object') throw new Error('农场状态无效。');
  if (kind === 'crop') {
    if (!Array.isArray(game.plots)) throw new Error('田地状态无效。');
    const targets = game.plots.filter(plot => plot?.id === id);
    if (targets.length !== 1) throw new Error('这块田不存在或编号重复，请重新选择。');
    const plot = targets[0], index = game.plots.indexOf(plot);
    if (!Number.isSafeInteger(game.unlockedPlots) || game.unlockedPlots < 1 || game.unlockedPlots > game.plots.length) throw new Error('已解锁田地数量无效。');
    if (index >= game.unlockedPlots) throw new Error('这块田尚未解锁。');
    const crop = CROPS.find(item => item.id === plot.crop);
    if (!crop) throw new Error('这块田没有可加速的作物，请重新选择。');
    if (!validTime(plot.readyAt) || (plot.plantedAt !== undefined && (!validTime(plot.plantedAt) || plot.readyAt < plot.plantedAt))) throw new Error('作物生长计时无效。');
    return { subject: crop.id, label: crop.name, readyAt: plot.readyAt, ...(plot.plantedAt !== undefined ? { startedAt: plot.plantedAt } : {}) };
  }
  if (!Array.isArray(game.animals)) throw new Error('畜栏状态无效。');
  const targets = game.animals.filter(pen => pen?.id === id);
  if (targets.length !== 1) throw new Error('这个畜栏不存在或编号重复，请重新选择。');
  const pen = targets[0], animal = LIVESTOCK.find(item => item.id === pen.animal);
  if (!animal) throw new Error('这个畜栏没有可加速的动物，请重新选择。');
  if (pen.readyAt === undefined && pen.fedAt === undefined) throw new Error('请先给动物喂食，再选择加速产出。');
  if (!validTime(pen.readyAt) || (pen.fedAt !== undefined && (!validTime(pen.fedAt) || pen.readyAt < pen.fedAt))) throw new Error('动物产出计时无效。');
  return { subject: animal.id, label: animal.name, readyAt: pen.readyAt, ...(pen.fedAt !== undefined ? { startedAt: pen.fedAt } : {}) };
}

function checkRequest(request: GameSpeedRequest): void {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || (request.kind !== 'crop' && request.kind !== 'animal') || !validId(request.id)
    || !validTime(request.readyAt) || !validCost(request.maximumCost)
    || (request.startedAt !== undefined && (!validTime(request.startedAt) || request.readyAt < request.startedAt))) {
    throw new Error('加速确认信息无效，请重新选择。');
  }
  const definitions = request.kind === 'crop' ? CROPS : LIVESTOCK;
  const definition = definitions.find(item => item.id === request.subject);
  if (!definition || request.label !== definition.name) throw new Error('加速对象信息无效，请重新选择。');
}

/** Capture the specific growth/feeding cycle. Preparing never spends or advances a timer. */
export function prepareGameSpeedUp(game: Game, kind: SpeedUpKind, id: number, now = Date.now()): GameSpeedRequest {
  if (!validTime(now)) throw new Error('加速确认时间无效。');
  const target = currentTarget(game, kind, id);
  if (target.readyAt <= now) throw new Error(finished(kind));
  return Object.freeze({ kind, id, ...target, maximumCost: costAt(target.readyAt, now) });
}

/** Read a fresh price without changing resources, progress, inventory or the captured request. */
export function readGameSpeedQuote(game: Game, request: GameSpeedRequest, now = Date.now()): GameSpeedQuote {
  try {
    if (!validTime(now)) throw new Error('加速确认时间无效。');
    checkRequest(request);
    const target = currentTarget(game, request.kind, request.id);
    if (target.subject !== request.subject || target.startedAt !== request.startedAt) throw new Error('原来的作物或喂食批次已变化，请重新选择加速目标。');
    if (target.readyAt <= now) return { cost: 0, blockedReason: finished(request.kind) };
    if (target.readyAt !== request.readyAt) throw new Error('原来的生长或产出计时已变化，请重新选择加速目标。');
    const cost = costAt(target.readyAt, now);
    if (cost > request.maximumCost) return { cost, blockedReason: '设备时间或费用已变化，超过打开确认框时的钻石上限，请重新选择。' };
    if (typeof game.gems !== 'number' || !Number.isSafeInteger(game.gems) || game.gems < 0) throw new Error('游戏钻石数量无效，请核实存档。');
    if (game.gems < cost) return { cost, blockedReason: `还差 ${cost - game.gems} 颗游戏钻石，请继续等待。` };
    return { cost, blockedReason: '' };
  } catch (error) {
    return { cost: 0, blockedReason: error instanceof Error ? error.message : '无法读取加速费用，请重新选择。' };
  }
}

/** Only an explicit approval may call the engine. The engine gets this exact quote time. */
export function confirmGameSpeedUp(game: Game, request: GameSpeedRequest, approvedCost: number, now = Date.now()): Game {
  const quote = readGameSpeedQuote(game, request, now);
  if (quote.blockedReason) throw new Error(quote.blockedReason);
  if (!validCost(approvedCost)) throw new Error('已确认的钻石费用无效，请重新核对。');
  if (quote.cost > approvedCost) throw new Error('当前费用高于刚才确认的钻石数量，尚未扣除钻石，请重新核对。');
  return request.kind === 'crop' ? speedUpCrop(game, request.id, now) : speedUpAnimal(game, request.id, now);
}
