import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, restoreGame, tickGame } from '../src/lib/game.ts';
import { createGameBackup, GAME_RECOVERY_KEY, GAME_SAVE_KEY, parseGameBackup, readGameSave, writeGameSave } from '../src/lib/gameSave.ts';
import { FISHING_LEVEL } from '../src/lib/farmEconomy.ts';
import { arriveTownTrain, buildTownFacility, collectTownVisitor, getTownAvailableGoods, getTownFacilityCapacity, getTownUpgradeCost, getTownVisitorPhase, initialTown, serveTownVisitor, TOWN_BUILDINGS, TOWN_TRAIN_COOLDOWN_MS, upgradeTownFacility } from '../src/lib/townGame.ts';
import { normalizeTown } from '../src/lib/townState.ts';
import type { Game, ItemId } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-18T08:00:00.000Z');
const MAX_DATE = 8_640_000_000_000_000;
function stocked(): Game {
  const game = initialGame(NOW);
  return { ...game, inventory: { ...game.inventory, wheat: 15, corn: 15, soybean: 10, radish: 10, bread: 8, egg: 8 } };
}
function readyTown(): Game {
  const arrived = arriveTownTrain(stocked(), NOW);
  return serveTownVisitor(arrived, arrived.town.visitors[0].id, NOW);
}
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('the default town is deterministic and old v2 saves and old explicit backups migrate without new rewards', () => {
  const current = initialGame(NOW);
  assert.deepEqual(current.town, initialTown());
  const old = structuredClone(current) as Partial<Game>; delete old.town;
  const restored = restoreGame(old, NOW);
  assert.deepEqual(restored, current);
  const backup = createGameBackup(current, NOW); const oldBackup = structuredClone(backup) as typeof backup & { game: Partial<Game> };
  delete (oldBackup.game as Partial<Game>).town;
  assert.deepEqual(parseGameBackup(oldBackup, NOW), current);
  assert.equal(restored.coins, current.coins); assert.equal(restored.xp, current.xp);
  assert.equal(restored.town.nextTrainAt, 0); assert.equal(restored.town.visitors.length, 0);
});

test('train arrivals are deterministic, explicit, immutable and bounded by their cooldown and six visitors', () => {
  const original = stocked(); const before = structuredClone(original);
  const first = arriveTownTrain(original, NOW);
  assert.deepEqual(first, arriveTownTrain(original, NOW)); assert.deepEqual(original, before);
  assert.equal(first.town.visitors.length, 3); assert.equal(first.town.nextTrainAt, NOW + TOWN_TRAIN_COOLDOWN_MS);
  assert.equal(first.town.trainSerial, 1);
  assert.deepEqual(first.inventory, original.inventory); assert.equal(first.coins, original.coins);
  assert.throws(() => arriveTownTrain(first, first.town.nextTrainAt - 1), /等待/);
  const second = arriveTownTrain(first, first.town.nextTrainAt);
  assert.equal(second.town.visitors.length, 6); assert.equal(new Set(second.town.visitors.map(visitor => visitor.id)).size, 6);
  assert.throws(() => arriveTownTrain(second, second.town.nextTrainAt), /已满/);
  assert.equal(tickGame(first, NOW + 999_999).town.visitors.length, 3, 'elapsed time cannot summon another train');
});

test('train demands only goods accessible through crops, owned animals and built recipes with available ingredients', () => {
  const beginner = initialGame(NOW); const goods = getTownAvailableGoods(beginner);
  assert.ok(goods.includes('wheat')); assert.ok(goods.includes('bread')); assert.ok(goods.includes('egg'));
  for (const absent of ['milk', 'cookie', 'cream', 'gold_ore', 'plank', 'chicken_feed']) assert.equal(goods.includes(absent as ItemId), false);
  const highLevel = { ...beginner, xp: 2000 };
  assert.equal(getTownAvailableGoods(highLevel).includes('cookie'), false, 'an unlocked recipe without its sugar source is not available');
  const sugarBuilt = { ...highLevel, machines: [...highLevel.machines, { id: 'sugar_mill' as const, slots: 2, queue: [] }] };
  assert.ok(getTownAvailableGoods(sugarBuilt).includes('cookie'));
  assert.equal(getTownAvailableGoods({ ...sugarBuilt, animals: sugarBuilt.animals.map(pen => ({ ...pen, animal: null })) }).includes('cookie'), false);
  for (let serial = 0, game = beginner; serial < 4; serial++) {
    game = arriveTownTrain({ ...game, town: { ...game.town, visitors: [] } }, NOW + serial * TOWN_TRAIN_COOLDOWN_MS);
    for (const visitor of game.town.visitors) for (const id of Object.keys(visitor.requirements)) assert.ok(goods.includes(id as ItemId));
  }
});

