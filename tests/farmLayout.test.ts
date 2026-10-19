import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFarmLayout, canPlaceFarmLayoutItem, FARM_LAYOUT_BLOCKED_CELLS, FARM_LAYOUT_GRID, FARM_LAYOUT_HEIGHT, FARM_LAYOUT_ITEMS, FARM_LAYOUT_WIDTH, getFarmLayoutItem, initialFarmLayout, moveFarmLayoutItem, normalizeFarmLayout, removeFarmLayoutItem } from '../src/lib/farmLayout.ts';
import type { FarmLayout, FarmLayoutItemId } from '../src/lib/farmLayoutTypes.ts';
import { buildPen, buyAnimal, feedAnimal, harvest, initialGame, plant, queueProduction, restoreGame, tickGame, unlockMachine } from '../src/lib/game.ts';
import { arriveTownTrain, collectTownVisitor, serveTownVisitor } from '../src/lib/townGame.ts';
import { createGameBackup, GAME_RECOVERY_KEY, GAME_SAVE_KEY, parseGameBackup, readGameSave, writeGameSave } from '../src/lib/gameSave.ts';

const NOW = Date.parse('2026-10-18T08:00:00.000Z');
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function furnishedLayout(): FarmLayout {
  let layout = moveFarmLayoutItem(initialFarmLayout(), 'house', 1000, 600);
  for (const [index, id] of (['flowerbed-1', 'flowerbed-2', 'hedge-1', 'hedge-2', 'fence-1', 'fence-2'] as const).entries()) layout = moveFarmLayoutItem(layout, id, 100 + index * 100, 100);
  return layout;
}

test('default footprints fit the agreed world and six free decorations start unplaced', () => {
  const layout = initialFarmLayout();
  assert.equal(FARM_LAYOUT_WIDTH, 1200); assert.equal(FARM_LAYOUT_HEIGHT, 700); assert.equal(FARM_LAYOUT_GRID, 50);
  assert.deepEqual(normalizeFarmLayout(layout), layout);
  assert.deepEqual(layout.placements.slice(0, 3), [
    { id: 'house', x: 150, y: 250, placed: true }, { id: 'production', x: 850, y: 250, placed: true }, { id: 'livestock', x: 100, y: 450, placed: true },
  ]);
  assert.equal(layout.placements.filter(item => !item.placed && item.x === 0 && item.y === 0).length, 6);
  assert.deepEqual(FARM_LAYOUT_ITEMS.map(item => [item.width, item.height]), [[200, 100], [200, 100], [350, 100], ...Array.from({ length: 6 }, () => [100, 50])]);
  layout.placements[0].x = 500;
  assert.equal(initialFarmLayout().placements[0].x, 150);
  assert.throws(() => getFarmLayoutItem('unknown' as FarmLayoutItemId));
});

test('blocked cells are exactly the agreed river, mountains, field, town and pond', () => {
  const actual = new Set(FARM_LAYOUT_BLOCKED_CELLS.map(cell => `${cell.x},${cell.y}`));
  const clearing: Record<number, [number, number]> = { 3: [11, 13], 4: [10, 14], 5: [9, 15], 6: [8, 16], 7: [9, 15], 8: [10, 14], 9: [12, 13] };
  const expected = new Set<string>();
  for (let row = 0; row < 14; row++) for (let col = 0; col < 24; col++) {
    const range = clearing[row];
    if (col < 2 || row < 2 || (range && col >= range[0] && col <= range[1]) || (col >= 21 && row >= 4 && row <= 7) || (col >= 18 && row >= 8 && row <= 11)) expected.add(`${col * 50},${row * 50}`);
  }
  assert.deepEqual(actual, expected); assert.equal(actual.size, FARM_LAYOUT_BLOCKED_CELLS.length);
  const layout = initialFarmLayout();
  for (const [x, y] of [[50, 150], [150, 50], [450, 250], [1050, 200], [900, 400]]) assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-1', x, y).valid, false, `${x},${y}`);
  // Directly beside the clearing, town and pond is legal; no extra hidden no-build area.
  for (const [x, y] of [[450, 150], [950, 200], [800, 400], [1100, 600]]) assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-1', x, y).valid, true, `${x},${y}`);
});

