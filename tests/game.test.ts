import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceDay, clearPlot, CROPS, getAdvice, getLevel, harvest, initialGame, plant, restoreGame, speedUpCrop, storageUsed, tickGame, water } from '../src/lib/game.ts';
import type { Game, WeatherDay } from '../src/lib/game.ts';
const NOW = Date.parse('2026-10-10T08:00:00Z');
const mildWeather: WeatherDay = { date: '2026-10-10', temp: 23, minTemp: 18, maxTemp: 27, humidity: 60, rain: 0, rainChance: 10, wind: 8, et0: 2, code: 0 };
const crop = (id: string) => CROPS.find(item => item.id === id)!;

test('new farm has inventory, six unlocked plots, starter machines and a ready crop', () => {
  const game = initialGame(NOW);
  assert.equal(game.version, 2); assert.equal(game.coins, 500); assert.equal(game.gems, 20);
  assert.equal(game.plots.length, 12); assert.equal(new Set(game.plots.map(p => p.id)).size, 12); assert.equal(game.unlockedPlots, 6);
  assert.equal(game.plots[0].readyAt, NOW); assert.equal(game.plots[0].growth, 100);
  assert.ok((game.inventory.wheat ?? 0) >= 6); assert.ok((game.inventory.chicken_feed ?? 0) > 0);
  assert.deepEqual(game.machines.map(m => m.id), ['feed_mill', 'bakery']); assert.equal(game.orders.length, 3);
  assert.ok(storageUsed(game, 'silo') < game.siloCapacity); assert.ok(storageUsed(game, 'barn') < game.barnCapacity);
});

test('plant consumes one seed, charges no coins and rejects occupied locked and empty-stock actions', () => {
  const game = { ...initialGame(NOW), coins: 0 }; const before = structuredClone(game);
  const next = plant(game, 4, 'wheat', NOW);
  assert.equal(next.coins, 0); assert.equal(next.inventory.wheat, game.inventory.wheat! - 1); assert.equal(next.plots[3].readyAt, NOW + crop('wheat').durationMs);
  assert.deepEqual(game, before);
  assert.throws(() => plant(next, 4, 'wheat', NOW), /已经有作物/);
  assert.throws(() => plant(game, 7, 'wheat', NOW), /尚未解锁/);
  assert.throws(() => plant(game, 4, 'strawberry', NOW), /级/);
  assert.throws(() => plant({ ...game, inventory: { ...game.inventory, wheat: 0 } }, 4, 'wheat', NOW), /库存不足/);
  assert.throws(() => plant(game, 999, 'wheat', NOW), /找不到这块田/);
  assert.throws(() => plant(game, 4, 'unknown' as never, NOW), /找不到这个作物/);
});

test('harvest stores two crops and XP without money; early and duplicate harvesting cannot pay twice', () => {
  const game = initialGame(NOW); const before = structuredClone(game); const next = harvest(game, 1, NOW);
  assert.equal(next.inventory.wheat, game.inventory.wheat! + 2); assert.equal(next.coins, game.coins); assert.equal(next.xp, crop('wheat').xp);
  assert.equal(next.harvests, 1); assert.equal(next.plots[0].crop, null); assert.equal(next.plots[0].readyAt, undefined); assert.deepEqual(game, before);
  assert.throws(() => harvest(next, 1, NOW), /没有作物/); assert.throws(() => harvest(game, 2, NOW), /没有成熟/);
  const planted = plant(next, 1, 'wheat', NOW); const done = harvest(planted, 1, NOW + crop('wheat').durationMs);
  assert.equal(done.inventory.wheat, game.inventory.wheat! + 3, 'one seed grows to two crops');
});

test('full storage keeps ripe crops intact and does not partially grant rewards', () => {
  const initial = initialGame(NOW); const game = { ...initial, siloCapacity: storageUsed(initial, 'silo') + 1 }; const before = structuredClone(game);
  assert.throws(() => harvest(game, 1, NOW), /粮仓空间不足/); assert.deepEqual(game, before); assert.equal(game.plots[0].crop, 'wheat');
});

