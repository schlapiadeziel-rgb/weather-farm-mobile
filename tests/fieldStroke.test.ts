import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFieldStroke, getFieldStrokeNotice } from '../src/lib/fieldStroke.ts';
import { CROPS, harvest, initialGame, plant, restoreGame, storageUsed } from '../src/lib/game.ts';
import type { Game } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-13T08:00:00Z');
const wheat = CROPS.find(crop => crop.id === 'wheat')!;
const corn = CROPS.find(crop => crop.id === 'corn')!;

const ripeGame = (): Game => {
  const game = initialGame(NOW);
  game.plots = game.plots.map(plot => plot.id <= 6 ? { ...plot, crop: 'wheat', growth: 100, plantedAt: NOW - wheat.durationMs, readyAt: NOW } : plot);
  return game;
};

test('a plant stroke applies once per field in the order first crossed and skips occupied and locked fields', () => {
  const game = initialGame(NOW); const before = structuredClone(game);
  const result = applyFieldStroke(game, 'plant', [6, 1, 4, 6, 7, 5, 4], 'wheat', NOW);
  assert.deepEqual(result.changedPlotIds, [6, 4, 5]);
  assert.deepEqual(result.skippedPlotIds, [1, 7]);
  assert.equal(result.game.inventory.wheat, game.inventory.wheat! - 3);
  assert.equal(result.game.coins, game.coins); assert.equal(result.game.gems, game.gems);
  assert.equal(result.game.plots[6].crop, null);
  for (const id of [4, 5, 6]) {
    assert.equal(result.game.plots[id - 1].crop, 'wheat');
    assert.equal(result.game.plots[id - 1].plantedAt, NOW);
    assert.equal(result.game.plots[id - 1].readyAt, NOW + wheat.durationMs);
  }
  assert.deepEqual(game, before);
  assert.deepEqual(result.game, plant(plant(plant(game, 6, 'wheat', NOW), 4, 'wheat', NOW), 5, 'wheat', NOW));
});

test('seed exhaustion preserves completed fields and leaves all later fields unplanted', () => {
  const game = initialGame(NOW); game.inventory.wheat = 2; const before = structuredClone(game);
  const result = applyFieldStroke(game, 'plant', [6, 4, 5, 7], 'wheat', NOW);
  assert.deepEqual(result.changedPlotIds, [6, 4]); assert.deepEqual(result.skippedPlotIds, [5, 7]);
  assert.match(result.reason!, /小麦库存不足/); assert.equal(result.game.inventory.wheat, 0);
  assert.deepEqual(result.game.plots[4], game.plots[4]); assert.deepEqual(result.game.plots[6], game.plots[6]);
  assert.equal(result.game.coins, game.coins); assert.equal(result.game.gems, game.gems); assert.deepEqual(game, before);
  assert.match(getFieldStrokeNotice(result, 'plant'), /已播种小麦 2 块田.*库存不足/);
});

test('no seed or insufficient level completes no action and preserves the original state', () => {
  const game = initialGame(NOW); game.inventory.wheat = 0;
  const empty = applyFieldStroke(game, 'plant', [4, 5, 6], 'wheat', NOW);
  assert.equal(empty.game, game); assert.deepEqual(empty.changedPlotIds, []); assert.deepEqual(empty.skippedPlotIds, [4, 5, 6]);
  assert.match(empty.reason!, /库存不足/);
  const lockedCrop = applyFieldStroke(initialGame(NOW), 'plant', [4, 5], 'strawberry', NOW);
  assert.deepEqual(lockedCrop.changedPlotIds, []); assert.deepEqual(lockedCrop.skippedPlotIds, [4, 5]); assert.match(lockedCrop.reason!, /11 级/);
});

