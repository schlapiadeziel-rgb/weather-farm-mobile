import type { Game } from './farmTypes';
import type { FarmLayout, FarmLayoutItemDefinition, FarmLayoutItemId, FarmLayoutPlacement } from './farmLayoutTypes';

export type { FarmLayout, FarmLayoutItemDefinition, FarmLayoutItemId, FarmLayoutPlacement } from './farmLayoutTypes';

export const FARM_LAYOUT_WIDTH = 1200;
export const FARM_LAYOUT_HEIGHT = 700;
export const FARM_LAYOUT_GRID = 50;

/** Ground footprints, rather than the perspective artwork's full visual bounds. */
export const FARM_LAYOUT_ITEMS: readonly Readonly<FarmLayoutItemDefinition>[] = Object.freeze([
  { id: 'house', name: '农场小屋', kind: 'house', width: 200, height: 100, defaultX: 150, defaultY: 250, movable: true },
  { id: 'production', name: '风车工坊', kind: 'production', width: 200, height: 100, defaultX: 850, defaultY: 250, movable: true },
  { id: 'livestock', name: '牧场畜舍', kind: 'livestock', width: 350, height: 100, defaultX: 100, defaultY: 450, movable: true },
  { id: 'flowerbed-1', name: '花圃一', kind: 'flowerbed', width: 100, height: 50, defaultX: 0, defaultY: 0, movable: true },
  { id: 'flowerbed-2', name: '花圃二', kind: 'flowerbed', width: 100, height: 50, defaultX: 0, defaultY: 0, movable: true },
  { id: 'hedge-1', name: '绿篱一', kind: 'hedge', width: 100, height: 50, defaultX: 0, defaultY: 0, movable: true },
  { id: 'hedge-2', name: '绿篱二', kind: 'hedge', width: 100, height: 50, defaultX: 0, defaultY: 0, movable: true },
  { id: 'fence-1', name: '木栅栏一', kind: 'fence', width: 100, height: 50, defaultX: 0, defaultY: 0, movable: true },
  { id: 'fence-2', name: '木栅栏二', kind: 'fence', width: 100, height: 50, defaultX: 0, defaultY: 0, movable: true },
].map(item => Object.freeze(item as FarmLayoutItemDefinition)));

const itemMap = new Map(FARM_LAYOUT_ITEMS.map(item => [item.id, item]));
const isBuilding = (item: Readonly<FarmLayoutItemDefinition>): boolean => item.kind === 'house' || item.kind === 'production' || item.kind === 'livestock';

type ArtworkBounds = Readonly<{ dx: number; dy: number; width: number; height: number }>;
// Visual clearance applies only to the fixed central crops, not terrain or other items.
const landmarkArtworkBounds: Readonly<Partial<Record<FarmLayoutItemId, ArtworkBounds>>> = {
  house: { dx: -14, dy: -103, width: 204, height: 200 },
  production: { dx: -39, dy: -131, width: 255, height: 230 },
  livestock: { dx: -9, dy: -126, width: 375, height: 235 },
};

const clearing: Readonly<Record<number, readonly [number, number]>> = {
  3: [11, 13], 4: [10, 14], 5: [9, 15], 6: [8, 16], 7: [9, 15], 8: [10, 14], 9: [12, 13],
};
const blockedCells: { x: number; y: number }[] = [];
const clearingCells: Readonly<{ x: number; y: number }>[] = [];
for (let row = 0; row < FARM_LAYOUT_HEIGHT / FARM_LAYOUT_GRID; row++) {
  for (let col = 0; col < FARM_LAYOUT_WIDTH / FARM_LAYOUT_GRID; col++) {
    const field = clearing[row];
    const isClearing = field && col >= field[0] && col <= field[1];
    if (col < 2 || row < 2 || isClearing || (col >= 21 && row >= 4 && row <= 7) || (col >= 18 && row >= 8 && row <= 11)) {
      const cell = Object.freeze({ x: col * FARM_LAYOUT_GRID, y: row * FARM_LAYOUT_GRID });
      blockedCells.push(cell);
      if (isClearing) clearingCells.push(cell);
    }
  }
}
export const FARM_LAYOUT_BLOCKED_CELLS: readonly Readonly<{ x: number; y: number }>[] = Object.freeze(blockedCells);

export function getFarmLayoutItem(id: FarmLayoutItemId): Readonly<FarmLayoutItemDefinition> {
  const item = itemMap.get(id);
  if (!item) throw new Error('农场布置物品无效。');
  return item;
}

export function initialFarmLayout(): FarmLayout {
  return { version: 1, placements: FARM_LAYOUT_ITEMS.map(item => ({ id: item.id, x: item.defaultX, y: item.defaultY, placed: isBuilding(item) })) };
}

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('农场布置格式无效。');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('农场布置格式无效。');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value')) || allowed.some(key => !Object.hasOwn(value, key))) {
    throw new Error('农场布置字段不受支持或不完整。');
  }
  return value as Record<string, unknown>;
}

function placementList(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== FARM_LAYOUT_ITEMS.length) throw new Error('农场布置物品数量无效。');
  const allowed = ['length', ...FARM_LAYOUT_ITEMS.map((_, index) => String(index))];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value')) || FARM_LAYOUT_ITEMS.some((_, index) => !Object.hasOwn(value, index))) {
    throw new Error('农场布置物品列表无效。');
  }
  return value;
}

