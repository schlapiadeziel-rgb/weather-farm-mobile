import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CLINIC_DRAFT_KEY, CLINIC_DRAFT_RECOVERY_KEY, clearClinicDraft, emptyClinicDraftFields, readClinicDraft, saveClinicDraft } from '../src/lib/clinicDraft.ts';
import type { ClinicDraftFields, ClinicDraftSnapshot, ClinicDraftStorage } from '../src/lib/clinicDraft.ts';

class MemoryStorage implements ClinicDraftStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: string[] = [];
  readonly removals: string[] = [];
  readonly failedReads = new Set<string>();
  readonly failedWrites = new Set<string>();
  readonly failedRemovals = new Set<string>();
  getItem(key: string): string | null {
    this.reads.push(key);
    if (this.failedReads.has(key)) throw new Error('SecurityError');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(key);
    if (this.failedWrites.has(key)) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.removals.push(key);
    if (this.failedRemovals.has(key)) throw new Error('SecurityError');
    this.values.delete(key);
  }
}

function draft(fields: Partial<ClinicDraftFields> = {}): ClinicDraftSnapshot {
  return { version: 1, updatedAt: '2026-10-16T08:09:10.123Z', fields: { ...emptyClinicDraftFields(), ...fields }, speechReviewed: true, measurementIds: [], hadMedia: false };
}

function reject(value: unknown): void {
  const storage = new MemoryStorage();
  const previous = JSON.stringify(draft({ subject: '原有文字' }));
  storage.values.set(CLINIC_DRAFT_KEY, previous);
  assert.throws(() => saveClinicDraft(value as ClinicDraftSnapshot, storage), /本机草稿未保存/);
  assert.equal(storage.values.get(CLINIC_DRAFT_KEY), previous);
  assert.deepEqual(storage.writes, []);
}

test('empty draft fields are independent and an absent draft performs no writes', () => {
  const first = emptyClinicDraftFields(), second = emptyClinicDraftFields();
  assert.deepEqual(first, { category: 'crop', subject: '', symptoms: '', onset: '', extent: '', affected: '', total: '', stage: '', management: '' });
  first.subject = '番茄'; assert.equal(second.subject, '');
  const storage = new MemoryStorage();
  assert.deepEqual(readClinicDraft(storage), { snapshot: null });
  assert.deepEqual(storage.reads, [CLINIC_DRAFT_KEY]);
  assert.deepEqual(storage.writes, []); assert.deepEqual(storage.removals, []);
});

test('unfinished observations, exact text, invalid count strings and unreviewed speech survive a round trip', () => {
  const storage = new MemoryStorage();
  const original = { ...draft({ subject: '', symptoms: '  叶背有斑\n还没量过。\t', onset: '未知 ', extent: '\n北棚  两行', affected: '1e-', total: '-尚未知', stage: '  开花期 ', management: '未施药\r\n等待补充' }), speechReviewed: false, measurementIds: ['现场-A', 'sample-b'], hadMedia: true };
  const before = structuredClone(original);
  saveClinicDraft(original, storage);
  assert.deepEqual(readClinicDraft(storage), { snapshot: original });
  assert.deepEqual(original, before);
  const restored = readClinicDraft(storage).snapshot!;
  restored.fields.symptoms = '另一个对象'; restored.measurementIds.push('another');
  assert.deepEqual(readClinicDraft(storage).snapshot, original);
});

test('all empty fields are saveable for either category and an identical save is not rewritten', () => {
  for (const category of ['crop', 'animal'] as const) {
    const storage = new MemoryStorage(), original = draft({ category });
    saveClinicDraft(original, storage); saveClinicDraft(original, storage);
    assert.deepEqual(readClinicDraft(storage).snapshot, original);
    assert.deepEqual(storage.writes, [CLINIC_DRAFT_KEY]);
    assert.equal(storage.values.has(CLINIC_DRAFT_RECOVERY_KEY), false);
  }
});

test('media persistence is a boolean marker and unsupported payload, path and model fields are rejected', () => {
  const original = { ...draft(), hadMedia: true };
  const storage = new MemoryStorage(); saveClinicDraft(original, storage);
  const raw = storage.values.get(CLINIC_DRAFT_KEY)!;
  assert.deepEqual(Object.keys(JSON.parse(raw)), ['version', 'updatedAt', 'fields', 'speechReviewed', 'measurementIds', 'hadMedia']);
  assert.doesNotMatch(raw, /localUri|content:|file:|data:|previewDataUrl|modelOutput|outcome/);
  for (const key of ['media', 'attachments', 'localUri', 'previewDataUrl', 'modelOutput', 'outcome', 'weather', 'game']) {
    reject({ ...original, [key]: 'content://private/photo' });
    reject({ ...original, fields: { ...original.fields, [key]: 'file:///private/photo' } });
  }
});

