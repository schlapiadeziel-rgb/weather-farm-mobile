import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAnimalStroke, getAnimalStrokeNotice } from '../src/lib/animalStroke.ts';
import { collectProduct, feedAnimal, initialGame, LIVESTOCK, restoreGame, storageUsed } from '../src/lib/game.ts';
import type { AnimalId, AnimalPen, Game } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-16T08:00:00Z');
const MAX_DATE = 8_640_000_000_000_000;
const animal = (id: AnimalId) => LIVESTOCK.find(item => item.id === id)!;
const idlePen = (id: number, species: AnimalId | null): AnimalPen => ({ id, animal: species, health: 100, feed: 0, progress: 0 });
const readyPen = (id: number, species: AnimalId, readyAt = NOW): AnimalPen => ({
  ...idlePen(id, species), feed: 100, progress: 0, fedAt: readyAt - animal(species).durationMs, readyAt,
});
const mixedIdleGame = (): Game => {
  const game = initialGame(NOW);
  game.animals = [idlePen(1, 'chicken'), idlePen(2, 'cow'), idlePen(3, 'goat'), idlePen(4, null)];
  game.inventory.goat_feed = 2;
  return game;
};
const mixedReadyGame = (): Game => ({ ...mixedIdleGame(), animals: [readyPen(1, 'chicken'), readyPen(2, 'cow'), readyPen(3, 'goat'), idlePen(4, null)] });

test('feed strokes deduplicate in gesture order and use each species own feed and timer without charging coins or gems', () => {
  const game = mixedIdleGame(); const before = structuredClone(game);
  const result = applyAnimalStroke(game, 'feed', [3, 1, 3, 2, 4, 1], NOW);
  assert.deepEqual(result.changedPenIds, [3, 1, 2]); assert.deepEqual(result.skippedPenIds, [4]);
  for (const species of ['chicken', 'cow', 'goat'] as const) assert.equal(result.game.inventory[animal(species).feedItem], game.inventory[animal(species).feedItem]! - 1);
  for (const pen of result.game.animals.filter(pen => pen.animal !== null)) {
    assert.equal(pen.fedAt, NOW); assert.equal(pen.readyAt, NOW + animal(pen.animal!).durationMs);
    assert.equal(pen.feed, 100); assert.equal(pen.progress, 0);
  }
  assert.equal(result.game.coins, game.coins); assert.equal(result.game.gems, game.gems); assert.equal(result.game.xp, game.xp);
  assert.equal(result.game.productsCollected, 0); assert.deepEqual(game, before);
  assert.deepEqual(result.game, feedAnimal(feedAnimal(feedAnimal(game, 3, NOW), 1, NOW), 2, NOW));
  assert.match(getAnimalStrokeNotice(result, 'feed'), /已喂食 3 个畜栏.*另有 1/);
});

test('feed skips empty, producing and ready pens without collecting or refilling them', () => {
  const game = mixedIdleGame(); game.animals[0] = readyPen(1, 'chicken'); game.animals[1] = readyPen(2, 'cow', NOW + 1);
  const before = structuredClone(game);
  const result = applyAnimalStroke(game, 'feed', [1, 2, 4, 3], NOW);
  assert.deepEqual(result.changedPenIds, [3]); assert.deepEqual(result.skippedPenIds, [1, 2, 4]);
  assert.equal(result.game.animals[0].readyAt, NOW); assert.equal(result.game.animals[1].readyAt, NOW + 1);
  assert.equal(result.game.inventory.egg, game.inventory.egg); assert.equal(result.game.inventory.chicken_feed, game.inventory.chicken_feed);
  assert.equal(result.game.inventory.cow_feed, game.inventory.cow_feed); assert.equal(result.game.productsCollected, 0);
  assert.deepEqual(game, before);
});

test('a mixed-species feed shortage stops the whole gesture after prior successes', () => {
  const game = mixedIdleGame(); game.inventory.cow_feed = 0; const before = structuredClone(game);
  const result = applyAnimalStroke(game, 'feed', [1, 2, 3, 2, 4], NOW);
  assert.deepEqual(result.changedPenIds, [1]); assert.deepEqual(result.skippedPenIds, [2, 3, 4]);
  assert.match(result.reason!, /奶牛饲料库存不足/);
  assert.equal(result.game.inventory.chicken_feed, game.inventory.chicken_feed! - 1);
  assert.equal(result.game.inventory.goat_feed, game.inventory.goat_feed); assert.deepEqual(result.game.animals[2], game.animals[2]);
  assert.equal(result.game.coins, game.coins); assert.equal(result.game.gems, game.gems); assert.deepEqual(game, before);
  assert.match(getAnimalStrokeNotice(result, 'feed'), /已喂食 1 个畜栏.*库存不足/);
});

