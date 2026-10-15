import assert from 'node:assert/strict';
import test from 'node:test';
import { getFarmActivity } from '../src/lib/farmActivity.ts';
import { collectProduct, collectProduction, harvest, initialGame, storageUsed } from '../src/lib/game.ts';
import { collectSale, deliverOrder } from '../src/lib/farmEconomy.ts';
import type { Game } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-15T08:00:00Z');
const MAX_DATE = 8_640_000_000_000_000;
const section = (game: Game, id: 'farm' | 'livestock' | 'production' | 'orders' | 'storage', now = NOW) => getFarmActivity(game, now).sections.find(item => item.id === id)!;
const emptyGame = (): Game => {
  const game = initialGame(NOW);
  game.plots = game.plots.map(plot => ({ id: plot.id, crop: null, growth: 0, health: 100, moisture: 50 }));
  game.animals = game.animals.map(pen => ({ id: pen.id, animal: null, health: 100, feed: 0, progress: 0 }));
  game.orders = [];
  return game;
};

test('activity uses fixed sections, unit counts and actual storage without changing input', () => {
  const game = initialGame(NOW); const before = JSON.stringify(game);
  const activity = getFarmActivity(game, NOW);
  assert.deepEqual(activity.sections.map(({ id, title, unit }) => ({ id, title, unit })), [
    { id: 'farm', title: '成熟田地', unit: '块' },
    { id: 'livestock', title: '动物产物', unit: '栏' },
    { id: 'production', title: '工坊成品', unit: '批' },
    { id: 'orders', title: '可交订单', unit: '份' },
    { id: 'storage', title: '路边摊货款', unit: '笔' },
  ]);
  assert.deepEqual(activity.silo, { used: storageUsed(game, 'silo'), capacity: game.siloCapacity });
  assert.deepEqual(activity.barn, { used: storageUsed(game, 'barn'), capacity: game.barnCapacity });
  assert.equal(section(game, 'farm').count, 1); assert.equal(section(game, 'livestock').count, 1);
  assert.equal(JSON.stringify(game), before);
});

test('readiness uses exact timestamps rather than stale growth or progress percentages', () => {
  const game = emptyGame();
  game.plots[0] = { ...game.plots[0], crop: 'wheat', plantedAt: NOW - 100, readyAt: NOW, growth: 0 };
  game.plots[1] = { ...game.plots[1], crop: 'corn', plantedAt: NOW - 100, readyAt: NOW + 1, growth: 100 };
  game.animals[0] = { ...game.animals[0], animal: 'chicken', fedAt: NOW - 100, readyAt: NOW, progress: 0, feed: 0 };
  game.animals[1] = { ...game.animals[1], animal: 'cow', fedAt: NOW - 100, readyAt: NOW + 1, progress: 100, feed: 100 };
  assert.equal(section(game, 'farm', NOW - 1).count, 0); assert.equal(section(game, 'livestock', NOW - 1).count, 0);
  assert.equal(section(game, 'farm').count, 1); assert.equal(section(game, 'livestock').count, 1);
  assert.equal(section(game, 'farm', NOW + 1).count, 2); assert.equal(section(game, 'livestock', NOW + 1).count, 2);
});

test('locked planted fields and empty or unfed pens never produce an activity target or countdown', () => {
  const game = emptyGame(); game.unlockedPlots = 1;
  game.plots[1] = { ...game.plots[1], crop: 'wheat', plantedAt: NOW, readyAt: NOW + 1, growth: 100 };
  game.plots[2] = { ...game.plots[2], crop: 'corn', plantedAt: NOW - 1, readyAt: NOW, growth: 100 };
  game.animals[0] = { ...game.animals[0], fedAt: NOW, readyAt: NOW + 1, progress: 100 };
  game.animals[1] = { ...game.animals[1], animal: 'chicken', progress: 100 };
  const activity = getFarmActivity(game, NOW);
  assert.equal(section(game, 'farm').count, 0); assert.equal(section(game, 'farm').target, null);
  assert.equal(section(game, 'livestock').count, 0); assert.equal(section(game, 'livestock').target, null);
  assert.equal(activity.next, null);
});

test('completed production is counted in batches and collected jobs leave the board', () => {
  const game = emptyGame();
  game.machines[0].queue = [{ id: 'ready-feed', recipe: 'chicken_feed', startedAt: NOW - 1, readyAt: NOW }];
  game.machines[1].queue = [
    { id: 'ready-bread', recipe: 'bread', startedAt: NOW - 1, readyAt: NOW },
    { id: 'future-bread', recipe: 'bread', startedAt: NOW, readyAt: NOW + 1 },
  ];
  assert.equal(section(game, 'production', NOW - 1).count, 0);
  assert.equal(section(game, 'production').count, 2);
  assert.deepEqual(section(game, 'production').target, { tab: 'production', machineId: 'feed_mill' });
  assert.match(section(game, 'production').detail, /批数/);
  const collected = collectProduction(game, 'feed_mill', 'ready-feed', NOW);
  assert.equal(section(collected, 'production').count, 1);
  assert.deepEqual(section(collected, 'production').target, { tab: 'production', machineId: 'bakery' });
  assert.equal(section(collected, 'production', NOW + 1).count, 2);
});

