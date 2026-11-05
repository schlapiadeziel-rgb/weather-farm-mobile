import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, queueProduction, storageUsed, unlockMachine } from '../src/lib/game.ts';
import { storageUpgradeCost, upgradeStorage } from '../src/lib/farmEconomy.ts';
import { getFarmSeason } from '../src/lib/farmSeason.ts';
import type { Game, ItemId } from '../src/lib/farmTypes.ts';

const NOW = 1793512800000;

function started(): Game {
  const game = initialGame(NOW);
  game.harvests = 1;
  game.productsCollected = 1;
  game.ordersDelivered = 1;
  return game;
}

test('second season waits for the first journey and never writes rewards or save fields', () => {
  const fresh = initialGame(NOW);
  fresh.unlockedPlots = 8;
  fresh.siloCapacity = 150;
  assert.equal(getFarmSeason(fresh, NOW), null);
  const game = started();
  const before = structuredClone(game);
  const season = getFarmSeason(game, NOW);
  assert.equal(season?.step, 'expand');
  assert.equal(season?.completed, 0);
  assert.equal(season?.total, 3);
  assert.deepEqual(season?.target, { type: 'storage', section: 'upgrade' });
  assert.equal(season?.actionLabel, '去扩容');
  assert.deepEqual(game, before);
  assert.deepEqual(Object.keys(game).sort(), Object.keys(before).sort());
});

test('starter materials cover the first two silo upgrades, and the second upgrade is stopped by coins', () => {
  const game = started();
  const first = storageUpgradeCost(game, 'silo');
  assert.equal(first.materials.nail, 1);
  assert.ok((game.inventory.nail ?? 0) >= 2);
  const once = upgradeStorage(game, 'silo');
  const second = storageUpgradeCost(once, 'silo');
  assert.equal(once.siloCapacity, 125);
  assert.equal(second.materials.nail, 1);
  assert.equal(second.coins, 400);
  assert.equal(once.inventory.nail, 1);
  assert.ok(once.coins < second.coins);
  const snapshot = structuredClone(once);
  assert.throws(() => upgradeStorage(once, 'silo'), /金币/);
  assert.deepEqual(once, snapshot);
});

test('a full barn sends the player to clear space before another material harvest is missed', () => {
  const game = started();
  game.coins = 0;
  for (const id of ['nail', 'wood_panel', 'screw', 'plank', 'bolt', 'duct_tape'] as const) game.inventory[id] = 0;
  game.barnCapacity = storageUsed(game, 'barn');
  const season = getFarmSeason(game, NOW);
  assert.equal(season?.target.type, 'storage');
  assert.equal(season && season.target.type === 'storage' ? season.target.section : '', 'inventory');
  assert.match(season?.detail ?? '', /扩建材料/);
  game.barnCapacity = 100;
  game.siloCapacity = storageUsed(game, 'silo');
  const silo = getFarmSeason(game, NOW);
  assert.match(silo?.detail ?? '', /筒仓满了/);
});

test('an affordable new field is offered when storage materials and coins are short', () => {
  const game = started();
  game.xp = 20;
  game.coins = 200;
  for (const id of ['nail', 'wood_panel', 'screw', 'plank', 'bolt', 'duct_tape'] as const) game.inventory[id] = 0;
  const season = getFarmSeason(game, NOW);
  assert.equal(season?.title, '再开一块田');
  assert.deepEqual(season?.target, { type: 'storage', section: 'upgrade' });
  game.coins = 0;
  game.xp = 0;
  const harvest = getFarmSeason(game, NOW);
  assert.equal(harvest?.target.type, 'plot');
  assert.equal(harvest && harvest.target.type === 'plot' ? harvest.target.plotId : 0, 1);
  assert.match(harvest?.detail ?? '', /钉子/);
});