test('harvest stroke grants each ripe field once, skips empty growing and locked fields and preserves normal rewards', () => {
  const game = ripeGame(); game.plots[2] = initialGame(NOW).plots[2];
  const before = structuredClone(game);
  const result = applyFieldStroke(game, 'harvest', [2, 1, 2, 3, 7, 4], 'wheat', NOW);
  assert.deepEqual(result.changedPlotIds, [2, 1, 4]); assert.deepEqual(result.skippedPlotIds, [3, 7]);
  assert.equal(result.game.inventory.wheat, game.inventory.wheat! + 6);
  assert.equal(result.game.xp, game.xp + wheat.xp * 3); assert.equal(result.game.harvests, 3);
  assert.equal(result.game.coins, game.coins); assert.equal(result.game.gems, game.gems); assert.deepEqual(game, before);
  assert.deepEqual(result.game, harvest(harvest(harvest(game, 2, NOW), 1, NOW), 4, NOW));
});

test('full silo stops a stroke after successful fields without granting partial yield for the blocked field', () => {
  const game = ripeGame(); game.siloCapacity = storageUsed(game, 'silo') + 3; const before = structuredClone(game);
  const result = applyFieldStroke(game, 'harvest', [3, 2, 1, 4], 'wheat', NOW);
  assert.deepEqual(result.changedPlotIds, [3]); assert.deepEqual(result.skippedPlotIds, [2, 1, 4]); assert.match(result.reason!, /粮仓空间不足/);
  assert.equal(result.game.inventory.wheat, game.inventory.wheat! + 2); assert.equal(result.game.harvests, 1); assert.equal(result.game.xp, wheat.xp);
  for (const id of [2, 1, 4]) assert.deepEqual(result.game.plots[id - 1], game.plots[id - 1]);
  assert.deepEqual(game, before); assert.match(getFieldStrokeNotice(result, 'harvest'), /已收获 1 块田.*粮仓空间不足/);
});

test('a full silo before the first harvest does not consume or charge anything', () => {
  const game = ripeGame(); game.siloCapacity = storageUsed(game, 'silo');
  const result = applyFieldStroke(game, 'harvest', [1, 2], 'wheat', NOW);
  assert.equal(result.game, game); assert.deepEqual(result.changedPlotIds, []); assert.deepEqual(result.skippedPlotIds, [1, 2]);
  assert.match(result.reason!, /粮仓空间不足/); assert.equal(getFieldStrokeNotice(result, 'harvest'), result.reason);
});

test('mixed ripe crops keep their own yields and XP at the exact timer boundary', () => {
  const game = initialGame(NOW); const ready = game.plots[1].readyAt!;
  const early = applyFieldStroke(game, 'harvest', [2, 3], 'wheat', ready - 1);
  assert.equal(early.game, game); assert.deepEqual(early.changedPlotIds, []); assert.deepEqual(early.skippedPlotIds, [2, 3]);
  const mature = applyFieldStroke(game, 'harvest', [1, 2, 3], 'wheat', ready);
  assert.deepEqual(mature.changedPlotIds, [1, 2]); assert.deepEqual(mature.skippedPlotIds, [3]);
  assert.equal(mature.game.inventory.wheat, game.inventory.wheat! + 2); assert.equal(mature.game.inventory.corn, game.inventory.corn! + 2);
  assert.equal(mature.game.inventory.soybean, game.inventory.soybean); assert.equal(mature.game.xp, wheat.xp + corn.xp);
});

test('fifth-harvest materials follow normal counters and a full barn only suppresses the bonus', () => {
  const game = ripeGame(); game.harvests = 3;
  const collected = applyFieldStroke(game, 'harvest', [4, 3, 2], 'wheat', NOW).game;
  assert.equal(collected.harvests, 6); assert.equal(collected.inventory.plank, game.inventory.plank! + 1);
  const full = { ...game, barnCapacity: storageUsed(game, 'barn') };
  const withoutBonus = applyFieldStroke(full, 'harvest', [4, 3, 2], 'wheat', NOW).game;
  assert.equal(withoutBonus.harvests, 6); assert.equal(withoutBonus.inventory.plank, game.inventory.plank); assert.equal(withoutBonus.inventory.wheat, game.inventory.wheat! + 6);
});

