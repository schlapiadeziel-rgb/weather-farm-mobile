import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitCaseImport, createCaseBackup, MAX_CASE_BACKUP_BYTES, prepareCaseImport, readCaseBackupCases,
} from '../src/lib/caseBackup.ts';
import type { CaseImportPreview } from '../src/lib/caseBackup.ts';
import { CASE_STORAGE_KEY, createLocalCase, loadLocalCases, MODEL_NOTICE, parseDiagnosisOutput, saveLocalCases } from '../src/lib/fieldDiagnosis.ts';
import type { CaseStorage, FieldObservation, LocalCase, StructuredDiagnosis } from '../src/lib/fieldDiagnosis.ts';

const createdAt = '2026-10-09T06:30:00+08:00';
const exportedAt = '2026-10-16T08:09:10.123Z';
const observation: FieldObservation = {
  category: 'crop', subject: '番茄', symptoms: '北棚两株叶片有斑，其余暂未见异常。', affectedCount: 2, totalCount: 40,
  measurements: [{ name: '土壤 pH', value: 6.2, unit: 'pH', observedAt: '2026-10-09T06:00:00+08:00', place: '北棚东侧', instrument: '经校准 pH 计' }],
  media: [{ id: 'photo-1', kind: 'photo', description: '叶背近照。' }],
  weather: { sourceName: 'Open-Meteo 区域模型', sourceKind: 'forecast', observedAt: '2026-10-09T05:00:00+08:00', temperature: 22, humidity: 75 },
};
const result: StructuredDiagnosis = {
  observations: ['用户记录少量叶片有斑，缺少连续观察。'],
  possibleCauses: [{ name: '需核实环境与近期管理变化', evidence: ['只有文字与照片说明，无法确定原因。'], uncertainty: '不是确诊。' }],
  missingInformation: ['补充病斑变化与同批正常植株照片。'], lowRiskActions: ['原位标记观察，记录变化，不自行用药。'],
  escalation: ['扩大或持续异常时联系当地农技或植保人员。'], risk: 'medium', limitations: ['信息不足以确诊。'],
};
const sourceModel = { modelId: 'qwen3.5-0.8b-q4', modelName: 'Qwen3.5 0.8B Q4', engineVersion: 'llama.cpp test', durationMs: 1250.5 };

class MemoryStorage implements CaseStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: { key: string; value: string }[] = [];
  failRead = false;
  failWrite = false;
  ignoreWrite = false;
  failReadAfterWrite = false;
  getItem(key: string): string | null {
    this.reads.push(key);
    if (this.failRead || (this.failReadAfterWrite && this.writes.length)) throw new Error('SecurityError');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes.push({ key, value });
    if (this.failWrite) throw new Error('QuotaExceededError');
    if (!this.ignoreWrite) this.values.set(key, value);
  }
}

function localCase(id = 'case-one', raw = JSON.stringify(result)): LocalCase {
  return { ...createLocalCase(observation, parseDiagnosisOutput(raw, observation), createdAt, sourceModel), id };
}
function source(cases: readonly LocalCase[]): string { return JSON.stringify(createCaseBackup(cases, exportedAt), null, 2); }
function seed(storage: MemoryStorage, cases: readonly LocalCase[]): void { storage.values.set(CASE_STORAGE_KEY, JSON.stringify(cases)); }

test('new case envelope roundtrips observations, outputs and declared model metadata without mutating inputs', () => {
  const original = localCase(), snapshot = structuredClone(original), storage = new MemoryStorage();
  const backup = createCaseBackup([original], exportedAt);
  assert.deepEqual(Object.keys(backup), ['app', 'kind', 'formatVersion', 'exportedAt', 'cases']);
  assert.deepEqual([backup.app, backup.kind, backup.formatVersion], ['fieldletter', 'diagnosis-cases', 1]);
  const preview = prepareCaseImport(JSON.stringify(backup), storage);
  assert.deepEqual([preview.beforeCount, preview.afterCount, preview.added.length, preview.duplicates.length, preview.conflicts.length], [0, 1, 1, 0, 0]);
  assert.equal(preview.baseRaw, null); assert.equal(preview.blockedReason, undefined);
  const before = Date.now(), restored = commitCaseImport(preview, storage), after = Date.now();
  assert.deepEqual(restored[0].observation, original.observation);
  assert.deepEqual(restored[0].modelInfo, sourceModel);
  assert.deepEqual(restored[0].outcome, parseDiagnosisOutput(original.outcome.raw, original.observation));
  assert.ok(Date.parse(restored[0].importedAt!) >= before && Date.parse(restored[0].importedAt!) <= after);
  assert.deepEqual(loadLocalCases(storage), restored);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(storage.writes.map(item => item.key), [CASE_STORAGE_KEY]);
});

