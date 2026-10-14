import { CROPS, getLevel, harvest, plant, tickGame } from './game';
import type { CropId, Game } from './farmTypes';

export type FieldMode = 'browse' | 'plant' | 'harvest';

export interface FieldStrokeResult {
  game: Game;
  changedPlotIds: number[];
  skippedPlotIds: number[];
  reason?: string;
}

const MAX_DATE = 8_640_000_000_000_000;

/** Apply one completed gesture. All arguments are checked before any action. */
export function applyFieldStroke(
  game: Game,
  mode: 'plant' | 'harvest',
  plotIds: readonly number[],
  seed: CropId = 'wheat',
  now = Date.now(),
): FieldStrokeResult {
  if (mode !== 'plant' && mode !== 'harvest') throw new Error('田地操作模式无效。');
  const crop = CROPS.find(item => item.id === seed);
  if (!crop) throw new Error('播种作物无效。');
  if (!Number.isSafeInteger(now) || now < 0 || now > MAX_DATE || (mode === 'plant' && now + crop.durationMs > MAX_DATE)) {
    throw new Error('田地操作时间无效。');
  }
  if (!Array.isArray(plotIds)) throw new Error('田地笔划无效。');
  const plots = new Map(game.plots.map((plot, index) => [plot.id, { plot, index }]));
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const id of plotIds) {
    if (!Number.isSafeInteger(id) || id < 1 || !plots.has(id)) throw new Error('田地编号无效。');
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }

  // Reuse the existing economy validation, including on an empty gesture.
  // Its timer copy is discarded so a gesture with no action keeps its state.
  tickGame(game, now);
  const result: FieldStrokeResult = { game, changedPlotIds: [], skippedPlotIds: [] };
  if (mode === 'plant' && getLevel(game) < crop.level) {
    result.skippedPlotIds = ids;
    result.reason = `需要达到 ${crop.level} 级才能播种${crop.name}。`;
    return result;
  }

  for (const id of ids) {
    const { index } = plots.get(id)!;
    const plot = result.game.plots[index];
    if (result.reason || index >= result.game.unlockedPlots || (mode === 'plant' ? plot.crop !== null : !plot.crop || plot.readyAt === undefined || plot.readyAt > now)) {
      result.skippedPlotIds.push(id);
      continue;
    }
    try {
      result.game = mode === 'plant' ? plant(result.game, id, seed, now) : harvest(result.game, id, now);
      result.changedPlotIds.push(id);
    } catch (error) {
      // A resource limit stops this gesture without undoing preceding fields.
      // Invalid state and programming errors still fail loudly.
      if (!(error instanceof Error) || !/库存不足|[粮货]仓空间不足/.test(error.message)) throw error;
      result.reason = error.message;
      result.skippedPlotIds.push(id);
    }
  }
  return result;
}

/** One notice per gesture, rather than one toast per field. */
export function getFieldStrokeNotice(result: FieldStrokeResult, mode: 'plant' | 'harvest', seed: CropId = 'wheat'): string {
  if (mode !== 'plant' && mode !== 'harvest') throw new Error('田地操作模式无效。');
  const crop = CROPS.find(item => item.id === seed);
  if (!crop) throw new Error('播种作物无效。');
  const count = result.changedPlotIds.length;
  if (count === 0) return result.reason ?? (mode === 'plant' ? '划过已解锁的空地，即可播种。' : '划过已成熟的田地，即可收获。');
  const completed = mode === 'plant' ? `已播种${crop.name} ${count} 块田。` : `已收获 ${count} 块田，作物已入粮仓。`;
  if (result.reason) return `${completed}${result.reason}`;
  return result.skippedPlotIds.length ? `${completed}另有 ${result.skippedPlotIds.length} 块田未操作。` : completed;
}