function intersects(x: number, y: number, width: number, height: number, otherX: number, otherY: number, otherWidth: number, otherHeight: number): boolean {
  return x < otherX + otherWidth && x + width > otherX && y < otherY + otherHeight && y + height > otherY;
}

function targetReason(placements: readonly FarmLayoutPlacement[], id: FarmLayoutItemId, x: number, y: number): string {
  const item = getFarmLayoutItem(id);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x % FARM_LAYOUT_GRID !== 0 || y % FARM_LAYOUT_GRID !== 0) return '请在方格内摆放。';
  // The original livestock anchor is farther west than the two other buildings.
  const minX = isBuilding(item) && item.id !== 'livestock' ? 150 : 100;
  const minY = isBuilding(item) ? 200 : 100;
  if (x < minX || y < minY || x + item.width > FARM_LAYOUT_WIDTH || y + item.height > FARM_LAYOUT_HEIGHT) return '这里超出可摆放的农场范围。';
  if (FARM_LAYOUT_BLOCKED_CELLS.some(cell => intersects(x, y, item.width, item.height, cell.x, cell.y, FARM_LAYOUT_GRID, FARM_LAYOUT_GRID))) return '这里是固定地形或中央田地，请选择空地。';
  const artwork = landmarkArtworkBounds[id];
  // Original anchors preserve the existing artwork and older saves at the field edge.
  if (artwork && (x !== item.defaultX || y !== item.defaultY) && clearingCells.some(cell => intersects(x + artwork.dx, y + artwork.dy, artwork.width, artwork.height, cell.x, cell.y, FARM_LAYOUT_GRID, FARM_LAYOUT_GRID))) return '这里的地标会遮住田地，请选择更外侧的空地。';
  for (const other of placements) {
    if (!other.placed || other.id === id) continue;
    const otherItem = getFarmLayoutItem(other.id);
    if (intersects(x, y, item.width, item.height, other.x, other.y, otherItem.width, otherItem.height)) return `这里与${otherItem.name}重叠，请选择空地。`;
  }
  return '';
}

/** Missing old-save data is handled by restoreGame; present data is always strict. */
export function normalizeFarmLayout(value: unknown): FarmLayout {
  const source = record(value, ['version', 'placements']);
  if (source.version !== 1) throw new Error('农场布置版本不受支持。');
  const placements = placementList(source.placements).map(raw => {
    const placement = record(raw, ['id', 'x', 'y', 'placed']);
    const item = getFarmLayoutItem(placement.id as FarmLayoutItemId);
    if (typeof placement.placed !== 'boolean') throw new Error('农场布置摆放状态无效。');
    if (!Number.isSafeInteger(placement.x) || !Number.isSafeInteger(placement.y)) throw new Error('农场布置位置无效。');
    if (!placement.placed && (isBuilding(item) || placement.x !== 0 || placement.y !== 0)) throw new Error('建筑必须保留，未摆放装饰的位置必须归零。');
    return { id: item.id, x: placement.x as number, y: placement.y as number, placed: placement.placed };
  });
  if (new Set(placements.map(item => item.id)).size !== FARM_LAYOUT_ITEMS.length) throw new Error('农场布置包含重复或缺少的物品。');
  for (const placement of placements) {
    if (!placement.placed) continue;
    const reason = targetReason(placements, placement.id, placement.x, placement.y);
    if (reason) throw new Error(reason);
  }
  return { version: 1, placements: FARM_LAYOUT_ITEMS.map(item => ({ ...placements.find(placement => placement.id === item.id)! })) };
}

export function canPlaceFarmLayoutItem(layout: FarmLayout, id: FarmLayoutItemId, x: number, y: number): { valid: boolean; reason: string } {
  const current = normalizeFarmLayout(layout);
  const reason = targetReason(current.placements, id, x, y);
  return { valid: reason === '', reason };
}

export function moveFarmLayoutItem(layout: FarmLayout, id: FarmLayoutItemId, x: number, y: number): FarmLayout {
  const current = normalizeFarmLayout(layout);
  const reason = targetReason(current.placements, id, x, y);
  if (reason) throw new Error(reason);
  return { version: 1, placements: current.placements.map(item => item.id === id ? { id, x, y, placed: true } : item) };
}

export function removeFarmLayoutItem(layout: FarmLayout, id: FarmLayoutItemId): FarmLayout {
  const current = normalizeFarmLayout(layout);
  if (isBuilding(getFarmLayoutItem(id))) throw new Error('住宅、工坊和牧场建筑需要保留，不能收起。');
  return { version: 1, placements: current.placements.map(item => item.id === id ? { id, x: 0, y: 0, placed: false } : item) };
}

/** Applies scenery to the latest live game, without ticking or replacing its economy. */
export function applyFarmLayout(game: Game, layout: FarmLayout, expectedLayout?: FarmLayout): Game {
  const current = normalizeFarmLayout(game.layout);
  const next = normalizeFarmLayout(layout);
  if (expectedLayout !== undefined && JSON.stringify(current) !== JSON.stringify(normalizeFarmLayout(expectedLayout))) throw new Error('农场布置已发生变化，请关闭整理界面后重新打开。');
  if (JSON.stringify(current) === JSON.stringify(next)) return { ...game, layout: next };
  return { ...game, layout: next, log: ['调整了农场建筑与装饰布置。', ...game.log].slice(0, 12) };
}
