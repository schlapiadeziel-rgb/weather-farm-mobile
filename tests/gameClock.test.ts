import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, refreshGameClock, restoreGame, tickGame, harvest, queueProduction } from '../src/lib/game.ts';
import type { Game } from '../src/lib/game.ts';

const NOW = 1793512800000;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test('clock refresh matches the established timing at deadlines, offline catch-up and clock rollback', () => {
  const game = freeze(initialGame(NOW));
  const deadlines = [...game.plots.map(plot => plot.readyAt), ...game.animals.map(pen => pen.readyAt)].filter((value): value is number => value !== undefined);
  for (const now of [NOW-1000, NOW, NOW+1, NOW+1000, ...deadlines.flatMap(value => [value-1, value, value+1]), NOW+86_400_000]) {
    assert.deepEqual(refreshGameClock(game, now), tickGame(game, now), `time ${now}`);
  }
});

test('fully settled clocks keep the whole farm reference and do not award stock or rewards', () => {
  const settled = freeze(tickGame(initialGame(NOW), NOW+86_400_000));
  assert.strictEqual(refreshGameClock(settled, NOW+86_400_001), settled);
  assert.strictEqual(refreshGameClock(settled, NOW+172_800_000), settled);
});

test('quantized progress can remain idle before maturity without allocating another farm', () => {
  const game = freeze(initialGame(NOW));
  assert.strictEqual(refreshGameClock(game, NOW+1), game);
  assert.notStrictEqual(refreshGameClock(game, NOW+1000), game);
});

test('active plots copy only changed records while inventory, queues, orders and layout keep identity', () => {
  const game = freeze(initialGame(NOW));
  const next = refreshGameClock(game, NOW+1000);
  assert.notStrictEqual(next.plots, game.plots);
  assert.strictEqual(next.plots[0], game.plots[0]);
  assert.notStrictEqual(next.plots[1], game.plots[1]);
  assert.strictEqual(next.animals, game.animals);
  for (const key of ['inventory','machines','orders','shopListings','orchard','town','layout','farmVisitors','achievements','log'] as const) assert.strictEqual(next[key], game[key], key);
});

test('active animals copy only the changing pen and preserve stable field references', () => {
  const game = tickGame(initialGame(NOW), NOW+86_400_000);
  const start = NOW+86_400_000;
  game.animals[0] = { ...game.animals[0], fedAt: start, readyAt: start+60000, progress: 0 };
  freeze(game);
  const next = refreshGameClock(game, start+30000);
  assert.strictEqual(next.plots, game.plots);
  assert.notStrictEqual(next.animals, game.animals);
  assert.equal(next.animals[0].progress, 50);
  assert.strictEqual(next.animals[1], game.animals[1]);
  assert.deepEqual(next, tickGame(game, start+30000));
});

test('clock refresh rejects invalid time or resources without changing its input', () => {
  const game = freeze(initialGame(NOW));
  for (const now of [-1, Infinity, NaN]) assert.throws(() => refreshGameClock(game, now), /计时时间无效/);
  const invalid = freeze({ ...game, coins: -1 });
  assert.throws(() => refreshGameClock(invalid, NOW), /金币无效/);
});

test('restored saves can use the clock path and still produce the same canonical result', () => {
  const source = JSON.parse(JSON.stringify(initialGame(NOW))) as Game;
  // The restore boundary still owns normalization of older optional sections.
  delete (source as Partial<Game>).layout;
  delete (source as Partial<Game>).town;
  delete (source as Partial<Game>).farmVisitors;
  const restored = freeze(restoreGame(source, NOW));
  assert.deepEqual(refreshGameClock(restored, NOW+30000), tickGame(restored, NOW+30000));
});

test('actions after an identity-preserving clock still own their mutable copies', () => {
  const game = freeze(tickGame(initialGame(NOW), NOW+86_400_000));
  const clock = refreshGameClock(game, NOW+86_400_001);
  const before = structuredClone(game);
  const harvested = harvest(clock, 1, NOW+86_400_001);
  assert.equal(harvested.inventory.wheat, (game.inventory.wheat ?? 0)+2);
  assert.deepEqual(game, before);
  const noIngredients = freeze({ ...clock, inventory: { ...clock.inventory, wheat: 0 } });
  assert.throws(() => queueProduction(noIngredients, 'bakery', 'bread', NOW+86_400_001), /库存不足/);
  assert.equal(noIngredients.inventory.wheat, 0);
  assert.equal(noIngredients.machines.find(machine => machine.id === 'bakery')?.queue.length, 0);
});