test('bounds include exact right and bottom edges and respect the livestock west anchor', () => {
  const layout = initialFarmLayout();
  assert.equal(canPlaceFarmLayoutItem(layout, 'house', 1000, 600).valid, true);
  assert.equal(canPlaceFarmLayoutItem(layout, 'livestock', 850, 600).valid, true);
  assert.equal(canPlaceFarmLayoutItem(layout, 'livestock', 100, 600).valid, true);
  assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-1', 100, 100).valid, true);
  assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-1', 1100, 650).valid, true);
  for (const [id, x, y] of [
    ['house', 100, 600], ['house', 150, 150], ['house', 1050, 600], ['production', 100, 600],
    ['livestock', 50, 600], ['livestock', 900, 600], ['flowerbed-1', 50, 100], ['flowerbed-1', 100, 50],
    ['flowerbed-1', 1150, 650], ['flowerbed-1', 1100, 700],
  ] as const) assert.equal(canPlaceFarmLayoutItem(layout, id, x, y).valid, false, `${id}:${x},${y}`);
});

test('landmark roofs cannot cover central crops even when their ground footprints are clear', () => {
  const layout = initialFarmLayout(); const before = json(layout);
  const game = initialGame(NOW); const gameBefore = json(game);
  const reason = '这里的地标会遮住田地，请选择更外侧的空地。';
  for (const [id, x, y] of [['house', 700, 450], ['production', 700, 450], ['livestock', 500, 500]] as const) {
    assert.deepEqual(canPlaceFarmLayoutItem(layout, id, x, y), { valid: false, reason }, id);
    assert.throws(() => moveFarmLayoutItem(layout, id, x, y), { message: reason });
    const invalid = json(layout);
    Object.assign(invalid.placements.find(item => item.id === id)!, { x, y });
    assert.throws(() => normalizeFarmLayout(invalid), { message: reason });
    assert.throws(() => applyFarmLayout(game, invalid), { message: reason });
  }
  assert.deepEqual(layout, before);
  assert.deepEqual(game, gameBefore);
});

test('landmark visual clearance preserves original anchors, far edges and old save defaults', () => {
  const layout = initialFarmLayout();
  for (const item of FARM_LAYOUT_ITEMS.slice(0, 3)) assert.deepEqual(canPlaceFarmLayoutItem(layout, item.id, item.defaultX, item.defaultY), { valid: true, reason: '' }, item.id);
  for (const [id, x, y] of [['house', 1000, 600], ['production', 1000, 600], ['livestock', 850, 600], ['livestock', 100, 600]] as const) {
    assert.deepEqual(canPlaceFarmLayoutItem(layout, id, x, y), { valid: true, reason: '' }, `${id}:${x},${y}`);
    assert.deepEqual(normalizeFarmLayout(moveFarmLayoutItem(layout, id, x, y)), moveFarmLayoutItem(layout, id, x, y));
  }
  assert.deepEqual(normalizeFarmLayout(furnishedLayout()), furnishedLayout());
  const old = json(initialGame(NOW)) as unknown as Record<string, unknown>; delete old.layout;
  assert.deepEqual(restoreGame(old, NOW).layout, layout);
  const backup = createGameBackup(initialGame(NOW), NOW);
  delete (backup.game as unknown as Record<string, unknown>).layout;
  assert.deepEqual(parseGameBackup(backup, NOW).layout, layout);
});

