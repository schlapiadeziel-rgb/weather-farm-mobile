import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmGameSpeedUp, prepareGameSpeedUp, readGameSpeedQuote } from '../src/lib/gameSpeedUp.ts';
import type { GameSpeedRequest, SpeedUpKind } from '../src/lib/gameSpeedUp.ts';
import { buyAnimal, collectProduct, feedAnimal, harvest, initialGame, plant, speedUpAnimal, speedUpCrop } from '../src/lib/game.ts';
import type { Game } from '../src/lib/farmTypes.ts';

const NOW = Date.parse('2026-10-16T08:00:00Z');
const MAX_DATE = 8_640_000_000_000_000;

function growingCrop(): Game {
  const initial = initialGame(NOW);
  return plant({ ...initial, xp: 5000, inventory: { ...initial.inventory, cotton: 3 } }, 4, 'cotton', NOW);
}
function producingAnimal(): Game {
  const initial = initialGame(NOW);
  return feedAnimal(buyAnimal({ ...initial, xp: 5000, inventory: { ...initial.inventory, goat_feed: 3 } }, 2, 'goat'), 2, NOW);
}
function scenario(kind: SpeedUpKind): { game: Game; id: number } {
  return kind === 'crop' ? { game: growingCrop(), id: 4 } : { game: producingAnimal(), id: 2 };
}

test('opening and refreshing a confirmation only reads a specific growth or feeding cycle', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), before = structuredClone(game);
    const request = prepareGameSpeedUp(game, kind, id, NOW);
    assert.equal(request.subject, kind === 'crop' ? 'cotton' : 'goat');
    assert.equal(request.label, kind === 'crop' ? '棉花' : '山羊');
    assert.equal(request.startedAt, NOW); assert.equal(request.readyAt, NOW + 600000); assert.equal(request.maximumCost, 2);
    assert.deepEqual(readGameSpeedQuote(game, request, NOW), { cost: 2, blockedReason: '' });
    assert.deepEqual(readGameSpeedQuote(game, request, NOW + 300000), { cost: 1, blockedReason: '' });
    assert.deepEqual(game, before, 'preparing and quoting must not spend, tick, harvest, collect or log');
    assert.deepEqual(request, prepareGameSpeedUp(game, kind, id, NOW));
  }
});

test('live quotes use exact five-minute boundaries and stop charging at the completion timestamp', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), request = prepareGameSpeedUp(game, kind, id, NOW);
    for (const [remaining, expected] of [[600000, 2], [300001, 2], [300000, 1], [1, 1]]) {
      assert.deepEqual(readGameSpeedQuote(game, request, request.readyAt - remaining), { cost: expected, blockedReason: '' });
    }
    for (const time of [request.readyAt, request.readyAt + 1]) {
      const quote = readGameSpeedQuote(game, request, time);
      assert.equal(quote.cost, 0); assert.match(quote.blockedReason, /已完成.*无需钻石.*收获|已完成.*无需钻石.*收集/);
      assert.throws(() => confirmGameSpeedUp(game, request, 1, time), /已完成.*无需钻石/);
      assert.throws(() => prepareGameSpeedUp(game, kind, id, time), /已完成.*无需钻石/);
    }
  }
});

test('an explicit confirmation uses the existing engine and spends no inventory, coins or collection rewards', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), before = structuredClone(game), request = prepareGameSpeedUp(game, kind, id, NOW);
    const next = confirmGameSpeedUp(game, request, 2, NOW);
    assert.deepEqual(next, kind === 'crop' ? speedUpCrop(game, id, NOW) : speedUpAnimal(game, id, NOW));
    assert.equal(next.gems, game.gems - 2); assert.equal(next.coins, game.coins);
    assert.equal(next.xp, game.xp); assert.equal(next.harvests, game.harvests); assert.equal(next.productsCollected, game.productsCollected);
    assert.deepEqual(next.inventory, game.inventory);
    assert.deepEqual(next.plots.filter(item => kind !== 'crop' || item.id !== id), game.plots.filter(item => kind !== 'crop' || item.id !== id));
    assert.deepEqual(next.animals.filter(item => kind !== 'animal' || item.id !== id), game.animals.filter(item => kind !== 'animal' || item.id !== id));
    assert.equal(kind === 'crop' ? next.plots.find(item => item.id === id)!.readyAt : next.animals.find(item => item.id === id)!.readyAt, NOW);
    assert.deepEqual(game, before);
  }
});

