import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceDay, clearPlot, CROPS, getAdvice, harvest, initialGame, plant, water } from '../src/lib/game.ts';
import type { Game, WeatherDay } from '../src/lib/game.ts';

const mildWeather: WeatherDay = {
  date: '2026-10-08', temp: 23, minTemp: 18, maxTemp: 27, humidity: 60,
  rain: 0, rainChance: 10, wind: 8, et0: 2, code: 0,
};
const copy = <T>(value: T): T => structuredClone(value);
const updatePlot = (game: Game, plotId: number, changes: Partial<Game['plots'][number]>): Game => ({
  ...game, plots: game.plots.map((plot) => plot.id === plotId ? { ...plot, ...changes } : { ...plot }),
});

test('new game has twelve unique plots and an immediately harvestable crop', () => {
  const game = initialGame();
  assert.equal(game.coins, 500);
  assert.equal(game.plots.length, 12);
  assert.equal(new Set(game.plots.map((plot) => plot.id)).size, 12);
  assert.equal(game.plots.filter((plot) => plot.crop).length, 3);
  assert.equal(game.plots[0].growth, 100);
  assert.ok(CROPS.every((crop) => crop.days >= 3 && crop.days <= 7));
  assert.notStrictEqual(initialGame().plots, game.plots);
});

test('planting charges exactly once and refuses occupied plots, invalid crops or funds', () => {
  const before = initialGame();
  const snapshot = copy(before);
  const after = plant(before, 4, 'tomato');
  assert.equal(after.coins, 435);
  assert.equal(after.plots[3].crop, 'tomato');
  assert.equal(after.plots[3].growth, 0);
  assert.deepEqual(before, snapshot);
  assert.throws(() => plant(after, 4, 'tomato'), /已经有作物/);
  assert.throws(() => plant({ ...before, coins: 34 }, 4, 'radish'), /金币不足/);
  assert.throws(() => plant(before, 999, 'radish'), /找不到这块田/);
  assert.throws(() => plant(before, 4, 'unknown' as never), /找不到这个作物/);
});

test('harvesting pays for healthy ripe crops, empties the plot and rejects double harvest', () => {
  const before = initialGame();
  const snapshot = copy(before);
  const after = harvest(before, 1);
  assert.ok(after.coins > before.coins);
  assert.equal(after.harvests, 1);
  assert.equal(after.xp, 25);
  assert.equal(after.plots[0].crop, null);
  assert.equal(after.plots[0].growth, 0);
  assert.deepEqual(before, snapshot);
  assert.throws(() => harvest(after, 1), /没有作物/);
  assert.throws(() => harvest(before, 2), /没有成熟/);
  assert.throws(() => harvest(updatePlot(before, 1, { health: 0 }), 1), /已枯萎/);
});

test('poor crop health reduces harvest reward without permitting dead harvests', () => {
  const game = initialGame();
  const healthyReward = harvest(updatePlot(game, 1, { health: 100 }), 1).coins - game.coins;
  const stressedReward = harvest(updatePlot(game, 1, { health: 20 }), 1).coins - game.coins;
  assert.ok(stressedReward < healthyReward);
  assert.ok(stressedReward > 0);
});

test('watering consumes bounded game water and grants no coins or experience', () => {
  const before = initialGame();
  const snapshot = copy(before);
  const after = water(before, 2);
  assert.ok(after.plots[1].moisture > before.plots[1].moisture);
  assert.ok(after.plots[1].moisture <= 100);
  assert.equal(after.waterUsed, before.waterUsed + 20);
  assert.equal(after.coins, before.coins);
  assert.equal(after.xp, before.xp);
  assert.throws(() => water(after, 2), /已经很湿/);
  assert.throws(() => water(before, 4), /先种植/);
  assert.throws(() => water(updatePlot(before, 2, { health: 0 }), 2), /已枯萎/);
  assert.deepEqual(before, snapshot);
});

test('mild weather advances growth, and wet weather replenishes simulated soil', () => {
  const before = initialGame();
  const snapshot = copy(before);
  const dry = advanceDay(before, mildWeather);
  const rainy = advanceDay(before, { ...mildWeather, rain: 5, rainChance: 90 });
  assert.equal(dry.day, before.day + 1);
  assert.ok(dry.plots[1].growth - before.plots[1].growth >= 14);
  assert.ok(dry.plots[2].growth > before.plots[2].growth);
  assert.ok(dry.plots[1].moisture < before.plots[1].moisture);
  assert.ok(rainy.plots[1].moisture > dry.plots[1].moisture);
  assert.equal(dry.plots[0].growth, 100);
  assert.equal(dry.coins, before.coins);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(advanceDay(before, mildWeather), dry, 'advancement is deterministic');
});

test('hot dry weather causes stress and slows growth relative to suitable conditions', () => {
  const before = initialGame();
  const good = advanceDay(before, mildWeather);
  const stressed = advanceDay(updatePlot(before, 2, { moisture: 20 }), {
    ...mildWeather, temp: 39, minTemp: 30, maxTemp: 44, humidity: 25, et0: 9,
  });
  assert.ok(stressed.plots[1].health < before.plots[1].health);
  assert.ok(stressed.plots[1].growth < good.plots[1].growth);
  assert.ok(stressed.plots[1].moisture < 20);
});

