/** Original game scenery only. These coordinates never describe a real farm. */
export type FarmLayoutItemId = 'house' | 'production' | 'livestock' | 'flowerbed-1' | 'flowerbed-2' | 'hedge-1' | 'hedge-2' | 'fence-1' | 'fence-2';
export type FarmLayoutItemKind = 'house' | 'production' | 'livestock' | 'flowerbed' | 'hedge' | 'fence';

export interface FarmLayoutPlacement {
  id: FarmLayoutItemId;
  x: number;
  y: number;
  placed: boolean;
}

export interface FarmLayout {
  version: 1;
  placements: FarmLayoutPlacement[];
}

export interface FarmLayoutItemDefinition {
  id: FarmLayoutItemId;
  name: string;
  kind: FarmLayoutItemKind;
  width: number;
  height: number;
  defaultX: number;
  defaultY: number;
  movable: boolean;
}