test('target feedback rejects non-grid, non-finite and unsafe coordinates without modifying state', () => {
  const layout = initialFarmLayout(); const before = json(layout);
  for (const [x, y] of [[125, 100], [100, 125], [NaN, 100], [100, Infinity], [-Infinity, 100], [Number.MAX_SAFE_INTEGER + 1, 100], [-50, 100], [100.1, 100]]) {
    const result = canPlaceFarmLayoutItem(layout, 'flowerbed-1', x, y);
    assert.equal(result.valid, false); assert.ok(result.reason.length > 0);
    assert.throws(() => moveFarmLayoutItem(layout, 'flowerbed-1', x, y));
  }
  assert.deepEqual(layout, before);
});

test('building and decoration collisions reject overlap but allow touching edges', () => {
  let layout = initialFarmLayout();
  assert.equal(canPlaceFarmLayoutItem(layout, 'production', 150, 250).valid, false);
  assert.equal(canPlaceFarmLayoutItem(layout, 'house', 150, 250).valid, true, 'own footprint does not collide');
  layout = moveFarmLayoutItem(layout, 'flowerbed-1', 100, 100);
  assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-2', 150, 100).valid, false);
  assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-2', 200, 100).valid, true);
  assert.equal(canPlaceFarmLayoutItem(layout, 'flowerbed-2', 100, 150).valid, true);
  assert.equal(canPlaceFarmLayoutItem(layout, 'hedge-1', 150, 250).valid, false);
  layout = moveFarmLayoutItem(layout, 'flowerbed-2', 200, 100);
  assert.deepEqual(normalizeFarmLayout(layout), layout);
});

test('all six fixed decorations can be placed, removed and placed again without mutating inputs', () => {
  const layout = furnishedLayout(); const before = json(layout);
  assert.equal(layout.placements.filter(item => item.placed).length, 9);
  const removed = removeFarmLayoutItem(layout, 'hedge-1');
  assert.deepEqual(removed.placements.find(item => item.id === 'hedge-1'), { id: 'hedge-1', x: 0, y: 0, placed: false });
  const moved = moveFarmLayoutItem(removed, 'hedge-1', 300, 150);
  assert.deepEqual(moved.placements.find(item => item.id === 'hedge-1'), { id: 'hedge-1', x: 300, y: 150, placed: true });
  assert.deepEqual(layout, before);
  for (const id of ['house', 'production', 'livestock'] as const) assert.throws(() => removeFarmLayoutItem(layout, id), /保留/);
  assert.throws(() => removeFarmLayoutItem(layout, 'flowerbed-3' as FarmLayoutItemId));
});

test('normalization canonicalizes order and deep-copies valid data', () => {
  const input = furnishedLayout(); input.placements.reverse();
  const canonical = normalizeFarmLayout(input);
  assert.deepEqual(canonical.placements.map(item => item.id), FARM_LAYOUT_ITEMS.map(item => item.id));
  canonical.placements[0].x = 0;
  assert.equal(input.placements.find(item => item.id === 'house')!.x, 1000);
  const nullPrototype = Object.assign(Object.create(null), initialFarmLayout()) as FarmLayout;
  assert.deepEqual(normalizeFarmLayout(nullPrototype), initialFarmLayout());
});

test('present layout data rejects unknown, missing, duplicate, unplaced building and invalid coordinates', () => {
  const mutations: ((layout: FarmLayout) => unknown)[] = [
    layout => ({ ...layout, version: 2 }), layout => ({ ...layout, extra: 'PRIVATE_REAL_FARM' }),
    layout => ({ placements: layout.placements }), layout => ({ ...layout, placements: layout.placements.slice(1) }),
    layout => { layout.placements.push({ id: 'flowerbed-1', x: 0, y: 0, placed: false }); return layout; },
    layout => { layout.placements[0].id = 'unknown' as FarmLayoutItemId; return layout; },
    layout => { layout.placements[8].id = 'fence-1'; return layout; },
    layout => { layout.placements[0].placed = false; return layout; },
    layout => { layout.placements[3].x = 100; return layout; },
    layout => { layout.placements[3].placed = 'yes' as unknown as boolean; return layout; },
    layout => { layout.placements[0].x = NaN; return layout; },
    layout => { layout.placements[0].x = 151; return layout; },
    layout => { layout.placements[0].x = 550; return layout; },
    layout => { layout.placements[1].x = 150; return layout; },
    layout => { (layout.placements[0] as unknown as Record<string, unknown>).width = 0; return layout; },
  ];
  for (const mutate of mutations) assert.throws(() => normalizeFarmLayout(mutate(initialFarmLayout())));
  for (const invalid of [undefined, null, [], 1, 'layout', Object.create({ version: 1, placements: initialFarmLayout().placements })]) assert.throws(() => normalizeFarmLayout(invalid));
});

