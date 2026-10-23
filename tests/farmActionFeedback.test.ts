import assert from 'node:assert/strict';
import test from 'node:test';
import { createFarmActionFeedback } from '../src/lib/farmActionFeedback.ts';
import { applyAnimalStroke } from '../src/lib/animalStroke.ts';
import { applyFieldStroke } from '../src/lib/fieldStroke.ts';
import { CROPS, initialGame, LIVESTOCK, storageUsed, tickGame } from '../src/lib/game.ts';
import type { AnimalId, AnimalPen, Game } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-21T08:00:00Z');
const crop = (id: 'wheat' | 'corn') => CROPS.find(item => item.id === id)!;
const animal = (id: AnimalId) => LIVESTOCK.find(item => item.id === id)!;
const idlePen = (id: number, species: AnimalId): AnimalPen => ({ id, animal: species, health: 100, feed: 0, progress: 0 });
const readyPen = (id: number, species: AnimalId): AnimalPen => ({ ...idlePen(id, species), fedAt: NOW - animal(species).durationMs, readyAt: NOW, progress: 100, feed: 100 });
const mixedCrops = (): Game => {
  const game = initialGame(NOW);
  game.plots[1] = { ...game.plots[1], crop: 'corn', plantedAt: NOW - crop('corn').durationMs, readyAt: NOW, growth: 100 };
  return game;
};

test('mixed harvest includes the actual material bonus and caps visible details without inventing a yield', () => {
  const before = mixedCrops(); before.harvests = 4;
  const result = applyFieldStroke(before, 'harvest', [1, 2], 'wheat', NOW);
  const data = createFarmActionFeedback(before, result.game, 'harvest', result.changedPlotIds, true)!;
  assert.equal(data.title, '本次收获'); assert.equal(data.count, 2);
  assert.deepEqual(data.chips.map(chip => chip.id), ['wheat', 'corn', 'plank']);
  for (const chip of data.chips) assert.equal(chip.delta, result.game.inventory[chip.id as 'wheat' | 'corn' | 'plank']! - before.inventory[chip.id as 'wheat' | 'corn' | 'plank']!);
  assert.equal(data.remainingCount, 1, 'the real XP change is the fourth detail');
  assert.equal(data.unsaved, false); assert.doesNotMatch(JSON.stringify(data), /已保存/);
});

test('single harvest reports the XP actually granted and does not claim a bonus when the barn is full', () => {
  const before = mixedCrops(); before.harvests = 4; before.barnCapacity = storageUsed(before, 'barn');
  const result = applyFieldStroke(before, 'harvest', [1], 'wheat', NOW);
  const data = createFarmActionFeedback(before, result.game, 'harvest', result.changedPlotIds)!;
  assert.deepEqual(data.chips.map(chip => chip.id), ['wheat', 'xp']);
  assert.equal(data.chips.find(chip => chip.id === 'xp')!.delta, result.game.xp - before.xp);
  assert.equal(data.remainingCount, 0); assert.equal(data.unsaved, false);
});

test('a seed shortage only counts fields actually planted, including if visited or duplicate IDs leak into feedback', () => {
  const before = initialGame(NOW); before.inventory.wheat = 1;
  const result = applyFieldStroke(before, 'plant', [4, 5, 6], 'wheat', NOW);
  assert.match(result.reason!, /库存不足/);
  const data = createFarmActionFeedback(before, result.game, 'plant', [4, 5, 6, 4, 99, Number.NaN], false)!;
  assert.equal(data.count, result.changedPlotIds.length); assert.equal(data.count, 1);
  assert.deepEqual(data.chips, [{ id: 'wheat', label: '小麦', delta: -1 }]);
  assert.equal(data.unsaved, true);
});

test('zero successes, failed resource limits, and timer updates never produce success feedback', () => {
  const before = initialGame(NOW); before.inventory.wheat = 0;
  const failed = applyFieldStroke(before, 'plant', [4, 5], 'wheat', NOW);
  assert.equal(createFarmActionFeedback(before, failed.game, 'plant', failed.changedPlotIds), null);
  assert.equal(createFarmActionFeedback(before, before, 'harvest', [1]), null);
  assert.equal(createFarmActionFeedback(before, tickGame(before, NOW + 1000), 'harvest', [2]), null);
  const harvested = applyFieldStroke(before, 'harvest', [1], 'wheat', NOW);
  assert.equal(createFarmActionFeedback(before, harvested.game, 'harvest', []), null);
  assert.equal(createFarmActionFeedback(before, harvested.game, 'plant', [1]), null);
});

test('mixed feeding shows each consumed feed as a negative change and grants no experience', () => {
  const before = initialGame(NOW); before.animals = [idlePen(1, 'chicken'), idlePen(2, 'cow'), idlePen(3, 'chicken')];
  const result = applyAnimalStroke(before, 'feed', [1, 2], NOW);
  const data = createFarmActionFeedback(before, result.game, 'feed', result.changedPenIds, false)!;
  assert.equal(data.count, 2); assert.equal(data.unsaved, true);
  assert.deepEqual(new Map(data.chips.map(chip => [chip.id, chip.delta])), new Map([['chicken_feed', -1], ['cow_feed', -1]]));
  assert.ok(data.chips.every(chip => chip.delta < 0)); assert.equal(data.remainingCount, 0);
  assert.equal(createFarmActionFeedback(before, result.game, 'collect', result.changedPenIds), null);
});

test('mixed animal collection retains separate products and includes only its real bonus', () => {
  const before = initialGame(NOW); before.animals = [readyPen(1, 'chicken'), readyPen(2, 'cow'), idlePen(3, 'chicken')]; before.productsCollected = 4;
  const result = applyAnimalStroke(before, 'collect', [1, 2, 3], NOW);
  const data = createFarmActionFeedback(before, result.game, 'collect', result.changedPenIds)!;
  assert.equal(data.count, 2); assert.equal(data.chips.length, 3);
  assert.deepEqual(new Set(data.chips.map(chip => chip.id)), new Set(['egg', 'milk', 'axe']));
  assert.ok(data.chips.every(chip => chip.delta > 0)); assert.equal(data.remainingCount, 1);
});

test('feedback leaves both game snapshots and the caller IDs unchanged', () => {
  const before = mixedCrops();
  const result = applyFieldStroke(before, 'harvest', [1, 2], 'wheat', NOW);
  const snapshots = [structuredClone(before), structuredClone(result.game)];
  const freeze = (value: object): void => {
    Object.freeze(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
  };
  freeze(before); freeze(result.game);
  const ids = Object.freeze([...result.changedPlotIds]);
  const data = createFarmActionFeedback(before, result.game, 'harvest', ids)!;
  data.chips[0].delta = 123;
  assert.deepEqual(before, snapshots[0]); assert.deepEqual(result.game, snapshots[1]);
  assert.deepEqual(ids, result.changedPlotIds);
});
