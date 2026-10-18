import type { ItemId } from './farmTypes';

/** Original, offline NPC town. These records never describe real people or farms. */
export type TownBuildingId = 'store' | 'cafe' | 'inn';
export type TownBuildingLevel = 0 | 1 | 2 | 3;
export interface TownBuilding { id: TownBuildingId; level: TownBuildingLevel }
export interface TownVisitor {
  id: string;
  name: string;
  buildingId: TownBuildingId;
  requirements: Partial<Record<ItemId, number>>;
  coins: number;
  xp: number;
  reputation: number;
  arrivedAt: number;
  startedAt?: number;
  readyAt?: number;
}
export interface TownState {
  version: 1;
  reputation: number;
  trainSerial: number;
  nextTrainAt: number;
  buildings: TownBuilding[];
  visitors: TownVisitor[];
}
export interface TownBuildingDefinition {
  id: TownBuildingId;
  name: string;
  icon: string;
  description: string;
  unlockReputation: number;
  buildCost: number;
  serviceMs: number;
}