test('frost and saturation damage crops; numerical state remains bounded through many days', () => {
  let game = initialGame();
  const frozen = advanceDay(game, { ...mildWeather, temp: -5, minTemp: -10, maxTemp: 0 });
  assert.ok(frozen.plots[1].health < game.plots[1].health);
  const saturated = advanceDay(game, { ...mildWeather, rain: 100, rainChance: 100 });
  assert.equal(saturated.plots[1].moisture, 100);
  assert.ok(saturated.plots[1].health < game.plots[1].health);
  for (let day = 0; day < 50; day++) {
    game = advanceDay(game, { ...mildWeather, temp: 42, maxTemp: 49, et0: 20, rain: day % 2 ? 0 : 200 });
    for (const plot of game.plots) {
      for (const value of [plot.growth, plot.health, plot.moisture]) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 100);
      }
    }
  }
  assert.ok(game.log.length <= 8);
});

test('dead crops cannot revive by waiting and clearing allows replanting', () => {
  const game = updatePlot(initialGame(), 2, { health: 0, growth: 62 });
  const tomorrow = advanceDay(game, mildWeather);
  assert.equal(tomorrow.plots[1].health, 0);
  assert.equal(tomorrow.plots[1].growth, 62);
  const cleaned = clearPlot(tomorrow, 2);
  assert.equal(cleaned.plots[1].crop, null);
  assert.equal(cleaned.coins, game.coins);
  assert.equal(plant(cleaned, 2, 'wheat').plots[1].crop, 'wheat');
  assert.throws(() => clearPlot(initialGame(), 2), /还在生长/);
  assert.throws(() => clearPlot(initialGame(), 4), /已经是空/);
});

test('advice distinguishes game moisture from measurements and delays watering for rain', () => {
  const game = updatePlot(initialGame(), 2, { moisture: 15 });
  const dryAdvice = getAdvice(game, mildWeather);
  const watering = dryAdvice.find((item) => item.action === 'water');
  assert.deepEqual(watering?.plotIds, [2]);
  assert.match(watering!.detail, /模拟.*不是现实土壤测量/);
  const rainyAdvice = getAdvice(game, { ...mildWeather, rain: 8, rainChance: 95 });
  assert.ok(rainyAdvice.some((item) => item.id === 'rain'));
  assert.ok(rainyAdvice.every((item) => item.action !== 'water'));
  const withInput = getAdvice(game, mildWeather, 24);
  assert.match(withInput.find((item) => item.id === 'context')!.detail, /24%.*不能套用游戏湿度阈值/);
  assert.throws(() => getAdvice(game, mildWeather, 101), /0–100/);
  assert.throws(() => getAdvice(game, mildWeather, Number.NaN), /0–100/);
});

test('advice stays within two to four cards and includes concrete weather context', () => {
  const weather = { ...mildWeather, minTemp: 2, maxTemp: 39, humidity: 88, wind: 28 };
  const advice = getAdvice(initialGame(), weather);
  assert.ok(advice.length >= 2 && advice.length <= 4);
  assert.ok(advice.some((item) => item.id === 'heat'));
  assert.ok(advice.some((item) => item.id === 'cold'));
  assert.ok(advice.some((item) => item.id === 'humidity'));
  assert.match(advice.find((item) => item.id === 'context')!.detail, /2026-10-08.*88%/);
  const windAdvice = getAdvice(initialGame(), { ...mildWeather, wind: 28 });
  assert.ok(windAdvice.some((item) => item.id === 'wind'));
});

test('real-soil input mode never uses simulated plot dryness or wetness for advice', () => {
  let game = updatePlot(initialGame(), 2, { moisture: 5 });
  game = updatePlot(game, 3, { moisture: 100 });
  const advice = getAdvice(game, mildWeather, 24);
  assert.ok(advice.every((item) => item.action !== 'water' && !item.plotIds));
  assert.ok(advice.every((item) => !['water', 'wet-soil', 'growing'].includes(item.id)));
  assert.ok(advice.some((item) => item.id === 'field-weather'));
  assert.match(advice.find((item) => item.id === 'context')!.detail, /24%/);
  const rainy = getAdvice(game, { ...mildWeather, rain: 8, rainChance: 95 }, 24);
  assert.ok(rainy.every((item) => item.action !== 'water' && !item.plotIds));
  assert.match(rainy.find((item) => item.id === 'rain')!.detail, /实地雨量/);
  assert.ok(rainy.every((item) => !item.detail.includes('游戏雨水')));
});

test('invalid weather fails explicitly before changing game state', () => {
  const game = initialGame();
  const snapshot = copy(game);
  assert.throws(() => advanceDay(game, { ...mildWeather, et0: Number.NaN }), /天气数据不完整/);
  assert.throws(() => getAdvice(game, { ...mildWeather, humidity: Number.POSITIVE_INFINITY }), /天气数据不完整/);
  assert.deepEqual(game, snapshot);
});