test('workshop guidance queues a second job, then stays done after a new machine exists', () => {
  const game = started();
  game.unlockedPlots = 7;
  const open = getFarmSeason(game, NOW);
  assert.equal(open?.step, 'workshop');
  assert.deepEqual(open?.target, { type: 'production', machineId: 'feed_mill', itemId: 'chicken_feed' });
  const once = queueProduction(game, 'feed_mill', 'chicken_feed', NOW);
  const again = getFarmSeason(once, NOW);
  assert.equal(again?.actionLabel, '去连产');
  assert.equal(again?.target.type, 'production');
  const chained = queueProduction(once, 'feed_mill', 'chicken_feed', NOW);
  assert.equal(chained.machines.find(machine => machine.id === 'feed_mill')?.queue.length, 2);
  assert.equal(getFarmSeason(chained, NOW)?.step, 'delivery');
  const cleared = structuredClone(chained);
  cleared.machines = cleared.machines.map(machine => ({ ...machine, queue: [] }));
  assert.equal(getFarmSeason(cleared, NOW)?.step, 'workshop');
  const built = unlockMachine({ ...game, xp: 80, coins: 500 }, 'dairy');
  assert.equal(getFarmSeason(built, NOW)?.step, 'delivery');
  built.machines = built.machines.map(machine => ({ ...machine, queue: [] }));
  assert.equal(getFarmSeason(built, NOW)?.step, 'delivery');
});

test('missing workshop ingredients point at the real item without queueing or spending', () => {
  const game = started();
  game.unlockedPlots = 7;
  game.coins = 0;
  game.inventory.wheat = 0;
  game.inventory.corn = 0;
  const before = structuredClone(game);
  const season = getFarmSeason(game, NOW);
  assert.deepEqual(season?.target, { type: 'item', itemId: 'wheat' });
  assert.equal(season?.actionLabel, '查看来源');
  assert.deepEqual(game, before);
});

test('stable delivery prefers a ready order by id and kind, and ignores a locked boat', () => {
  const game = started();
  game.unlockedPlots = 7;
  game.machines = [...game.machines, { id: 'dairy', slots: 2, queue: [] }];
  game.orders = [
    { id: 'truck-short', kind: 'truck', requirements: { wheat: 99 }, coins: 10, xp: 1 },
    { id: 'boat-ready', kind: 'boat', requirements: { wheat: 1 }, coins: 10, xp: 1 },
  ];
  game.inventory.wheat = 1;
  game.xp = 0;
  const before = structuredClone(game);
  assert.deepEqual(getFarmSeason(game, NOW)?.target, { type: 'order', kind: 'truck', orderId: 'truck-short' });
  assert.deepEqual(game, before);
  game.xp = 320;
  assert.deepEqual(getFarmSeason(game, NOW)?.target, { type: 'order', kind: 'boat', orderId: 'boat-ready' });
  game.orders = [];
  assert.deepEqual(getFarmSeason(game, NOW)?.target, { type: 'order', kind: 'truck' });
  game.ordersDelivered = 3;
  assert.equal(getFarmSeason(game, NOW)?.step, 'delivery');
  assert.match(getFarmSeason(game, NOW)?.detail ?? '', /1 张/);
  game.ordersDelivered = 4;
  assert.equal(getFarmSeason(game, NOW), null);
});

test('invalid clocks cannot invent a mid-game target', () => {
  for (const now of [-1, Number.NaN, Infinity, 0.5]) assert.throws(() => getFarmSeason(started(), now), /时间无效/);
});

test('season targets stay inside the existing storage sections and item ids', () => {
  const game = started();
  const target = getFarmSeason(game, NOW)?.target;
  assert.equal(target?.type, 'storage');
  if (target?.type === 'storage') assert.ok(target.section === 'upgrade' || target.section === 'inventory');
  const poor = started();
  poor.coins = 0;
  for (const id of ['nail', 'wood_panel', 'screw', 'plank', 'bolt', 'duct_tape'] as ItemId[]) poor.inventory[id] = 0;
  const plot = getFarmSeason(poor, NOW)?.target;
  assert.equal(plot?.type, 'plot');
});