test('field maximum lengths are accepted intact and every overlong or nonstring value is rejected', () => {
  const limits = { subject: 100, symptoms: 4000, onset: 200, extent: 400, affected: 32, total: 32, stage: 200, management: 1000 };
  const fields = Object.fromEntries(Object.entries(limits).map(([key, maximum]) => [key, '字'.repeat(maximum)]));
  const original = draft(fields), storage = new MemoryStorage();
  saveClinicDraft(original, storage); assert.deepEqual(readClinicDraft(storage).snapshot, original);
  for (const [key, maximum] of Object.entries(limits)) {
    reject(draft({ [key]: 'x'.repeat(maximum + 1) }));
    reject({ ...draft(), fields: { ...emptyClinicDraftFields(), [key]: 3 } });
  }
});

test('version, category, complete shape and actual boolean status markers are required', () => {
  const original = draft();
  for (const version of [0, 2, '1', null]) reject({ ...original, version });
  for (const category of ['fish', '', null]) reject({ ...original, fields: { ...original.fields, category } });
  for (const key of ['speechReviewed', 'hadMedia']) {
    for (const flag of [0, 1, 'false', null]) reject({ ...original, [key]: flag });
  }
  for (const key of Object.keys(original)) {
    const incomplete = { ...original } as Record<string, unknown>; delete incomplete[key]; reject(incomplete);
  }
  for (const key of Object.keys(original.fields)) {
    const fields = { ...original.fields } as Record<string, unknown>; delete fields[key]; reject({ ...original, fields });
  }
  for (const invalid of [null, [], 'text', 1, { ...original, fields: [] }]) reject(invalid);
});

test('timestamps require canonical ISO instants and reject invalid calendar rollovers', () => {
  for (const updatedAt of ['', '2026-10-16', '2026-10-16T08:09:10Z', '2026-10-16T08:09:10.123+00:00', '2026-02-29T00:00:00.000Z', '2026-02-30T00:00:00.000Z', '2026-13-01T00:00:00.000Z', '2026-10-16T24:00:00.000Z', '2026-10-16T08:09:60.000Z', 'not-a-time']) reject({ ...draft(), updatedAt });
  const storage = new MemoryStorage(), leapDay = { ...draft(), updatedAt: '2028-02-29T23:59:59.999Z' };
  saveClinicDraft(leapDay, storage); assert.deepEqual(readClinicDraft(storage).snapshot, leapDay);
});

test('measurement selections retain up to twelve unique IDs and reject malformed or sparse selections', () => {
  const storage = new MemoryStorage();
  const original = { ...draft(), measurementIds: ['m'.repeat(200), ...Array.from({ length: 11 }, (_, index) => `measurement-${index}`)] };
  saveClinicDraft(original, storage); assert.deepEqual(readClinicDraft(storage).snapshot, original);
  for (const measurementIds of [[''], [' '], ['m'.repeat(201)], ['same', 'same'], [1], [null], Array.from({ length: 13 }, (_, index) => `m-${index}`), new Array(2), {}, 'id']) reject({ ...draft(), measurementIds });
});

test('damaged, unsupported and empty stored content produces a warning without modifying any bytes', () => {
  for (const raw of ['{broken', '', 'null', JSON.stringify({ ...draft(), version: 2 }), JSON.stringify({ ...draft(), localUri: 'content://media/photo' })]) {
    const storage = new MemoryStorage(); storage.values.set(CLINIC_DRAFT_KEY, raw);
    storage.values.set(CLINIC_DRAFT_RECOVERY_KEY, 'prior recovery');
    const before = [...storage.values];
    const result = readClinicDraft(storage);
    assert.equal(result.snapshot, null); assert.match(result.warning!, /损坏|版本/);
    assert.deepEqual([...storage.values], before); assert.deepEqual(storage.writes, []); assert.deepEqual(storage.removals, []);
  }
});

test('unreadable storage returns a warning and cannot be overwritten', () => {
  const storage = new MemoryStorage(); storage.values.set(CLINIC_DRAFT_KEY, 'ORIGINAL'); storage.failedReads.add(CLINIC_DRAFT_KEY);
  const result = readClinicDraft(storage);
  assert.equal(result.snapshot, null); assert.match(result.warning!, /无法读取/);
  assert.throws(() => saveClinicDraft(draft(), storage), /本机草稿未保存/);
  assert.equal(storage.values.get(CLINIC_DRAFT_KEY), 'ORIGINAL'); assert.deepEqual(storage.writes, []);
});