test('time advancing permits a lower price without requiring the old maximum charge', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), request = prepareGameSpeedUp(game, kind, id, NOW);
    const next = confirmGameSpeedUp(game, request, 2, NOW + 300000);
    assert.equal(next.gems, game.gems - 1);
    assert.deepEqual(next.inventory, game.inventory);
    assert.deepEqual(next, kind === 'crop' ? speedUpCrop(game, id, NOW + 300000) : speedUpAnimal(game, id, NOW + 300000));
  }
});

test('a rollback increasing cost above the original maximum blocks even with plentiful gems', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), before = structuredClone(game);
    const request = prepareGameSpeedUp(game, kind, id, NOW + 300000);
    assert.equal(request.maximumCost, 1);
    const quote = readGameSpeedQuote(game, request, NOW + 299999);
    assert.equal(quote.cost, 2); assert.match(quote.blockedReason, /时间或费用已变化.*上限/);
    assert.throws(() => confirmGameSpeedUp(game, request, 20, NOW + 299999), /上限/);
    assert.deepEqual(game, before);
  }
});

test('a rollback after rendering cannot spend more than the exact displayed amount even below the original maximum', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), before = structuredClone(game), request = prepareGameSpeedUp(game, kind, id, NOW);
    const renderedCost = readGameSpeedQuote(game, request, NOW + 300000).cost;
    assert.equal(renderedCost, 1); assert.equal(request.maximumCost, 2);
    assert.deepEqual(readGameSpeedQuote(game, request, NOW + 299999), { cost: 2, blockedReason: '' });
    assert.throws(() => confirmGameSpeedUp(game, request, renderedCost, NOW + 299999), /高于刚才确认.*尚未扣除/);
    assert.deepEqual(game, before);
  }
});

test('changing the subject, start or finish time invalidates the captured target even when its ID stays the same', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), request = prepareGameSpeedUp(game, kind, id, NOW);
    for (const variation of ['subject', 'startedAt', 'readyAt', 'removed', 'deleted'] as const) {
      const changed = structuredClone(game);
      if (kind === 'crop') {
        const plot = changed.plots.find(item => item.id === id)!;
        if (variation === 'subject') plot.crop = 'tomato';
        if (variation === 'startedAt') plot.plantedAt = NOW + 1;
        if (variation === 'readyAt') plot.readyAt! += 1;
        if (variation === 'removed') plot.crop = null;
        if (variation === 'deleted') changed.plots = changed.plots.filter(item => item.id !== id);
      } else {
        const pen = changed.animals.find(item => item.id === id)!;
        if (variation === 'subject') pen.animal = 'cow';
        if (variation === 'startedAt') pen.fedAt = NOW + 1;
        if (variation === 'readyAt') pen.readyAt! += 1;
        if (variation === 'removed') pen.animal = null;
        if (variation === 'deleted') changed.animals = changed.animals.filter(item => item.id !== id);
      }
      const before = structuredClone(changed), quote = readGameSpeedQuote(changed, request, NOW);
      assert.equal(quote.cost, 0); assert.ok(quote.blockedReason);
      assert.throws(() => confirmGameSpeedUp(changed, request, 20, NOW));
      assert.deepEqual(changed, before);
    }
  }
});

