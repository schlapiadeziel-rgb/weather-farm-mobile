import assert from 'node:assert/strict';
import test from 'node:test';
import { CROPS, ITEMS, LIVESTOCK, MACHINES, RECIPES } from '../src/lib/farmContent.ts';
import { ORCHARD_FRUITS } from '../src/lib/farmEconomy.ts';
import { getItemSource } from '../src/lib/itemSource.ts';
import type { ItemId } from '../src/lib/farmTypes.ts';

test('all 98 registered goods have a source in the existing, complete source partition', () => {
  const byTab: Record<string, ItemId[]> = {};
  for (const item of ITEMS) {
    const source = getItemSource(item.id);
    (byTab[source.tab] ??= []).push(item.id);
    assert.ok(source.label.length > 0, item.id);
  }
  assert.equal(ITEMS.length, 98);
  assert.deepEqual(Object.fromEntries(Object.entries(byTab).map(([tab, ids]) => [tab, ids.length])), {
    farm: 12, production: 57, livestock: 5, explore: 11, storage: 13,
  });
  assert.equal(new Set(Object.values(byTab).flat()).size, ITEMS.length);
});

test('crop and livestock navigation identifies the actual seed or producing animal', () => {
  for (const crop of CROPS) {
    assert.deepEqual(getItemSource(crop.id), { tab: 'farm', label: '农田', cropId: crop.id });
  }
  for (const animal of LIVESTOCK) {
    assert.deepEqual(getItemSource(animal.product), { tab: 'livestock', label: '牧场', animalId: animal.id });
  }
});

test('all production outputs locate their registered machines and displayed source names', () => {
  for (const recipe of RECIPES) {
    const machine = MACHINES.find(entry => entry.id === recipe.machine);
    assert.ok(machine, recipe.output);
    assert.deepEqual(getItemSource(recipe.output), { tab: 'production', label: machine.name, machineId: machine.id });
  }
  assert.deepEqual(getItemSource('chicken_feed'), { tab: 'production', label: '饲料坊', machineId: 'feed_mill' });
});

test('all six harvestable orchard fruits locate the orchard rather than storage', () => {
  assert.equal(ORCHARD_FRUITS.length, 6);
  assert.deepEqual(ITEMS.filter(item => getItemSource(item.id).tab === 'explore' && getItemSource(item.id).label === '果园').map(item => item.id).sort(), ORCHARD_FRUITS.map(fruit => fruit.id).sort());
  for (const fruit of ORCHARD_FRUITS) {
    assert.deepEqual(getItemSource(fruit.id), { tab: 'explore', label: '果园', section: 'orchard' });
  }
});

test('fish, honey and all mine ores identify precise exploration sections', () => {
  assert.deepEqual(getItemSource('fish_fillet'), { tab: 'explore', label: '鱼塘', section: 'fishing' });
  assert.deepEqual(getItemSource('honey'), { tab: 'explore', label: '蜂箱', section: 'honey' });
  assert.equal(ITEMS.find(item => item.id === 'honey')!.category, 'animal');
  for (const id of ['coal', 'iron_ore', 'gold_ore'] as const) {
    assert.deepEqual(getItemSource(id), { tab: 'explore', label: '矿山', section: 'mine' });
  }
});

test('processed goods are distinct from their raw inputs even when names or icons overlap', () => {
  const cases = [
    ['honey', 'beeswax', 'honey_extractor'],
    ['apple', 'apple_jam', 'jam_maker'],
    ['iron_ore', 'iron_bar', 'smelter'],
    ['gold_ore', 'gold_bar', 'smelter'],
    ['fish_fillet', 'fish_soup', 'soup_kitchen'],
    ['coffee_bean', 'espresso', 'coffee_kiosk'],
    ['milk', 'cream', 'dairy'],
    ['goat_milk', 'goat_cheese', 'dairy'],
  ] as const;
  for (const [raw, processed, machineId] of cases) {
    assert.notEqual(getItemSource(raw).tab, 'production', raw);
    const source = getItemSource(processed);
    assert.equal(source.tab, 'production', processed);
    if (source.tab === 'production') assert.equal(source.machineId, machineId, processed);
  }
});

test('building materials, tools and expansion items use inventory without pretending to be mine outputs', () => {
  const expected: ItemId[] = ['plank', 'screw', 'bolt', 'duct_tape', 'nail', 'wood_panel', 'saw', 'axe', 'shovel', 'dynamite', 'land_deed', 'mallet', 'marker_stake'];
  assert.deepEqual(ITEMS.filter(item => getItemSource(item.id).tab === 'storage').map(item => item.id).sort(), [...expected].sort());
  for (const id of expected) {
    assert.deepEqual(getItemSource(id), { tab: 'storage', label: '仓库', section: 'inventory' });
  }
});

test('resolving every source leaves content intact and returned data does not pollute later requests', () => {
  const content = [ITEMS, CROPS, LIVESTOCK, MACHINES, RECIPES];
  const before = JSON.stringify(content);
  for (const item of ITEMS) getItemSource(item.id);
  assert.equal(JSON.stringify(content), before);

  const source = getItemSource('apple');
  Object.assign(source, { label: 'caller edit', section: 'mine' });
  assert.deepEqual(getItemSource('apple'), { tab: 'explore', label: '果园', section: 'orchard' });
  assert.equal(JSON.stringify(content), before);
});

test('an unknown item is rejected instead of gaining a false inventory source', () => {
  assert.throws(() => getItemSource('unknown-item' as ItemId), /找不到这种游戏物品/);
});