test('ticks use real elapsed time; background weather and day buttons neither damage nor skip timers', () => {
  const start = plant(initialGame(NOW), 4, 'wheat', NOW); const before = structuredClone(start); const duration = crop('wheat').durationMs;
  assert.equal(tickGame(start, NOW + duration / 2).plots[3].growth, 50);
  assert.equal(tickGame(start, NOW + duration).plots[3].growth, 100);
  const extreme = { ...mildWeather, temp: 45, minTemp: -15, maxTemp: 50, rain: 200, humidity: 99 };
  const recorded = advanceDay(start, extreme, NOW);
  assert.equal(recorded.plots[3].growth, 0); assert.equal(recorded.plots[3].health, 100); assert.equal(recorded.plots[3].moisture, start.plots[3].moisture);
  assert.equal(recorded.animals[0].health, 100); assert.deepEqual(start, before);
  assert.throws(() => water(start, 4), /无需浇水/); assert.throws(() => clearPlot(start, 4), /不会枯萎/);
});

test('gem crop acceleration pays gems, does not grant stock until collection, and cannot be repeated', () => {
  const start = plant(initialGame(NOW), 4, 'wheat', NOW); const before = structuredClone(start); const fast = speedUpCrop(start, 4, NOW);
  assert.ok(fast.gems < start.gems); assert.equal(fast.coins, start.coins); assert.deepEqual(fast.inventory, start.inventory);
  assert.equal(fast.plots[3].readyAt, NOW); assert.equal(fast.plots[3].growth, 100); assert.deepEqual(start, before);
  assert.throws(() => speedUpCrop(fast, 4, NOW), /无需钻石/); assert.throws(() => speedUpCrop({ ...start, gems: 0 }, 4, NOW), /钻石不足/);
  assert.equal(harvest(fast, 4, NOW).inventory.wheat, start.inventory.wheat! + 2);
});

test('resource and time guards reject negative fractional or non-finite economy values', () => {
  const game = initialGame(NOW);
  for (const invalid of [{ coins: -1 }, { gems: -1 }, { xp: Number.NaN }, { harvests: -1 }, { productsCollected: -1 }]) assert.throws(() => plant({ ...game, ...invalid }, 4, 'wheat', NOW), /无效/);
  assert.throws(() => plant({ ...game, inventory: { ...game.inventory, wheat: -1 } }, 4, 'wheat', NOW), /无效/);
  assert.throws(() => plant({ ...game, inventory: { ...game.inventory, wheat: 1.5 } }, 4, 'wheat', NOW), /无效/);
  assert.throws(() => tickGame(game, -1), /计时时间无效/); assert.throws(() => tickGame(game, Number.NaN), /计时时间无效/);
  assert.equal(getLevel({ xp: 19 }), 1); assert.equal(getLevel({ xp: 20 }), 2); assert.equal(getLevel({ xp: 80 }), 3);
});

test('every fifth harvest supplies a real game material source, skipping only bonus when barn is full', () => {
  const game = { ...initialGame(NOW), harvests: 4 }; const next = harvest(game, 1, NOW);
  assert.equal(next.inventory.plank, game.inventory.plank! + 1); assert.equal(next.harvests, 5);
  const full = { ...game, barnCapacity: storageUsed(game, 'barn') }; const collected = harvest(full, 1, NOW);
  assert.equal(collected.inventory.plank, full.inventory.plank); assert.equal(collected.inventory.wheat, full.inventory.wheat! + 2);
});

