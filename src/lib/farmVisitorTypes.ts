import type { ItemId } from './farmTypes';

export type FarmVisitorProfileId = 'seed_post' | 'reed_basket' | 'morning_kitchen' | 'blue_lantern';
export interface FarmVisitorProfile {
  id: FarmVisitorProfileId;
  name: string;
  tagline: string;
  greeting: string;
  color: string;
}
/** A simulated customer; never a real buyer or market demand signal. */
export interface FarmVisitor {
  id: string;
  profileId: FarmVisitorProfileId;
  item: ItemId;
  quantity: number;
  coins: number;
  xp: number;
  arrivedAt: number;
}
export interface FarmVisitorsState {
  version: 1;
  serial: number;
  nextArrivalAt: number;
  visitor: FarmVisitor | null;
}