test('town recipe sources follow the actual fishing unlock and exclude tool-dependent minerals and exhausted orchards', () => {
  const base = { ...stocked(), xp: 20 * (FISHING_LEVEL - 1) ** 2 };
  const sushi = { ...base, xp: 20 * 20 ** 2, machines: [...base.machines,
    { id: 'sauce_maker' as const, slots: 2, queue: [] }, { id: 'sushi_bar' as const, slots: 2, queue: [] },
    { id: 'smelter' as const, slots: 2, queue: [] }, { id: 'jeweler' as const, slots: 2, queue: [] },
    { id: 'juice_press' as const, slots: 2, queue: [] }] };
  const goods = getTownAvailableGoods(sushi);
  assert.ok(goods.includes('fish_sushi'), 'the implemented fishing action supplies fish without consuming tools');
  for (const absent of ['iron_bar', 'gold_bar', 'bracelet', 'necklace']) assert.equal(goods.includes(absent as ItemId), false);
  const living = { ...sushi, orchard: [{ id: 1, fruit: 'apple' as const, harvests: 3, readyAt: NOW, needsHelp: true, revived: false }] };
  assert.ok(getTownAvailableGoods(living).includes('apple_juice'), 'the free NPC revival still leaves one attainable harvest');
  const dead = { ...living, orchard: living.orchard.map(tree => ({ ...tree, harvests: 4, revived: true })) };
  assert.equal(getTownAvailableGoods(dead).includes('apple_juice'), false, 'a dead tree cannot promise another fruit harvest');
  const oneLiveTree = { ...dead, orchard: [...dead.orchard, { ...living.orchard[0], id: 2 }] };
  assert.ok(getTownAvailableGoods(oneLiveTree).includes('apple_juice'));
  const tooEarly = { ...sushi, xp: 20 * (FISHING_LEVEL - 2) ** 2 };
  assert.equal(getTownAvailableGoods(tooEarly).includes('fish_sushi'), false);
});

test('service consumes the exact inventory once and requires a free facility seat and explicit reward collection', () => {
  let game = arriveTownTrain(stocked(), NOW); const first = game.town.visitors[0]; const original = structuredClone(game);
  game = serveTownVisitor(game, first.id, NOW);
  for (const [id, count] of Object.entries(first.requirements)) assert.equal(game.inventory[id as ItemId], original.inventory[id as ItemId]! - count!);
  assert.equal(game.coins, original.coins); assert.equal(game.xp, original.xp); assert.equal(game.town.reputation, 0);
  assert.equal(getTownVisitorPhase(game.town.visitors[0], NOW), 'serving');
  assert.throws(() => serveTownVisitor(game, first.id, NOW), /重复/);
  game = serveTownVisitor(game, game.town.visitors[1].id, NOW);
  assert.throws(() => serveTownVisitor(game, game.town.visitors[2].id, NOW), /席位已满/);
  const readyAt = game.town.visitors[0].readyAt!;
  assert.equal(getTownVisitorPhase(game.town.visitors[0], readyAt - 1), 'serving');
  assert.equal(getTownVisitorPhase(game.town.visitors[0], readyAt), 'ready');
  assert.throws(() => collectTownVisitor(game, first.id, readyAt - 1), /尚未完成/);
  const elapsed = tickGame(game, readyAt + 10_000);
  assert.equal(elapsed.coins, original.coins); assert.equal(elapsed.town.visitors.length, 3);
  assert.throws(() => serveTownVisitor(elapsed, elapsed.town.visitors[2].id, readyAt), /席位已满/, 'ready visitors retain a seat until collection');
  const reward = collectTownVisitor(elapsed, first.id, readyAt);
  assert.equal(reward.coins, original.coins + first.coins); assert.equal(reward.xp, original.xp + first.xp); assert.equal(reward.town.reputation, 1);
  assert.equal(reward.town.visitors.length, 2); assert.throws(() => collectTownVisitor(reward, first.id, readyAt), /找不到/);
  assert.doesNotThrow(() => serveTownVisitor(reward, reward.town.visitors.find(visitor => visitor.startedAt === undefined)!.id, readyAt));
  assert.deepEqual(original, arriveTownTrain(stocked(), NOW));
});