test('all gesture identifiers are checked before any valid preceding field can act', () => {
  const game = initialGame(NOW); const before = structuredClone(game);
  for (const invalid of [0, -1, 1.5, 99, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '5', null, undefined]) {
    assert.throws(() => applyFieldStroke(game, 'plant', [4, invalid as number], 'wheat', NOW), /田地编号无效/);
    assert.deepEqual(game, before);
  }
  assert.throws(() => applyFieldStroke(game, 'plant', Array(2), 'wheat', NOW), /田地编号无效/);
  for (const invalid of [null, undefined, new Set([4]), '4', { 0: 4, length: 1 }]) {
    assert.throws(() => applyFieldStroke(game, 'plant', invalid as never, 'wheat', NOW), /田地笔划无效/);
  }
});

test('invalid mode seed and time including timestamp overflow are rejected atomically', () => {
  const game = initialGame(NOW); const before = structuredClone(game);
  for (const mode of ['browse', 'unknown', null, undefined]) assert.throws(() => applyFieldStroke(game, mode as never, [4], 'wheat', NOW), /模式无效/);
  for (const seed of ['unknown', 'chicken', null, 1]) {
    assert.throws(() => applyFieldStroke(game, 'plant', [4], seed as never, NOW), /作物无效/);
    assert.throws(() => applyFieldStroke(game, 'harvest', [1], seed as never, NOW), /作物无效/);
  }
  for (const now of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 8_640_000_000_000_001]) assert.throws(() => applyFieldStroke(game, 'plant', [4], 'wheat', now), /时间无效/);
  assert.throws(() => applyFieldStroke(game, 'plant', [4, 5], 'wheat', 8_640_000_000_000_000), /时间无效/);
  assert.deepEqual(game, before);
});

test('invalid economy state is not disguised as an ordinary resource shortage', () => {
  const game = initialGame(NOW);
  for (const invalid of [{ coins: -1 }, { gems: 1.5 }, { xp: Number.NaN }, { inventory: { wheat: -1 } }]) {
    assert.throws(() => applyFieldStroke({ ...game, ...invalid }, 'plant', [4], 'wheat', NOW), /无效/);
    assert.throws(() => applyFieldStroke({ ...game, ...invalid }, 'harvest', [], 'wheat', NOW), /无效/);
  }
});

test('empty and entirely ineligible strokes preserve state and have a useful single notice', () => {
  const game = initialGame(NOW);
  assert.equal(applyFieldStroke(game, 'plant', [], 'wheat', NOW).game, game);
  const occupied = applyFieldStroke(game, 'plant', [1, 2, 3, 7], 'wheat', NOW);
  assert.equal(occupied.game, game); assert.deepEqual(occupied.skippedPlotIds, [1, 2, 3, 7]); assert.equal(occupied.reason, undefined);
  assert.match(getFieldStrokeNotice(occupied, 'plant'), /空地/);
  const empty = applyFieldStroke(game, 'harvest', [4, 5, 6], 'wheat', NOW);
  assert.equal(empty.game, game); assert.match(getFieldStrokeNotice(empty, 'harvest'), /已成熟/);
});

test('completed and partially completed strokes roundtrip through the unchanged version-two save format', () => {
  const game = initialGame(NOW); game.inventory.wheat = 1;
  const planted = applyFieldStroke(game, 'plant', [4, 5, 6], 'wheat', NOW);
  assert.equal(planted.game.version, 2); assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(planted.game)), NOW), planted.game);
  const completedAt = NOW + wheat.durationMs;
  const harvested = applyFieldStroke(planted.game, 'harvest', [4, 5, 1], 'wheat', completedAt);
  assert.deepEqual(harvested.changedPlotIds, [4, 1]);
  assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(harvested.game)), completedAt), harvested.game);
  assert.equal(harvested.game.version, 2);
});
