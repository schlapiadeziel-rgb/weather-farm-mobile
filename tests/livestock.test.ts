import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame, buyAnimal, feedAnimal, collectProduct, clearAnimal, advanceDay, getAdvice, LIVESTOCK } from '../src/lib/game.ts';
import type { Game, WeatherDay } from '../src/lib/game.ts';
const weather: WeatherDay = { date: '2026-10-08', temp: 22, minTemp: 17, maxTemp: 25, humidity: 60, rain: 0, rainChance: 10, wind: 8, et0: 2, code: 0 };
const changePen = (game: Game, id: number, changes: Partial<Game['animals'][number]>): Game => ({ ...game, animals: game.animals.map(p => p.id === id ? { ...p, ...changes } : p) });

test('initial chicken produces eggs and product cannot be collected twice', () => {
  const before = initialGame();
  const next = collectProduct(before, 1);
  assert.equal(next.productsCollected, 1);
  assert.equal(next.coins, 538);
  assert.equal(next.xp, 10);
  assert.equal(next.animals[0].progress, 0);
  assert.equal(before.animals[0].progress, 100);
  assert.throws(() => collectProduct(next, 1), /没准备好/);
});

test('buying and feeding charge coins and reject occupied pens or overspending', () => {
  const bought = buyAnimal(initialGame(), 2, 'cow');
  assert.equal(bought.coins, 220);
  assert.equal(bought.animals[1].animal, 'cow');
  const fed = feedAnimal(bought, 2);
  assert.equal(fed.coins, 196);
  assert.equal(fed.animals[1].feed, 100);
  assert.equal(bought.animals[1].feed, 70);
  assert.throws(() => feedAnimal(fed, 2), /吃饱/);
  assert.throws(() => buyAnimal(bought, 2, 'sheep'), /已经有动物/);
  assert.throws(() => buyAnimal({ ...bought, coins: 1 }, 3, 'sheep'), /金币不足/);
  assert.throws(() => feedAnimal(initialGame(), 3), /还没有动物/);
});

test('weather and feeding drive animal production without losing a ready product', () => {
  let game = collectProduct(initialGame(), 1);
  game = advanceDay(game, weather);
  assert.equal(game.animals[0].progress, 50);
  assert.equal(game.animals[0].feed, 54);
  game = advanceDay(game, weather);
  assert.equal(game.animals[0].progress, 100);
  assert.equal(advanceDay(game, weather).animals[0].progress, 100);
  const noFeed = changePen(collectProduct(initialGame(), 1), 1, { feed: 0 });
  const hungry = advanceDay(noFeed, weather);
  assert.equal(hungry.animals[0].progress, 0);
  assert.ok(hungry.animals[0].health < noFeed.animals[0].health);
});

test('extreme weather stresses livestock and numerical states remain bounded', () => {
  const initial = buyAnimal(initialGame(), 2, 'cow');
  const hot = { ...weather, temp: 43, minTemp: 38, maxTemp: 46, humidity: 95, rain: 20 };
  const next = advanceDay(initial, hot);
  assert.ok(next.animals[1].health < initial.animals[1].health);
  assert.ok(next.animals[1].progress < advanceDay(initial, weather).animals[1].progress);
  let game = next;
  for (let i = 0; i < 25; i++) game = advanceDay(game, hot);
  for (const pen of game.animals) for (const value of [pen.health, pen.feed, pen.progress]) assert.ok(value >= 0 && value <= 100);
  assert.throws(() => collectProduct(game, 2), /死亡/);
  const cleared = clearAnimal(game, 2);
  assert.equal(cleared.animals[1].animal, null);
  assert.equal(buyAnimal({ ...cleared, coins: 1000 }, 2, 'sheep').animals[1].animal, 'sheep');
  assert.throws(() => clearAnimal(initialGame(), 1), /还活着/);
});

test('animal advice differentiates game hunger from real-field weather context', () => {
  const hungry = changePen(initialGame(), 1, { feed: 8 });
  assert.ok(getAdvice(hungry, weather).some(a => a.id === 'animal-feed'));
  assert.ok(!getAdvice(hungry, weather, 30).some(a => a.id === 'animal-feed'));
  assert.ok(getAdvice(hungry, { ...weather, maxTemp: 36 }).some(a => /养殖/.test(a.detail)));
  assert.deepEqual(LIVESTOCK.map(a => a.product), ['鸡蛋', '牛奶', '羊毛']);
});