test('shortages and clock rollback reject actions without partially spending inventory or changing state', () => {
  let game = { ...stocked(), town: { ...initialTown(), reputation: 3 } };
  game = buildTownFacility(game, 'cafe', NOW);
  game = arriveTownTrain(game, NOW);
  const cafe = game.town.visitors.find(visitor => visitor.buildingId === 'cafe')!;
  const ids = Object.keys(cafe.requirements) as ItemId[]; assert.equal(ids.length, 2);
  game = { ...game, inventory: { [ids[0]]: 10, [ids[1]]: 0 } };
  const before = structuredClone(game);
  assert.throws(() => serveTownVisitor(game, cafe.id, NOW), /库存不足/); assert.deepEqual(game, before);
  assert.throws(() => serveTownVisitor(game, cafe.id, NOW - 1), /设备时间/); assert.deepEqual(game, before);
  const serving = readyTown();
  assert.equal(getTownVisitorPhase(serving.town.visitors[0], NOW - 1000), 'serving');
  assert.throws(() => collectTownVisitor(serving, serving.town.visitors[0].id, NOW - 1000), /尚未完成/);
});

test('reputation unlocks facilities with visible prices and upgrades add seats without spending diamonds', () => {
  let game = stocked(); const original = structuredClone(game);
  assert.throws(() => buildTownFacility(game, 'cafe', NOW), /3 小镇声望/); assert.deepEqual(game, original);
  game = { ...game, town: { ...game.town, reputation: 8 }, coins: 2000 };
  game = buildTownFacility(game, 'cafe', NOW); game = buildTownFacility(game, 'inn', NOW);
  assert.equal(game.coins, 1250); assert.equal(game.gems, original.gems);
  assert.throws(() => buildTownFacility(game, 'cafe', NOW), /已经/);
  assert.equal(getTownUpgradeCost(1), 250); assert.equal(getTownUpgradeCost(2), 500); assert.equal(getTownUpgradeCost(3), null);
  assert.equal(getTownFacilityCapacity(0), 0); assert.equal(getTownFacilityCapacity(1), 2);
  game = upgradeTownFacility(game, 'store', NOW); assert.equal(game.coins, 1000); assert.equal(getTownFacilityCapacity(game.town.buildings[0].level), 3);
  game = upgradeTownFacility(game, 'store', NOW); assert.equal(game.coins, 500); assert.equal(getTownFacilityCapacity(game.town.buildings[0].level), 4);
  assert.throws(() => upgradeTownFacility(game, 'store', NOW), /3 级上限/);
  assert.throws(() => upgradeTownFacility(stocked(), 'inn', NOW), /先建造/);
  const broke = { ...game, coins: 0 }; assert.throws(() => upgradeTownFacility(broke, 'cafe', NOW), /金币不足/);
  assert.equal(TOWN_BUILDINGS.find(item => item.id === 'inn')!.buildCost, 500);
});

test('town progress survives save and backup roundtrips without returning paid goods or auto-collecting ready rewards', () => {
  const game = readyTown(); const before = structuredClone(game); const disk = storage();
  disk.setItem('fieldletter.farm.v1', 'REAL_RECORDS'); disk.setItem('fieldletter.location.v1', 'GPS'); disk.setItem('field-notes.diagnosis-cases.v1', 'CASES');
  assert.equal(writeGameSave(game, disk), true);
  const later = NOW + 60_000;
  assert.deepEqual(readGameSave(disk, later).game, tickGame(game, later));
  const backup = createGameBackup(game, NOW); const restored = parseGameBackup(JSON.parse(JSON.stringify(backup)), later);
  assert.equal(restored.coins, game.coins); assert.equal(restored.xp, game.xp); assert.deepEqual(restored.inventory, game.inventory);
  assert.equal(getTownVisitorPhase(restored.town.visitors[0], later), 'ready');
  restored.town.visitors[0].requirements.wheat = 99; restored.town.buildings[0].level = 3;
  assert.deepEqual(game, before); assert.deepEqual(backup.game, before);
  assert.equal(disk.getItem('fieldletter.farm.v1'), 'REAL_RECORDS'); assert.equal(disk.getItem('fieldletter.location.v1'), 'GPS'); assert.equal(disk.getItem('field-notes.diagnosis-cases.v1'), 'CASES');
});