test('v0.7 single-case and all-case exports import without changing their original creation time', () => {
  for (const value of [localCase(), { version: 1, exportedAt, cases: [localCase()] }]) {
    const storage = new MemoryStorage(), preview = prepareCaseImport(JSON.stringify(value), storage);
    const cases = commitCaseImport(preview, storage);
    assert.equal(cases[0].id, 'case-one'); assert.equal(cases[0].createdAt, createdAt);
  }
});

test('external structure, risk, triage, notices and unsafe derived output never replace revalidation from raw', () => {
  const item = localCase();
  const tampered = { ...item, outcome: { ...item.outcome, status: 'structured', result: { confirmedDiagnosis: '伪造确诊', risk: 'low' }, triage: { risk: 'low', contact: '不要联系专业人员' }, notice: '认证准确率99%', validationErrors: [] } };
  const target = new MemoryStorage(), restored = commitCaseImport(prepareCaseImport(JSON.stringify(tampered), target), target);
  assert.deepEqual(restored[0].outcome, parseDiagnosisOutput(item.outcome.raw, item.observation));
  assert.equal(restored[0].outcome.notice, MODEL_NOTICE);
  assert.doesNotMatch(JSON.stringify(restored), /伪造确诊|认证准确率99%|不要联系专业人员/);
  const unsafeRaw = JSON.stringify({ ...result, lowRiskActions: ['立即喷施农药 50 mg/kg。'] });
  const unsafe = { ...item, outcome: { ...tampered.outcome, raw: unsafeRaw, result } };
  const storage = new MemoryStorage(), next = commitCaseImport(prepareCaseImport(JSON.stringify(unsafe), storage), storage);
  assert.equal(next[0].outcome.status, 'unstructured'); assert.equal(next[0].outcome.result, null);
  assert.equal(next[0].outcome.raw, unsafeRaw);
});

test('urgent animal symptoms regain the built-in safety floor even when the file supplies low-risk triage', () => {
  const input: FieldObservation = { category: 'animal', subject: '奶牛', symptoms: '今早两头呼吸困难。' };
  const raw = JSON.stringify({ ...result, risk: 'low', lowRiskActions: ['记录情况，不自行用药。'], escalation: ['联系兽医。'] });
  const item = { ...localCase(), observation: input, outcome: { ...parseDiagnosisOutput(raw, input), triage: { risk: 'low' }, result: { risk: 'low' } } };
  const preview = prepareCaseImport(JSON.stringify(item), new MemoryStorage());
  assert.equal(preview.incoming[0].outcome.triage.risk, 'urgent');
  assert.equal(preview.incoming[0].outcome.result?.risk, 'urgent');
});

test('native paths, media payloads and disguised URI identifiers are rejected without writes', () => {
  const item = localCase();
  const values = [
    { ...item, localUri: 'content://media/private' },
    { ...item, observation: { ...item.observation, localUri: 'file:///private/image' } },
    { ...item, observation: { ...item.observation, media: [{ id: 'p', kind: 'photo', localUri: 'content://media/private' }] } },
    { ...item, observation: { ...item.observation, media: [{ id: 'file:///private/image', kind: 'photo' }] } },
    { ...item, modelInfo: { ...sourceModel, modelId: '/private/model.gguf' } },
    { ...item, outcome: { ...item.outcome, result: { localUri: 'content://media/private' } } },
    { ...item, observation: { ...item.observation, attachments: [{ base64: 'payload' }] } },
  ];
  for (const value of values) {
    const storage = new MemoryStorage();
    assert.throws(() => prepareCaseImport(JSON.stringify(value), storage), /路径|地址|字段|游戏数据/);
    assert.deepEqual(storage.writes, []);
  }
});