test('real harvest/replant and collection/refeeding cannot reuse the previous cycle confirmation', () => {
  const cropGame = growingCrop(), cropRequest = prepareGameSpeedUp(cropGame, 'crop', 4, NOW), doneAt = cropRequest.readyAt;
  const replanted = plant(harvest(cropGame, 4, doneAt), 4, 'cotton', doneAt);
  assert.match(readGameSpeedQuote(replanted, cropRequest, doneAt).blockedReason, /批次已变化/);
  assert.throws(() => confirmGameSpeedUp(replanted, cropRequest, 2, doneAt), /批次已变化/);
  const animalGame = producingAnimal(), animalRequest = prepareGameSpeedUp(animalGame, 'animal', 2, NOW);
  const refed = feedAnimal(collectProduct(animalGame, 2, animalRequest.readyAt), 2, animalRequest.readyAt);
  assert.match(readGameSpeedQuote(refed, animalRequest, animalRequest.readyAt).blockedReason, /批次已变化/);
  assert.throws(() => confirmGameSpeedUp(refed, animalRequest, 2, animalRequest.readyAt), /批次已变化/);
});

test('insufficient or changed gem balances block confirmation without altering the target', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), request = prepareGameSpeedUp(game, kind, id, NOW);
    for (const gems of [0, 1]) {
      const changed = { ...game, gems }, before = structuredClone(changed), quote = readGameSpeedQuote(changed, request, NOW);
      assert.equal(quote.cost, 2); assert.match(quote.blockedReason, /还差.*游戏钻石/);
      assert.throws(() => confirmGameSpeedUp(changed, request, 2, NOW), /还差.*游戏钻石/);
      assert.deepEqual(changed, before);
    }
    const exact = { ...game, gems: 2 };
    assert.equal(confirmGameSpeedUp(exact, request, 2, NOW).gems, 0);
    assert.equal(readGameSpeedQuote({ ...game, gems: 1 }, request, NOW + 300000).blockedReason, '');
  }
});

test('a second confirmation only reports the finished target and cannot collect or charge again', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), request = prepareGameSpeedUp(game, kind, id, NOW);
    const next = confirmGameSpeedUp(game, request, 2, NOW), before = structuredClone(next), quote = readGameSpeedQuote(next, request, NOW);
    assert.equal(quote.cost, 0); assert.match(quote.blockedReason, /已完成.*无需钻石/);
    assert.throws(() => confirmGameSpeedUp(next, request, 2, NOW), /已完成.*无需钻石/);
    assert.deepEqual(next, before); assert.deepEqual(next.inventory, game.inventory);
    assert.equal(next.harvests, game.harvests); assert.equal(next.productsCollected, game.productsCollected);
  }
});

test('empty, unfed, locked, duplicate, nonexistent and malformed target identities cannot be quoted or prepared', () => {
  const initial = initialGame(NOW), growing = growingCrop();
  const locked = structuredClone(growing); locked.plots[6] = { ...locked.plots[3], id: 7 };
  const duplicate = structuredClone(growing); duplicate.plots[4] = { ...duplicate.plots[3] };
  const animalDuplicate = producingAnimal(); animalDuplicate.animals.push({ ...animalDuplicate.animals[1] });
  const unfed = buyAnimal({ ...initial, xp: 5000 }, 2, 'goat');
  for (const [game, kind, id] of [
    [initial, 'crop', 4], [initial, 'animal', 2], [unfed, 'animal', 2], [locked, 'crop', 7],
    [duplicate, 'crop', 4], [animalDuplicate, 'animal', 2], [initial, 'crop', 999], [initial, 'animal', 999],
  ] as const) assert.throws(() => prepareGameSpeedUp(game, kind, id, NOW));
  for (const id of [-1, 0, 1.5, Number.NaN, Infinity]) assert.throws(() => prepareGameSpeedUp(growing, 'crop', id, NOW), /编号无效/);
  assert.throws(() => prepareGameSpeedUp(growing, 'machine' as never, 4, NOW), /类型无效/);
});