test('present malformed town data is rejected rather than silently reset or mixed with real or native metadata', () => {
  const game = readyTown(); const backup = createGameBackup(game, NOW);
  const invalid: unknown[] = [null, [], {}, { ...game.town, version: 2 }, { ...game.town, reputation: -1 }, { ...game.town, visitors: [...game.town.visitors, game.town.visitors[0]] },
    { ...game.town, buildings: [game.town.buildings[0], game.town.buildings[0], game.town.buildings[2]] },
    { ...game.town, location: 'PRIVATE_GPS' }, { ...game.town, visitors: game.town.visitors.map(visitor => ({ ...visitor, localUri: 'file:///private/photo' })) },
    { ...game.town, visitors: game.town.visitors.map(visitor => ({ ...visitor, requirements: { plank: 1 } })) },
    { ...game.town, visitors: game.town.visitors.map(visitor => ({ ...visitor, requirements: { wheat: -1 } })) },
    { ...game.town, visitors: game.town.visitors.map(visitor => ({ ...visitor, coins: visitor.coins + 1 })) },
    { ...game.town, visitors: game.town.visitors.map(visitor => ({ ...visitor, readyAt: undefined })) },
  ];
  for (const town of invalid) {
    assert.throws(() => restoreGame({ ...game, town }, NOW));
    assert.throws(() => parseGameBackup({ ...backup, game: { ...backup.game, town } }, NOW));
  }
  const disk = storage(); const raw = JSON.stringify({ ...game, town: null }); disk.setItem(GAME_SAVE_KEY, raw);
  assert.match(readGameSave(disk, NOW).warning!, /原始内容已保留/);
  assert.equal(disk.getItem(GAME_RECOVERY_KEY), raw); assert.equal(disk.getItem(GAME_SAVE_KEY), raw);
});

test('town validation enforces arrival order, service intervals, capacity and unique generated identities', () => {
  const game = readyTown(); const first = game.town.visitors[0];
  for (const visitor of [
    { ...first, id: 'town-0-0' }, { ...first, id: 'town-2-0' }, { ...first, id: 'town-01-0' },
    { ...first, startedAt: NOW - 1 }, { ...first, readyAt: NOW + 59_999 }, { ...first, arrivedAt: NOW + 1 },
    { ...first, requirements: {} }, { ...first, requirements: { wheat: 4 } }, { ...first, name: '\nPRIVATE' },
  ]) assert.throws(() => normalizeTown({ ...game.town, visitors: [visitor] }));
  const overcrowded = { ...game.town, visitors: game.town.visitors.map(visitor => ({ ...visitor, startedAt: NOW, readyAt: NOW + 60_000 })) };
  assert.throws(() => normalizeTown(overcrowded), /超出容量/);
  assert.throws(() => normalizeTown({ ...initialTown(), nextTrainAt: NOW }), /计时不一致/);
  assert.throws(() => normalizeTown({ ...game.town, nextTrainAt: 0 }), /计时不一致/);
  const withGetter = { ...initialTown() }; Object.defineProperty(withGetter, 'reputation', { enumerable: true, get: () => 0 });
  assert.throws(() => normalizeTown(withGetter), /字段/);
});

test('invalid times, overflow rewards and invalid balances fail before mutating the original game', () => {
  const game = readyTown(); const before = structuredClone(game);
  for (const now of [-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_DATE + 1, NOW + 0.5]) assert.throws(() => arriveTownTrain(game, now));
  assert.throws(() => arriveTownTrain(game, MAX_DATE), /计时/);
  const waiting = arriveTownTrain(stocked(), NOW); assert.throws(() => serveTownVisitor(waiting, waiting.town.visitors[0].id, MAX_DATE), /计时/);
  const overflowCoins = { ...game, coins: Number.MAX_SAFE_INTEGER };
  assert.throws(() => collectTownVisitor(overflowCoins, game.town.visitors[0].id, NOW + 60_000), /金币/);
  assert.throws(() => collectTownVisitor({ ...game, xp: Number.MAX_SAFE_INTEGER }, game.town.visitors[0].id, NOW + 60_000), /经验/);
  assert.throws(() => collectTownVisitor({ ...game, town: { ...game.town, reputation: Number.MAX_SAFE_INTEGER } }, game.town.visitors[0].id, NOW + 60_000), /声望/);
  assert.throws(() => arriveTownTrain({ ...game, town: { ...game.town, trainSerial: Number.MAX_SAFE_INTEGER } }, NOW + TOWN_TRAIN_COOLDOWN_MS), /序号/);
  for (const coins of [-1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildTownFacility({ ...game, coins }, 'cafe', NOW), /金币/);
  assert.deepEqual(game, before);
});