test('wrong backup types, bad versions, damaged JSON and duplicate incoming IDs are rejected', () => {
  const cases = [localCase()], backup = createCaseBackup(cases, exportedAt);
  const values: unknown[] = [
    null, [], { version: 2, exportedAt, cases }, { ...backup, formatVersion: 2 }, { ...backup, app: 'other' }, { ...backup, kind: 'game' },
    { ...cases[0], version: 2 }, { ...cases[0], createdAt: '2026-02-30T10:00:00Z' },
    { version: 1, fields: {}, updatedAt: exportedAt }, { version: 1, coins: 100, plots: [] },
    { ...backup, cases: [cases[0], { ...cases[0], id: ' case-one ' }] },
  ];
  for (const value of values) {
    const storage = new MemoryStorage();
    assert.throws(() => prepareCaseImport(JSON.stringify(value), storage)); assert.deepEqual(storage.writes, []);
  }
  assert.throws(() => prepareCaseImport('{broken', new MemoryStorage()), /JSON/);
});

test('invalid observation values and provenance are rejected instead of entering the restored case list', () => {
  const item = localCase();
  for (const value of [
    { ...item, observation: { ...item.observation, affectedCount: 41 } },
    { ...item, observation: { ...item.observation, weather: { ...item.observation.weather, humidity: 101 } } },
    { ...item, modelInfo: { ...sourceModel, durationMs: -1 } },
    { ...item, modelInfo: { ...sourceModel, durationMs: '12' } },
    { ...item, modelInfo: { ...sourceModel, accuracy: 99 } },
    { ...item, importedAt: '2026-02-30T12:00:00Z' },
  ]) assert.throws(() => prepareCaseImport(JSON.stringify(value), new MemoryStorage()));
});

test('duplicate IDs compare only canonical observations, raw, creation time and declared model metadata', () => {
  const storage = new MemoryStorage(), item = localCase(); seed(storage, [item]);
  const external = { ...item, id: ' case-one ', importedAt: '2025-01-01T00:00:00Z', outcome: { ...item.outcome, status: 'unstructured', result: null, notice: 'fake' }, observation: { ...item.observation, subject: ' 番茄 ' } };
  const preview = prepareCaseImport(JSON.stringify(external), storage);
  assert.deepEqual([preview.added.length, preview.duplicates.length, preview.conflicts.length, preview.afterCount], [0, 1, 0, 1]);
  assert.throws(() => commitCaseImport(preview, storage), /没有可新增/); assert.deepEqual(storage.writes, []);
  assert.equal(storage.values.get(CASE_STORAGE_KEY), JSON.stringify([item]));
});

test('conflicting IDs retain local content while unrelated incoming cases are merged', () => {
  const storage = new MemoryStorage(), existing = localCase(); seed(storage, [existing]);
  const conflict = { ...existing, observation: { ...existing.observation, symptoms: '新文件修改了描述。' } };
  const added = localCase('case-new');
  const preview = prepareCaseImport(source([conflict, added]), storage);
  assert.deepEqual([preview.added.length, preview.conflicts.length, preview.duplicates.length, preview.beforeCount, preview.afterCount], [1, 1, 0, 1, 2]);
  assert.equal(preview.conflicts[0].id, existing.id);
  const merged = commitCaseImport(preview, storage);
  assert.deepEqual(merged.map(item => item.id), ['case-new', 'case-one']);
  assert.equal(merged[1].observation.symptoms, existing.observation.symptoms);
  assert.equal(merged[1].importedAt, undefined); assert.ok(merged[0].importedAt);
});