test('accessors, prototypes, symbols and sparse or decorated arrays are rejected before reads', () => {
  let reads = 0;
  const source = initialFarmLayout();
  Object.defineProperty(source, 'version', { get() { reads++; return 1; } });
  assert.throws(() => normalizeFarmLayout(source));
  const nested = initialFarmLayout();
  Object.defineProperty(nested.placements[0], 'x', { get() { reads++; return 150; } });
  assert.throws(() => normalizeFarmLayout(nested));
  const arrayAccessor = initialFarmLayout();
  Object.defineProperty(arrayAccessor.placements, '0', { get() { reads++; return initialFarmLayout().placements[0]; } });
  assert.throws(() => normalizeFarmLayout(arrayAccessor));
  assert.equal(reads, 0);
  const symbolic = initialFarmLayout(); Object.defineProperty(symbolic.placements[0], Symbol('hidden'), { value: 'secret' });
  const sparse = initialFarmLayout(); delete (sparse.placements as unknown[])[0];
  const decorated = initialFarmLayout(); Object.assign(decorated.placements, { media: 'PRIVATE_PHOTO' });
  const inherited = initialFarmLayout(); Object.setPrototypeOf(inherited.placements[0], { bad: true });
  for (const bad of [symbolic, sparse, decorated, inherited]) assert.throws(() => normalizeFarmLayout(bad));
});

test('applying a draft preserves the latest economy, timers and town rather than its opening snapshot', () => {
  const opening = initialGame(NOW); const before = json(opening);
  const draft = furnishedLayout();
  let latest = harvest(opening, 1, NOW); latest = queueProduction(latest, 'bakery', 'bread', NOW); latest = arriveTownTrain(latest, NOW);
  const result = applyFarmLayout(latest, draft, opening.layout);
  const { layout: _layout, log: _log, ...rest } = result;
  const { layout: _oldLayout, log: _oldLog, ...oldRest } = latest;
  assert.deepEqual(rest, oldRest);
  assert.deepEqual(result.layout, draft);
  assert.equal(result.log[0], '调整了农场建筑与装饰布置。'); assert.ok(result.log.length <= 12);
  result.layout.placements[0].x = 0;
  assert.equal(draft.placements[0].x, 1000);
  assert.deepEqual(opening, before);
});

test('optimistic layout baseline rejects stale saves while equivalent reordered bases are accepted', () => {
  const game = initialGame(NOW); const baseline = json(game.layout);
  const first = applyFarmLayout(game, moveFarmLayoutItem(game.layout, 'house', 1000, 600), baseline);
  const snapshot = json(first);
  assert.throws(() => applyFarmLayout(first, furnishedLayout(), baseline), /已发生变化/);
  assert.deepEqual(first, snapshot);
  const reordered = json(first.layout); reordered.placements.reverse();
  const second = applyFarmLayout(first, furnishedLayout(), reordered);
  assert.deepEqual(second.layout, furnishedLayout());
  const noChange = applyFarmLayout(second, json(second.layout), second.layout);
  assert.deepEqual(noChange.log, second.log);
  assert.deepEqual(applyFarmLayout(game, furnishedLayout()).layout, furnishedLayout());
});

