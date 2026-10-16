/** Unfinished, real-world observations only. Media and model results are never persisted here. */
export const CLINIC_DRAFT_KEY = 'fieldletter.clinic-draft.v1';
export const CLINIC_DRAFT_RECOVERY_KEY = `${CLINIC_DRAFT_KEY}.recovery`;
export type ClinicDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ClinicDraftFields {
  category: 'crop' | 'animal';
  subject: string;
  symptoms: string;
  onset: string;
  extent: string;
  affected: string;
  total: string;
  stage: string;
  management: string;
}

export interface ClinicDraftSnapshot {
  version: 1;
  updatedAt: string;
  fields: ClinicDraftFields;
  speechReviewed: boolean;
  measurementIds: string[];
  hadMedia: boolean;
}

const fieldLimits = {
  subject: 100, symptoms: 4000, onset: 200, extent: 400,
  affected: 32, total: 32, stage: 200, management: 1000,
} as const;
const snapshotKeys = ['version', 'updatedAt', 'fields', 'speechReviewed', 'measurementIds', 'hadMedia'] as const;

export function emptyClinicDraftFields(): ClinicDraftFields {
  return { category: 'crop', subject: '', symptoms: '', onset: '', extent: '', affected: '', total: '', stage: '', management: '' };
}

function strictRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('草稿格式无效。');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error('草稿格式无效。');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))
    || allowed.some(key => !Object.hasOwn(value, key))
    || keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'))) {
    throw new Error('草稿含有不支持的字段，或字段不完整。');
  }
  return value as Record<string, unknown>;
}

function normalizeDraft(value: unknown): ClinicDraftSnapshot {
  const draft = strictRecord(value, snapshotKeys);
  if (draft.version !== 1) throw new Error('草稿版本不受支持。');
  if (typeof draft.updatedAt !== 'string'
    || !/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(draft.updatedAt)) {
    throw new Error('草稿保存时间无效。');
  }
  const date = new Date(draft.updatedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== draft.updatedAt) throw new Error('草稿保存时间无效。');
  const fields = strictRecord(draft.fields, ['category', ...Object.keys(fieldLimits)]);
  if (fields.category !== 'crop' && fields.category !== 'animal') throw new Error('草稿类别无效。');
  for (const [key, maximum] of Object.entries(fieldLimits)) {
    if (typeof fields[key] !== 'string' || fields[key].length > maximum) throw new Error(`草稿 ${key} 字段无效或过长。`);
  }
  if (typeof draft.speechReviewed !== 'boolean' || typeof draft.hadMedia !== 'boolean') throw new Error('草稿状态标记无效。');
  if (!Array.isArray(draft.measurementIds) || draft.measurementIds.length > 12
    || [...draft.measurementIds].some(id => typeof id !== 'string' || !id.trim() || id.length > 200)
    || new Set(draft.measurementIds).size !== draft.measurementIds.length) {
    throw new Error('草稿实测记录编号无效、重复或过多。');
  }
  // Construct every allowed property explicitly: no native paths, attachment payloads or outputs.
  return {
    version: 1, updatedAt: draft.updatedAt,
    fields: {
      category: fields.category, subject: fields.subject as string, symptoms: fields.symptoms as string,
      onset: fields.onset as string, extent: fields.extent as string, affected: fields.affected as string,
      total: fields.total as string, stage: fields.stage as string, management: fields.management as string,
    },
    speechReviewed: draft.speechReviewed, measurementIds: [...draft.measurementIds] as string[], hadMedia: draft.hadMedia,
  };
}

function getStorage(storage?: ClinicDraftStorage): ClinicDraftStorage | null {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Reading never creates a recovery copy or overwrites damaged or unsupported content. */
export function readClinicDraft(storage?: ClinicDraftStorage): { snapshot: ClinicDraftSnapshot | null; warning?: string } {
  const target = getStorage(storage);
  if (!target) return { snapshot: null, warning: '本机草稿存储不可用，当前文字可能无法保存。' };
  let raw: string | null;
  try { raw = target.getItem(CLINIC_DRAFT_KEY); }
  catch { return { snapshot: null, warning: '无法读取本机草稿，原内容未被覆盖；当前文字可能无法保存。' }; }
  if (raw === null) return { snapshot: null };
  try { return { snapshot: normalizeDraft(JSON.parse(raw) as unknown) }; }
  catch { return { snapshot: null, warning: '本机草稿损坏或版本不受支持，原内容未被覆盖。' }; }
}

function preserveDamagedDraft(storage: ClinicDraftStorage, raw: string): void {
  const recovery = storage.getItem(CLINIC_DRAFT_RECOVERY_KEY);
  if (recovery !== null && recovery !== raw) throw new Error('已有不同的草稿恢复副本，原内容已保留；请先显式清空草稿再重试。');
  if (recovery === null) storage.setItem(CLINIC_DRAFT_RECOVERY_KEY, raw);
  if (storage.getItem(CLINIC_DRAFT_RECOVERY_KEY) !== raw) throw new Error('草稿恢复副本保存失败，原内容未被覆盖。');
}

/** Incomplete text is preserved verbatim; validation does not submit or diagnose an observation. */
export function saveClinicDraft(snapshot: ClinicDraftSnapshot, storage?: ClinicDraftStorage): void {
  let canonical: ClinicDraftSnapshot;
  try { canonical = normalizeDraft(snapshot); }
  catch (error) { throw new Error(`本机草稿未保存：${error instanceof Error ? error.message : '草稿格式无效。'}`); }
  const target = getStorage(storage);
  if (!target) throw new Error('本机草稿未保存：设备存储不可用。');
  const payload = JSON.stringify(canonical);
  try {
    const previous = target.getItem(CLINIC_DRAFT_KEY);
    if (previous === payload) return;
    if (previous !== null) {
      let damaged = false;
      try { normalizeDraft(JSON.parse(previous) as unknown); } catch { damaged = true; }
      if (damaged) preserveDamagedDraft(target, previous);
    }
    target.setItem(CLINIC_DRAFT_KEY, payload);
    if (target.getItem(CLINIC_DRAFT_KEY) !== payload) throw new Error('写入后未能确认草稿已保存。');
  } catch (error) {
    const recoveryMessage = error instanceof Error && /恢复副本/.test(error.message) ? error.message : '设备空间或存储权限不足，请保留当前文字后重试。';
    throw new Error(`本机草稿未保存：${recoveryMessage}`);
  }
}

/** Only an explicit clear action deletes both this draft and its damaged-content recovery copy. */
export function clearClinicDraft(storage?: ClinicDraftStorage): void {
  const target = getStorage(storage);
  if (!target) throw new Error('本机草稿未清空：设备存储不可用。');
  try {
    target.removeItem(CLINIC_DRAFT_KEY);
    if (target.getItem(CLINIC_DRAFT_KEY) !== null) throw new Error('草稿删除失败。');
    target.removeItem(CLINIC_DRAFT_RECOVERY_KEY);
    if (target.getItem(CLINIC_DRAFT_RECOVERY_KEY) !== null) throw new Error('恢复副本删除失败。');
  } catch { throw new Error('本机草稿未完全清空，请检查存储权限后重试。'); }
}