test('a full local list blocks added cases without clipping existing or incoming data', () => {
  const storage = new MemoryStorage(), existing = Array.from({ length: 20 }, (_, i) => localCase(`existing-${i}`)); seed(storage, existing);
  const baseline = storage.values.get(CASE_STORAGE_KEY), preview = prepareCaseImport(source([localCase('new')]), storage);
  assert.equal(preview.beforeCount, 20); assert.equal(preview.afterCount, 21); assert.match(preview.blockedReason!, /20/);
  assert.throws(() => commitCaseImport(preview, storage), /20/);
  assert.equal(storage.values.get(CASE_STORAGE_KEY), baseline); assert.deepEqual(storage.writes, []);
});

test('more than 20 incoming cases remain visible in a blocked preview', () => {
  const incoming = Array.from({ length: 21 }, (_, index) => localCase(`incoming-${index}`));
  const sourceText = JSON.stringify({ version: 1, exportedAt, cases: incoming }), storage = new MemoryStorage();
  const preview = prepareCaseImport(sourceText, storage);
  assert.equal(preview.incoming.length, 21); assert.equal(preview.afterCount, 21); assert.match(preview.blockedReason!, /20/);
  assert.throws(() => commitCaseImport(preview, storage), /20/); assert.deepEqual(storage.writes, []);
});

test('compact storage overflow blocks import even when count and 2 MiB file limit are valid', () => {
  const storage = new MemoryStorage(), first = localCase('first', 'a'.repeat(260000)), second = localCase('second', 'b'.repeat(260000));
  seed(storage, [first]);
  const sourceText = JSON.stringify(second), preview = prepareCaseImport(sourceText, storage);
  assert.equal(preview.afterCount, 2); assert.ok(new TextEncoder().encode(sourceText).byteLength < MAX_CASE_BACKUP_BYTES);
  assert.match(preview.blockedReason!, /大小/);
  assert.throws(() => commitCaseImport(preview, storage), /大小/); assert.deepEqual(storage.writes, []);
});

test('the file limit counts UTF-8 bytes and permits harmless pretty-print whitespace above the compact storage limit', () => {
  const storage = new MemoryStorage(), valid = source([localCase()]);
  const preview = prepareCaseImport(' '.repeat(600000) + valid, storage);
  assert.equal(commitCaseImport(preview, storage).length, 1);
  const oversized = JSON.stringify({ ...localCase(), outcome: { raw: '汉'.repeat(710000) } });
  assert.ok(oversized.length < MAX_CASE_BACKUP_BYTES);
  assert.ok(new TextEncoder().encode(oversized).byteLength > MAX_CASE_BACKUP_BYTES);
  const blocked = new MemoryStorage(); assert.throws(() => prepareCaseImport(oversized, blocked), /2 MiB/); assert.deepEqual(blocked.writes, []);
});

test('damaged, unsupported, duplicate or over-capacity stored lists cannot be overwritten or exported as empty', () => {
  for (const raw of [
    '', '{broken', 'null', '{}', JSON.stringify([{ ...localCase(), version: 2 }]), JSON.stringify([localCase(), localCase()]),
    JSON.stringify(Array.from({ length: 21 }, (_, index) => localCase(`old-${index}`))),
  ]) {
    const storage = new MemoryStorage(); storage.values.set(CASE_STORAGE_KEY, raw);
    assert.throws(() => prepareCaseImport(source([localCase('new')]), storage), /本机案例/);
    assert.throws(() => readCaseBackupCases(storage), /本机案例/);
    assert.equal(storage.values.get(CASE_STORAGE_KEY), raw); assert.deepEqual(storage.writes, []);
  }
});

test('a stored baseline change, including JSON whitespace, makes confirmation fail without writes', () => {
  const storage = new MemoryStorage(), item = localCase(); seed(storage, [item]);
  const preview = prepareCaseImport(source([localCase('new')]), storage);
  const modified = storage.values.get(CASE_STORAGE_KEY)! + ' '; storage.values.set(CASE_STORAGE_KEY, modified);
  assert.throws(() => commitCaseImport(preview, storage), /已变化/);
  assert.equal(storage.values.get(CASE_STORAGE_KEY), modified); assert.deepEqual(storage.writes, []);
});