test('orders are checked separately against shared inventory and recount after a delivery', () => {
  const game = emptyGame(); game.inventory = { wheat: 2 };
  game.orders = [
    { id: 'boat-shared', kind: 'boat', requirements: { wheat: 2 }, coins: 1, xp: 0 },
    { id: 'truck-shared', kind: 'truck', requirements: { wheat: 2 }, coins: 1, xp: 0 },
    { id: 'short-milk', kind: 'truck', requirements: { milk: 1 }, coins: 1, xp: 0 },
  ];
  assert.equal(section(game, 'orders').count, 2);
  assert.deepEqual(section(game, 'orders').target, { tab: 'orders', kind: 'boat' });
  assert.match(section(game, 'orders').detail, /分别核对库存，交货后重新计算/);
  assert.match(section(game, 'orders').detail, /同一批库存/);
  const delivered = deliverOrder(game, 'truck-shared', NOW);
  assert.equal(delivered.inventory.wheat, 0); assert.equal(section(delivered, 'orders').count, 0);
  assert.equal(section(delivered, 'orders').target, null);
});

test('all lines of an order must be satisfied and malformed empty quantities are not deliverable', () => {
  const game = emptyGame(); game.inventory = { wheat: 2, corn: 1 };
  game.orders = [
    { id: 'exact', kind: 'truck', requirements: { wheat: 2, corn: 1 }, coins: 1, xp: 0 },
    { id: 'short', kind: 'boat', requirements: { wheat: 2, corn: 2 }, coins: 1, xp: 0 },
    { id: 'empty', kind: 'truck', requirements: {}, coins: 1, xp: 0 },
    { id: 'zero', kind: 'truck', requirements: { wheat: 0 }, coins: 1, xp: 0 },
    { id: 'invalid', kind: 'truck', requirements: { wheat: Number.NaN }, coins: 1, xp: 0 },
  ];
  assert.equal(section(game, 'orders').count, 1);
  assert.deepEqual(section(game, 'orders').target, { tab: 'orders', kind: 'truck' });
});

test('roadside sold count excludes collected listings and respects the exact sale boundary', () => {
  const game = emptyGame();
  game.shopListings = [
    { id: 'collected', item: 'wheat', quantity: 1, unitPrice: 1, listedAt: NOW - 180_000, soldAt: NOW, collected: true },
    { id: 'ready', item: 'corn', quantity: 8, unitPrice: 1, listedAt: NOW - 180_000, soldAt: NOW, collected: false },
    { id: 'future', item: 'wheat', quantity: 1, unitPrice: 1, listedAt: NOW - 179_999, soldAt: NOW + 1, collected: false },
  ];
  assert.equal(section(game, 'storage', NOW - 1).count, 0); assert.equal(section(game, 'storage').count, 1);
  assert.deepEqual(section(game, 'storage').target, { tab: 'storage', section: 'roadside' });
  const collected = collectSale(game, 'ready', NOW);
  assert.equal(section(collected, 'storage').count, 0); assert.equal(section(collected, 'storage').target, null);
  assert.equal(section(collected, 'storage', NOW + 1).count, 1);
});

test('next selects the earliest remaining timer from all five activity classes and uses content names', () => {
  const game = emptyGame();
  game.plots[0] = { ...game.plots[0], crop: 'corn', plantedAt: NOW, readyAt: NOW + 400 };
  game.animals[0] = { ...game.animals[0], animal: 'chicken', fedAt: NOW, readyAt: NOW + 300 };
  game.machines[1].queue = [{ id: 'bread', recipe: 'bread', startedAt: NOW, readyAt: NOW + 200 }];
  game.shopListings = [{ id: 'sale', item: 'wheat', quantity: 1, unitPrice: 1, listedAt: NOW, soldAt: NOW + 100, collected: false }];
  assert.deepEqual(getFarmActivity(game, NOW).next, { label: '路边摊 · 小麦', readyAt: NOW + 100, target: { tab: 'storage', section: 'roadside' } });
  assert.deepEqual(getFarmActivity(game, NOW + 100).next, { label: '面包坊 · 面包', readyAt: NOW + 200, target: { tab: 'production', machineId: 'bakery' } });
  assert.deepEqual(getFarmActivity(game, NOW + 200).next, { label: '1 号畜栏 · 鸡蛋', readyAt: NOW + 300, target: { tab: 'livestock', penId: 1 } });
  assert.deepEqual(getFarmActivity(game, NOW + 300).next, { label: '1 号田 · 玉米', readyAt: NOW + 400, target: { tab: 'farm', plotId: 1 } });
  assert.equal(getFarmActivity(game, NOW + 400).next, null);
});

