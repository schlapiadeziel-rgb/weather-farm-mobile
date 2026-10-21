/** Read-only scenery signals for game production, never real farm conditions. */
import { MACHINES } from './farmContent';
import { getFarmActivity } from './farmActivity';
import type { FarmActivityTarget } from './farmActivity';
import type { Game } from './farmTypes';

export type FarmMapSignalArea = 'production' | 'livestock';

export interface FarmMapSignal {
  area: FarmMapSignalArea;
  count: number;
  label: string;
  x: number;
  y: number;
  target: FarmActivityTarget;
}

/** Coordinates use the saved 1200 × 700 world, so signals follow moved landmarks. */
export function getFarmMapSignals(game: Game, now: number): FarmMapSignal[] {
  const { sections } = getFarmActivity(game, now);
  const signals: FarmMapSignal[] = [];
  const production = sections.find(section => section.id === 'production');
  const workshop = game.layout.placements.find(placement => placement.id === 'production');
  if (production && production.count > 0 && production.target?.tab === 'production' && workshop?.placed) {
    const machineId = production.target.machineId;
    const name = MACHINES.find(machine => machine.id === machineId)!.name;
    signals.push({
      area: 'production', count: production.count,
      label: `工坊有${production.count}批成品待收，前往${name}查看。`,
      x: workshop.x + 130, y: workshop.y - 55, target: production.target,
    });
  }
  const livestock = sections.find(section => section.id === 'livestock');
  const ranch = game.layout.placements.find(placement => placement.id === 'livestock');
  if (livestock && livestock.count > 0 && livestock.target?.tab === 'livestock' && ranch?.placed) {
    signals.push({
      area: 'livestock', count: livestock.count,
      label: `牧场有${livestock.count}栏待收产物，前往${livestock.target.penId}号畜栏查看。`,
      x: ranch.x + 140, y: ranch.y - 50, target: livestock.target,
    });
  }
  return signals;
}