test('confirmation recomputes from the original text and ignores mutated preview cases and counts', () => {
  const storage = new MemoryStorage(), preview = prepareCaseImport(source([localCase()]), storage);
  preview.added[0].observation.symptoms = 'MUTATED_PREVIEW';
  preview.incoming[0].outcome.raw = 'MUTATED_PREVIEW';
  const restored = commitCaseImport(preview, storage);
  assert.equal(restored[0].observation.symptoms, observation.symptoms);
  assert.doesNotMatch(storage.values.get(CASE_STORAGE_KEY)!, /MUTATED_PREVIEW/);
  assert.throws(() => commitCaseImport({ ...preview } as CaseImportPreview, storage), /预览已失效/);
  assert.throws(() => commitCaseImport(preview, storage), /预览已失效/);
});

test('quota errors, silently ignored writes and readback failures never report successful restoration', () => {
  for (const failure of ['failWrite', 'ignoreWrite', 'failReadAfterWrite'] as const) {
    const storage = new MemoryStorage(), preview = prepareCaseImport(source([localCase()]), storage);
    storage[failure] = true;
    assert.throws(() => commitCaseImport(preview, storage), /未保存|无法确认/);
    if (failure !== 'failReadAfterWrite') assert.equal(storage.values.get(CASE_STORAGE_KEY), undefined);
    else assert.ok(storage.values.get(CASE_STORAGE_KEY), 'a write may already have succeeded when readback fails; the error must remain uncertain');
  }
});

test('unreadable storage is never treated as an empty list', () => {
  const storage = new MemoryStorage(); storage.failRead = true;
  assert.throws(() => prepareCaseImport(source([localCase()]), storage), /无法读取/);
  assert.throws(() => readCaseBackupCases(storage), /无法读取/); assert.deepEqual(storage.writes, []);
  storage.failRead = false;
  const preview = prepareCaseImport(source([localCase()]), storage); storage.failRead = true;
  assert.throws(() => commitCaseImport(preview, storage), /无法读取/); assert.deepEqual(storage.writes, []);
});

test('imported provenance survives load/save/export; a new import gets its own current external-source marker', () => {
  const storage = new MemoryStorage(), oldMarker = '2020-01-01T00:00:00Z', imported = { ...localCase(), importedAt: oldMarker };
  saveLocalCases([imported], storage);
  assert.equal(loadLocalCases(storage)[0].importedAt, oldMarker);
  const backup = createCaseBackup(readCaseBackupCases(storage), exportedAt);
  assert.equal(backup.cases[0].importedAt, oldMarker);
  const target = new MemoryStorage(), preview = prepareCaseImport(JSON.stringify(backup), target), next = commitCaseImport(preview, target);
  assert.notEqual(next[0].importedAt, oldMarker); assert.equal(next[0].modelInfo?.modelName, sourceModel.modelName);
  assert.equal(localCase().importedAt, undefined);
  assert.throws(() => saveLocalCases([{ ...imported, importedAt: '2026-02-30T00:00:00Z' }], storage), /导入时间/);
  storage.values.set(CASE_STORAGE_KEY, JSON.stringify([{ ...imported, importedAt: 'bad timestamp' }, localCase('valid-local')]));
  assert.deepEqual(loadLocalCases(storage).map(item => item.id), ['valid-local']);
});

test('case backup and import touch no game, draft, GPS, measurements or market-record keys', () => {
  const storage = new MemoryStorage();
  const other = new Map([['fieldletter.game.v1', 'GAME'], ['fieldletter.clinic-draft.v1', 'DRAFT'], ['fieldletter.location.v1', 'GPS'], ['fieldletter.real-farm.v1', 'FARM'], ['fieldletter.market.v1', 'MARKET']]);
  for (const [key, value] of other) storage.values.set(key, value);
  commitCaseImport(prepareCaseImport(source([localCase()]), storage), storage);
  for (const [key, value] of other) assert.equal(storage.values.get(key), value);
  assert.ok(storage.reads.every(key => key === CASE_STORAGE_KEY));
  assert.ok(storage.writes.every(item => item.key === CASE_STORAGE_KEY));
});
