import assert from 'node:assert/strict';
import test from 'node:test';
import type { Game, ItemId, StorageKind } from '../src/lib/farmTypes.ts';
import { getItem } from '../src/lib/farmContent.ts';
import {
  ACHIEVEMENTS, BEEHIVE_COST, BEEKEEPING_LEVEL, BOAT_LEVEL, FISHING_COOLDOWN_MS, FISHING_LEVEL,
  HONEY_COOLDOWN_MS, MAX_STORAGE_CAPACITY, MINING_COOLDOWN_MS, MINING_LEVEL,
  ORCHARD_FRUITS, ORCHARD_LIMIT, ROADSIDE_LIMIT, SALE_DELAY_MS, buildBeehive, buySupply, catchFish,
  claimAchievement, clearOrchard, collectHoney, collectSale, deliverOrder, discardOrder,
  ensureOrders, expandFarm, farmExpansionCost, generateOrders, harvestOrchard, listForSale, mineOre, plantOrchard,
  reviveOrchard, storageUpgradeCost, upgradeStorage,
} from '../src/lib/farmEconomy.ts';

const NOW = Date.UTC(2026, 9, 10, 8);
const xpAtLevel = (level: number): number => 20 * (level - 1) ** 2;

/** Independent v2 fixture: economy tests must not depend on the game engine. */
function farm(overrides: Partial<Game> = {}): Game {
  return {
    version: 2, day: 1, coins: 100_000, gems: 0, xp: 100_000,
    harvests: 0, waterUsed: 0, productsCollected: 0,
    plots: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, crop: null, growth: 0, health: 100, moisture: 50 })),
    animals: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, animal: null, health: 100, feed: 0, progress: 0 })),
    log: [], inventory: {}, siloCapacity: 1000, barnCapacity: 1000,
    unlockedPlots: 12, machines: [], orders: [], ordersDelivered: 0, orderSerial: 1,
    shopListings: [], orchard: [], fishingReadyAt: 0, mineReadyAt: 0,
    beehiveBuilt: false, beehiveReadyAt: 0, achievements: [],
    ...overrides,
  };
}

function assertAtomicFailure(before: Game, action: () => unknown, message?: RegExp): void {
  const snapshot = structuredClone(before);
  if (message) assert.throws(action, message);
  else assert.throws(action);
  assert.deepEqual(before, snapshot, 'failed operations must not consume inventory, coins or counters');
}

function assertSoundEconomy(game: Game): void {
  for (const amount of [game.coins, game.gems, game.xp, game.siloCapacity, game.barnCapacity, ...Object.values(game.inventory)]) {
    assert.ok(typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0, 'economic balances must be finite, safe nonnegative integers');
  }
}

test('buying unlocked supplies charges the full price and leaves the input untouched', () => {
  const before = farm({ inventory: { wheat: 4, chicken_feed: 1 } });
  const snapshot = structuredClone(before);
  const bought = buySupply(before, 'wheat', 3);
  assert.equal(bought.coins, before.coins - getItem('wheat').price * 3 * 3);
  assert.equal(bought.inventory.wheat, 7);
  assert.equal(bought.inventory.chicken_feed, 1);
  assert.deepEqual(before, snapshot);
  assert.notStrictEqual(bought, before);
  assert.notStrictEqual(bought.inventory, before.inventory);
  assertSoundEconomy(bought);
});

