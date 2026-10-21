import assert from 'node:assert/strict';
import test from 'node:test';
import { getFarmMapSignals } from '../src/lib/farmMapSignals.ts';
import { applyFarmLayout, moveFarmLayoutItem } from '../src/lib/farmLayout.ts';
import { collectProduct, collectProduction, feedAnimal, initialGame, queueProduction, storageUsed } from '../src/lib/game.ts';
import type { Game } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-20T08:00:00Z');
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const emptyGame = (): Game => {
  const game = initialGame(NOW);
  game.animals = game.animals.map(pen => ({ id: pen.id, animal: null, health: 100, feed: 0, progress: 0 }));
  return game;
};
const queuedGame = (): Game => queueProduction(queueProduction(emptyGame(), 'feed_mill', 'chicken_feed', NOW), 'bakery', 'bread', NOW);
const completionTime = (game: Game): number => Math.max(...game.machines.flatMap(machine => machine.queue.map(job => job.readyAt)));

test('empty workshops and pens have no map signals even when other farm activities are ready', () => {
  const game = emptyGame(); const before = copy(game);
  assert.equal(game.plots[0].readyAt, NOW);
  assert.ok(game.orders.length > 0);
  assert.deepEqual(getFarmMapSignals(game, NOW), []);
  assert.deepEqual(game, before);
});

test('signals use exact completion timestamps and ignore stale animal progress without ticking the game', () => {
  let game = emptyGame();
  game.animals[0].animal = 'chicken';
  game = feedAnimal(game, 1, NOW);
  game = queueProduction(game, 'feed_mill', 'chicken_feed', NOW);
  const feedReady = game.machines[0].queue[0].readyAt;
  const animalReady = game.animals[0].readyAt!;
  game.animals[0].progress = 100;
  const before = copy(game);
  assert.deepEqual(getFarmMapSignals(game, feedReady - 1), []);
  assert.deepEqual(getFarmMapSignals(game, feedReady).map(({ area, count }) => ({ area, count })), [{ area: 'production', count: 1 }]);
  assert.equal(getFarmMapSignals(game, animalReady - 1).some(signal => signal.area === 'livestock'), false);
  game.animals[0].progress = 0;
  const livestock = getFarmMapSignals(game, animalReady).find(signal => signal.area === 'livestock')!;
  assert.equal(livestock.count, 1);
  assert.deepEqual(livestock.target, { tab: 'livestock', penId: 1 });
  assert.equal(livestock.label, '牧场有1栏待收产物，前往1号畜栏查看。');
  assert.deepEqual(game, { ...before, animals: before.animals.map(pen => pen.id === 1 ? { ...pen, progress: 0 } : pen) });
});

test('actual production collection retargets the signal from the feed mill to the bakery and counts batches', () => {
  const game = queuedGame(); const now = completionTime(game); const before = copy(game);
  const [first] = getFarmMapSignals(game, now);
  assert.equal(first.area, 'production'); assert.equal(first.count, 2);
  assert.deepEqual(first.target, { tab: 'production', machineId: 'feed_mill' });
  assert.equal(first.label, '工坊有2批成品待收，前往饲料坊查看。');
  assert.deepEqual(game, before);
  const feedJob = game.machines.find(machine => machine.id === 'feed_mill')!.queue[0];
  const collected = collectProduction(game, 'feed_mill', feedJob.id, now);
  assert.equal(collected.inventory.chicken_feed, game.inventory.chicken_feed! + 3);
  const [next] = getFarmMapSignals(collected, now);
  assert.equal(next.count, 1);
  assert.deepEqual(next.target, { tab: 'production', machineId: 'bakery' });
  assert.equal(next.label, '工坊有1批成品待收，前往面包坊查看。');
  const breadJob = collected.machines.find(machine => machine.id === 'bakery')!.queue[0];
  assert.deepEqual(getFarmMapSignals(collectProduction(collected, 'bakery', breadJob.id, now), now), []);
  assert.deepEqual(game, before);
});

test('collecting an animal product removes its signal immediately without changing the source game', () => {
  const game = initialGame(NOW); const before = copy(game);
  assert.deepEqual(getFarmMapSignals(game, NOW), [{
    area: 'livestock', count: 1, label: '牧场有1栏待收产物，前往1号畜栏查看。',
    x: 240, y: 400, target: { tab: 'livestock', penId: 1 },
  }]);
  assert.deepEqual(getFarmMapSignals(collectProduct(game, 1, NOW), NOW), []);
  assert.deepEqual(game, before);
});

test('a full barn keeps unclaimed products visible without claiming that collection will succeed', () => {
  const game = queueProduction(initialGame(NOW), 'feed_mill', 'chicken_feed', NOW);
  game.barnCapacity = storageUsed(game, 'barn');
  const now = completionTime(game); const before = copy(game);
  const signals = getFarmMapSignals(game, now);
  assert.deepEqual(signals.map(({ area, count }) => ({ area, count })), [{ area: 'production', count: 1 }, { area: 'livestock', count: 1 }]);
  assert.ok(signals.every(signal => signal.label.includes('待收') && !signal.label.includes('可收')));
  assert.throws(() => collectProduction(game, 'feed_mill', game.machines[0].queue[0].id, now), /货仓空间不足/);
  assert.throws(() => collectProduct(game, 1, now), /货仓空间不足/);
  assert.deepEqual(getFarmMapSignals(game, now), signals);
  assert.deepEqual(game, before);
});

test('saved landmark moves update both signal anchors while preserving inventory, timers and layout input', () => {
  const game = queueProduction(initialGame(NOW), 'feed_mill', 'chicken_feed', NOW);
  const now = completionTime(game); const before = copy(game);
  assert.deepEqual(getFarmMapSignals(game, now).map(({ area, x, y }) => ({ area, x, y })), [
    { area: 'production', x: 980, y: 195 }, { area: 'livestock', x: 240, y: 400 },
  ]);
  const layout = moveFarmLayoutItem(moveFarmLayoutItem(game.layout, 'production', 1000, 600), 'livestock', 100, 600);
  const moved = applyFarmLayout(game, layout); const movedBefore = copy(moved); const layoutBefore = copy(layout);
  assert.deepEqual(getFarmMapSignals(moved, now).map(({ area, x, y }) => ({ area, x, y })), [
    { area: 'production', x: 1130, y: 545 }, { area: 'livestock', x: 240, y: 550 },
  ]);
  assert.deepEqual(moved.inventory, game.inventory); assert.deepEqual(moved.machines, game.machines); assert.deepEqual(moved.animals, game.animals);
  assert.deepEqual(moved, movedBefore); assert.deepEqual(layout, layoutBefore); assert.deepEqual(game, before);
});

test('an unplaced landmark suppresses only its own readiness signal', () => {
  const game = queueProduction(initialGame(NOW), 'feed_mill', 'chicken_feed', NOW);
  const now = completionTime(game);
  game.layout.placements.find(placement => placement.id === 'production')!.placed = false;
  const before = copy(game);
  assert.deepEqual(getFarmMapSignals(game, now).map(signal => signal.area), ['livestock']);
  assert.deepEqual(game, before);
  game.layout.placements.find(placement => placement.id === 'livestock')!.placed = false;
  assert.deepEqual(getFarmMapSignals(game, now), []);
});