test('version two roundtrip preserves detached inventory queues and optional draft hive defaults', () => {
  const game = initialGame(NOW); const restored = restoreGame(JSON.parse(JSON.stringify(game)), NOW);
  assert.deepEqual(restored, game); restored.inventory.wheat = 1; restored.orders[0].requirements.wheat = 999;
  assert.equal(game.inventory.wheat, 12); assert.notEqual(game.orders[0].requirements.wheat, 999);
  const draft = JSON.parse(JSON.stringify(game)); delete draft.beehiveBuilt; delete draft.beehiveReadyAt;
  assert.equal(restoreGame(draft, NOW).beehiveBuilt, false); assert.equal(restoreGame(draft, NOW).beehiveReadyAt, 0);
});

test('legacy migration preserves balances plots and animals while establishing timers and removing death', () => {
  const plots = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, crop: null as string | null, growth: 0, health: 100, moisture: 50 }));
  plots[0] = { id: 1, crop: 'tomato', growth: 75, health: 0, moisture: 15 }; plots[1] = { id: 2, crop: 'radish', growth: 100, health: 90, moisture: 55 };
  const legacy = { version: 1, day: 9, coins: 713, xp: 175, harvests: 8, waterUsed: 100, productsCollected: 4, plots, animals: [{ id: 1, animal: 'cow', health: 20, feed: 60, progress: 45 }, { id: 2, animal: 'chicken', health: 90, feed: 70, progress: 100 }, { id: 3, animal: null, health: 100, feed: 0, progress: 0 }], log: ['旧记录'], realRecords: { secret: 'REAL_DATA_IS_SEPARATE' } };
  const before = structuredClone(legacy); const migrated = restoreGame(legacy, NOW);
  assert.equal(migrated.version, 2); assert.equal(migrated.coins, 713); assert.equal(migrated.xp, 175); assert.equal(migrated.day, 9); assert.equal(migrated.unlockedPlots, 12);
  assert.equal(migrated.plots[0].crop, 'tomato'); assert.equal(migrated.plots[0].growth, 75); assert.equal(migrated.plots[0].health, 100);
  assert.equal(migrated.animals[0].animal, 'cow'); assert.equal(migrated.animals[0].progress, 45); assert.equal(migrated.animals[0].health, 100);
  assert.equal(migrated.plots[1].readyAt, NOW); assert.ok(!JSON.stringify(migrated).includes('REAL_DATA_IS_SEPARATE')); assert.deepEqual(legacy, before);
  const { animals: _animals, productsCollected: _products, ...beforeAnimals } = legacy;
  assert.equal(restoreGame(beforeAnimals, NOW).animals.length, 3);
});

test('strict saved-state validation rejects invalid identifiers missing fields times and capacities', () => {
  const game = initialGame(NOW);
  const invalid: unknown[] = [null, { ...game, version: 7 }, { ...game, coins: -1 }, { ...game, gems: null }, { ...game, inventory: { wheat: -1 } }, { ...game, inventory: { ghost: 1 } }, { ...game, siloCapacity: 1001 }, { ...game, inventory: { wheat: 101 } }, { ...game, unlockedPlots: 13 }, { ...game, beehiveReadyAt: null }, { ...game, beehiveBuilt: false, beehiveReadyAt: NOW }];
  const duplicate = structuredClone(game); duplicate.plots[1].id = duplicate.plots[0].id; invalid.push(duplicate);
  const timing = structuredClone(game); timing.plots[1].readyAt = timing.plots[1].plantedAt! - 1; invalid.push(timing);
  const missing = JSON.parse(JSON.stringify(game)); delete missing.plots[1].readyAt; invalid.push(missing);
  const tooMany = structuredClone(game); tooMany.animals = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, animal: null, health: 100, feed: 0, progress: 0 })); invalid.push(tooMany);
  for (const saved of invalid) assert.throws(() => restoreGame(saved, NOW));
});