test('quantities reject zero, negative, fractional, nonfinite and unsafe values atomically', () => {
  const before = farm({ inventory: { wheat: 20 } });
  for (const quantity of [0, -1, 1.5, 1001, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assertAtomicFailure(before, () => buySupply(before, 'wheat', quantity));
    assertAtomicFailure(before, () => listForSale(before, 'wheat', quantity, getItem('wheat').price, NOW));
  }
});

test('supply purchases cannot bypass funds, storage, item categories or unlock levels', () => {
  const unitCost = getItem('wheat').price * 3;
  const poor = farm({ coins: unitCost - 1, inventory: { wheat: 2 } });
  assertAtomicFailure(poor, () => buySupply(poor, 'wheat', 1));
  const fullSilo = farm({ siloCapacity: 10, inventory: { wheat: 10 } });
  assertAtomicFailure(fullSilo, () => buySupply(fullSilo, 'wheat', 1));
  const fullBarn = farm({ barnCapacity: 10, inventory: { chicken_feed: 10 } });
  assertAtomicFailure(fullBarn, () => buySupply(fullBarn, 'chicken_feed', 1));
  const beginner = farm({ xp: 0 });
  assertAtomicFailure(beginner, () => buySupply(beginner, 'goat_feed', 1));
  const products = farm({ inventory: { bread: 3 } });
  assertAtomicFailure(products, () => buySupply(products, 'bread', 1));
  assertAtomicFailure(beginner, () => buySupply(beginner, 'unknown' as never, 1));
});

test('delivery consumes exactly the requested stock, rewards once and retires the order ID', () => {
  const order = { id: 'truck-1', kind: 'truck' as const, requirements: { wheat: 3, egg: 2 }, coins: 120, xp: 15 };
  const before = farm({ orders: [order], inventory: { wheat: 10, egg: 4 }, ordersDelivered: 2 });
  const snapshot = structuredClone(before);
  const after = deliverOrder(before, order.id, NOW);
  assert.equal(after.inventory.wheat, 7);
  assert.equal(after.inventory.egg, 2);
  assert.equal(after.coins, before.coins + order.coins);
  assert.equal(after.xp, before.xp + order.xp);
  assert.equal(after.ordersDelivered, 3);
  assert.ok(after.orders.every(item => item.id !== order.id));
  assert.ok(after.orderSerial > before.orderSerial);
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(after, () => deliverOrder(after, order.id, NOW));
  assertSoundEconomy(after);
});

test('an incomplete delivery cannot partly deduct an earlier available ingredient', () => {
  const before = farm({ orders: [{ id: 'short', kind: 'truck', requirements: { wheat: 3, egg: 2 }, coins: 120, xp: 15 }], inventory: { wheat: 10, egg: 1 } });
  assertAtomicFailure(before, () => deliverOrder(before, 'short', NOW));
  assertAtomicFailure(before, () => deliverOrder(before, 'missing', NOW));
  assert.equal(before.inventory.wheat, 10);
  assert.equal(before.coins, 100_000);
});

test('malformed order quantities cannot mint stock or partly consume a preceding ingredient', () => {
  for (const quantity of [-1, 0, 0.5, Number.NaN, Infinity]) {
    const before = farm({ inventory: { wheat: 10, egg: 3 }, orders: [{ id: 'invalid-order', kind: 'truck', requirements: { wheat: 3, egg: quantity }, coins: 90, xp: 10 }] });
    assertAtomicFailure(before, () => deliverOrder(before, 'invalid-order', NOW));
  }
});

test('generated orders are deterministic, unique and use only unlocked positive requirements', () => {
  const beginner = farm({ xp: 0 });
  const orders = generateOrders(beginner, 10, 'truck');
  assert.ok(orders.length > 0);
  assert.deepEqual(generateOrders(beginner, 10, 'truck'), orders);
  assert.equal(new Set(orders.map(order => order.id)).size, orders.length);
  for (const order of orders) {
    assert.equal(order.kind, 'truck');
    assert.ok(order.coins > 0 && order.xp > 0);
    assert.ok(Object.keys(order.requirements).length > 0);
    for (const [id, quantity] of Object.entries(order.requirements)) {
      assert.ok(getItem(id as ItemId).level <= 1);
      assert.ok(Number.isSafeInteger(quantity) && quantity! > 0);
    }
  }
});

test('boat orders unlock at level five, retain truck orders and replace a delivered boat only once', () => {
  assert.equal(BOAT_LEVEL, 5);
  const below = farm({ xp: xpAtLevel(BOAT_LEVEL - 1) });
  assertAtomicFailure(below, () => ensureOrders(below, 'boat'));
  const truck = { id: 'existing-truck', kind: 'truck' as const, requirements: { wheat: 2 }, coins: 40, xp: 4 };
  const before = farm({ xp: xpAtLevel(BOAT_LEVEL), orders: [truck], orderSerial: 41 });
  const snapshot = structuredClone(before);
  const board = ensureOrders(before, 'boat');
  assert.equal(board.orders.filter(order => order.kind === 'boat').length, 1);
  assert.deepEqual(board.orders.filter(order => order.kind === 'truck'), [truck]);
  assert.equal(board.orderSerial, before.orderSerial + 1);
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(board, () => ensureOrders(board, 'boat'));
  const boat = board.orders.find(order => order.kind === 'boat')!;
  const stocked = { ...board, inventory: { ...board.inventory, ...boat.requirements } };
  const stockedSnapshot = structuredClone(stocked);
  const delivered = deliverOrder(stocked, boat.id, NOW);
  assert.equal(delivered.coins, stocked.coins + boat.coins);
  assert.equal(delivered.xp, stocked.xp + boat.xp);
  assert.equal(delivered.ordersDelivered, stocked.ordersDelivered + 1);
  for (const id of Object.keys(boat.requirements) as ItemId[]) assert.equal(delivered.inventory[id], 0);
  assert.deepEqual(delivered.orders.filter(order => order.kind === 'truck'), [truck]);
  const replacement = delivered.orders.filter(order => order.kind === 'boat');
  assert.equal(replacement.length, 1);
  assert.notEqual(replacement[0].id, boat.id);
  assert.equal(delivered.orderSerial, board.orderSerial + 1);
  assert.deepEqual(stocked, stockedSnapshot);
  assertAtomicFailure(delivered, () => deliverOrder(delivered, boat.id, NOW));
  assertSoundEconomy(delivered);
});

test('pure generated order batches have distinct IDs across serials and transport kinds', () => {
  const before = farm({ xp: xpAtLevel(BOAT_LEVEL) });
  const snapshot = structuredClone(before);
  const ids: string[] = [];
  for (const serial of [10, 11, 12]) {
    for (const kind of ['truck', 'boat'] as const) {
      const orders = generateOrders(before, serial, kind);
      assert.equal(orders.length, kind === 'truck' ? 3 : 1);
      assert.deepEqual(generateOrders(before, serial, kind), orders);
      ids.push(...orders.map(order => order.id));
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(before, snapshot);
});

test('discarding an order retires its ID without stock consumption or a delivery reward', () => {
  const before = farm({ inventory: { wheat: 10 }, orders: [{ id: 'discard-me', kind: 'truck', requirements: { wheat: 3 }, coins: 90, xp: 10 }] });
  const snapshot = structuredClone(before);
  const after = discardOrder(before, 'discard-me', NOW);
  assert.deepEqual(after.inventory, before.inventory);
  assert.equal(after.coins, before.coins);
  assert.equal(after.xp, before.xp);
  assert.equal(after.ordersDelivered, before.ordersDelivered);
  assert.ok(after.orders.every(order => order.id !== 'discard-me'));
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(after, () => discardOrder(after, 'discard-me', NOW));
});

test('a local NPC listing reserves stock, cannot pay before soldAt and pays only once', () => {
  assert.equal(SALE_DELAY_MS, 3 * 60_000);
  const before = farm({ inventory: { wheat: 10 } });
  const snapshot = structuredClone(before);
  const unitPrice = getItem('wheat').price;
  const listed = listForSale(before, 'wheat', 3, unitPrice, NOW);
  const listing = listed.shopListings[0];
  assert.equal(listing.quantity, 3);
  assert.equal(listing.listedAt, NOW);
  assert.equal(listing.soldAt, NOW + SALE_DELAY_MS);
  assert.equal(listing.collected, false);
  assert.equal(listed.inventory.wheat, 7);
  assert.equal(listed.coins, before.coins, 'listing stock is not an instant sale');
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(listed, () => collectSale(listed, listing.id, listing.soldAt - 1));
  const listedSnapshot = structuredClone(listed);
  const collected = collectSale(listed, listing.id, listing.soldAt);
  assert.equal(collected.coins, before.coins + 3 * unitPrice);
  assert.equal(collected.inventory.wheat, 7);
  assert.deepEqual(listed, listedSnapshot);
  assertAtomicFailure(collected, () => collectSale(collected, listing.id, listing.soldAt + 1));
  assertAtomicFailure(collected, () => collectSale(collected, 'unknown-listing', listing.soldAt));
  assertSoundEconomy(collected);
});

test('invalid listing prices and missing stock never reserve inventory or pay coins', () => {
  const before = farm({ inventory: { wheat: 2 } });
  for (const price of [0, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assertAtomicFailure(before, () => listForSale(before, 'wheat', 1, price, NOW));
  }
  assertAtomicFailure(before, () => listForSale(before, 'wheat', 3, getItem('wheat').price, NOW));
});

test('six local roadside slots fill atomically and collecting a sale frees exactly one slot', () => {
  let game = farm({ inventory: { wheat: 10 } });
  for (let index = 0; index < ROADSIDE_LIMIT; index++) game = listForSale(game, 'wheat', 1, getItem('wheat').price, NOW);
  assert.equal(ROADSIDE_LIMIT, 6);
  assert.equal(new Set(game.shopListings.map(slot => slot.id)).size, ROADSIDE_LIMIT);
  assertAtomicFailure(game, () => listForSale(game, 'wheat', 1, getItem('wheat').price, NOW));
  const first = game.shopListings[0];
  const collected = collectSale(game, first.id, first.soldAt);
  const refilled = listForSale(collected, 'wheat', 1, getItem('wheat').price, first.soldAt);
  assert.equal(refilled.shopListings.filter(slot => !slot.collected).length, ROADSIDE_LIMIT);
  assert.equal(refilled.inventory.wheat, 3);
  assertAtomicFailure(refilled, () => collectSale(refilled, first.id, first.soldAt));
  assertSoundEconomy(refilled);
});

test('orchard matures, needs help after three harvests, revives once and dies after the fourth', () => {
  const definition = ORCHARD_FRUITS.find(fruit => fruit.id === 'apple')!;
  const before = farm({ inventory: { [definition.tool]: 1 } });
  const snapshot = structuredClone(before);
  let game = plantOrchard(before, 'apple', NOW);
  const id = game.orchard[0].id;
  assert.equal(game.coins, before.coins - definition.cost);
  assert.equal(game.orchard[0].readyAt, NOW + definition.durationMs);
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(game, () => harvestOrchard(game, id, game.orchard[0].readyAt - 1));
  assertAtomicFailure(game, () => reviveOrchard(game, id, NOW));
  assertAtomicFailure(game, () => clearOrchard(game, id));
  for (let harvest = 1; harvest <= 3; harvest++) {
    const old = game;
    const oldSnapshot = structuredClone(old);
    game = harvestOrchard(old, id, old.orchard[0].readyAt);
    assert.equal(game.orchard[0].harvests, harvest);
    assert.equal(game.inventory.apple, definition.quantity * harvest);
    assert.deepEqual(old, oldSnapshot);
  }
  assert.equal(game.orchard[0].needsHelp, true);
  assert.equal(game.orchard[0].revived, false);
  assertAtomicFailure(game, () => harvestOrchard(game, id, game.orchard[0].readyAt + definition.durationMs));
  const revivalTime = game.orchard[0].readyAt + definition.durationMs;
  const revived = reviveOrchard(game, id, revivalTime);
  assert.equal(revived.orchard[0].revived, true);
  assert.equal(revived.orchard[0].needsHelp, false);
  assert.equal(revived.orchard[0].readyAt, revivalTime + 2 * 60_000);
  assertAtomicFailure(revived, () => reviveOrchard(revived, id, revivalTime));
  const fourth = harvestOrchard(revived, id, revived.orchard[0].readyAt);
  assert.equal(fourth.orchard[0].harvests, 4);
  assert.equal(fourth.inventory.apple, definition.quantity * 4);
  assertAtomicFailure(fourth, () => harvestOrchard(fourth, id, fourth.orchard[0].readyAt + definition.durationMs));
  assertAtomicFailure(fourth, () => reviveOrchard(fourth, id, revivalTime));
  const withoutTool = { ...fourth, inventory: { ...fourth.inventory, [definition.tool]: 0 } };
  assertAtomicFailure(withoutTool, () => clearOrchard(withoutTool, id));
  const cleared = clearOrchard(fourth, id);
  assert.equal(cleared.orchard.length, 0);
  assert.equal(cleared.inventory[definition.tool] ?? 0, 0);
  assert.equal(cleared.inventory.apple, definition.quantity * 4);
  assertAtomicFailure(cleared, () => clearOrchard(cleared, id));
  assertSoundEconomy(cleared);
});

test('full storage cannot lose ripe orchard fruit or advance its harvest lifecycle', () => {
  const planted = plantOrchard(farm({ siloCapacity: 10, inventory: { wheat: 8 } }), 'apple', NOW);
  assertAtomicFailure(planted, () => harvestOrchard(planted, planted.orchard[0].id, planted.orchard[0].readyAt));
  assert.equal(planted.orchard[0].harvests, 0);
  assert.equal(planted.inventory.apple, undefined);
});

test('orchard planting obeys the plot limit and level unlocks without spending on failure', () => {
  let game = farm();
  for (let index = 0; index < ORCHARD_LIMIT; index++) game = plantOrchard(game, 'apple', NOW);
  assert.equal(ORCHARD_LIMIT, 6);
  assert.equal(new Set(game.orchard.map(plot => plot.id)).size, ORCHARD_LIMIT);
  assertAtomicFailure(game, () => plantOrchard(game, 'apple', NOW));
  const locked = ORCHARD_FRUITS.find(fruit => fruit.level > 1)!;
  const beginner = farm({ xp: 0 });
  assertAtomicFailure(beginner, () => plantOrchard(beginner, locked.id, NOW));
});

test('storage upgrades charge every required material and coins for the advertised capacity', () => {
  for (const kind of ['silo', 'barn'] as StorageKind[]) {
    const base = farm({ siloCapacity: 100, barnCapacity: 100 });
    const cost = storageUpgradeCost(base, kind);
    const inventory: Game['inventory'] = { wool: 7 };
    for (const [id, quantity] of Object.entries(cost.materials)) inventory[id as ItemId] = quantity! + 2;
    const before = { ...base, inventory };
    const snapshot = structuredClone(before);
    const upgraded = upgradeStorage(before, kind);
    assert.equal(upgraded.coins, before.coins - cost.coins);
    assert.equal(upgraded[kind === 'silo' ? 'siloCapacity' : 'barnCapacity'], cost.capacity);
    assert.equal(upgraded[kind === 'silo' ? 'barnCapacity' : 'siloCapacity'], 100);
    for (const id of Object.keys(cost.materials) as ItemId[]) assert.equal(upgraded.inventory[id], 2);
    assert.equal(upgraded.inventory.wool, 7);
    assert.deepEqual(before, snapshot);
    assertSoundEconomy(upgraded);
  }
});

test('failed storage upgrades do not consume available materials and respect the capacity cap', () => {
  for (const kind of ['silo', 'barn'] as StorageKind[]) {
    const base = farm({ siloCapacity: 100, barnCapacity: 100 });
    const cost = storageUpgradeCost(base, kind);
    const stocked = { ...base, inventory: { ...cost.materials } };
    const missingId = Object.keys(cost.materials)[1] as ItemId;
    assert.ok(missingId);
    const missing = { ...stocked, inventory: { ...stocked.inventory, [missingId]: 0 } };
    assertAtomicFailure(missing, () => upgradeStorage(missing, kind));
    const poor = { ...stocked, coins: cost.coins - 1 };
    assertAtomicFailure(poor, () => upgradeStorage(poor, kind));
    const capped = farm({ siloCapacity: MAX_STORAGE_CAPACITY, barnCapacity: MAX_STORAGE_CAPACITY, inventory: stocked.inventory });
    assertAtomicFailure(capped, () => upgradeStorage(capped, kind));
  }
  assert.equal(MAX_STORAGE_CAPACITY, 1000);
});

test('the final storage upgrade reaches the cap without exceeding it or allowing another charge', () => {
  const base = farm({ siloCapacity: MAX_STORAGE_CAPACITY - 10 });
  const cost = storageUpgradeCost(base, 'silo');
  const before = { ...base, inventory: { ...cost.materials } };
  const upgraded = upgradeStorage(before, 'silo');
  assert.equal(upgraded.siloCapacity, MAX_STORAGE_CAPACITY);
  assertAtomicFailure(upgraded, () => upgradeStorage(upgraded, 'silo'));
  assertSoundEconomy(upgraded);
});

test('farm expansion unlocks six existing fields once each and cannot charge beyond twelve', () => {
  let game = farm({ unlockedPlots: 6 });
  for (let unlocked = 7; unlocked <= 12; unlocked++) {
    const before = game;
    const snapshot = structuredClone(before);
    const cost = farmExpansionCost(before);
    game = expandFarm(before);
    assert.equal(game.unlockedPlots, unlocked);
    assert.equal(game.coins, before.coins - cost.coins);
    assert.deepEqual(game.plots, before.plots);
    assert.deepEqual(before, snapshot);
  }
  assertAtomicFailure(game, () => expandFarm(game));
  const poor = farm({ unlockedPlots: 6, coins: 0 });
  assertAtomicFailure(poor, () => expandFarm(poor));
  const locked = farm({ unlockedPlots: 10, xp: 0 });
  assertAtomicFailure(locked, () => expandFarm(locked));
  assertSoundEconomy(game);
});

test('the seventh field requires level two and its full coin payment atomically', () => {
  const levelOne = farm({ unlockedPlots: 6, xp: xpAtLevel(1) });
  const cost = farmExpansionCost(levelOne);
  assert.equal(cost.plots, 7);
  assert.equal(cost.level, 2);
  assertAtomicFailure(levelOne, () => expandFarm(levelOne));
  const poor = farm({ unlockedPlots: 6, xp: xpAtLevel(2), coins: cost.coins - 1 });
  assertAtomicFailure(poor, () => expandFarm(poor));
  const affordable = farm({ unlockedPlots: 6, xp: xpAtLevel(2), coins: cost.coins });
  const expanded = expandFarm(affordable);
  assert.equal(expanded.unlockedPlots, 7);
  assert.equal(expanded.coins, 0);
  assertSoundEconomy(expanded);
});

test('fishing yields two fillets and enforces a ten-minute cooldown including its boundary', () => {
  assert.equal(FISHING_COOLDOWN_MS, 10 * 60_000);
  const before = farm({ xp: xpAtLevel(FISHING_LEVEL) });
  const snapshot = structuredClone(before);
  const first = catchFish(before, NOW);
  assert.equal(first.inventory.fish_fillet, 2);
  assert.equal(first.fishingReadyAt, NOW + FISHING_COOLDOWN_MS);
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(first, () => catchFish(first, first.fishingReadyAt - 1));
  const second = catchFish(first, first.fishingReadyAt);
  assert.equal(second.inventory.fish_fillet, 4);
  assert.equal(second.fishingReadyAt, first.fishingReadyAt + FISHING_COOLDOWN_MS);
  const full = farm({ barnCapacity: 1 });
  assertAtomicFailure(full, () => catchFish(full, NOW));
  const beginner = farm({ xp: xpAtLevel(FISHING_LEVEL - 1) });
  assertAtomicFailure(beginner, () => catchFish(beginner, NOW));
  assertSoundEconomy(second);
});

test('mining uses a shovel first, preserves dynamite and enforces the five-minute cooldown', () => {
  assert.equal(MINING_COOLDOWN_MS, 5 * 60_000);
  const before = farm({ xp: xpAtLevel(MINING_LEVEL), inventory: { shovel: 2, dynamite: 1 } });
  const snapshot = structuredClone(before);
  const first = mineOre(before, NOW);
  assert.equal(first.inventory.shovel, 1);
  assert.equal(first.inventory.dynamite, 1);
  assert.equal(first.inventory.coal, 1);
  assert.equal(first.inventory.iron_ore, 1);
  assert.equal(first.inventory.gold_ore ?? 0, 0);
  assert.equal(first.mineReadyAt, NOW + MINING_COOLDOWN_MS);
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(first, () => mineOre(first, first.mineReadyAt - 1));
  const second = mineOre(first, first.mineReadyAt);
  assert.equal(second.inventory.shovel ?? 0, 0);
  assert.equal(second.inventory.coal, 2);
  assert.equal(second.inventory.iron_ore, 2);
  assertSoundEconomy(second);
});

test('dynamite mining checks net storage after consumption and never loses tools on failure', () => {
  const exact = farm({ barnCapacity: 5, inventory: { dynamite: 1 } });
  const result = mineOre(exact, NOW);
  assert.equal(result.inventory.dynamite ?? 0, 0);
  assert.equal(result.inventory.coal, 2);
  assert.equal(result.inventory.iron_ore, 2);
  assert.equal(result.inventory.gold_ore, 1);
  assert.equal(Object.values(result.inventory).reduce((sum, amount) => sum + amount!, 0), 5);
  const tooSmall = farm({ barnCapacity: 4, inventory: { dynamite: 1 } });
  assertAtomicFailure(tooSmall, () => mineOre(tooSmall, NOW));
  assert.equal(tooSmall.inventory.dynamite, 1);
  assert.equal(tooSmall.mineReadyAt, 0);
  const empty = farm();
  assertAtomicFailure(empty, () => mineOre(empty, NOW));
  const beginner = farm({ xp: xpAtLevel(MINING_LEVEL - 1), inventory: { shovel: 1 } });
  assertAtomicFailure(beginner, () => mineOre(beginner, NOW));
  assertSoundEconomy(result);
});

test('a local beehive costs coins, waits twenty minutes and produces honey without duplicate collection', () => {
  assert.equal(HONEY_COOLDOWN_MS, 20 * 60_000);
  const before = farm({ xp: xpAtLevel(BEEKEEPING_LEVEL) });
  const snapshot = structuredClone(before);
  const hive = buildBeehive(before, NOW);
  assert.equal(hive.beehiveBuilt, true);
  assert.equal(hive.beehiveReadyAt, NOW + HONEY_COOLDOWN_MS);
  assert.equal(hive.coins, before.coins - BEEHIVE_COST);
  assert.deepEqual(before, snapshot);
  assertAtomicFailure(hive, () => buildBeehive(hive, NOW));
  assertAtomicFailure(hive, () => collectHoney(hive, hive.beehiveReadyAt - 1));
  const hiveSnapshot = structuredClone(hive);
  const first = collectHoney(hive, hive.beehiveReadyAt);
  assert.equal(first.inventory.honey, 2);
  assert.equal(first.xp, hive.xp + 8);
  assert.equal(first.productsCollected, hive.productsCollected + 2);
  assert.equal(first.beehiveReadyAt, hive.beehiveReadyAt + HONEY_COOLDOWN_MS);
  assert.deepEqual(hive, hiveSnapshot);
  assertAtomicFailure(first, () => collectHoney(first, hive.beehiveReadyAt));
  const second = collectHoney(first, first.beehiveReadyAt);
  assert.equal(second.inventory.honey, 4);
  assert.equal(second.productsCollected, hive.productsCollected + 4);
  assertSoundEconomy(second);
});

test('full storage retains mature honey, while unavailable hives, level and funds fail atomically', () => {
  const full = buildBeehive(farm({ barnCapacity: 1 }), NOW);
  assertAtomicFailure(full, () => collectHoney(full, full.beehiveReadyAt));
  assert.equal(full.beehiveReadyAt, NOW + HONEY_COOLDOWN_MS);
  assert.equal(full.inventory.honey, undefined);
  assert.equal(collectHoney({ ...full, barnCapacity: 2 }, full.beehiveReadyAt).inventory.honey, 2);
  const unbuilt = farm();
  assertAtomicFailure(unbuilt, () => collectHoney(unbuilt, NOW));
  const beginner = farm({ xp: xpAtLevel(BEEKEEPING_LEVEL - 1) });
  assertAtomicFailure(beginner, () => buildBeehive(beginner, NOW));
  const poor = farm({ coins: BEEHIVE_COST - 1 });
  assertAtomicFailure(poor, () => buildBeehive(poor, NOW));
});

test('malformed beehive flags and ready times are rejected even by unrelated economy operations', () => {
  const invalidGames = [
    ...[undefined, null, 0, 1, 'true'].map(value => farm({ beehiveBuilt: value as never })),
    ...[-1, 0.5, Number.NaN, Infinity, 8_640_000_000_000_001].map(value => farm({ beehiveReadyAt: value })),
  ];
  for (const before of invalidGames) {
    assertAtomicFailure(before, () => buildBeehive(before, NOW));
    assertAtomicFailure(before, () => collectHoney(before, NOW));
    assertAtomicFailure(before, () => buySupply(before, 'wheat', 1));
    assertAtomicFailure(before, () => ensureOrders(before, 'truck'));
  }
});

test('achievements require their threshold and grant coins and gems only once', () => {
  for (const [id, metric] of [
    ['first_harvest', 'harvests'], ['animal_keeper', 'productsCollected'], ['truck_starter', 'ordersDelivered'],
  ] as const) {
    const achievement = ACHIEVEMENTS.find(item => item.id === id)!;
    assert.ok(achievement);
    const below = farm({ [metric]: achievement.target - 1 });
    assertAtomicFailure(below, () => claimAchievement(below, id));
    const before = farm({ [metric]: achievement.target });
    const snapshot = structuredClone(before);
    const claimed = claimAchievement(before, id);
    assert.equal(claimed.coins, before.coins + achievement.coins);
    assert.equal(claimed.gems, before.gems + achievement.gems);
    assert.deepEqual(claimed.achievements, [id]);
    assert.deepEqual(before, snapshot);
    assertAtomicFailure(claimed, () => claimAchievement(claimed, id));
    assertSoundEconomy(claimed);
  }
  const before = farm();
  assertAtomicFailure(before, () => claimAchievement(before, 'not-an-achievement'));
});

test('invalid or overflowing operation times cannot corrupt cooldowns or reserve sale stock', () => {
  const before = farm({ inventory: { wheat: 10, shovel: 1 } });
  for (const now of [-1, 0.5, Number.NaN, Infinity, 8_640_000_000_000_001, 8_640_000_000_000_000]) {
    assertAtomicFailure(before, () => listForSale(before, 'wheat', 1, getItem('wheat').price, now));
    assertAtomicFailure(before, () => plantOrchard(before, 'apple', now));
    assertAtomicFailure(before, () => catchFish(before, now));
    assertAtomicFailure(before, () => mineOre(before, now));
    assertAtomicFailure(before, () => buildBeehive(before, now));
  }
});

test('negative stock and reward overflow cannot create corrupted balances or consume goods', () => {
  const negative = farm({ inventory: { wheat: -1 } });
  assertAtomicFailure(negative, () => buySupply(negative, 'wheat', 1));
  assertAtomicFailure(negative, () => catchFish(negative, NOW));
  const orderOverflow = farm({ coins: Number.MAX_SAFE_INTEGER, inventory: { wheat: 3 }, orders: [{ id: 'overflow', kind: 'truck', requirements: { wheat: 3 }, coins: 1, xp: 1 }] });
  assertAtomicFailure(orderOverflow, () => deliverOrder(orderOverflow, 'overflow', NOW));
  assert.equal(orderOverflow.inventory.wheat, 3);
  const achievementOverflow = farm({ harvests: 1, gems: Number.MAX_SAFE_INTEGER });
  assertAtomicFailure(achievementOverflow, () => claimAchievement(achievementOverflow, 'first_harvest'));
});
