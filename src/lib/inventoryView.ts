import { ITEMS } from './farmContent';
import type { ItemDefinition, ItemId, StorageKind } from './farmTypes';

export type InventorySort = 'catalog' | 'quantity';

/** Treat full-width forms and surrounding whitespace as the same search text. */
export function normalizeInventoryQuery(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

/** A view of owned stock only; filtering and sorting never change the inventory. */
export function inventoryItems(
  inventory: Readonly<Partial<Record<ItemId, number>>>,
  storage: 'all' | StorageKind = 'all',
  query = '',
  sort: InventorySort = 'catalog',
): ItemDefinition[] {
  const search = normalizeInventoryQuery(query);
  const entries = ITEMS.map((item, index) => ({ item, index, quantity: inventory[item.id] ?? 0 }))
    .filter(({ item, quantity }) => quantity > 0
      && (storage === 'all' || item.storage === storage)
      && (!search || normalizeInventoryQuery(item.name).includes(search)));
  if (sort === 'quantity') entries.sort((a, b) => b.quantity - a.quantity || a.index - b.index);
  return entries.map(({ item }) => item);
}
