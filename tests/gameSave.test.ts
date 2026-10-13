import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPen, buyAnimal, feedAnimal, harvest, initialGame, plant, queueProduction, restoreGame, tickGame, unlockMachine } from '../src/lib/game.ts';
import { buildBeehive, catchFish, claimAchievement, deliverOrder, ensureOrders, listForSale, mineOre, plantOrchard } from '../src/lib/farmEconomy.ts';
import { ITEMS } from '../src/lib/farmContent.ts';
import { createGameBackup, GAME_RECOVERY_KEY, GAME_SAVE_KEY, parseGameBackup, readGameSave, writeGameSave } from '../src/lib/gameSave.ts';
import type { Game, ItemId } from '../src/lib/farmTypes.ts';
import type { GameSaveStorage } from '../src/lib/gameSave.ts';

const NOW = Date.parse('2026-10-13T08:00:00.000Z');
class MemoryStorage implements GameSaveStorage {
  readonly values = new Map<string, string>();
  readonly failedWrites = new Set<string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.failedWrites.has(key)) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
}

function advancedFarm(): Game {
  let game = initialGame(NOW);
  game = { ...game, coins: 90_000, gems: 60, xp: 6000, siloCapacity: 1000, barnCapacity: 1000, unlockedPlots: 12,
    inventory: Object.fromEntries(ITEMS.map(item => [item.id, 8])) as Partial<Record<ItemId, number>> };
  game = harvest(game, 1, NOW);
  game = plant(game, 4, 'strawberry', NOW);
  game = buyAnimal(game, 2, 'cow'); game = feedAnimal(game, 2, NOW);
  game = buildPen(game); game = buyAnimal(game, 4, 'goat'); game = feedAnimal(game, 4, NOW);
  game = unlockMachine(game, 'dairy');
  game = queueProduction(game, 'dairy', 'cream', NOW);
  game = queueProduction(game, 'dairy', 'cheese', NOW);
  game = queueProduction(game, 'bakery', 'bread', NOW);
  game = ensureOrders(game, 'boat'); game = deliverOrder(game, game.orders[0].id, NOW);
  game = listForSale(game, 'apple', 2, 2, NOW);
  game = plantOrchard(game, 'cherry', NOW);
  game = catchFish(game, NOW); game = mineOre(game, NOW); game = buildBeehive(game, NOW);
  return claimAchievement(game, 'first_harvest');
}