test('ordinary crop, animal, production, offline and town actions retain a changed layout', () => {
  const expected = furnishedLayout();
  let game = applyFarmLayout(initialGame(NOW), expected);
  game = { ...game, coins: 10000, xp: 6000, siloCapacity: 1000, barnCapacity: 1000 };
  game = harvest(game, 1, NOW); game = plant(game, 4, 'wheat', NOW);
  game = buyAnimal(game, 2, 'cow'); game = feedAnimal(game, 2, NOW); game = buildPen(game);
  game = unlockMachine(game, 'dairy'); game = queueProduction(game, 'bakery', 'bread', NOW);
  game = tickGame(game, NOW + 60_000);
  game = arriveTownTrain(game, NOW + 60_000);
  // Supply the synthetic visitor's requested game goods, then exercise both state transitions.
  const visitor = game.town.visitors[0];
  for (const [id, quantity] of Object.entries(visitor.requirements)) game.inventory[id as keyof typeof game.inventory] = quantity;
  game = serveTownVisitor(game, visitor.id, NOW + 60_000);
  game = collectTownVisitor(game, visitor.id, NOW + 120_000);
  assert.deepEqual(game.layout, expected);
  assert.deepEqual(restoreGame(game, NOW + 86400_000).layout, expected);
  const copied = tickGame(game, NOW + 86400_000); copied.layout.placements[0].x = 0;
  assert.equal(game.layout.placements[0].x, 1000);
});

test('version-one, older version-two and older game backups gain deterministic default layouts', () => {
  const old = json(initialGame(NOW)) as unknown as Record<string, unknown>; delete old.layout;
  assert.deepEqual(restoreGame(old, NOW).layout, initialFarmLayout());
  assert.deepEqual(restoreGame({ ...old, version: 1 }, NOW).layout, initialFarmLayout());
  const backup = createGameBackup(initialGame(NOW), NOW);
  delete (backup.game as unknown as Record<string, unknown>).layout;
  assert.deepEqual(parseGameBackup(backup, NOW).layout, initialFarmLayout());
  for (const version of [1, 2]) assert.throws(() => restoreGame({ ...old, version, layout: null }, NOW));
});

test('game backup round trips layout and rejects present malicious layout fields', () => {
  const game = applyFarmLayout(initialGame(NOW), furnishedLayout());
  const backup = createGameBackup(game, NOW);
  assert.deepEqual(parseGameBackup(json(backup), NOW).layout, furnishedLayout());
  assert.equal(backup.game.version, 2);
  for (const value of [null, {}, { ...initialFarmLayout(), location: 'PRIVATE_GPS' }]) {
    const invalid = json(backup); (invalid.game as unknown as Record<string, unknown>).layout = value;
    assert.throws(() => parseGameBackup(invalid, NOW));
  }
});

test('invalid present layout preserves raw recovery data and layout writes leave all real service keys untouched', () => {
  const values = new Map<string, string>([
    ['fieldletter.location.v1', 'PRIVATE_GPS'], ['fieldletter.real-farm.v1', 'PRIVATE_RECORDS'],
    ['field-notes.diagnosis-cases.v1', 'PRIVATE_CASES'], ['fieldletter.clinic-draft.v1', 'PRIVATE_DRAFT'],
  ]);
  const real = [...values];
  const storage = { getItem: (key: string): string | null => values.get(key) ?? null, setItem: (key: string, value: string): void => { values.set(key, value); } };
  const invalid = JSON.stringify({ ...initialGame(NOW), layout: { version: 1, placements: [] } });
  values.set(GAME_SAVE_KEY, invalid);
  const restored = readGameSave(storage, NOW);
  assert.match(restored.warning!, /恢复副本/); assert.equal(values.get(GAME_RECOVERY_KEY), invalid); assert.equal(values.get(GAME_SAVE_KEY), invalid);
  const game = applyFarmLayout(restored.game, furnishedLayout());
  assert.equal(writeGameSave(game, storage), true); assert.deepEqual(readGameSave(storage, NOW).game.layout, furnishedLayout());
  for (const [key, value] of real) assert.equal(values.get(key), value);
  assert.equal(values.get(GAME_RECOVERY_KEY), invalid);
});
