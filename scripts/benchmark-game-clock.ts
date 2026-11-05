/** Reproducible CPU microbenchmark, not a device FPS or battery measurement.
 * Run: node --import tsx scripts/benchmark-game-clock.ts
 * tickGame remains the pre-optimization deep-copy path used by game actions.
 */
import { performance } from 'node:perf_hooks';
import { initialGame, refreshGameClock, tickGame, ITEMS, MACHINES, RECIPES } from '../src/lib/game.ts';
import type { Game } from '../src/lib/game.ts';

const now = 1793512800000;
const fresh = initialGame(now);
const idle = tickGame(fresh, now+86_400_000);
const established = initialGame(now);
established.xp = 100_000;
established.siloCapacity = established.barnCapacity = 1000;
established.inventory = Object.fromEntries(ITEMS.map(item => [item.id, 3]));
established.machines = MACHINES.map(machine => ({
  id: machine.id, slots: 9, queue: Array.from({ length: 9 }, (_, index) => {
    const recipe = RECIPES.find(item => item.machine === machine.id)!;
    return { id: `${machine.id}-${index}`, recipe: recipe.output, startedAt: now+index*recipe.durationMs, readyAt: now+(index+1)*recipe.durationMs };
  }),
}));
const iterations = 2000;
function measure(game: Game, time: number, update: typeof tickGame) {
  for (let i = 0; i < 200; i++) update(game, time);
  const samplesMs: number[] = [];
  for (let sample = 0; sample < 5; sample++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) update(game, time);
    samplesMs.push(performance.now()-start);
  }
  return { medianMs: samplesMs.slice().sort((a,b) => a-b)[2], samplesMs };
}
const results = Object.entries({ fresh, idle, established }).map(([fixture, game]) => {
  const time = fixture === 'idle' ? now+86_400_000 : now+1000;
  const before = measure(game, time, tickGame);
  const after = measure(game, time, refreshGameClock);
  return { fixture, iterations, before, after, cpuReductionPercent: (1-after.medianMs/before.medianMs)*100 };
});
console.log(JSON.stringify({ node: process.version, platform: process.platform, scope: 'canonical in-memory clock updates; excludes rendering, network and device performance', results }, null, 2));