test('restore rejects missing or reordered map identifiers rather than leaving default selections unreachable', () => {
  const game = initialGame(NOW);
  const shiftedPlots = structuredClone(game); shiftedPlots.plots.forEach(plot => plot.id += 1);
  assert.throws(() => restoreGame(shiftedPlots, NOW), /地块编号/);
  const shiftedPens = structuredClone(game); shiftedPens.animals.forEach(pen => pen.id += 1);
  assert.throws(() => restoreGame(shiftedPens, NOW), /畜栏编号/);
  const reordered = structuredClone(game); [reordered.plots[0], reordered.plots[1]] = [reordered.plots[1], reordered.plots[0]];
  assert.throws(() => restoreGame(reordered, NOW), /地块编号/);
  assert.throws(() => restoreGame({ ...game, plots: game.plots.slice(0, 6) }, NOW), /地块无效/);
  assert.deepEqual(restoreGame(game, NOW).plots.map(plot => plot.id), Array.from({ length: 12 }, (_, index) => index + 1));
});

test('restore timer limits match the economy and actions cannot overflow the Date range', () => {
  const game = initialGame(NOW); const maxDate = 8_640_000_000_000_000;
  for (const field of ['fishingReadyAt', 'mineReadyAt', 'beehiveReadyAt'] as const) {
    assert.throws(() => restoreGame({ ...game, beehiveBuilt: true, [field]: maxDate + 1 }, NOW), /计时无效/);
  }
  const badCrop = structuredClone(game); badCrop.plots[1].readyAt = maxDate + 1;
  assert.throws(() => restoreGame(badCrop, NOW), /成熟时间无效/);
  assert.equal(restoreGame({ ...game, beehiveBuilt: true, beehiveReadyAt: maxDate }, NOW).beehiveReadyAt, maxDate);
  assert.throws(() => tickGame(game, maxDate + 1), /计时时间无效/);
  const before = structuredClone(game); assert.throws(() => plant(game, 4, 'wheat', maxDate), /计时时间无效/); assert.deepEqual(game, before);
});

test('restore accepts each reachable orchard stage and rejects states that would strand a tree', () => {
  const game = initialGame(NOW); const tree = { id: 2, fruit: 'apple' as const, readyAt: NOW };
  const reachable = [
    { harvests: 0, needsHelp: false, revived: false }, { harvests: 2, needsHelp: false, revived: false },
    { harvests: 3, needsHelp: true, revived: false }, { harvests: 3, needsHelp: false, revived: true },
    { harvests: 4, needsHelp: true, revived: true },
  ];
  for (const stage of reachable) assert.deepEqual(restoreGame({ ...game, orchard: [{ ...tree, ...stage }] }, NOW).orchard[0], { ...tree, ...stage });
  for (const stage of [
    { harvests: 5, needsHelp: true, revived: true }, { harvests: 2, needsHelp: true, revived: false },
    { harvests: 3, needsHelp: true, revived: true }, { harvests: 4, needsHelp: false, revived: true },
    { harvests: 4, needsHelp: true, revived: false },
  ]) assert.throws(() => restoreGame({ ...game, orchard: [{ ...tree, ...stage }] }, NOW), /果树/);
});

test('real-field weather advice never derives irrigation or livestock status from game simulation', () => {
  const game: Game = { ...initialGame(NOW), plots: initialGame(NOW).plots.map(p => ({ ...p, moisture: 0, health: 1 })), animals: initialGame(NOW).animals.map(p => ({ ...p, feed: 0 })) };
  const advice = getAdvice(game, mildWeather, 24);
  assert.ok(advice.length >= 2 && advice.length <= 4); assert.ok(advice.every(a => a.action === undefined && a.plotIds === undefined));
  assert.ok(advice.every(a => !['water', 'wet-soil', 'animal-feed'].includes(a.id))); assert.match(advice.find(a => a.id === 'context')!.detail, /24%.*不能套用游戏湿度阈值/);
  assert.throws(() => getAdvice(game, mildWeather, 101), /0–100/); assert.throws(() => getAdvice(game, { ...mildWeather, humidity: Number.NaN }), /天气数据不完整/);
});
