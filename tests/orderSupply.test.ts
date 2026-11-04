import assert from 'node:assert/strict';
import test from 'node:test';
import { initialGame } from '../src/lib/game.ts';
import { resolveOrderReturn } from '../src/lib/orderSupply.ts';
import type { OrderSupplyOrigin } from '../src/lib/orderSupply.ts';

const origin: OrderSupplyOrigin = { orderId: 'boat-target', kind: 'boat', orderNumber: 2 };
function fixture() {
  const game = initialGame(1793512800000);
  game.orders = [
    { id: 'boat-first', kind: 'boat', requirements: { wheat: 2 }, coins: 10, xp: 2 },
    { id: origin.orderId, kind: 'boat', requirements: { bread: 2 }, coins: 20, xp: 3 },
  ];
  return game;
}

test('order return retains the exact delivery kind and identity without changing the save', () => {
  const game = fixture(), before = structuredClone(game);
  assert.deepEqual(resolveOrderReturn(game, origin), { kind: 'boat', orderId: origin.orderId });
  assert.deepEqual(game, before);
});

test('reordered cards still locate the original order by ID, not its former number', () => {
  const game = fixture();
  game.orders.reverse();
  assert.equal(resolveOrderReturn(game, origin).orderId, origin.orderId);
});

test('completed or replaced orders fall back to their delivery board without selecting a replacement', () => {
  const game = fixture();
  game.orders[1] = { ...game.orders[1], id: 'replacement' };
  assert.deepEqual(resolveOrderReturn(game, origin), { kind: 'boat', orderId: undefined });
  game.orders = [];
  assert.deepEqual(resolveOrderReturn(game, origin), { kind: 'boat', orderId: undefined });
});

test('same ID in another delivery kind cannot become the return target', () => {
  const game = fixture();
  game.orders[1].kind = 'truck';
  assert.deepEqual(resolveOrderReturn(game, origin), { kind: 'boat', orderId: undefined });
  assert.deepEqual(resolveOrderReturn(game, { ...origin, kind: 'truck' }), { kind: 'truck', orderId: origin.orderId });
});