test('unavailable default local storage reports failure instead of claiming the draft was saved or cleared', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.match(readClinicDraft().warning!, /存储不可用/);
    assert.throws(() => saveClinicDraft(draft()), /本机草稿未保存/);
    assert.throws(() => clearClinicDraft(), /本机草稿未清空/);
    Reflect.deleteProperty(globalThis, 'localStorage');
    assert.match(readClinicDraft().warning!, /存储不可用/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('a damaged original is copied byte for byte before a valid replacement is written', () => {
  const storage = new MemoryStorage(), raw = '  {"symptoms": "叶背斑点", unfinished';
  storage.values.set(CLINIC_DRAFT_KEY, raw);
  saveClinicDraft(draft({ symptoms: '新的现场观察' }), storage);
  assert.equal(storage.values.get(CLINIC_DRAFT_RECOVERY_KEY), raw);
  assert.deepEqual(storage.writes, [CLINIC_DRAFT_RECOVERY_KEY, CLINIC_DRAFT_KEY]);
  assert.equal(readClinicDraft(storage).snapshot!.fields.symptoms, '新的现场观察');
  storage.values.set(CLINIC_DRAFT_KEY, raw);
  saveClinicDraft(draft(), storage);
  assert.equal(storage.values.get(CLINIC_DRAFT_RECOVERY_KEY), raw);
  assert.equal(storage.writes.filter(key => key === CLINIC_DRAFT_RECOVERY_KEY).length, 1);
});

test('failed or conflicting recovery copies prevent overwriting the damaged original', () => {
  for (const failure of ['quota', 'read', 'conflict', 'silent'] as const) {
    const storage = new MemoryStorage(), raw = '{ORIGINAL_BROKEN_DRAFT}';
    storage.values.set(CLINIC_DRAFT_KEY, raw);
    if (failure === 'quota') storage.failedWrites.add(CLINIC_DRAFT_RECOVERY_KEY);
    if (failure === 'read') storage.failedReads.add(CLINIC_DRAFT_RECOVERY_KEY);
    if (failure === 'conflict') storage.values.set(CLINIC_DRAFT_RECOVERY_KEY, 'FIRST_BROKEN_DRAFT');
    if (failure === 'silent') storage.setItem = () => {};
    assert.throws(() => saveClinicDraft(draft(), storage), /本机草稿未保存/);
    assert.equal(storage.values.get(CLINIC_DRAFT_KEY), raw);
    if (failure === 'conflict') assert.equal(storage.values.get(CLINIC_DRAFT_RECOVERY_KEY), 'FIRST_BROKEN_DRAFT');
  }
});

test('quota and silent primary write failures are surfaced while previous saved text remains', () => {
  for (const silent of [false, true]) {
    const storage = new MemoryStorage(), original = JSON.stringify(draft({ subject: '之前保存的番茄' }));
    storage.values.set(CLINIC_DRAFT_KEY, original);
    if (silent) storage.setItem = () => {};
    else storage.failedWrites.add(CLINIC_DRAFT_KEY);
    assert.throws(() => saveClinicDraft(draft({ subject: '本次新观察' }), storage), /本机草稿未保存/);
    assert.equal(storage.values.get(CLINIC_DRAFT_KEY), original);
    assert.equal(storage.values.has(CLINIC_DRAFT_RECOVERY_KEY), false);
  }
});

test('explicit clearing removes both draft keys and reports partial or failed deletion', () => {
  const storage = new MemoryStorage();
  storage.values.set(CLINIC_DRAFT_KEY, JSON.stringify(draft())); storage.values.set(CLINIC_DRAFT_RECOVERY_KEY, 'broken');
  clearClinicDraft(storage);
  assert.equal(storage.values.has(CLINIC_DRAFT_KEY), false); assert.equal(storage.values.has(CLINIC_DRAFT_RECOVERY_KEY), false);
  assert.deepEqual(storage.removals, [CLINIC_DRAFT_KEY, CLINIC_DRAFT_RECOVERY_KEY]);
  for (const key of [CLINIC_DRAFT_KEY, CLINIC_DRAFT_RECOVERY_KEY]) {
    storage.values.set(CLINIC_DRAFT_KEY, 'draft'); storage.values.set(CLINIC_DRAFT_RECOVERY_KEY, 'recovery');
    storage.failedRemovals.add(key);
    assert.throws(() => clearClinicDraft(storage), /本机草稿未完全清空/);
    assert.equal(storage.values.get(key), key === CLINIC_DRAFT_KEY ? 'draft' : 'recovery');
    storage.failedRemovals.clear();
  }
});

test('draft operations never touch game, real record, location or case keys, and the module has no imports', () => {
  const storage = new MemoryStorage();
  const other = new Map([['fieldletter.game.v1', 'GAME'], ['fieldletter.farm.v1', 'FARM'], ['fieldletter.location.v1', 'GPS'], ['field-notes.diagnosis-cases.v1', 'CASES']]);
  for (const [key, value] of other) storage.values.set(key, value);
  readClinicDraft(storage); saveClinicDraft(draft(), storage); readClinicDraft(storage); clearClinicDraft(storage);
  for (const [key, value] of other) assert.equal(storage.values.get(key), value);
  const allowed = new Set([CLINIC_DRAFT_KEY, CLINIC_DRAFT_RECOVERY_KEY]);
  for (const key of [...storage.reads, ...storage.writes, ...storage.removals]) assert.ok(allowed.has(key));
  const source = readFileSync(new URL('../src/lib/clinicDraft.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b/m);
  assert.doesNotMatch(source, /normalizeObservation|localStorage\.clear\(/);
});
