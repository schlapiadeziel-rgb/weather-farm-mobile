import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, queueProduction, collectProduction, speedUpMachine, unlockMachine, RECIPES, MACHINES, storageUsed, restoreGame } from '../src/lib/game.ts';
const NOW = Date.parse('2026-10-10T08:00:00Z');
const bread = RECIPES.find(r => r.id === 'bread')!;
const feed = RECIPES.find(r => r.id === 'chicken_feed')!;

test('starter factories consume recipe inputs atomically and sequence real-time work', () => {
  const game = initialGame(NOW); const snapshot = structuredClone(game); const first = queueProduction(game, 'bakery', 'bread', NOW);
  assert.equal(first.inventory.wheat, game.inventory.wheat! - bread.inputs.wheat!); assert.equal(first.coins, game.coins); assert.deepEqual(game, snapshot);
  const second = queueProduction(first, 'bakery', 'bread', NOW); const jobs = second.machines.find(m => m.id === 'bakery')!.queue;
  assert.equal(jobs.length, 2); assert.equal(jobs[0].startedAt, NOW); assert.equal(jobs[1].startedAt, jobs[0].readyAt); assert.ok(jobs[1].readyAt > jobs[0].readyAt); assert.notEqual(jobs[0].id, jobs[1].id);
  assert.throws(() => queueProduction(second, 'bakery', 'bread', jobs[1].readyAt), /队列已满/, 'finished but uncollected products still occupy slots');
});

test('missing inputs wrong factory and locked recipes never partially consume stock', () => {
  const game = initialGame(NOW); const incomplete = { ...game, inventory: { ...game.inventory, corn: 0 } }; const snapshot = structuredClone(incomplete);
  assert.throws(() => queueProduction(incomplete, 'feed_mill', 'chicken_feed', NOW), /库存不足/); assert.deepEqual(incomplete, snapshot);
  assert.throws(() => queueProduction(game, 'feed_mill', 'bread', NOW), /不能在此/);
  assert.throws(() => queueProduction(game, 'dairy', 'cream', NOW), /先建造/);
  assert.throws(() => queueProduction(game, 'bakery', 'cookie', NOW), /级/);
});

test('factory collection adds configured output and XP rather than coins, with ready and duplicate guards', () => {
  const started = queueProduction(initialGame(NOW), 'feed_mill', 'chicken_feed', NOW); const job = started.machines.find(m => m.id === 'feed_mill')!.queue[0]; const snapshot = structuredClone(started);
  assert.throws(() => collectProduction(started, 'feed_mill', job.id, job.readyAt - 1), /没有做好/);
  const collected = collectProduction(started, 'feed_mill', job.id, job.readyAt);
  assert.equal(collected.inventory.chicken_feed, started.inventory.chicken_feed! + feed.quantity); assert.equal(collected.xp, started.xp + feed.xp); assert.equal(collected.coins, started.coins);
  assert.equal(collected.machines.find(m => m.id === 'feed_mill')!.queue.length, 0); assert.deepEqual(started, snapshot);
  assert.throws(() => collectProduction(collected, 'feed_mill', job.id, job.readyAt), /已经收取或不存在/);
});

test('full factory output storage retains the production job and all unclaimed rewards', () => {
  const started = queueProduction(initialGame(NOW), 'feed_mill', 'chicken_feed', NOW); const full = { ...started, barnCapacity: storageUsed(started, 'barn') + feed.quantity - 1 }; const job = full.machines[0].queue[0]; const snapshot = structuredClone(full);
  assert.throws(() => collectProduction(full, 'feed_mill', job.id, job.readyAt), /货仓空间不足/); assert.deepEqual(full, snapshot); assert.equal(full.machines[0].queue.length, 1);
});

test('building factories costs coins and requires both an eligible level and unowned machine', () => {
  const game = initialGame(NOW); assert.throws(() => unlockMachine(game, 'dairy'), /级/); assert.throws(() => unlockMachine(game, 'bakery'), /已经建好了/);
  const leveled = { ...game, xp: 80 }; const built = unlockMachine(leveled, 'dairy');
  assert.equal(built.coins, leveled.coins - MACHINES.find(m => m.id === 'dairy')!.cost); assert.equal(built.machines.at(-1)!.id, 'dairy'); assert.equal(built.machines.at(-1)!.queue.length, 0);
  assert.throws(() => unlockMachine({ ...leveled, coins: 0 }, 'dairy'), /金币不足/);
});

test('machine gem acceleration advances the active job and queue but never freely produces stock', () => {
  const started = queueProduction(queueProduction(initialGame(NOW), 'bakery', 'bread', NOW), 'bakery', 'bread', NOW); const queue = started.machines.find(m => m.id === 'bakery')!.queue; const snapshot = structuredClone(started);
  assert.throws(() => speedUpMachine(started, 'bakery', queue[1].id, NOW), /当前正在制作/);
  const fast = speedUpMachine(started, 'bakery', queue[0].id, NOW); const fastQueue = fast.machines.find(m => m.id === 'bakery')!.queue;
  assert.ok(fast.gems < started.gems); assert.equal(fast.coins, started.coins); assert.deepEqual(fast.inventory, started.inventory); assert.equal(fastQueue[0].readyAt, NOW); assert.equal(fastQueue[1].startedAt, NOW); assert.ok(fastQueue[1].readyAt < queue[1].readyAt); assert.deepEqual(started, snapshot);
  assert.throws(() => speedUpMachine({ ...started, gems: 0 }, 'bakery', queue[0].id, NOW), /钻石不足/);
  assert.equal(restoreGame(fast, NOW).machines.find(m => m.id === 'bakery')!.queue[1].startedAt, NOW);
  const collected = collectProduction(fast, 'bakery', queue[0].id, NOW); assert.equal(collected.inventory.bread, (started.inventory.bread ?? 0) + bread.quantity);
});

test('restoration rejects overlapping jobs, cross-factory recipes and malformed identifiers', () => {
  const started = queueProduction(queueProduction(initialGame(NOW), 'bakery', 'bread', NOW), 'bakery', 'bread', NOW);
  const overlap = structuredClone(started); overlap.machines[1].queue[1].startedAt = NOW;
  const mismatch = structuredClone(started); mismatch.machines[1].queue[0].recipe = 'chicken_feed';
  const badId = structuredClone(started); badId.machines[1].queue[0].id = ' ';
  for (const game of [overlap, mismatch, badId]) assert.throws(() => restoreGame(game, NOW));
});
