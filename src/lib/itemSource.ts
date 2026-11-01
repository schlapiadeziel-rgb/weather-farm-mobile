import { CROPS, LIVESTOCK, MACHINES, RECIPES, getItem } from './farmContent';
import type { AnimalId, CropId, ItemId, MachineId } from './farmTypes';

export type ExploreItemSection = 'orchard' | 'fishing' | 'mine' | 'honey';
export type ItemSource =
  | { tab: 'farm'; label: '农田'; cropId: CropId }
  | { tab: 'livestock'; label: '牧场'; animalId: AnimalId }
  | { tab: 'production'; label: string; machineId: MachineId }
  | { tab: 'explore'; label: '果园' | '鱼塘' | '矿山' | '蜂箱'; section: ExploreItemSection }
  | { tab: 'storage'; label: '仓库'; section: 'inventory' };

/** Describes a game's existing source without changing progress or claiming goods. */
export function getItemSource(id: ItemId): ItemSource {
  const item = getItem(id);
  const crop = CROPS.find(entry => entry.id === id);
  if (crop) return { tab: 'farm', label: '农田', cropId: crop.id };

  // Honey shares the animal category, but is not produced by a livestock pen.
  const animal = LIVESTOCK.find(entry => entry.product === id);
  if (animal) return { tab: 'livestock', label: '牧场', animalId: animal.id };

  const recipe = RECIPES.find(entry => entry.output === id);
  if (recipe) {
    const machine = MACHINES.find(entry => entry.id === recipe.machine);
    if (!machine) throw new Error('找不到这种游戏物品的生产工坊。');
    return { tab: 'production', label: machine.name, machineId: machine.id };
  }

  if (item.category === 'fruit') return { tab: 'explore', label: '果园', section: 'orchard' };
  if (id === 'fish_fillet') return { tab: 'explore', label: '鱼塘', section: 'fishing' };
  if (id === 'honey') return { tab: 'explore', label: '蜂箱', section: 'honey' };
  if (id === 'coal' || id === 'iron_ore' || id === 'gold_ore') return { tab: 'explore', label: '矿山', section: 'mine' };
  return { tab: 'storage', label: '仓库', section: 'inventory' };
}
