import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, queueProduction, collectProduction, speedUpMachine, unlockMachine, productionSlotCost, expandProductionSlots, cancelQueuedProduction, RECIPES, MACHINES, storageUsed, restoreGame } from '../src/lib/game.ts';
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

test('additional production slots cost increasing gems and preserve inventory and existing work', () => {
  const game = queueProduction(initialGame(NOW), 'bakery', 'bread', NOW); const snapshot = structuredClone(game);
  assert.equal(productionSlotCost(game, 'bakery'), 5);
  const expanded = expandProductionSlots(game, 'bakery');
  assert.equal(expanded.machines[1].slots, 3); assert.equal(expanded.gems, game.gems - 5);
  assert.equal(productionSlotCost(expanded, 'bakery'), 10); assert.deepEqual(expanded.inventory, game.inventory);
  assert.deepEqual(expanded.machines[1].queue, game.machines[1].queue); assert.equal(expanded.coins, game.coins); assert.equal(expanded.xp, game.xp);
  assert.match(expanded.log[0], /生产槽位.*5 钻石/); assert.deepEqual(game, snapshot);
  const queued = queueProduction(queueProduction(expanded, 'bakery', 'bread', NOW), 'bakery', 'bread', NOW);
  assert.equal(queued.machines[1].queue.length, 3); assert.equal(restoreGame(queued, NOW).machines[1].slots, 3);
});

test('production slot limit, unbuilt factories and invalid or insufficient resources are atomic', () => {
  const game = initialGame(NOW); const capped = structuredClone(game); capped.machines[1].slots = 9;
  const poor = { ...game, gems: 4 }; const invalidSlots = structuredClone(game); invalidSlots.machines[1].slots = 2.5;
  const invalidResources = { ...game, gems: Number.NaN };
  for (const [saved, machine, error] of [
    [capped, 'bakery', /9 个上限/], [poor, 'bakery', /钻石不足/], [game, 'dairy', /先建造/],
    [invalidSlots, 'bakery', /生产槽位无效/], [invalidResources, 'bakery', /钻石无效/],
  ] as const) {
    const snapshot = structuredClone(saved); assert.throws(() => expandProductionSlots(saved, machine), error); assert.deepEqual(saved, snapshot);
  }
  const enough = expandProductionSlots({ ...game, gems: 5 }, 'bakery'); assert.equal(enough.gems, 0);
  const single = structuredClone(game); single.machines[1].slots = 1;
  assert.equal(productionSlotCost(single, 'bakery'), 0); assert.equal(expandProductionSlots({ ...single, gems: 0 }, 'bakery').machines[1].slots, 2);
  const oldExtended = structuredClone(game); oldExtended.machines[1].slots = 10;
  const restored = restoreGame(oldExtended, NOW); assert.equal(restored.machines[1].slots, 10);
  assert.throws(() => expandProductionSlots(restored, 'bakery'), /9 个上限/);
});

test('canceling a middle waiting task refunds all inputs and advances only later serial work', () => {
  const unlocked = expandProductionSlots({ ...initialGame(NOW), xp: 20 }, 'bakery');
  const first = queueProduction(unlocked, 'bakery', 'bread', NOW);
  const second = queueProduction(first, 'bakery', 'corn_bread', NOW);
  const game = queueProduction(second, 'bakery', 'bread', NOW); const snapshot = structuredClone(game); const jobs = game.machines[1].queue;
  const canceled = cancelQueuedProduction(game, 'bakery', jobs[1].id, NOW + 1); const remaining = canceled.machines[1].queue;
  assert.equal(canceled.gems, game.gems - 1); assert.equal(canceled.inventory.wheat, game.inventory.wheat! + 2); assert.equal(canceled.inventory.corn, game.inventory.corn! + 2);
  assert.equal(canceled.inventory.bread, game.inventory.bread); assert.equal(canceled.coins, game.coins); assert.equal(canceled.xp, game.xp);
  assert.equal(remaining.length, 2); assert.deepEqual(remaining[0], jobs[0]);
  assert.equal(remaining[1].id, jobs[2].id); assert.equal(remaining[1].startedAt, remaining[0].readyAt);
  assert.equal(remaining[1].readyAt, jobs[2].readyAt - (jobs[1].readyAt - jobs[1].startedAt));
  assert.match(canceled.log[0], /退回全部原料.*1 钻石/); assert.deepEqual(game, snapshot);
  assert.deepEqual(restoreGame(canceled, NOW + 1).machines[1].queue, remaining);
  const afterSnapshot = structuredClone(canceled); assert.throws(() => cancelQueuedProduction(canceled, 'bakery', jobs[1].id, NOW + 1), /已经取消/); assert.deepEqual(canceled, afterSnapshot);
});