test('missing feed before the first action preserves the original game and all later stock', () => {
  const game = mixedIdleGame(); game.inventory.chicken_feed = 0;
  const result = applyAnimalStroke(game, 'feed', [1, 2, 3], NOW);
  assert.equal(result.game, game); assert.deepEqual(result.changedPenIds, []); assert.deepEqual(result.skippedPenIds, [1, 2, 3]);
  assert.match(result.reason!, /库存不足/); assert.equal(getAnimalStrokeNotice(result, 'feed'), result.reason);
});

test('collection uses timer boundaries despite stale progress and never uses feed or speeds a future timer', () => {
  const game = mixedReadyGame(); game.animals[1] = readyPen(2, 'cow', NOW + 1); game.animals[1].progress = 100;
  const before = structuredClone(game);
  const early = applyAnimalStroke(game, 'collect', [1, 2, 3, 1, 4], NOW);
  assert.deepEqual(early.changedPenIds, [1, 3]); assert.deepEqual(early.skippedPenIds, [2, 4]);
  assert.equal(early.game.inventory.egg, game.inventory.egg! + 1); assert.equal(early.game.inventory.goat_milk, 1);
  assert.equal(early.game.inventory.milk, game.inventory.milk); assert.equal(early.game.animals[1].readyAt, NOW + 1);
  assert.equal(early.game.inventory.chicken_feed, game.inventory.chicken_feed); assert.equal(early.game.inventory.goat_feed, game.inventory.goat_feed);
  assert.equal(early.game.productsCollected, 2); assert.equal(early.game.xp, game.xp + 10);
  assert.equal(early.game.coins, game.coins); assert.equal(early.game.gems, game.gems); assert.deepEqual(game, before);
  assert.deepEqual(early.game, collectProduct(collectProduct(game, 1, NOW), 3, NOW));
  const boundary = applyAnimalStroke(early.game, 'collect', [2], NOW + 1);
  assert.deepEqual(boundary.changedPenIds, [2]); assert.equal(boundary.game.inventory.milk, 1);
  assert.deepEqual(boundary.game.animals[1], idlePen(2, 'cow'));
});

test('clock rewind and an empty or idle pen do not permit collection', () => {
  const game = mixedReadyGame(); game.animals[2] = idlePen(3, 'goat');
  for (const ids of [[], [1, 2, 3, 4]]) {
    const result = applyAnimalStroke(game, 'collect', ids, NOW - 1);
    assert.equal(result.game, game); assert.deepEqual(result.changedPenIds, []); assert.deepEqual(result.skippedPenIds, ids);
    assert.match(getAnimalStrokeNotice(result, 'collect'), /产物已就绪/);
  }
});

test('a full barn stops collection without losing a product or granting partial XP', () => {
  const game = mixedReadyGame(); game.barnCapacity = storageUsed(game, 'barn') + 1; const before = structuredClone(game);
  const result = applyAnimalStroke(game, 'collect', [3, 2, 1], NOW);
  assert.deepEqual(result.changedPenIds, [3]); assert.deepEqual(result.skippedPenIds, [2, 1]); assert.match(result.reason!, /货仓空间不足/);
  assert.equal(result.game.inventory.goat_milk, 1); assert.equal(result.game.inventory.egg, game.inventory.egg);
  assert.equal(result.game.inventory.milk, game.inventory.milk); assert.equal(result.game.productsCollected, 1); assert.equal(result.game.xp, 5);
  assert.deepEqual(result.game, collectProduct(game, 3, NOW));
  assert.equal(result.game.animals[0].readyAt, game.animals[0].readyAt); assert.equal(result.game.animals[1].readyAt, game.animals[1].readyAt);
  assert.equal(result.game.coins, game.coins); assert.equal(result.game.gems, game.gems); assert.deepEqual(game, before);
  assert.match(getAnimalStrokeNotice(result, 'collect'), /已收取 1 个畜栏.*货仓空间不足/);
  const full = { ...game, barnCapacity: storageUsed(game, 'barn') };
  const blocked = applyAnimalStroke(full, 'collect', [1, 2], NOW);
  assert.equal(blocked.game, full); assert.equal(getAnimalStrokeNotice(blocked, 'collect'), blocked.reason);
});

test('normal fifth-collection material rewards apply once and are suppressed when the product fills the barn', () => {
  const game = mixedReadyGame(); game.productsCollected = 3;
  const result = applyAnimalStroke(game, 'collect', [3, 2, 1], NOW);
  assert.equal(result.game.productsCollected, 6); assert.equal(result.game.inventory.axe, game.inventory.axe! + 1);
  assert.deepEqual(result.game, collectProduct(collectProduct(collectProduct(game, 3, NOW), 2, NOW), 1, NOW));
  const tight = { ...game, productsCollected: 4, barnCapacity: storageUsed(game, 'barn') + 1 };
  const noBonus = applyAnimalStroke(tight, 'collect', [1], NOW);
  assert.equal(noBonus.game.inventory.egg, game.inventory.egg! + 1); assert.equal(noBonus.game.inventory.axe, game.inventory.axe);
});

