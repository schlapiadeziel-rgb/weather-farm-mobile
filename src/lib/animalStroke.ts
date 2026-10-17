import { collectProduct, feedAnimal, LIVESTOCK, tickGame } from './game';
import type { AnimalPen, Game } from './farmTypes';

export type AnimalMode = 'browse' | 'feed' | 'collect';

export interface AnimalStrokeResult {
  game: Game;
  changedPenIds: number[];
  skippedPenIds: number[];
  reason?: string;
}

const MAX_DATE = 8_640_000_000_000_000;
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE;

function checkPen(pen: AnimalPen): void {
  if (!pen || !Number.isSafeInteger(pen.id) || pen.id < 1) throw new Error('畜栏状态无效。');
  for (const value of [pen.health, pen.feed, pen.progress]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('畜栏状态无效。');
  }
  if (pen.animal !== null && !LIVESTOCK.some(animal => animal.id === pen.animal)) throw new Error('畜栏动物无效。');
  if (pen.animal === null || (pen.fedAt === undefined && pen.readyAt === undefined)) {
    if (pen.fedAt !== undefined || pen.readyAt !== undefined || pen.progress !== 0) throw new Error('畜栏计时无效。');
    return;
  }
  if (!validTime(pen.fedAt) || !validTime(pen.readyAt) || pen.readyAt < pen.fedAt) throw new Error('畜栏计时无效。');
}

/** Apply a completed gesture without buying, accelerating or switching its mode. */
export function applyAnimalStroke(
  game: Game,
  mode: 'feed' | 'collect',
  penIds: readonly number[],
  now = Date.now(),
): AnimalStrokeResult {
  if (mode !== 'feed' && mode !== 'collect') throw new Error('畜栏操作模式无效。');
  if (!validTime(now)) throw new Error('畜栏操作时间无效。');
  if (!Array.isArray(penIds)) throw new Error('畜栏笔划无效。');
  if (!Array.isArray(game.animals) || game.animals.length < 3 || game.animals.length > 15) throw new Error('畜栏状态无效。');
  const pens = new Map<number, number>();
  for (const [index, pen] of game.animals.entries()) {
    checkPen(pen);
    if (pens.has(pen.id)) throw new Error('畜栏编号重复。');
    if (pen.id !== index + 1) throw new Error('畜栏编号必须从 1 连续排列。');
    pens.set(pen.id, index);
  }
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const id of penIds) {
    if (!Number.isSafeInteger(id) || id < 1 || !pens.has(id)) throw new Error('畜栏编号无效。');
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
  // Check every prospective timer before the first action, including later
  // animals with a longer production duration. No preceding feed may succeed
  // when a later selected timer cannot be represented.
  if (mode === 'feed') {
    for (const id of ids) {
      const pen = game.animals[pens.get(id)!];
      if (pen.animal !== null && pen.readyAt === undefined) {
        const animal = LIVESTOCK.find(item => item.id === pen.animal)!;
        if (now + animal.durationMs > MAX_DATE) throw new Error('畜栏操作时间无效。');
      }
    }
  }

  // Preserve the normal economy validation even if every selected pen is
  // ineligible. Discard this timer copy so a no-op retains object identity.
  tickGame(game, now);
  const result: AnimalStrokeResult = { game, changedPenIds: [], skippedPenIds: [] };
  for (const id of ids) {
    const pen = result.game.animals[pens.get(id)!];
    if (result.reason || pen.animal === null || (mode === 'feed' ? pen.readyAt !== undefined : pen.readyAt === undefined || pen.readyAt > now)) {
      result.skippedPenIds.push(id);
      continue;
    }
    try {
      result.game = mode === 'feed' ? feedAnimal(result.game, id, now) : collectProduct(result.game, id, now);
      result.changedPenIds.push(id);
    } catch (error) {
      // Only expected resource limits stop a partially completed gesture.
      // Corrupt state and programming failures must remain visible as errors.
      if (!(error instanceof Error) || !/库存不足|[粮货]仓空间不足/.test(error.message)) throw error;
      result.reason = error.message;
      result.skippedPenIds.push(id);
    }
  }
  return result;
}

/** Return one summary for the entire gesture. */
export function getAnimalStrokeNotice(result: AnimalStrokeResult, mode: 'feed' | 'collect'): string {
  if (mode !== 'feed' && mode !== 'collect') throw new Error('畜栏操作模式无效。');
  const count = result.changedPenIds.length;
  if (count === 0) return result.reason ?? (mode === 'feed' ? '划过等待喂食的畜栏，即可使用对应饲料。' : '划过产物已就绪的畜栏，即可收取。');
  const completed = mode === 'feed' ? `已喂食 ${count} 个畜栏，分别使用对应饲料。` : `已收取 ${count} 个畜栏的产物，已入货仓。`;
  if (result.reason) return `${completed}${result.reason}`;
  return result.skippedPenIds.length ? `${completed}另有 ${result.skippedPenIds.length} 个畜栏未操作。` : completed;
}