test('waiting cancellation is allowed until one millisecond before start, never at start or after completion', () => {
  const game = queueProduction(queueProduction(initialGame(NOW), 'bakery', 'bread', NOW), 'bakery', 'bread', NOW); const [active, waiting] = game.machines[1].queue;
  assert.equal(cancelQueuedProduction(game, 'bakery', waiting.id, waiting.startedAt - 1).machines[1].queue.length, 1);
  for (const [id, now] of [[active.id, NOW], [waiting.id, waiting.startedAt], [waiting.id, waiting.readyAt - 1], [waiting.id, waiting.readyAt], [active.id, waiting.readyAt]] as const) {
    const snapshot = structuredClone(game); assert.throws(() => cancelQueuedProduction(game, 'bakery', id, now), /尚未开始/); assert.deepEqual(game, snapshot);
  }
  const fast = speedUpMachine(game, 'bakery', active.id, NOW);
  assert.throws(() => cancelQueuedProduction(fast, 'bakery', waiting.id, NOW), /尚未开始/, 'accelerating previous work starts the next job immediately');
});

test('canceling a task with mixed storage inputs is atomic when either warehouse cannot accept its complete refund', () => {
  const ingredients = { ...initialGame(NOW), xp: 180, inventory: { ...initialGame(NOW).inventory, brown_sugar: 2 } };
  const game = queueProduction(queueProduction(ingredients, 'bakery', 'cookie', NOW), 'bakery', 'cookie', NOW); const waiting = game.machines[1].queue[1];
  const fullSilo = { ...game, siloCapacity: storageUsed(game, 'silo') + 1 };
  const fullBarn = { ...game, barnCapacity: storageUsed(game, 'barn') + 1 };
  for (const [saved, error] of [[fullSilo, /粮仓空间不足/], [fullBarn, /货仓空间不足/], [{ ...game, gems: 0 }, /钻石不足/]] as const) {
    const snapshot = structuredClone(saved); assert.throws(() => cancelQueuedProduction(saved, 'bakery', waiting.id, NOW), error); assert.deepEqual(saved, snapshot);
  }
  const exact = { ...game, gems: 1, siloCapacity: storageUsed(game, 'silo') + 2, barnCapacity: storageUsed(game, 'barn') + 2 };
  const canceled = cancelQueuedProduction(exact, 'bakery', waiting.id, NOW);
  assert.equal(canceled.gems, 0); assert.equal(storageUsed(canceled, 'silo'), exact.siloCapacity); assert.equal(storageUsed(canceled, 'barn'), exact.barnCapacity);
  assert.equal(canceled.inventory.wheat, exact.inventory.wheat! + 2); assert.equal(canceled.inventory.egg, exact.inventory.egg! + 1); assert.equal(canceled.inventory.brown_sugar, exact.inventory.brown_sugar! + 1);
});

test('old version 2 save queues retain their schema and support expansion and waiting cancellation', () => {
  const saved = queueProduction(queueProduction(initialGame(NOW), 'feed_mill', 'chicken_feed', NOW), 'feed_mill', 'chicken_feed', NOW);
  const restored = restoreGame(JSON.parse(JSON.stringify(saved)), NOW); const waiting = restored.machines[0].queue[1];
  const expanded = expandProductionSlots(restored, 'feed_mill'); const canceled = cancelQueuedProduction(expanded, 'feed_mill', waiting.id, NOW);
  assert.equal(canceled.version, 2); assert.equal(canceled.machines[0].slots, 3); assert.equal(canceled.machines[0].queue.length, 1);
  assert.deepEqual(Object.keys(canceled).sort(), Object.keys(saved).sort()); assert.equal(restoreGame(canceled, NOW).machines[0].slots, 3);
});

test('waiting cancellation preserves both completed uncollected work and the current active task', () => {
  const roomy = expandProductionSlots(initialGame(NOW), 'bakery');
  const game = queueProduction(queueProduction(queueProduction(roomy, 'bakery', 'bread', NOW), 'bakery', 'bread', NOW), 'bakery', 'bread', NOW);
  const [finished, active, waiting] = game.machines[1].queue; const now = finished.readyAt + 1;
  const canceled = cancelQueuedProduction(game, 'bakery', waiting.id, now);
  assert.deepEqual(canceled.machines[1].queue, [finished, active]); assert.ok(active.startedAt < now && active.readyAt > now);
  assert.equal(collectProduction(canceled, 'bakery', finished.id, now).machines[1].queue[0].id, active.id);
});

test('canceling future work keeps any idle gap and never moves its successor before the current time', () => {
  const future = NOW + 60_000;
  const game = queueProduction(queueProduction(initialGame(NOW), 'bakery', 'bread', future), 'bakery', 'bread', future);
  const [waiting, successor] = game.machines[1].queue; const canceled = cancelQueuedProduction(game, 'bakery', waiting.id, NOW);
  assert.equal(canceled.machines[1].queue[0].id, successor.id); assert.equal(canceled.machines[1].queue[0].startedAt, future);
  assert.equal(canceled.machines[1].queue[0].readyAt, successor.readyAt - bread.durationMs); assert.ok(canceled.machines[1].queue[0].startedAt > NOW);
  const snapshot = structuredClone(game); assert.throws(() => cancelQueuedProduction(game, 'bakery', waiting.id, Number.NaN), /计时时间无效/); assert.deepEqual(game, snapshot);
});
