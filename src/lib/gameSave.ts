import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { initialGame, restoreGame } from './game';
import type { Game } from './farmTypes';

export const GAME_SAVE_KEY = 'fieldletter.game.v1';
export const GAME_RECOVERY_KEY = 'fieldletter.game.recovery.v1';
export type GameSaveStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface GameBackup {
  app: 'fieldletter';
  kind: 'game';
  formatVersion: 1;
  exportedAt: string;
  game: Game;
}

function localStorageOrNull(storage?: GameSaveStorage): GameSaveStorage | null {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

type RecoveryResult = 'saved' | 'existing' | 'failed';
function preserveInvalidSave(storage: GameSaveStorage, raw: string): RecoveryResult {
  try {
    const previous = storage.getItem(GAME_RECOVERY_KEY);
    // Keep the first recovery copy byte for byte; this is separate from exported backups.
    if (previous !== null) return previous === raw ? 'saved' : 'existing';
    storage.setItem(GAME_RECOVERY_KEY, raw);
    return storage.getItem(GAME_RECOVERY_KEY) === raw ? 'saved' : 'failed';
  } catch { return 'failed'; }
}

/** A broken save is kept for recovery before a fresh playable farm is returned. */
export function readGameSave(storage?: GameSaveStorage, now = Date.now()): { game: Game; warning?: string } {
  const target = localStorageOrNull(storage);
  if (!target) return { game: initialGame(now), warning: '本机存储不可用，暂时使用新农场；进度可能无法保存，请导出游戏备份。' };
  let raw: string | null;
  try { raw = target.getItem(GAME_SAVE_KEY); } catch {
    return { game: initialGame(now), warning: '无法读取本机游戏存档，暂时使用新农场。原存档未被覆盖，请导出本次游戏备份。' };
  }
  if (raw === null || raw === '') return { game: initialGame(now) };
  try { return { game: restoreGame(JSON.parse(raw) as unknown, now) }; } catch {
    const recovery = preserveInvalidSave(target, raw);
    const warning = recovery === 'saved'
      ? '游戏存档无法读取，原始内容已保留在本机恢复副本中；暂时使用新农场。'
      : recovery === 'existing'
        ? '游戏存档无法读取，已有异常存档恢复副本已保留；暂时使用新农场。'
        : '游戏存档无法读取，恢复副本保存失败。原始存档未被覆盖，自动保存已暂停；请导出本次游戏备份。';
    return { game: initialGame(now), warning };
  }
}

/** Returns false on failed writes, including when a broken original cannot be backed up. */
export function writeGameSave(game: Game, storage?: GameSaveStorage): boolean {
  const target = localStorageOrNull(storage);
  if (!target) return false;
  try {
    const canonical = restoreGame(game);
    const previous = target.getItem(GAME_SAVE_KEY);
    if (previous !== null && previous !== '') {
      try { restoreGame(JSON.parse(previous) as unknown); } catch {
        if (preserveInvalidSave(target, previous) === 'failed') return false;
      }
    }
    target.setItem(GAME_SAVE_KEY, JSON.stringify(canonical));
    return true;
  } catch { return false; }
}

/** Whitelisted game fields only: real records, location, and media never enter this file. */
export function createGameBackup(game: Game, now = Date.now()): GameBackup {
  const canonical = restoreGame(game, now);
  return { app: 'fieldletter', kind: 'game', formatVersion: 1, exportedAt: new Date(now).toISOString(), game: canonical };
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('游戏备份格式无效。');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('游戏备份格式无效。');
  return value as Record<string, unknown>;
}
function keys(value: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> {
  const record = plainObject(value);
  if (Object.keys(record).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw new Error('游戏备份字段不受支持或不完整。');
  return record;
}
function entries(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('游戏备份列表无效。');
  return value;
}
function validateBackupGameFields(value: unknown): Record<string, unknown> {
  const required = [
    'version', 'day', 'coins', 'gems', 'xp', 'harvests', 'waterUsed', 'productsCollected', 'plots', 'animals', 'log', 'inventory',
    'siloCapacity', 'barnCapacity', 'unlockedPlots', 'machines', 'orders', 'ordersDelivered', 'orderSerial', 'shopListings', 'orchard',
    'fishingReadyAt', 'mineReadyAt', 'beehiveBuilt', 'beehiveReadyAt', 'achievements',
  ];
  const record = keys(value, [...required, 'town', 'layout', 'farmVisitors'], required);
  if (record.version !== 2) throw new Error('游戏备份中的存档版本不受支持。');
  for (const plot of entries(record.plots)) keys(plot, ['id', 'crop', 'growth', 'health', 'moisture', 'plantedAt', 'readyAt'], ['id', 'crop', 'growth', 'health', 'moisture']);
  for (const pen of entries(record.animals)) keys(pen, ['id', 'animal', 'health', 'feed', 'progress', 'fedAt', 'readyAt'], ['id', 'animal', 'health', 'feed', 'progress']);
  for (const value of entries(record.machines)) {
    const machine = keys(value, ['id', 'slots', 'queue']);
    for (const job of entries(machine.queue)) keys(job, ['id', 'recipe', 'startedAt', 'readyAt']);
  }
  plainObject(record.inventory);
  for (const value of entries(record.orders)) {
    const order = keys(value, ['id', 'kind', 'requirements', 'coins', 'xp']);
    plainObject(order.requirements);
  }
  for (const listing of entries(record.shopListings)) keys(listing, ['id', 'item', 'quantity', 'unitPrice', 'listedAt', 'soldAt', 'collected']);
  for (const tree of entries(record.orchard)) keys(tree, ['id', 'fruit', 'harvests', 'readyAt', 'needsHelp', 'revived']);
  return record;
}

/** Imports only an explicit game backup; raw saves and real-farm backups are rejected. */
export function parseGameBackup(value: unknown, now = Date.now()): Game {
  const backup = keys(value, ['app', 'kind', 'formatVersion', 'exportedAt', 'game']);
  if (backup.app !== 'fieldletter' || backup.kind !== 'game') throw new Error('请选择田野来信的游戏备份，真实农场记录需在农场工作室导入。');
  if (backup.formatVersion !== 1) throw new Error('游戏备份版本不受支持。');
  if (typeof backup.exportedAt !== 'string' || !/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(backup.exportedAt)) throw new Error('游戏备份导出时间无效。');
  const exported = new Date(backup.exportedAt);
  if (!Number.isFinite(exported.getTime()) || exported.toISOString() !== backup.exportedAt) throw new Error('游戏备份导出时间无效。');
  return restoreGame(validateBackupGameFields(backup.game), now);
}

/** Called only by an explicit export action; opens Android's chooser or a web download. */
export async function exportGameBackup(game: Game): Promise<{ shared: boolean }> {
  const backup = createGameBackup(game);
  const filename = `fieldletter-game-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
  const text = JSON.stringify(backup, null, 2);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const file = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: '田野来信 · 游戏进度备份', dialogTitle: '保存或分享游戏备份', files: [file.uri] });
    // This reports that the chooser completed, not that a particular destination saved it.
    return { shared: true };
  }
  if (typeof document === 'undefined') throw new Error('当前环境无法下载游戏备份。');
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return { shared: false };
}
