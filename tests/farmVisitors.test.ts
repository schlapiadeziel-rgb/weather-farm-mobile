import assert from 'node:assert/strict';
import test from 'node:test';
import { FARM_VISITOR_COOLDOWN_MS, FARM_VISITOR_PROFILES, dismissFarmVisitor, getFarmVisitorProfile, getFarmVisitorSaleBlock, initialFarmVisitors, normalizeFarmVisitors, sellToFarmVisitor, welcomeFarmVisitor } from '../src/lib/farmVisitors.ts';
import type { FarmVisitorsState } from '../src/lib/farmVisitorTypes.ts';
import type { Game, ItemId } from '../src/lib/farmTypes.ts';
import { ITEMS } from '../src/lib/farmContent.ts';
import { harvest, initialGame, plant, queueProduction, restoreGame, tickGame } from '../src/lib/game.ts';
import { applyFarmLayout, moveFarmLayoutItem } from '../src/lib/farmLayout.ts';
import { arriveTownTrain } from '../src/lib/townGame.ts';
import { GAME_RECOVERY_KEY, GAME_SAVE_KEY, createGameBackup, parseGameBackup, readGameSave, writeGameSave } from '../src/lib/gameSave.ts';

const NOW = Date.parse('2026-10-19T08:00:00.000Z');
const MAX_DATE = 8_640_000_000_000_000;
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function withGoods(inventory: Game['inventory'], xp = 0): Game { return { ...initialGame(NOW), inventory, xp }; }
function oneCrop(): Game { return welcomeFarmVisitor(withGoods({ wheat: 7 }), NOW); }
function visitor(game: Game) { assert.ok(game.farmVisitors.visitor); return game.farmVisitors.visitor; }
function storage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

test('initial visitors are deterministic and never appear, spend or reward through ticking', () => {
  const empty = { version: 1, serial: 0, nextArrivalAt: 0, visitor: null };
  assert.deepEqual(initialFarmVisitors(), empty);
  assert.deepEqual(initialGame(NOW).farmVisitors, empty);
  const game = initialGame(NOW); const before = json(game);
  const later = tickGame(game, NOW + 7 * 86400_000);
  assert.deepEqual(later.farmVisitors, empty);
  assert.deepEqual([later.coins, later.xp, later.inventory, later.gems], [game.coins, game.xp, game.inventory, game.gems]);
  assert.deepEqual(game, before);
});

