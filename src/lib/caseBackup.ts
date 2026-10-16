import { CASE_STORAGE_KEY, normalizeObservation, parseDiagnosisOutput } from './fieldDiagnosis';
import type { CaseStorage, FieldObservation, LocalCase, ModelInfo } from './fieldDiagnosis';
import { validTimestamp } from './publicDataHttp';

export const MAX_CASE_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_LOCAL_CASES = 20;
const MAX_STORED_CHARACTERS = 500000;

export interface CaseBackup {
  app: 'fieldletter';
  kind: 'diagnosis-cases';
  formatVersion: 1;
  exportedAt: string;
  cases: LocalCase[];
}

export interface CaseImportPreview {
  readonly incoming: readonly LocalCase[];
  readonly added: readonly LocalCase[];
  readonly duplicates: readonly LocalCase[];
  readonly conflicts: readonly { readonly id: string; readonly existing: LocalCase; readonly incoming: LocalCase }[];
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly blockedReason?: string;
  readonly baseRaw: string | null;
  readonly sourceText: string;
}

// Commit accepts a preview made by this module, and never trusts its mutable
// case objects, counts or flags. Only the original source and baseline are used.
const previewSources = new WeakMap<CaseImportPreview, { sourceText: string; baseRaw: string | null }>();

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error('案例备份格式无效。');
  const allowed = [...required, ...optional];
  if (required.some(key => !Object.hasOwn(value, key))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.includes(key)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) {
    throw new Error('案例备份字段不完整或包含不支持的内容。');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label}无效或过长。`);
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !validTimestamp(value)) throw new Error(`${label}无效。`);
  return value;
}

function rejectNativeFields(value: unknown): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (pending.length) {
    const current = pending.pop()!;
    if (!current.value || typeof current.value !== 'object') continue;
    if (current.depth > 40) throw new Error('案例备份结构过深。');
    for (const [key, child] of Object.entries(current.value)) {
      if (/^(?:localUri|nativePath|filePath|mediaPath|imagePath|videoPath|audioPath|modelPath|path|uri|previewDataUrl|dataUrl|base64|attachments|game|deviceLocation|__proto__|constructor|prototype)$/i.test(key)) {
        throw new Error('案例备份包含原生路径、附件载荷或游戏数据，不能导入。');
      }
      if (child && typeof child === 'object') pending.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function identifier(value: unknown, label: string): string {
  const result = text(value, label, 200);
  if (/^(?:(?:content|file|data|blob|capacitor|cdvfile):|\/|[a-z]:[\\/])/i.test(result)) throw new Error(`${label}不能是设备路径或附件地址。`);
  return result;
}

function modelInfo(value: unknown): ModelInfo | undefined {
  if (value === undefined) return undefined;
  const model = record(value, ['modelId', 'modelName', 'engineVersion', 'durationMs']);
  if (typeof model.durationMs !== 'number' || !Number.isFinite(model.durationMs) || model.durationMs < 0) throw new Error('模型分析耗时无效。');
  return {
    modelId: identifier(model.modelId, '模型编号'), modelName: text(model.modelName, '模型名称', 300),
    engineVersion: text(model.engineVersion, '推理引擎版本', 200), durationMs: model.durationMs,
  };
}

function normalizeCase(value: unknown): LocalCase {
  const item = record(value, ['version', 'id', 'createdAt', 'observation', 'outcome'], ['modelInfo', 'importedAt']);
  if (item.version !== 1) throw new Error('案例版本不受支持。');
  const input = record(item.observation, ['category', 'subject', 'symptoms'], ['onset', 'extent', 'affectedCount', 'totalCount', 'ageOrStage', 'managementNotes', 'measurements', 'media', 'weather']);
  if (input.measurements !== undefined) {
    if (!Array.isArray(input.measurements)) throw new Error('案例实测记录格式无效。');
    input.measurements.forEach(item => record(item, ['name', 'value', 'unit', 'observedAt', 'place'], ['instrument']));
  }
  if (input.media !== undefined) {
    if (!Array.isArray(input.media)) throw new Error('案例附件说明格式无效。');
    input.media.forEach(item => { const media = record(item, ['id', 'kind'], ['description', 'capturedAt', 'timestampSeconds']); identifier(media.id, '附件编号'); });
  }
  if (input.weather !== undefined) record(input.weather, ['sourceName', 'sourceKind', 'observedAt'], ['temperature', 'humidity', 'rainMm', 'windKmh']);
  const outcome = record(item.outcome, ['raw'], ['status', 'result', 'triage', 'notice', 'validationErrors']);
  if (typeof outcome.raw !== 'string') throw new Error('案例原始输出格式无效。');
  const observation = normalizeObservation(input as FieldObservation);
  const provenance = modelInfo(item.modelInfo);
  const importedAt = item.importedAt === undefined ? undefined : timestamp(item.importedAt, '案例导入时间');
  return {
    version: 1, id: identifier(item.id, '案例编号'), createdAt: timestamp(item.createdAt, '案例时间'),
    observation, outcome: parseDiagnosisOutput(outcome.raw, observation),
    ...(provenance ? { modelInfo: provenance } : {}), ...(importedAt !== undefined ? { importedAt } : {}),
  };
}

function normalizeCases(value: unknown): LocalCase[] {
  if (!Array.isArray(value)) throw new Error('案例备份的案例列表无效。');
  const cases = value.map(normalizeCase), ids = new Set<string>();
  for (const item of cases) {
    if (ids.has(item.id)) throw new Error('案例备份含有重复案例编号，请核实文件。');
    ids.add(item.id);
  }
  return cases;
}

function parseSource(sourceText: string): LocalCase[] {
  if (typeof sourceText !== 'string' || new TextEncoder().encode(sourceText).byteLength > MAX_CASE_BACKUP_BYTES) throw new Error('案例备份超过 2 MiB，无法导入。');
  let value: unknown;
  try { value = JSON.parse(sourceText); } catch { throw new Error('案例备份不是有效的 JSON 文件。'); }
  rejectNativeFields(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('不是有效的案例备份文件。');
  const shape = value as Record<string, unknown>;
  if (Object.hasOwn(shape, 'app') || Object.hasOwn(shape, 'kind') || Object.hasOwn(shape, 'formatVersion')) {
    const backup = record(value, ['app', 'kind', 'formatVersion', 'exportedAt', 'cases']);
    if (backup.app !== 'fieldletter' || backup.kind !== 'diagnosis-cases' || backup.formatVersion !== 1) throw new Error('案例备份类型或版本不受支持。');
    timestamp(backup.exportedAt, '备份导出时间');
    return normalizeCases(backup.cases);
  }
  if (Object.hasOwn(shape, 'cases')) {
    const backup = record(value, ['version', 'exportedAt', 'cases']);
    if (backup.version !== 1) throw new Error('案例备份版本不受支持。');
    timestamp(backup.exportedAt, '备份导出时间');
    return normalizeCases(backup.cases);
  }
  return [normalizeCase(value)];
}

function currentCases(baseRaw: string | null): LocalCase[] {
  if (baseRaw === null) return [];
  try {
    if (baseRaw.length > MAX_STORED_CHARACTERS) throw new Error('too large');
    const value: unknown = JSON.parse(baseRaw);
    rejectNativeFields(value);
    const cases = normalizeCases(value);
    if (cases.length > MAX_LOCAL_CASES) throw new Error('too many');
    return cases;
  } catch { throw new Error('本机案例损坏、版本不受支持或数量异常；原内容已保留，不能直接合并。'); }
}

function storageTarget(storage?: CaseStorage): CaseStorage {
  if (storage) return storage;
  try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* Report without touching another key. */ }
  throw new Error('本机案例存储不可用，不能导入。');
}

function readRaw(storage: CaseStorage): string | null {
  try { return storage.getItem(CASE_STORAGE_KEY); }
  catch { throw new Error('无法读取本机案例，原内容未被覆盖。'); }
}

function sameContent(first: LocalCase, second: LocalCase): boolean {
  const content = (item: LocalCase) => JSON.stringify({ createdAt: item.createdAt, observation: item.observation, raw: item.outcome.raw, modelInfo: item.modelInfo });
  return content(first) === content(second);
}

function plan(sourceText: string, baseRaw: string | null, importedAt: string): { preview: CaseImportPreview; merged: LocalCase[] } {
  const incoming = parseSource(sourceText), existing = currentCases(baseRaw);
  const added: LocalCase[] = [], duplicates: LocalCase[] = [];
  const conflicts: { id: string; existing: LocalCase; incoming: LocalCase }[] = [];
  const byId = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) {
    const local = byId.get(item.id);
    if (!local) added.push({ ...item, importedAt });
    else if (sameContent(local, item)) duplicates.push(item);
    else conflicts.push({ id: item.id, existing: local, incoming: item });
  }
  // A new import is prepended, leaving every existing case and its order intact.
  const merged = [...added, ...existing];
  const blockedReason = merged.length > MAX_LOCAL_CASES ? '合并后超过 20 个案例；请先导出并删减本机案例后重新预览。'
    : JSON.stringify(merged).length > MAX_STORED_CHARACTERS ? '合并后案例超过本机保存大小限制；请先导出并删减案例后重新预览。' : undefined;
  return {
    preview: Object.freeze({ incoming, added, duplicates, conflicts, beforeCount: existing.length, afterCount: merged.length, ...(blockedReason ? { blockedReason } : {}), baseRaw, sourceText }),
    merged,
  };
}

export function createCaseBackup(cases: readonly LocalCase[], exportedAt = new Date().toISOString()): CaseBackup {
  rejectNativeFields(cases);
  const normalized = normalizeCases(cases);
  if (normalized.length > MAX_LOCAL_CASES || JSON.stringify(normalized).length > MAX_STORED_CHARACTERS) throw new Error('案例数量或大小超过本机备份限制。');
  return { app: 'fieldletter', kind: 'diagnosis-cases', formatVersion: 1, exportedAt: timestamp(exportedAt, '备份导出时间'), cases: normalized };
}

/** Export reads the complete stored list; a damaged list is never treated as empty. */
export function readCaseBackupCases(storage?: CaseStorage): LocalCase[] {
  return currentCases(readRaw(storageTarget(storage)));
}

export function prepareCaseImport(sourceText: string, storage?: CaseStorage): CaseImportPreview {
  const baseRaw = readRaw(storageTarget(storage));
  const { preview } = plan(sourceText, baseRaw, new Date().toISOString());
  previewSources.set(preview, { sourceText, baseRaw });
  return preview;
}

export function commitCaseImport(preview: CaseImportPreview, storage?: CaseStorage): LocalCase[] {
  const source = previewSources.get(preview);
  if (!source || preview.sourceText !== source.sourceText || preview.baseRaw !== source.baseRaw) throw new Error('案例导入预览已失效，请重新选择并预览文件。');
  const target = storageTarget(storage), actualRaw = readRaw(target);
  if (actualRaw !== source.baseRaw) throw new Error('本机案例已变化，尚未导入；请重新预览后确认。');
  const next = plan(source.sourceText, actualRaw, new Date().toISOString());
  if (next.preview.blockedReason) throw new Error(next.preview.blockedReason);
  if (!next.preview.added.length) throw new Error('没有可新增的案例；本机内容未改动。');
  const payload = JSON.stringify(next.merged);
  try { target.setItem(CASE_STORAGE_KEY, payload); }
  catch { throw new Error('案例导入未保存，设备空间或存储权限不足；请保留备份文件后重试。'); }
  try {
    if (target.getItem(CASE_STORAGE_KEY) !== payload) throw new Error('not persisted');
  } catch { throw new Error('无法确认案例导入已保存，请检查本机案例并保留备份文件，不要重复操作。'); }
  previewSources.delete(preview);
  return next.merged;
}