test('ready targets and tied countdowns preserve array order without sorting input', () => {
  const game = emptyGame();
  game.plots[0] = { ...game.plots[0], id: 9, crop: 'wheat', plantedAt: NOW - 100, readyAt: NOW + 1 };
  game.plots[1] = { ...game.plots[1], id: 1, crop: 'corn', plantedAt: NOW - 100, readyAt: NOW + 1 };
  game.animals[0] = { ...game.animals[0], animal: 'chicken', fedAt: NOW, readyAt: NOW + 1 };
  game.machines[0].queue = [{ id: 'feed', recipe: 'chicken_feed', startedAt: NOW, readyAt: NOW + 1 }];
  game.shopListings = [{ id: 'sale', item: 'wheat', quantity: 1, unitPrice: 1, listedAt: NOW, soldAt: NOW + 1, collected: false }];
  const before = JSON.stringify(game);
  assert.deepEqual(getFarmActivity(game, NOW).next!.target, { tab: 'farm', plotId: 9 });
  assert.deepEqual(section(game, 'farm', NOW + 1).target, { tab: 'farm', plotId: 9 });
  assert.equal(JSON.stringify(game), before);
});

test('collected crops and animal products disappear without a tick or any side effects', () => {
  const game = initialGame(NOW);
  const afterHarvest = harvest(game, 1, NOW);
  const afterProduct = collectProduct(afterHarvest, 1, NOW);
  const before = JSON.stringify(afterProduct);
  assert.equal(section(afterProduct, 'farm').count, 0); assert.equal(section(afterProduct, 'livestock').count, 0);
  assert.equal(JSON.stringify(afterProduct), before);
  assert.equal(afterProduct.version, 2); assert.equal(afterProduct.harvests, 1); assert.equal(afterProduct.productsCollected, 1);
});

test('an empty board has no target or next and ignores timers for exploration', () => {
  const game = emptyGame();
  game.orchard = [{ id: 1, fruit: 'apple', harvests: 0, readyAt: NOW + 1, needsHelp: false, revived: false }];
  game.fishingReadyAt = NOW + 1; game.mineReadyAt = NOW + 1; game.beehiveBuilt = true; game.beehiveReadyAt = NOW + 1;
  const activity = getFarmActivity(game, NOW);
  assert.equal(activity.next, null);
  assert.ok(activity.sections.every(item => item.count === 0 && item.target === null));
});

test('now must be a nonnegative safe integer within the JavaScript Date range', () => {
  const game = emptyGame(); const before = JSON.stringify(game);
  for (const now of [-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, MAX_DATE + 1, Number.MAX_SAFE_INTEGER + 1, '0', null, undefined]) {
    assert.throws(() => getFarmActivity(game, now as number), /时间无效/);
    assert.equal(JSON.stringify(game), before);
  }
  assert.equal(getFarmActivity(game, 0).next, null); assert.equal(getFarmActivity(game, MAX_DATE).next, null);
});

test('missing malformed or reversed object timers never produce a NaN countdown or false readiness', () => {
  for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 0.1, MAX_DATE + 1, '123']) {
    const game = emptyGame();
    game.plots[0] = { ...game.plots[0], crop: 'wheat', plantedAt: NOW, readyAt: bad as number };
    game.animals[0] = { ...game.animals[0], animal: 'chicken', fedAt: NOW, readyAt: bad as number };
    game.machines[0].queue = [{ id: 'bad', recipe: 'chicken_feed', startedAt: NOW, readyAt: bad as number }];
    game.shopListings = [{ id: 'bad', item: 'wheat', quantity: 1, unitPrice: 1, listedAt: NOW, soldAt: bad as number, collected: false }];
    const activity = getFarmActivity(game, NOW);
    assert.equal(activity.next, null); assert.ok(activity.sections.every(item => item.count === 0 && item.target === null));
  }
  const reversed = emptyGame();
  reversed.plots[0] = { ...reversed.plots[0], crop: 'wheat', plantedAt: NOW + 1, readyAt: NOW };
  reversed.animals[0] = { ...reversed.animals[0], animal: 'chicken', fedAt: NOW + 1, readyAt: NOW };
  reversed.machines[0].queue = [{ id: 'reversed', recipe: 'chicken_feed', startedAt: NOW + 1, readyAt: NOW }];
  reversed.shopListings = [{ id: 'reversed', item: 'wheat', quantity: 1, unitPrice: 1, listedAt: NOW + 1, soldAt: NOW, collected: false }];
  assert.ok(getFarmActivity(reversed, NOW).sections.every(item => item.count === 0));
  assert.equal(getFarmActivity(reversed, NOW).next, null);
});

test('read-only derivation works against deeply frozen game data and returns independent targets', () => {
  const game = initialGame(NOW);
  const freeze = (value: unknown): void => {
    if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); }
  };
  freeze(game);
  const activity = getFarmActivity(game, NOW);
  assert.deepEqual(activity.sections[0].target, { tab: 'farm', plotId: 1 });
  const target = activity.sections[0].target;
  if (target?.tab === 'farm') target.plotId = 99;
  assert.deepEqual(getFarmActivity(game, NOW).sections[0].target, { tab: 'farm', plotId: 1 });
});
