import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, harvest, collectProduct } from '../src/lib/game.ts';
import { getFarmJourney } from '../src/lib/farmJourney.ts';

const NOW = 1793512800000;

test('first journey follows actual harvest and collection without adding rewards or save fields', () => {
  const game = initialGame(NOW), before = structuredClone(game);
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'plot', plotId: 1 });
  assert.equal(getFarmJourney(game, NOW)?.completed, 0);
  assert.deepEqual(game, before);
  const harvested = harvest(game, 1, NOW);
  assert.equal(getFarmJourney(harvested, NOW)?.step, 'animal');
  assert.deepEqual(getFarmJourney(harvested, NOW)?.target, { type: 'pen', penId: 1 });
  const collected = collectProduct(harvested, 1, NOW);
  assert.equal(getFarmJourney(collected, NOW)?.step, 'order');
  assert.equal(getFarmJourney(collected, NOW)?.completed, 2);
});

test('maturity is determined by the real deadline, not a stale progress percentage', () => {
  const game = initialGame(NOW);
  game.plots[0].growth = 100; game.plots[0].readyAt = NOW + 30000;
  assert.equal(getFarmJourney(game, NOW)?.actionLabel, '查看作物');
  assert.equal(getFarmJourney(game, NOW + 30000)?.actionLabel, '去收获');
  game.harvests = 1; game.animals[0].progress = 100; game.animals[0].readyAt = NOW + 30000;
  assert.equal(getFarmJourney(game, NOW)?.actionLabel, '查看动物');
  assert.equal(getFarmJourney(game, NOW + 30000)?.actionLabel, '去收取');
});

test('full storage accounts for two crops and one animal product before proposing collection', () => {
  const game = initialGame(NOW);
  game.inventory = { wheat: 99 }; game.siloCapacity = 100;
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'storage');
  game.inventory.wheat = 98;
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'plot');
  game.harvests = 1; game.inventory = { egg: 100 }; game.barnCapacity = 100;
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'storage');
  game.inventory.egg = 99;
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'pen');
});

test('planting guidance uses unlocked owned seed and never sends missing seed back into a crop loop', () => {
  const game = initialGame(NOW);
  game.plots.forEach(plot => { plot.crop = null; delete plot.readyAt; delete plot.plantedAt; });
  game.inventory = { strawberry: 10, corn: 1 };
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'plot', plotId: 1, cropId: 'corn' });
  game.inventory = { strawberry: 10 };
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'storage');
});

test('locked plots are not proposed and full-grown crop without a timer is not collectible', () => {
  const game = initialGame(NOW);
  game.unlockedPlots = 1; game.plots[0].readyAt = NOW + 60000;
  game.plots[1] = { ...game.plots[0], id: 2, readyAt: NOW };
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'plot', plotId: 1 });
  delete game.plots[0].readyAt;
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'guide');
});

test('hungry animals guide to feeding when owned, otherwise to the actual feed source', () => {
  const game = initialGame(NOW); game.harvests = 1;
  delete game.animals[0].readyAt; delete game.animals[0].fedAt;
  game.inventory.chicken_feed = 1;
  assert.equal(getFarmJourney(game, NOW)?.actionLabel, '去喂食');
  game.inventory.chicken_feed = 0;
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'item', itemId: 'chicken_feed' });
});

test('empty pasture proposes only an affordable unlocked animal, otherwise explains the conditions', () => {
  const game = initialGame(NOW); game.harvests = 1;
  game.animals[0].animal = null; game.coins = 90;
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'pen', penId: 1, animalId: 'chicken' });
  game.coins = 89;
  assert.equal(getFarmJourney(game, NOW)?.target.type, 'guide');
});

test('ready order is preferred by real identity and delivery kind without sorting saved orders', () => {
  const game = initialGame(NOW); game.harvests = 1; game.productsCollected = 1;
  game.xp = 320;
  game.orders = [
    { id: 'truck-missing', kind: 'truck', requirements: { wheat: 99 }, coins: 20, xp: 2 },
    { id: 'boat-ready', kind: 'boat', requirements: { wheat: 1 }, coins: 20, xp: 2 },
  ];
  game.inventory.wheat = 1;
  const before = structuredClone(game);
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'order', kind: 'boat', orderId: 'boat-ready' });
  assert.deepEqual(game, before);
  game.inventory.wheat = 0;
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'order', kind: 'truck', orderId: 'truck-missing' });
  game.orders = [];
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'order', kind: 'truck' });
});

test('boat orders below their unlock level cannot become the proposed first delivery', () => {
  const game = initialGame(NOW); game.harvests = 1; game.productsCollected = 1;
  game.orders = [{ id: 'locked-boat', kind: 'boat', requirements: { wheat: 1 }, coins: 20, xp: 2 }];
  game.inventory.wheat = 2;
  assert.deepEqual(getFarmJourney(game, NOW)?.target, { type: 'order', kind: 'truck' });
});

test('completed old farms need no journey and unusual milestone order stays read-only', () => {
  const game = initialGame(NOW); game.harvests = game.productsCollected = game.ordersDelivered = 1;
  assert.equal(getFarmJourney(game, NOW), null);
  game.harvests = 0;
  assert.equal(getFarmJourney(game, NOW)?.step, 'harvest');
  assert.equal(getFarmJourney(game, NOW)?.completed, 2);
});

test('invalid clocks cannot create false ready guidance', () => {
  for (const now of [-1, NaN, Infinity, 0.5]) assert.throws(() => getFarmJourney(initialGame(NOW), now), /时间无效/);
});