test('empty saves and inaccessible storage return a playable farm without touching real farmer data', () => {
  const storage = new MemoryStorage(); storage.setItem('fieldletter.location.v1', 'LOCATION_STAYS'); storage.setItem('fieldletter.farm.v1', 'REAL_RECORDS_STAY');
  const empty = readGameSave(storage, NOW);
  assert.deepEqual(empty.game, initialGame(NOW)); assert.equal(empty.warning, undefined);
  storage.setItem(GAME_SAVE_KEY, ''); assert.equal(readGameSave(storage, NOW).warning, undefined);
  const denied = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  assert.match(readGameSave(denied, NOW).warning!, /无法读取/);
  assert.equal(writeGameSave(initialGame(NOW), denied), false);
  assert.equal(storage.getItem('fieldletter.location.v1'), 'LOCATION_STAYS'); assert.equal(storage.getItem('fieldletter.farm.v1'), 'REAL_RECORDS_STAY');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.match(readGameSave(undefined, NOW).warning!, /存储不可用/);
    assert.equal(writeGameSave(initialGame(NOW)), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('corrupted save text is preserved byte for byte before subsequent fresh-game saving', () => {
  const storage = new MemoryStorage(); const broken = ' { "coins": 700, "inventory": {broken';
  storage.setItem(GAME_SAVE_KEY, broken);
  const result = readGameSave(storage, NOW);
  assert.match(result.warning!, /原始内容已保留/); assert.deepEqual(result.game, initialGame(NOW));
  assert.equal(storage.getItem(GAME_SAVE_KEY), broken); assert.equal(storage.getItem(GAME_RECOVERY_KEY), broken);
  assert.equal(writeGameSave(harvest(result.game, 1, NOW), storage), true);
  assert.equal(storage.getItem(GAME_RECOVERY_KEY), broken);
  assert.equal(readGameSave(storage, NOW).game.harvests, 1);
});

test('the first recovery copy survives later invalid saves and is never replaced', () => {
  const storage = new MemoryStorage(); const first = '{FIRST_BROKEN_SAVE}'; const later = '{SECOND_BROKEN_SAVE}';
  storage.setItem(GAME_RECOVERY_KEY, first); storage.setItem(GAME_SAVE_KEY, later);
  const result = readGameSave(storage, NOW);
  assert.match(result.warning!, /已有异常存档恢复副本已保留/); assert.doesNotMatch(result.warning!, /原始内容已保留/);
  assert.equal(storage.getItem(GAME_RECOVERY_KEY), first); assert.equal(storage.getItem(GAME_SAVE_KEY), later);
  assert.equal(writeGameSave(result.game, storage), true); assert.equal(storage.getItem(GAME_RECOVERY_KEY), first);
});

test('failed recovery writes accurately warn and prevent autosaving over the only broken original', () => {
  const storage = new MemoryStorage(); const original = '{BROKEN_BUT_NOT_LOST}';
  storage.setItem(GAME_SAVE_KEY, original); storage.failedWrites.add(GAME_RECOVERY_KEY);
  const result = readGameSave(storage, NOW);
  assert.match(result.warning!, /恢复副本保存失败/); assert.match(result.warning!, /自动保存已暂停/);
  assert.doesNotMatch(result.warning!, /已保留在本机恢复副本/);
  assert.equal(writeGameSave(result.game, storage), false);
  assert.equal(storage.getItem(GAME_SAVE_KEY), original); assert.equal(storage.getItem(GAME_RECOVERY_KEY), null);
  storage.failedWrites.delete(GAME_RECOVERY_KEY);
  assert.equal(writeGameSave(result.game, storage), true);
  assert.equal(storage.getItem(GAME_RECOVERY_KEY), original);
});

test('valid-looking unsupported or invalid saves also preserve their originals', () => {
  for (const bad of [{ ...initialGame(NOW), version: 99 }, { ...initialGame(NOW), inventory: { wheat: -1 } }, null]) {
    const storage = new MemoryStorage(); const original = JSON.stringify(bad); storage.setItem(GAME_SAVE_KEY, original);
    assert.match(readGameSave(storage, NOW).warning!, /无法读取/);
    assert.equal(storage.getItem(GAME_RECOVERY_KEY), original); assert.equal(storage.getItem(GAME_SAVE_KEY), original);
  }
});

test('failed primary writes and rejected game objects leave the previous valid progress intact', () => {
  const storage = new MemoryStorage(); const original = JSON.stringify(initialGame(NOW)); storage.setItem(GAME_SAVE_KEY, original);
  const progressed = harvest(initialGame(NOW), 1, NOW); storage.failedWrites.add(GAME_SAVE_KEY);
  assert.equal(writeGameSave(progressed, storage), false); assert.equal(storage.getItem(GAME_SAVE_KEY), original);
  storage.failedWrites.clear();
  assert.equal(writeGameSave({ ...progressed, inventory: { wheat: Number.NaN } }, storage), false);
  assert.equal(storage.getItem(GAME_SAVE_KEY), original); assert.equal(storage.getItem(GAME_RECOVERY_KEY), null);
});

test('valid version-one saves migrate balances fields and livestock without treating them as corruption', () => {
  const storage = new MemoryStorage(); const initial = initialGame(NOW);
  const legacy = { version: 1, day: 7, coins: 765, xp: 80, harvests: 9, waterUsed: 36, productsCollected: 3,
    plots: initial.plots.map(({ plantedAt: _plantedAt, readyAt: _readyAt, ...plot }) => plot),
    animals: initial.animals.map(({ fedAt: _fedAt, readyAt: _readyAt, ...pen }) => pen), log: ['旧农场的记录'] };
  storage.setItem(GAME_SAVE_KEY, JSON.stringify(legacy));
  const result = readGameSave(storage, NOW);
  assert.equal(result.warning, undefined); assert.equal(result.game.version, 2); assert.equal(result.game.coins, 765); assert.equal(result.game.xp, 80);
  assert.equal(result.game.day, 7); assert.equal(result.game.animals[0].animal, 'chicken'); assert.equal(result.game.plots[0].crop, 'wheat');
  assert.equal(storage.getItem(GAME_RECOVERY_KEY), null); assert.equal(JSON.parse(storage.getItem(GAME_SAVE_KEY)!).version, 1);
  assert.equal(writeGameSave(result.game, storage), true); assert.equal(JSON.parse(storage.getItem(GAME_SAVE_KEY)!).version, 2);
});

test('game backup roundtrip preserves advanced economy, queues, cooldowns and pending harvests', () => {
  const game = advancedFarm(); const before = structuredClone(game);
  const exported = createGameBackup(game, NOW); const restored = parseGameBackup(JSON.parse(JSON.stringify(exported)), NOW);
  assert.equal(exported.exportedAt, '2026-10-13T08:00:00.000Z'); assert.deepEqual(restored, game); assert.deepEqual(game, before);
  assert.equal(restored.machines.find(machine => machine.id === 'dairy')!.queue.length, 2);
  assert.equal(restored.shopListings[0].collected, false); assert.ok(restored.orders.some(order => order.kind === 'boat'));
  assert.equal(restored.orchard[0].fruit, 'cherry'); assert.equal(restored.beehiveBuilt, true);
  assert.ok(restored.fishingReadyAt > NOW); assert.ok(restored.mineReadyAt > NOW); assert.ok(restored.beehiveReadyAt > NOW);
  const later = NOW + 60 * 60_000;
  assert.deepEqual(parseGameBackup(exported, later), tickGame(game, later), 'offline elapsed time updates progress but does not auto-collect or lose state');
  restored.inventory.wheat = 0; restored.orders[0].requirements.wheat = 99; restored.machines[0].queue.push({ id: 'LOCAL_EDIT', recipe: 'chicken_feed', startedAt: NOW, readyAt: later });
  assert.deepEqual(game, before); assert.deepEqual(exported.game, before);
});

test('export canonicalization excludes accidental real records, location and media from every nested game field', () => {
  const game = advancedFarm(); const mixed = { ...game, realRecords: { sentinel: 'PRIVATE_REAL_RECORD' }, location: 'PRIVATE_GPS', media: 'PRIVATE_PHOTO',
    plots: game.plots.map(plot => ({ ...plot, location: 'PRIVATE_PLOT_GPS' })),
    animals: game.animals.map(pen => ({ ...pen, diagnosis: 'PRIVATE_VET_CASE' })) };
  const backup = createGameBackup(mixed, NOW); const encoded = JSON.stringify(backup);
  assert.doesNotMatch(encoded, /PRIVATE_|realRecords|location|media|diagnosis/); assert.deepEqual(parseGameBackup(backup, NOW), game);
});

test('import rejects other apps, real-farm backups, raw saves and unsupported future formats without mutation', () => {
  const backup = createGameBackup(advancedFarm(), NOW); const before = structuredClone(backup);
  for (const invalid of [
    initialGame(NOW), null, [], { version: 1, fields: [], animals: [], observations: [] },
    { ...backup, app: 'otherfarm' }, { ...backup, kind: 'farm' }, { ...backup, formatVersion: 2 },
    { ...backup, extra: 'UNSUPPORTED' }, { ...backup, game: { ...backup.game, version: 3 } },
    { ...backup, game: { ...backup.game, location: 'PRIVATE_GPS' } },
    { ...backup, game: { ...backup.game, plots: backup.game.plots.map(plot => ({ ...plot, location: 'PRIVATE_GPS' })) } },
  ]) assert.throws(() => parseGameBackup(invalid, NOW));
  const missing = structuredClone(backup) as unknown as { game: Record<string, unknown> }; delete missing.game.inventory;
  assert.throws(() => parseGameBackup(missing, NOW), /不完整/);
  assert.deepEqual(backup, before);
});

test('import validates canonical calendar dates and the complete saved-game economy', () => {
  const backup = createGameBackup(advancedFarm(), NOW);
  for (const exportedAt of ['2026-02-30T08:00:00.000Z', '2026-10-13', '2026-10-13T08:00:00Z', '2026-10-13T08:00:00.000+00:00', 'not-a-date', NOW]) {
    assert.throws(() => parseGameBackup({ ...backup, exportedAt }, NOW), /导出时间无效/);
  }
  for (const game of [
    { ...backup.game, coins: -1 }, { ...backup.game, gems: '20' }, { ...backup.game, inventory: { wheat: 1001 } },
    { ...backup.game, inventory: { unknown_crop: 2 } }, { ...backup.game, mineReadyAt: Number.POSITIVE_INFINITY },
  ]) assert.throws(() => parseGameBackup({ ...backup, game }, NOW));
  const overlapping = structuredClone(backup); const queue = overlapping.game.machines.find(machine => machine.id === 'dairy')!.queue;
  queue[1].startedAt = queue[0].readyAt - 1;
  assert.throws(() => parseGameBackup(overlapping, NOW), /时间重叠/);
  assert.deepEqual(parseGameBackup(backup, NOW), restoreGame(backup.game, NOW));
});
