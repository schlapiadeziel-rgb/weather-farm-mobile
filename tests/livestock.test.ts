import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, buyAnimal, feedAnimal, collectProduct, clearAnimal, tickGame, speedUpAnimal, buildPen, LIVESTOCK, storageUsed, restoreGame } from '../src/lib/game.ts';
const NOW = Date.parse('2026-10-10T08:00:00Z');
const chicken = LIVESTOCK.find(a => a.id === 'chicken')!;

test('ready livestock yields inventory without coins and cannot be collected twice', () => {
  const before = initialGame(NOW); const snapshot = structuredClone(before); const next = collectProduct(before, 1, NOW);
  assert.equal(next.productsCollected, 1); assert.equal(next.inventory.egg, before.inventory.egg! + 1); assert.equal(next.coins, before.coins); assert.ok(next.xp > before.xp);
  assert.equal(next.animals[0].progress, 0); assert.equal(next.animals[0].animal, 'chicken'); assert.equal(next.animals[0].readyAt, undefined); assert.deepEqual(before, snapshot);
  assert.throws(() => collectProduct(next, 1, NOW), /没准备好/);
});

test('buying charges coins while feeding consumes exactly one matching inventory feed', () => {
  const game = initialGame(NOW); const bought = buyAnimal(game, 2, 'chicken');
  assert.equal(bought.coins, game.coins - chicken.cost); assert.equal(bought.animals[1].feed, 0); assert.equal(bought.animals[1].readyAt, undefined);
  const fed = feedAnimal(bought, 2, NOW);
  assert.equal(fed.coins, bought.coins); assert.equal(fed.inventory.chicken_feed, bought.inventory.chicken_feed! - 1); assert.equal(fed.animals[1].readyAt, NOW + chicken.durationMs);
  assert.throws(() => feedAnimal(fed, 2, NOW), /重复喂食/); assert.throws(() => buyAnimal(bought, 2, 'chicken'), /已经有动物/);
  assert.throws(() => buyAnimal(game, 2, 'cow'), /级/); assert.throws(() => buyAnimal({ ...game, coins: 1 }, 2, 'chicken'), /金币不足/);
  assert.throws(() => feedAnimal({ ...bought, inventory: { ...bought.inventory, chicken_feed: 0 } }, 2, NOW), /库存不足/);
  assert.throws(() => feedAnimal(game, 3, NOW), /还没有动物/);
});

test('animal production waits real time, never dies and preserves a ready product until collection', () => {
  const fed = feedAnimal(collectProduct(initialGame(NOW), 1, NOW), 1, NOW);
  assert.equal(tickGame(fed, NOW + chicken.durationMs / 2).animals[0].progress, 50);
  assert.throws(() => collectProduct(fed, 1, NOW + chicken.durationMs - 1), /没准备好/);
  const muchLater = tickGame(fed, NOW + 30 * 86400000); assert.equal(muchLater.animals[0].progress, 100); assert.equal(muchLater.animals[0].health, 100);
  assert.equal(collectProduct(muchLater, 1, NOW + 30 * 86400000).inventory.egg, fed.inventory.egg! + 1);
  assert.throws(() => feedAnimal(muchLater, 1, NOW + 30 * 86400000), /先收取/); assert.throws(() => clearAnimal(fed, 1), /不会死亡/);
});

test('barn capacity failure retains ready production and every fifth product supplies an orchard tool', () => {
  const initial = { ...initialGame(NOW), productsCollected: 4 }; const full = { ...initial, barnCapacity: storageUsed(initial, 'barn') }; const snapshot = structuredClone(full);
  assert.throws(() => collectProduct(full, 1, NOW), /货仓空间不足/); assert.deepEqual(full, snapshot);
  const next = collectProduct(initial, 1, NOW); assert.equal(next.inventory.axe, initial.inventory.axe! + 1);
  const roomForProduct = { ...initial, barnCapacity: storageUsed(initial, 'barn') + 1 }; const withoutBonus = collectProduct(roomForProduct, 1, NOW);
  assert.equal(withoutBonus.inventory.egg, initial.inventory.egg! + 1); assert.equal(withoutBonus.inventory.axe, initial.inventory.axe);
});

test('animal acceleration spends gems and never creates products before collection', () => {
  const fed = feedAnimal(collectProduct(initialGame(NOW), 1, NOW), 1, NOW); const snapshot = structuredClone(fed); const fast = speedUpAnimal(fed, 1, NOW);
  assert.ok(fast.gems < fed.gems); assert.equal(fast.coins, fed.coins); assert.deepEqual(fast.inventory, fed.inventory); assert.equal(fast.animals[0].progress, 100); assert.deepEqual(fed, snapshot);
  assert.throws(() => speedUpAnimal({ ...fed, gems: 0 }, 1, NOW), /钻石不足/); assert.throws(() => speedUpAnimal(fast, 1, NOW), /无需钻石/);
});

test('additional pens require level and coins, preserve unique identifiers and cap at fifteen', () => {
  const game = initialGame(NOW); assert.throws(() => buildPen(game), /提升等级/);
  const leveled = { ...game, xp: 20 }; const before = structuredClone(leveled); const next = buildPen(leveled);
  assert.equal(next.animals.length, 4); assert.equal(next.coins, leveled.coins - 100); assert.equal(next.animals[3].animal, null); assert.deepEqual(leveled, before);
  assert.throws(() => buildPen({ ...leveled, coins: 0 }), /金币不足/);
  let expanded = { ...game, xp: 20 * 12 * 12, coins: 10000 }; while (expanded.animals.length < 15) expanded = buildPen(expanded);
  assert.equal(new Set(expanded.animals.map(a => a.id)).size, 15); assert.throws(() => buildPen(expanded), /15 个上限/);
  assert.equal(restoreGame(expanded, NOW).animals.length, 15);
});
