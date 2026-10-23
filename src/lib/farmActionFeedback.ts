import { ITEMS, LIVESTOCK } from './farmContent';
import type { Game, ItemId } from './farmTypes';

export type FarmActionKind = 'plant' | 'harvest' | 'feed' | 'collect';

export type FarmActionFeedbackChip = {
  id: ItemId | 'xp';
  label: string;
  delta: number;
};

export type FarmActionFeedbackData = {
  action: FarmActionKind;
  title: string;
  count: number;
  chips: FarmActionFeedbackChip[];
  remainingCount: number;
  unsaved: boolean;
};

const titles: Record<FarmActionKind, string> = {
  plant: '本次播种',
  harvest: '本次收获',
  feed: '本次投喂',
  collect: '本次收取',
};

/** Describe a completed action; this never predicts yields or writes game state. */
export function createFarmActionFeedback(
  before: Game,
  after: Game,
  action: FarmActionKind,
  changedIds: readonly number[],
  saved?: boolean,
): FarmActionFeedbackData | null {
  const stockDelta = (id: ItemId) => (after.inventory[id] ?? 0) - (before.inventory[id] ?? 0);
  const completed = new Set(changedIds.filter(id => {
    if (!Number.isSafeInteger(id) || id < 1) return false;
    if (action === 'plant' || action === 'harvest') {
      const previous = before.plots.find(plot => plot.id === id);
      const next = after.plots.find(plot => plot.id === id);
      if (!previous || !next) return false;
      return action === 'plant'
        ? previous.crop === null && next.crop !== null && next.plantedAt !== undefined && next.readyAt !== undefined && stockDelta(next.crop) < 0
        : previous.crop !== null && next.crop === null && after.harvests > before.harvests && stockDelta(previous.crop) > 0;
    }
    const previous = before.animals.find(pen => pen.id === id);
    const next = after.animals.find(pen => pen.id === id);
    if (!previous?.animal || next?.animal !== previous.animal) return false;
    const animal = LIVESTOCK.find(item => item.id === previous.animal);
    if (!animal) return false;
    return action === 'feed'
      ? previous.readyAt === undefined && next.readyAt !== undefined && next.fedAt !== undefined && stockDelta(animal.feedItem) < 0
      : action === 'collect' && previous.readyAt !== undefined && next.readyAt === undefined && after.productsCollected > before.productsCollected && stockDelta(animal.product) > 0;
  }));
  if (!completed.size) return null;

  // Enumerate the catalog so newly gained items and stock consumed down to zero
  // both appear. Material bonuses come from the committed inventory delta too.
  const changes: FarmActionFeedbackChip[] = [];
  for (const item of ITEMS) {
    const delta = stockDelta(item.id);
    if (Number.isFinite(delta) && delta !== 0) changes.push({ id: item.id, label: item.name, delta });
  }
  const experience = after.xp - before.xp;
  if (Number.isFinite(experience) && experience !== 0) changes.push({ id: 'xp', label: '经验', delta: experience });
  if (!changes.length) return null;

  return {
    action,
    title: titles[action],
    count: completed.size,
    chips: changes.slice(0, 3),
    remainingCount: Math.max(0, changes.length - 3),
    unsaved: saved === false,
  };
}