test('four fixed original profiles rotate and lookup rejects an unknown identity', () => {
  assert.deepEqual(FARM_VISITOR_PROFILES.map(profile => profile.name), ['邮差阿穗', '竹匠芦叔', '邻居陶婶', '画师小蓝']);
  assert.ok(FARM_VISITOR_PROFILES.every(profile => profile.tagline && profile.greeting && /^#[a-f0-9]{6}$/i.test(profile.color)));
  let game = initialGame(NOW); let now = NOW;
  for (let serial = 1; serial <= 8; serial++) {
    game = welcomeFarmVisitor(game, now);
    const guest = visitor(game);
    assert.equal(guest.id, `farm-visitor-${serial}`);
    assert.equal(guest.profileId, FARM_VISITOR_PROFILES[(serial - 1) % 4].id);
    assert.equal(getFarmVisitorProfile(guest.profileId).id, guest.profileId);
    game = dismissFarmVisitor(game, guest.id, now);
    now += FARM_VISITOR_COOLDOWN_MS;
  }
  assert.throws(() => getFarmVisitorProfile('unknown' as never));
  assert.equal(Object.isFrozen(FARM_VISITOR_PROFILES), true);
  assert.equal(Object.isFrozen(FARM_VISITOR_PROFILES[0]), true);
});

test('welcome selects owned unlocked surplus, reserves crop seeds and never changes resources', () => {
  const game = initialGame(NOW); const before = json(game);
  const next = welcomeFarmVisitor(game, NOW); const guest = visitor(next);
  assert.equal(guest.item, 'wheat'); assert.equal(guest.quantity, 2);
  assert.equal(guest.coins, Math.ceil(8 * 2 * 1.1)); assert.equal(guest.xp, 4);
  assert.deepEqual(next.inventory, game.inventory); assert.equal(next.coins, game.coins); assert.equal(next.xp, game.xp); assert.equal(next.gems, game.gems);
  assert.equal(next.farmVisitors.nextArrivalAt, 0);
  assert.throws(() => welcomeFarmVisitor(next, NOW), /已有一位/);
  assert.deepEqual(game, before);
  assert.deepEqual(welcomeFarmVisitor(game, NOW), next, 'no random choice or UUID');
});

test('top three available stocks rotate with deterministic ordering instead of demanding absent items', () => {
  let game = withGoods({ wheat: 22, corn: 17, soybean: 12, radish: 3 }); let now = NOW;
  const selected: ItemId[] = [];
  for (let serial = 1; serial <= 6; serial++) {
    game = welcomeFarmVisitor(game, now);
    const guest = visitor(game); selected.push(guest.item);
    assert.ok(guest.quantity >= 1 && guest.quantity <= 5);
    assert.ok(guest.quantity <= game.inventory[guest.item]! - 2);
    game = dismissFarmVisitor(game, guest.id, now); now += FARM_VISITOR_COOLDOWN_MS;
  }
  assert.deepEqual(selected, ['wheat', 'corn', 'soybean', 'wheat', 'corn', 'soybean']);
});

test('each supported category is selected when owned and unlocked including fruit and fish', () => {
  for (const id of ['wheat', 'egg', 'bread', 'apple', 'fish_fillet'] as const) {
    const game = welcomeFarmVisitor(withGoods({ [id]: id === 'wheat' ? 3 : 1 }, 6000), NOW);
    assert.equal(visitor(game).item, id); assert.equal(visitor(game).quantity, 1);
    const next = sellToFarmVisitor(game, visitor(game).id, NOW);
    assert.equal(next.inventory[id], id === 'wheat' ? 2 : 0);
  }
});

test('no fallback demand when only locked goods, seed reserves, feed, materials or minerals are owned', () => {
  for (const inventory of [{}, { wheat: 2, corn: 2 }, { chicken_feed: 10, plank: 10 }, { carrot: 10, apple: 10 }, { coal: 10, iron_ore: 10, gold_ore: 10, iron_bar: 10, gold_bar: 10 }]) {
    const game = withGoods(inventory); const before = json(game);
    assert.throws(() => welcomeFarmVisitor(game, NOW), /没有可出售/);
    assert.deepEqual(game, before);
  }
  const minerals = withGoods({ coal: 10, iron_ore: 10, gold_ore: 10, iron_bar: 10, gold_bar: 10 }, 6000);
  assert.throws(() => welcomeFarmVisitor(minerals, NOW), /没有可出售/);
});

test('waiting never expires and resolving starts exactly a two-minute explicit-arrival cooldown', () => {
  let game = oneCrop(); const guest = visitor(game);
  const muchLater = NOW + 30 * 86400_000;
  game = tickGame(game, muchLater);
  assert.deepEqual(visitor(game), guest);
  assert.equal(getFarmVisitorSaleBlock(game, guest.id, muchLater), '');
  const resolved = dismissFarmVisitor(game, guest.id, muchLater);
  assert.equal(resolved.farmVisitors.visitor, null);
  assert.equal(resolved.farmVisitors.nextArrivalAt, muchLater + 120_000);
  assert.throws(() => welcomeFarmVisitor(resolved, muchLater + 119_999), /倒计时/);
  assert.equal(tickGame(resolved, muchLater + 120_000).farmVisitors.visitor, null);
  assert.equal(visitor(welcomeFarmVisitor(resolved, muchLater + 120_000)).id, 'farm-visitor-2');
});

test('sale uses actual latest inventory and pays only the displayed fixed reward once', () => {
  const game = oneCrop(); const guest = visitor(game); const before = json(game);
  const latest = queueProduction(game, 'bakery', 'bread', NOW);
  assert.equal(latest.inventory.wheat, 4);
  const sold = sellToFarmVisitor(latest, guest.id, NOW);
  assert.equal(sold.inventory.wheat, 2);
  assert.equal(sold.coins, latest.coins + guest.coins); assert.equal(sold.xp, latest.xp + guest.xp);
  assert.equal(sold.gems, latest.gems); assert.equal(sold.productsCollected, latest.productsCollected); assert.equal(sold.ordersDelivered, latest.ordersDelivered); assert.equal(sold.harvests, latest.harvests);
  assert.deepEqual(sold.machines, latest.machines); assert.deepEqual(sold.town, latest.town); assert.deepEqual(sold.layout, latest.layout);
  assert.equal(sold.farmVisitors.visitor, null); assert.equal(sold.farmVisitors.serial, 1); assert.equal(sold.farmVisitors.nextArrivalAt, NOW + 120_000);
  assert.throws(() => sellToFarmVisitor(sold, guest.id, NOW), /已经离开/);
  assert.throws(() => dismissFarmVisitor(sold, guest.id, NOW), /已经离开/);
  assert.deepEqual(game, before);
});

test('latest crop inventory cannot be sold below the two-seed reserve even if total goods suffice', () => {
  const game = oneCrop(); const guest = visitor(game);
  for (const owned of [0, 1, 2, 3]) {
    const latest = { ...game, inventory: { wheat: owned } }; const before = json(latest);
    assert.ok(getFarmVisitorSaleBlock(latest, guest.id, NOW));
    assert.throws(() => sellToFarmVisitor(latest, guest.id, NOW), owned < guest.quantity ? /库存不足/ : /保留 2 份/);
    assert.deepEqual(latest, before);
  }
  const enough = { ...game, inventory: { wheat: 4 } };
  assert.equal(getFarmVisitorSaleBlock(enough, guest.id, NOW), '');
  assert.equal(sellToFarmVisitor(enough, guest.id, NOW).inventory.wheat, 2);
});

test('dismissal is free, still works after inventory is spent and gives no rewards', () => {
  const game = { ...oneCrop(), inventory: {} }; const before = json(game); const guest = visitor(game);
  const next = dismissFarmVisitor(game, guest.id, NOW);
  assert.deepEqual(next.inventory, game.inventory); assert.equal(next.coins, game.coins); assert.equal(next.xp, game.xp); assert.equal(next.gems, game.gems);
  assert.equal(next.farmVisitors.visitor, null); assert.equal(next.farmVisitors.nextArrivalAt, NOW + FARM_VISITOR_COOLDOWN_MS);
  assert.deepEqual(game, before);
});

test('stale ids cannot sell, dismiss or affect the next visitor', () => {
  const game = oneCrop(); const oldId = visitor(game).id;
  const next = welcomeFarmVisitor(dismissFarmVisitor(game, oldId, NOW), NOW + FARM_VISITOR_COOLDOWN_MS); const before = json(next);
  assert.ok(getFarmVisitorSaleBlock(next, oldId, NOW + FARM_VISITOR_COOLDOWN_MS));
  assert.throws(() => sellToFarmVisitor(next, oldId, NOW + FARM_VISITOR_COOLDOWN_MS), /已经离开/);
  assert.throws(() => dismissFarmVisitor(next, oldId, NOW + FARM_VISITOR_COOLDOWN_MS), /已经离开/);
  assert.deepEqual(next, before);
});

test('backward, non-finite, fractional and overflowing times cannot resolve or invite', () => {
  const game = oneCrop(); const guest = visitor(game); const before = json(game);
  for (const now of [NOW - 1, NaN, Infinity, -1, 0.5, MAX_DATE - FARM_VISITOR_COOLDOWN_MS + 1]) {
    assert.ok(getFarmVisitorSaleBlock(game, guest.id, now));
    assert.throws(() => sellToFarmVisitor(game, guest.id, now)); assert.throws(() => dismissFarmVisitor(game, guest.id, now));
  }
  for (const now of [NaN, Infinity, -1, 0.5, MAX_DATE - FARM_VISITOR_COOLDOWN_MS + 1]) assert.throws(() => welcomeFarmVisitor(initialGame(NOW), now));
  assert.deepEqual(game, before);
  const nearEnd = welcomeFarmVisitor(initialGame(NOW), MAX_DATE - FARM_VISITOR_COOLDOWN_MS);
  assert.equal(dismissFarmVisitor(nearEnd, visitor(nearEnd).id, MAX_DATE - FARM_VISITOR_COOLDOWN_MS).farmVisitors.nextArrivalAt, MAX_DATE);
});

test('coin, experience and serial overflow reject atomically and blocked sale explains the reason', () => {
  const game = oneCrop(); const guest = visitor(game);
  for (const field of ['coins', 'xp'] as const) {
    const overflow = { ...game, [field]: Number.MAX_SAFE_INTEGER }; const before = json(overflow);
    assert.match(getFarmVisitorSaleBlock(overflow, guest.id, NOW), /无效/);
    assert.throws(() => sellToFarmVisitor(overflow, guest.id, NOW), /无效/);
    assert.deepEqual(overflow, before);
  }
  const serial = initialGame(NOW); serial.farmVisitors = { version: 1, serial: Number.MAX_SAFE_INTEGER, visitor: null, nextArrivalAt: NOW };
  const before = json(serial);
  assert.throws(() => welcomeFarmVisitor(serial, NOW), /序号无效/); assert.deepEqual(serial, before);
});

test('malformed stock or resource numbers cannot be laundered through visitor operations', () => {
  for (const amount of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const game = { ...oneCrop(), inventory: { wheat: amount } }; const guest = visitor(game);
    assert.ok(getFarmVisitorSaleBlock(game, guest.id, NOW));
    assert.throws(() => sellToFarmVisitor(game, guest.id, NOW));
    assert.throws(() => dismissFarmVisitor(game, guest.id, NOW));
    assert.throws(() => welcomeFarmVisitor(withGoods({ wheat: amount }), NOW));
  }
});

test('state validation returns canonical independent own-data objects', () => {
  const game = oneCrop(); const state = game.farmVisitors; const copy = normalizeFarmVisitors(state);
  assert.deepEqual(copy, state); assert.notEqual(copy, state); assert.notEqual(copy.visitor, state.visitor);
  copy.visitor!.quantity = 5; assert.equal(state.visitor!.quantity, 2);
  const nullPrototype = Object.assign(Object.create(null), state) as FarmVisitorsState;
  assert.deepEqual(normalizeFarmVisitors(nullPrototype), state);
});

test('malformed present visitor states, extra fields and incoherent ids/rewards/times are rejected', () => {
  const good = oneCrop().farmVisitors;
  const mutations: ((state: FarmVisitorsState) => unknown)[] = [
    state => ({ ...state, version: 2 }), state => ({ ...state, serial: -1 }), state => ({ ...state, nextArrivalAt: NOW + 1 }),
    state => ({ ...state, serial: 0 }), state => ({ ...state, serial: 2 }), state => ({ ...state, media: 'PRIVATE_PHOTO' }),
    state => { delete (state as unknown as Record<string, unknown>).visitor; return state; },
    state => { state.visitor!.id = 'farm-visitor-01'; return state; },
    state => { state.visitor!.profileId = 'reed_basket'; return state; },
    state => { state.visitor!.item = 'plank'; return state; },
    state => { state.visitor!.quantity = 0; return state; },
    state => { state.visitor!.quantity = 6; return state; },
    state => { state.visitor!.coins++; return state; }, state => { state.visitor!.xp++; return state; },
    state => { state.visitor!.arrivedAt = MAX_DATE; return state; }, state => { state.visitor!.arrivedAt = NaN; return state; },
    state => { Object.assign(state.visitor!, { name: 'PRIVATE_REAL_FARM' }); return state; },
  ];
  for (const mutate of mutations) assert.throws(() => normalizeFarmVisitors(mutate(json(good))));
  for (const bad of [undefined, null, [], '', 1, { ...initialFarmVisitors(), serial: 1 }, { ...initialFarmVisitors(), nextArrivalAt: 1 }, Object.create(good)]) assert.throws(() => normalizeFarmVisitors(bad));
  const resolved = dismissFarmVisitor(oneCrop(), visitor(oneCrop()).id, NOW).farmVisitors;
  assert.deepEqual(normalizeFarmVisitors(resolved), resolved);
  const second = welcomeFarmVisitor({ ...initialGame(NOW), farmVisitors: resolved }, NOW + 120_000).farmVisitors;
  assert.deepEqual(normalizeFarmVisitors(second), second);
});

test('accessors, inherited fields and symbol extras are rejected without evaluating getters', () => {
  let reads = 0;
  const outer = oneCrop().farmVisitors;
  Object.defineProperty(outer, 'serial', { get() { reads++; return 1; } });
  assert.throws(() => normalizeFarmVisitors(outer));
  const inner = oneCrop().farmVisitors;
  Object.defineProperty(inner.visitor!, 'coins', { get() { reads++; return 18; } });
  assert.throws(() => normalizeFarmVisitors(inner));
  const game = initialGame(NOW);
  Object.defineProperty(game, 'farmVisitors', { get() { reads++; return initialFarmVisitors(); } });
  assert.throws(() => restoreGame(game, NOW));
  assert.equal(reads, 0);
  const symbolic = oneCrop().farmVisitors; Object.defineProperty(symbolic.visitor!, Symbol('private'), { value: 'PRIVATE' });
  const inherited = oneCrop().farmVisitors; Object.setPrototypeOf(inherited.visitor!, { private: 'PRIVATE' });
  assert.throws(() => normalizeFarmVisitors(symbolic)); assert.throws(() => normalizeFarmVisitors(inherited));
});

test('old saves and backups gain visitors only when the field is truly absent', () => {
  const old = json(initialGame(NOW)) as unknown as Record<string, unknown>; delete old.farmVisitors;
  assert.deepEqual(restoreGame(old, NOW).farmVisitors, initialFarmVisitors());
  const backup = createGameBackup(initialGame(NOW), NOW); delete (backup.game as unknown as Record<string, unknown>).farmVisitors;
  assert.deepEqual(parseGameBackup(backup, NOW).farmVisitors, initialFarmVisitors());
  for (const bad of [undefined, null, {}, []]) {
    assert.throws(() => restoreGame({ ...old, farmVisitors: bad }, NOW));
    assert.throws(() => parseGameBackup({ ...backup, game: { ...old, farmVisitors: bad } }, NOW));
  }
});

test('waiting and resolved visitors survive save/backup roundtrips without external fields', () => {
  const waiting = oneCrop(); const resolved = dismissFarmVisitor(waiting, visitor(waiting).id, NOW);
  for (const game of [waiting, resolved]) {
    const store = storage({ 'fieldletter.real.records.v1': 'PRIVATE_RECORD', 'fieldletter.location.v1': 'PRIVATE_LOCATION', 'fieldletter.case.draft.v1': 'PRIVATE_MEDIA' });
    assert.equal(writeGameSave(game, store), true);
    assert.deepEqual(readGameSave(store, NOW).game.farmVisitors, game.farmVisitors);
    const contaminated = { ...game, realRecords: 'PRIVATE_RECORD', location: 'PRIVATE_LOCATION', media: 'PRIVATE_MEDIA' };
    const backup = createGameBackup(contaminated, NOW);
    assert.deepEqual(parseGameBackup(backup, NOW).farmVisitors, game.farmVisitors);
    const text = JSON.stringify(backup);
    for (const marker of ['PRIVATE_RECORD', 'PRIVATE_LOCATION', 'PRIVATE_MEDIA']) assert.equal(text.includes(marker), false);
    assert.equal(store.getItem('fieldletter.real.records.v1'), 'PRIVATE_RECORD');
    assert.equal(store.getItem('fieldletter.location.v1'), 'PRIVATE_LOCATION');
    assert.equal(store.getItem('fieldletter.case.draft.v1'), 'PRIVATE_MEDIA');
  }
});

test('invalid visitor save is preserved byte for byte in recovery before reset', () => {
  const game = oneCrop(); game.farmVisitors.visitor!.coins++;
  const raw = JSON.stringify(game, null, 2); const store = storage({ [GAME_SAVE_KEY]: raw });
  const read = readGameSave(store, NOW);
  assert.ok(read.warning); assert.deepEqual(read.game.farmVisitors, initialFarmVisitors());
  assert.equal(store.getItem(GAME_RECOVERY_KEY), raw); assert.equal(store.getItem(GAME_SAVE_KEY), raw);
  assert.equal(writeGameSave(read.game, store), true); assert.equal(store.getItem(GAME_RECOVERY_KEY), raw);
});

test('ordinary actions, town arrivals and layout changes deep-copy and retain a waiting farm visitor', () => {
  let game = oneCrop(); const expected = json(game.farmVisitors);
  game = harvest(game, 1, NOW); game = plant(game, 4, 'wheat', NOW);
  game = queueProduction(game, 'bakery', 'bread', NOW);
  game = arriveTownTrain(game, NOW);
  game = applyFarmLayout(game, moveFarmLayoutItem(game.layout, 'house', 1000, 600));
  const cloned = tickGame(game, NOW + 60_000);
  assert.deepEqual(cloned.farmVisitors, expected);
  cloned.farmVisitors.visitor!.quantity = 5;
  assert.deepEqual(game.farmVisitors, expected);
  assert.deepEqual(restoreGame(game, NOW + 120_000).farmVisitors, expected);
});

test('normalized reward is exact for every accepted catalog item and quantity without allowing mineral products', () => {
  const excluded = new Set(['coal', 'iron_ore', 'gold_ore', 'iron_bar', 'gold_bar']);
  for (const item of ITEMS) for (let quantity = 1; quantity <= 5; quantity++) {
    const state: FarmVisitorsState = { version: 1, serial: 1, nextArrivalAt: 0, visitor: { id: 'farm-visitor-1', profileId: 'seed_post', item: item.id, quantity, coins: Math.ceil(item.price * quantity * 11 / 10), xp: 2 + quantity, arrivedAt: NOW } };
    if (['crop', 'animal', 'product', 'fruit', 'fish'].includes(item.category) && !excluded.has(item.id)) assert.deepEqual(normalizeFarmVisitors(state), state);
    else assert.throws(() => normalizeFarmVisitors(state));
  }
});