test('every identifier is validated before any preceding animal acts', () => {
  const game = mixedIdleGame(); const before = structuredClone(game);
  for (const invalid of [0, -1, 1.5, 99, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '2', null, undefined]) {
    assert.throws(() => applyAnimalStroke(game, 'feed', [1, invalid as number], NOW), /畜栏编号无效/);
    assert.deepEqual(game, before);
  }
  assert.throws(() => applyAnimalStroke(game, 'feed', Array(2), NOW), /畜栏编号无效/);
  for (const invalid of [null, undefined, new Set([1]), '1', { 0: 1, length: 1 }]) assert.throws(() => applyAnimalStroke(game, 'feed', invalid as never, NOW), /畜栏笔划无效/);
});

test('invalid modes, times and a later species timer overflow reject the entire gesture', () => {
  const game = mixedIdleGame(); const before = structuredClone(game);
  for (const mode of ['browse', 'unknown', null, undefined]) {
    assert.throws(() => applyAnimalStroke(game, mode as never, [1], NOW), /模式无效/);
    assert.throws(() => getAnimalStrokeNotice({ game, changedPenIds: [], skippedPenIds: [] }, mode as never), /模式无效/);
  }
  for (const now of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_DATE + 1]) {
    assert.throws(() => applyAnimalStroke(game, 'feed', [1], now), /时间无效/);
    assert.throws(() => applyAnimalStroke(game, 'collect', [], now), /时间无效/);
  }
  assert.throws(() => applyAnimalStroke(game, 'feed', [1, 3], MAX_DATE - animal('chicken').durationMs), /时间无效/);
  const validEdge = applyAnimalStroke(game, 'feed', [1], MAX_DATE - animal('chicken').durationMs);
  assert.equal(validEdge.game.animals[0].readyAt, MAX_DATE); assert.deepEqual(game, before);
});

test('invalid economy or animal state is never mistaken for a resource limit even on empty gestures', () => {
  const game = mixedIdleGame();
  for (const invalid of [{ coins: -1 }, { gems: 1.5 }, { xp: Number.NaN }, { inventory: { chicken_feed: -1 } }, { barnCapacity: 1 }]) {
    assert.throws(() => applyAnimalStroke({ ...game, ...invalid }, 'feed', [1], NOW), /无效|超过仓库容量/);
    assert.throws(() => applyAnimalStroke({ ...game, ...invalid }, 'collect', [], NOW), /无效|超过仓库容量/);
  }
  for (const invalid of [
    { animal: 'horse' }, { fedAt: NOW }, { readyAt: NOW }, { progress: 1 }, { health: Number.NaN }, { feed: 101 },
    { fedAt: NOW, readyAt: NOW - 1 }, { fedAt: NOW, readyAt: MAX_DATE + 1 },
    { animal: null, fedAt: NOW, readyAt: NOW },
  ]) {
    const broken = structuredClone(game); broken.animals[2] = { ...broken.animals[2], ...invalid } as AnimalPen;
    const before = structuredClone(broken);
    assert.throws(() => applyAnimalStroke(broken, 'feed', [1, 3], NOW), /畜栏.*无效/);
    assert.throws(() => applyAnimalStroke(broken, 'collect', [], NOW), /畜栏.*无效/);
    assert.deepEqual(broken, before);
  }
  const duplicate = structuredClone(game); duplicate.animals[2].id = 1;
  assert.throws(() => applyAnimalStroke(duplicate, 'feed', [1], NOW), /编号重复/);
  const skippedId = structuredClone(game); skippedId.animals[3].id = 5;
  assert.throws(() => applyAnimalStroke(skippedId, 'feed', [], NOW), /连续排列/);
  for (const invalid of [[], Array(3), null]) assert.throws(() => applyAnimalStroke({ ...game, animals: invalid } as Game, 'feed', [], NOW), /畜栏状态无效/);
});

test('empty and entirely ineligible feeding strokes preserve state and offer a single useful notice', () => {
  const game = initialGame(NOW);
  assert.equal(applyAnimalStroke(game, 'feed', [], NOW).game, game);
  const result = applyAnimalStroke(game, 'feed', [1, 2, 3], NOW);
  assert.equal(result.game, game); assert.deepEqual(result.skippedPenIds, [1, 2, 3]); assert.equal(result.reason, undefined);
  assert.match(getAnimalStrokeNotice(result, 'feed'), /等待喂食/);
});

test('complete and partial animal strokes roundtrip through the existing version-two save format', () => {
  const game = mixedIdleGame(); game.inventory.cow_feed = 0;
  const fed = applyAnimalStroke(game, 'feed', [1, 2, 3], NOW);
  assert.equal(fed.game.version, 2); assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(fed.game)), NOW), fed.game);
  const readyAt = fed.game.animals[0].readyAt!;
  const collected = applyAnimalStroke(fed.game, 'collect', [1, 2, 3], readyAt);
  assert.deepEqual(collected.changedPenIds, [1]); assert.deepEqual(restoreGame(JSON.parse(JSON.stringify(collected.game)), readyAt), collected.game);
});