test('invalid request fields, times, costs and gem values always block rather than repair or spend', () => {
  const game = growingCrop(), request = prepareGameSpeedUp(game, 'crop', 4, NOW), before = structuredClone(game);
  const badRequests: GameSpeedRequest[] = [
    null as never, {} as never, { ...request, kind: 'machine' as never }, { ...request, id: 0 },
    { ...request, subject: 'unknown' }, { ...request, label: '不同对象' },
    { ...request, maximumCost: 0 }, { ...request, maximumCost: -1 }, { ...request, maximumCost: 1.5 },
    { ...request, maximumCost: Number.NaN }, { ...request, maximumCost: Infinity },
    { ...request, readyAt: Number.NaN }, { ...request, readyAt: MAX_DATE + 1 },
    { ...request, startedAt: -1 }, { ...request, startedAt: request.readyAt + 1 }, { ...request, startedAt: undefined },
  ];
  for (const bad of badRequests) {
    const quote = readGameSpeedQuote(game, bad, NOW);
    assert.equal(quote.cost, 0); assert.ok(quote.blockedReason);
    assert.throws(() => confirmGameSpeedUp(game, bad, 2, NOW));
  }
  for (const now of [-1, 0.1, Number.NaN, Infinity, MAX_DATE + 1]) {
    assert.throws(() => prepareGameSpeedUp(game, 'crop', 4, now), /时间无效/);
    assert.equal(readGameSpeedQuote(game, request, now).cost, 0);
    assert.throws(() => confirmGameSpeedUp(game, request, 2, now), /时间无效/);
  }
  for (const approvedCost of [0, -1, 0.5, Number.NaN, Infinity]) assert.throws(() => confirmGameSpeedUp(game, request, approvedCost, NOW), /费用无效/);
  for (const gems of [-1, 1.5, Number.NaN, Infinity]) {
    const changed = { ...game, gems };
    assert.equal(readGameSpeedQuote(changed, request, NOW).cost, 0);
    assert.throws(() => confirmGameSpeedUp(changed, request, 2, NOW), /钻石数量无效/);
  }
  assert.deepEqual(game, before);
});

test('corrupt timer values are rejected before deriving costs or invoking the engine', () => {
  for (const kind of ['crop', 'animal'] as const) {
    const { game, id } = scenario(kind), request = prepareGameSpeedUp(game, kind, id, NOW);
    for (const invalid of [undefined, -1, NOW + 0.5, Number.NaN, Infinity, MAX_DATE + 1]) {
      const changed = structuredClone(game);
      if (kind === 'crop') changed.plots.find(item => item.id === id)!.readyAt = invalid;
      else changed.animals.find(item => item.id === id)!.readyAt = invalid;
      assert.throws(() => prepareGameSpeedUp(changed, kind, id, NOW), /计时无效/);
      assert.equal(readGameSpeedQuote(changed, request, NOW).cost, 0);
      assert.throws(() => confirmGameSpeedUp(changed, request, 2, NOW), /计时无效/);
    }
    const reverse = structuredClone(game);
    if (kind === 'crop') reverse.plots.find(item => item.id === id)!.plantedAt = request.readyAt + 1;
    else reverse.animals.find(item => item.id === id)!.fedAt = request.readyAt + 1;
    assert.throws(() => prepareGameSpeedUp(reverse, kind, id, NOW), /计时无效/);
  }
});

test('the engine still rejects corrupt economy state at confirmation without silently fixing it', () => {
  const game = growingCrop(), request = prepareGameSpeedUp(game, 'crop', 4, NOW);
  for (const changed of [{ ...game, coins: -1 }, { ...game, xp: Number.NaN }, { ...game, inventory: { ...game.inventory, wheat: -1 } }]) {
    const before = structuredClone(changed);
    assert.equal(readGameSpeedQuote(changed, request, NOW).blockedReason, '');
    assert.throws(() => confirmGameSpeedUp(changed, request, 2, NOW), /无效/);
    assert.deepEqual(changed, before);
  }
});

test('default confirmation samples the clock once and passes that exact timestamp to the engine', t => {
  const game = growingCrop(), request = prepareGameSpeedUp(game, 'crop', 4, NOW);
  let reads = 0;
  t.mock.method(Date, 'now', () => NOW + 300000 + reads++);
  const next = confirmGameSpeedUp(game, request, 1);
  assert.equal(reads, 1);
  assert.equal(next.plots.find(item => item.id === 4)!.readyAt, NOW + 300000);
  assert.equal(next.gems, game.gems - 1);
});
