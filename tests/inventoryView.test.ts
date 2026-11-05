import assert from 'node:assert/strict';
import test from 'node:test';
import { ITEMS } from '../src/lib/farmContent.ts';
import { inventoryItems, normalizeInventoryQuery } from '../src/lib/inventoryView.ts';
import type { ItemId } from '../src/lib/farmTypes.ts';

test('inventory search matches owned Chinese names with surrounding Unicode whitespace', () => {
  const inventory = { milk: 8, goat_milk: 3, cream: 5, corn: 4, wheat: 0 };
  assert.deepEqual(new Set(inventoryItems(inventory, 'all', '　奶\t').map(item => item.id)), new Set(['milk', 'goat_milk', 'cream']));
  assert.equal(inventoryItems(inventory, 'all', '小麦').length, 0);
  assert.equal(inventoryItems(inventory, 'all', '不存在').length, 0);
});

test('search normalization handles full-width Latin input, case and empty whitespace', () => {
  assert.equal(normalizeInventoryQuery('　ＡbＣ  '), 'abc');
  assert.equal(normalizeInventoryQuery('\n\t　'), '');
  assert.equal(normalizeInventoryQuery('奶油'), '奶油');
  assert.deepEqual(inventoryItems({ wheat: 2 }, 'all', '　').map(item => item.id), ['wheat']);
});

test('storage filters combine with name matching and quantity ordering', () => {
  const inventory = { wheat: 5, corn: 5, carrot: 7, egg: 5, cream: 4 };
  assert.deepEqual(inventoryItems(inventory, 'all', '', 'quantity').map(item => item.id), ['carrot', 'wheat', 'corn', 'egg', 'cream']);
  assert.deepEqual(inventoryItems(inventory, 'silo', '', 'quantity').map(item => item.id), ['carrot', 'wheat', 'corn']);
  assert.deepEqual(inventoryItems(inventory, 'barn', '奶').map(item => item.id), ['cream']);
  assert.deepEqual(inventoryItems(inventory, 'silo', '奶').map(item => item.id), []);
});

test('all registered owned goods can be found and sorting preserves catalog tie order', () => {
  const inventory = Object.fromEntries(ITEMS.map(item => [item.id, 1])) as Record<ItemId, number>;
  const catalog = inventoryItems(inventory);
  assert.equal(catalog.length, 98);
  assert.deepEqual(inventoryItems(inventory, 'all', '', 'quantity'), catalog);
  for (const item of ITEMS) assert.ok(inventoryItems(inventory, 'all', item.name).some(found => found.id === item.id), item.name);
});

test('browsing cannot mutate stock or global content and reacts to updated quantities', () => {
  const inventory = Object.freeze({ wheat: 2, corn: 6, egg: 0 });
  const catalogBefore = JSON.stringify(ITEMS);
  inventoryItems(inventory, 'all', '', 'quantity');
  assert.deepEqual(inventory, { wheat: 2, corn: 6, egg: 0 });
  assert.equal(JSON.stringify(ITEMS), catalogBefore);
  assert.deepEqual(inventoryItems({ ...inventory, wheat: 0, egg: 7 }, 'all', '', 'quantity').map(item => item.id), ['egg', 'corn']);
});
