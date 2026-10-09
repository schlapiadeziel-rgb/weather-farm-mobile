import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDiagnosisPrompt, CASE_STORAGE_KEY, createLocalCase, EDUCATION_ENTRIES, getRelevantGuidance,
  getSafetyTriage, loadLocalCases, MODEL_NOTICE, normalizeObservation, parseDiagnosisOutput,
  saveLocalCases, validateDiagnosisResult,
} from '../src/lib/fieldDiagnosis.ts';
import type { CaseStorage, FieldObservation, StructuredDiagnosis } from '../src/lib/fieldDiagnosis.ts';

const observation: FieldObservation = {
  category: 'crop', subject: '菠萝', symptoms: '田边几株叶尖发黄，中心叶仍绿色。',
  onset: '2026-10-09 上午首次发现', extent: '田边一行', affectedCount: 4, totalCount: 80, ageOrStage: '定植后 2 个月',
};
const result: StructuredDiagnosis = {
  observations: ['用户描述田边少量植株叶尖发黄；缺少照片。'],
  possibleCauses: [{ name: '水分或近期管理变化可能相关', evidence: ['分布在田边，但没有实测土壤数据。'], uncertainty: '无法仅凭文字确定原因，需要补充现场记录。' }],
  missingInformation: ['补拍整株、叶片正反面和同批正常植株。'], lowRiskActions: ['标记受影响位置，记录变化，不自行用药。'],
  escalation: ['范围扩大或持续加重时联系当地农技人员。'], risk: 'medium', limitations: ['现有信息不足以确诊。'],
};
const rawResult = (): string => JSON.stringify(result);
function memoryStorage(): CaseStorage {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}

test('prompt accepts arbitrary real crop names and projects only explicit observation fields', () => {
  const input = {
    ...observation,
    game: { coins: 987654321, plots: [{ moisture: 7, health: 3 }] },
    animalHealth: 'SIMULATED_ANIMAL_SECRET',
    deviceLocation: 'DEVICE_COORDINATE_SECRET',
    media: [{ id: 'leaf-photo', kind: 'photo' as const, description: '用户拍摄的整株，叶尖发黄。', localUri: 'content://PRIVATE_IMAGE_PATH', capturedAt: '2026-10-09T10:00:00Z' }],
  };
  const snapshot = structuredClone(input);
  const prompt = buildDiagnosisPrompt(input);
  const data = JSON.parse(prompt.user);
  assert.equal(data.realObservation.subject, '菠萝');
  assert.equal(data.realObservation.media[0].description, input.media[0].description);
  for (const secret of ['987654321', 'SIMULATED_ANIMAL_SECRET', 'DEVICE_COORDINATE_SECRET', 'PRIVATE_IMAGE_PATH']) assert.ok(!prompt.user.includes(secret));
  assert.match(prompt.system, /禁止使用游戏/);
  assert.ok(prompt.system.includes(MODEL_NOTICE));
  assert.deepEqual(input, snapshot);
});

test('real weather and selected measurements retain their provenance and timestamp', () => {
  const input: FieldObservation = {
    category: 'animal', subject: '罗非鱼', symptoms: '早上有鱼浮到水面，食欲降低。', managementNotes: '昨天下午换水约一成。',
    measurements: [{ name: '溶氧', value: 3.2, unit: 'mg/L', observedAt: '2026-10-09T06:00:00Z', place: '池塘东侧水下 30 cm', instrument: '手持溶氧仪' }],
    weather: { sourceName: 'Open-Meteo', sourceKind: 'forecast', observedAt: '2026-10-09T05:00:00Z', temperature: 26, humidity: 82 },
  };
  const prompt = buildDiagnosisPrompt(input);
  const data = JSON.parse(prompt.user);
  assert.equal(data.realObservation.measurements[0].value, 3.2);
  assert.equal(data.realObservation.measurements[0].observedAt, input.measurements![0].observedAt);
  assert.equal(data.realObservation.weather.sourceKind, 'forecast');
  assert.match(prompt.system, /空气气温和天气不能替代水温、溶氧、pH/);
  assert.ok(data.managementReferences.some((entry: { id: string }) => entry.id === 'aquaculture'));
  const parsed = parseDiagnosisOutput(rawResult(), input);
  assert.ok(parsed.result?.missingInformation.some((item) => /实际水温、pH、溶氧/.test(item)));
});

test('keyframes are explicitly limited evidence and do not imply original video or audio access', () => {
  const prompt = buildDiagnosisPrompt({
    ...observation,
    media: [{ id: 'frame-1', kind: 'video-frame', timestampSeconds: 4, description: '4 秒处植株全景。' }],
  });
  const data = JSON.parse(prompt.user);
  assert.equal(data.realObservation.media[0].kind, 'video-frame');
  assert.equal(data.realObservation.media[0].timestampSeconds, 4);
  assert.match(prompt.system, /不得声称看过原视频、原视频音轨或连续行为/);
});

test('invalid real observations fail rather than generating invented numeric observations', () => {
  assert.throws(() => normalizeObservation({ ...observation, symptoms: '' }), /症状描述/);
  assert.throws(() => normalizeObservation({ ...observation, affectedCount: 90 }), /不能超过/);
  assert.throws(() => normalizeObservation({ ...observation, measurements: [{ name: '土壤温度', value: Number.NaN, unit: '°C', observedAt: '今日', place: '田边' }] }), /实测值/);
  assert.throws(() => normalizeObservation({ ...observation, weather: { sourceName: '温度计', sourceKind: 'measured', observedAt: '今日', humidity: 120 } }), /空气湿度/);
  assert.throws(() => buildDiagnosisPrompt({ ...observation, symptoms: '细节'.repeat(2000), managementNotes: '近期管理'.repeat(250) }), /过长/);
});

test('complete JSON and fenced JSON produce structured possibilities, never a confirmed diagnosis', () => {
  for (const raw of [rawResult(), `\`\`\`json\n${rawResult()}\n\`\`\``]) {
    const parsed = parseDiagnosisOutput(raw, observation);
    assert.equal(parsed.status, 'structured');
    assert.ok(parsed.result);
    assert.equal(parsed.validationErrors.length, 0);
    assert.equal(parsed.result.possibleCauses[0].name, result.possibleCauses[0].name);
    assert.ok(parsed.result.limitations.includes(MODEL_NOTICE));
    assert.ok(!('confirmedDiagnosis' in parsed.result));
  }
});

test('malformed output preserves raw text but cannot become structured diagnosis', () => {
  for (const raw of ['不是 JSON：我猜是病害。', '{"risk":"low",', 'null', '[]', '{"risk":"low","observations":["发黄"]}']) {
    const parsed = parseDiagnosisOutput(raw, observation);
    assert.equal(parsed.status, 'unstructured');
    assert.equal(parsed.result, null);
    assert.equal(parsed.raw, raw);
    assert.ok(parsed.validationErrors.length > 0);
    assert.ok(parsed.notice.includes('不是确诊'));
  }
});

test('schema rejects missing uncertainty and fabricated risk levels', () => {
  assert.equal(validateDiagnosisResult({ ...result, possibleCauses: [{ name: '某病', evidence: ['发黄'] }] }).result, null);
  assert.equal(validateDiagnosisResult({ ...result, risk: 'certain' }).result, null);
  assert.equal(validateDiagnosisResult({ ...result, lowRiskActions: '使用药物' }).result, null);
});

test('prompt requires array evidence and parsing never turns single-string evidence into success', () => {
  const prompt = buildDiagnosisPrompt(observation);
  assert.match(prompt.system, /possibleCauses\.evidence必须是字符串数组，即使只有一项也用/);
  const raw = JSON.stringify({ ...result, possibleCauses: [{ ...result.possibleCauses[0], evidence: '用户只描述叶尖发黄。' }] });
  const parsed = parseDiagnosisOutput(raw, observation);
  assert.equal(parsed.status, 'unstructured');
  assert.equal(parsed.result, null);
  assert.equal(parsed.raw, raw);
  assert.ok(parsed.validationErrors.some((error) => /原因依据/.test(error)));
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, limitations: ['不能确诊，仅供辅助排查。'] }), observation).status, 'structured');
});

test('model certainty, accuracy claims and pharmaceutical doses are rejected before display as advice', () => {
  for (const unsafe of ['确诊为某病。', '本模型准确率 99%。', '保证治愈并提高收益。', '建议注射 10mg/kg 抗菌药。', '使用 2克青霉素。', '喷施 1000倍液药剂。']) {
    const parsed = parseDiagnosisOutput(JSON.stringify({ ...result, lowRiskActions: [unsafe] }), observation);
    assert.equal(parsed.status, 'unstructured', unsafe);
    assert.equal(parsed.result, null, unsafe);
    assert.ok(parsed.validationErrors.some((error) => /不安全内容/.test(error)), unsafe);
  }
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, observations: ['溶氧仪实测 3.2 mg/L，时间为今日清晨。'] }), observation).status, 'structured', 'actual water-quality measurements are not a drug dose');
});

test('English diagnosis certainty, invented accuracy and drug doses are rejected just like Chinese', () => {
  for (const unsafe of ['Confirmed diagnosis of fungal disease.', 'The animal is diagnosed with pneumonia.', 'The cow definitely has an infection.', 'This treatment has a guaranteed cure.', 'Model accuracy98%.', 'Confidence0.99.', 'Administer 10mg per kg.', 'Spray the plants with 2ml of pesticide.']) {
    const parsed = parseDiagnosisOutput(JSON.stringify({ ...result, lowRiskActions: [unsafe] }), observation);
    assert.equal(parsed.status, 'unstructured', unsafe);
    assert.equal(parsed.result, null, unsafe);
    assert.ok(parsed.validationErrors.some((error) => /不安全内容/.test(error)), unsafe);
  }
  const safe = parseDiagnosisOutput(JSON.stringify({ ...result, limitations: ['This is not a confirmed diagnosis.', 'We cannot diagnose from these observations.', 'Unknown accuracy.', 'Cannot guarantee a cure.', 'This is not a diagnosis.'] }), observation);
  assert.equal(safe.status, 'structured');
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, limitations: ['Not a confirmed diagnosis, but the cow definitely has pneumonia.'] }), observation).status, 'unstructured');
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, limitations: ['Unknown accuracy.', 'Temperature was 23°C.'] }), observation).status, 'structured', 'separate factual numbers are not an accuracy claim');
});

test('Chinese diagnosis limitations including the actual model notice are allowed without hiding affirmative promises', () => {
  for (const limitation of [MODEL_NOTICE, '仅用于辅助排查，不是确诊。', '不作任何确诊。', '结果不用于确诊。', '不能作为疾病确诊的依据。', '本次不确诊任何病害。']) {
    assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, limitations: [limitation] }), observation).status, 'structured', limitation);
  }
  for (const unsafe of ['这是确诊。', '已经确诊。', '不是确诊，但是保证治愈。', '不作确诊，但已经确诊。', '不是，已经确诊。']) {
    const parsed = parseDiagnosisOutput(JSON.stringify({ ...result, limitations: [unsafe] }), observation);
    assert.equal(parsed.status, 'unstructured', unsafe);
    assert.equal(parsed.result, null, unsafe);
  }
});

test('real model failures recommending plant relocation or a veterinarian for tomatoes remain unstructured', () => {
  const tomato: FieldObservation = { category: 'crop', subject: '番茄', symptoms: '两株番茄叶片发黄。' };
  const failures = [
    { ...result, lowRiskActions: ['立即将两株病株移至隔离观察。'] },
    { ...result, escalation: ['联系专业兽医。'] },
  ];
  for (const failure of failures) {
    const raw = JSON.stringify(failure);
    const parsed = parseDiagnosisOutput(raw, tomato);
    assert.equal(parsed.status, 'unstructured');
    assert.equal(parsed.result, null);
    assert.equal(parsed.raw, raw);
    assert.ok(parsed.validationErrors.some((error) => /作物.*(?:兽医|搬移)/.test(error)));
    assert.equal(parsed.triage.risk, 'medium');
  }
  const spreading = parseDiagnosisOutput(JSON.stringify(failures[0]), { ...tomato, symptoms: '叶片病斑范围快速扩大。' });
  assert.equal(spreading.result, null);
  assert.equal(spreading.triage.risk, 'high');
  assert.match(spreading.triage.contact, /农技/);
});

test('crop context rejects invasive actions in either language but accepts explicit original-site precautions', () => {
  for (const action of ['移栽病株到其他田块。', '拔除患病植株。', '把土壤搬运到另一块田。', 'Move affected plants to an isolation area.', 'Uproot the affected plants.']) {
    assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, lowRiskActions: [action] }), observation).status, 'unstructured', action);
  }
  const safe = parseDiagnosisOutput(JSON.stringify({ ...result, lowRiskActions: ['原位标记观察，不要将病株移至其他地方。', '避免搬运土壤，不自行拔除植株。', 'Do not transplant affected plants; mark and observe them in place.'] }), observation);
  assert.equal(safe.status, 'structured');
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, lowRiskActions: ['不要搬运土壤，但立即拔除病株。'] }), observation).status, 'unstructured');
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, escalation: ['Contact a veterinarian.'] }), observation).status, 'unstructured');
  assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, escalation: ['联系当地兽医。'] }), { category: 'animal', subject: '山羊', symptoms: '采食减少。' }).status, 'structured');
  assert.match(buildDiagnosisPrompt(observation).system, /作物.*农技.*植保.*不能指引联系兽医/);
  assert.match(buildDiagnosisPrompt({ category: 'animal', subject: '山羊', symptoms: '采食减少。' }).system, /养殖.*减少应激，不随意搬运动物/);
});

test('animal respiratory, neurological and acute-death descriptions always escalate first', () => {
  for (const symptoms of ['多只鸡大量急死', '一只奶牛呼吸困难', '猪出现神经异常和抽搐']) {
    const input: FieldObservation = { category: 'animal', subject: '本场动物', symptoms };
    const triage = getSafetyTriage(input);
    assert.equal(triage.risk, 'urgent');
    assert.match(triage.contact, /立即联系.*兽医/);
    assert.ok(triage.immediateActions.some((action) => action.includes('隔离')));
    const parsed = parseDiagnosisOutput(JSON.stringify({ ...result, risk: 'low' }), input);
    assert.equal(parsed.result?.risk, 'urgent');
    assert.equal(parsed.result?.escalation[0], triage.contact);
    assert.ok(parsed.result?.lowRiskActions[0].includes('隔离'));
    const failed = parseDiagnosisOutput('坏JSON', input);
    assert.equal(failed.result, null);
    assert.equal(failed.triage.risk, 'urgent');
    assert.equal(failed.triage.contact, triage.contact);
  }
});

test('rapidly expanding crop symptoms escalate even when the model is reassuring', () => {
  const input = { ...observation, symptoms: '叶斑范围快速扩大，一天内从一行扩散到三行。' };
  const parsed = parseDiagnosisOutput(JSON.stringify({ ...result, risk: 'low' }), input);
  assert.equal(parsed.triage.risk, 'high');
  assert.equal(parsed.result?.risk, 'high');
  assert.match(parsed.result!.escalation[0], /尽快联系.*农技/);
});

test('explicit negatives do not trigger animal emergency alerts, while separate affirmative danger remains urgent', () => {
  for (const symptoms of ['没有呼吸困难，未发生死亡。', '未发生大量死亡，未见神经异常。', '没有明显的呼吸困难。', '未见呼吸困难、抽搐或急死。', '呼吸困难：无；神经异常：未见。', 'No respiratory distress or sudden death observed.']) {
    const input: FieldObservation = { category: 'animal', subject: '本场动物', symptoms };
    assert.equal(getSafetyTriage(input).risk, 'medium', symptoms);
  }
  for (const symptoms of ['没有呼吸困难，但一只羊出现抽搐。', '未发生大量死亡，一只奶牛张口呼吸。', '过去没有神经异常，今天突然死亡两只。', '并非没有呼吸困难，需要进一步检查。']) {
    const input: FieldObservation = { category: 'animal', subject: '本场动物', symptoms };
    assert.equal(getSafetyTriage(input).risk, 'urgent', symptoms);
    assert.equal(parseDiagnosisOutput(JSON.stringify({ ...result, risk: 'low' }), input).result?.risk, 'urgent', symptoms);
  }
});

test('explicit denial of rapid crop spread does not escalate an isolated symptom', () => {
  assert.equal(getSafetyTriage({ ...observation, symptoms: '几株叶片发黄，没有快速扩散。' }).risk, 'medium');
  assert.equal(getSafetyTriage({ ...observation, symptoms: '昨天没有快速扩散，今天范围快速扩大。' }).risk, 'high');
  assert.equal(getSafetyTriage({ ...observation, symptoms: '昨天没有短时间扩大，但今天快速扩散。' }).risk, 'high');
});

test('local cases persist selected reality-only data and revalidate raw model results on read', () => {
  const storage = memoryStorage();
  const input = { ...observation, game: { secret: 'GAME_SAVE_SECRET' }, media: [{ id: 'p1', kind: 'photo' as const, localUri: 'file://PRIVATE_CASE_PHOTO', description: '整株照片。' }] };
  const item = createLocalCase(input, parseDiagnosisOutput(rawResult(), input), '2026-10-09T12:00:00Z');
  saveLocalCases([item], storage);
  const saved = storage.getItem(CASE_STORAGE_KEY)!;
  assert.ok(!saved.includes('GAME_SAVE_SECRET'));
  assert.ok(!saved.includes('PRIVATE_CASE_PHOTO'));
  const loaded = loadLocalCases(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].observation.subject, '菠萝');
  assert.equal(loaded[0].observation.media![0].description, '整株照片。');
  assert.equal(loaded[0].outcome.status, 'structured');
  const tampered = JSON.parse(saved);
  tampered[0].outcome.result = { risk: 'low', confirmedDiagnosis: '伪造确诊' };
  storage.setItem(CASE_STORAGE_KEY, JSON.stringify(tampered));
  assert.equal(loadLocalCases(storage)[0].outcome.result!.risk, 'medium');
  assert.ok(!JSON.stringify(loadLocalCases(storage)[0].outcome.result).includes('伪造确诊'));
});

test('corrupt saved cases and storage failures are handled without fabricating a diagnosis', () => {
  const storage = memoryStorage();
  storage.setItem(CASE_STORAGE_KEY, 'broken JSON');
  assert.deepEqual(loadLocalCases(storage), []);
  storage.setItem(CASE_STORAGE_KEY, JSON.stringify([{ version: 7, observation: observation }]));
  assert.deepEqual(loadLocalCases(storage), []);
  const item = createLocalCase(observation, parseDiagnosisOutput('unstructured text', observation));
  saveLocalCases([item], storage);
  assert.equal(loadLocalCases(storage)[0].outcome.result, null);
  assert.equal(loadLocalCases(storage)[0].outcome.status, 'unstructured');
  assert.throws(() => saveLocalCases([item], { getItem: () => null, setItem: () => { throw new Error('quota'); } }), /本地案例保存失败/);
});

test('local case timestamps reject impossible calendar dates on creation save and cached reload', () => {
  const storage = memoryStorage();
  const outcome = parseDiagnosisOutput(rawResult(), observation);
  const valid = createLocalCase(observation, outcome, '2024-02-29T06:30:00+08:00');
  for (const createdAt of ['2026-02-30T06:30:00Z', '2026-10-09T24:00:00Z', '2026-10-09T06:60:00Z', '2026-10-09']) {
    assert.throws(() => createLocalCase(observation, outcome, createdAt), /案例时间无效/, createdAt);
    assert.throws(() => saveLocalCases([{ ...valid, createdAt }], storage), /案例时间无效/, createdAt);
    storage.setItem(CASE_STORAGE_KEY, JSON.stringify([{ ...valid, id: 'invalid-date', createdAt }, valid]));
    assert.deepEqual(loadLocalCases(storage).map((item) => item.id), [valid.id]);
  }
  saveLocalCases([valid], storage);
  assert.equal(loadLocalCases(storage)[0].createdAt, '2024-02-29T06:30:00+08:00');
});

test('real model provenance roundtrips through a field allowlist and invalid metadata is rejected', () => {
  const storage = memoryStorage();
  const modelInfo = { modelId: 'qwen3.5-0.8b-q4', modelName: 'Qwen3.5 0.8B Q4', engineVersion: 'llama.cpp test-build', durationMs: 1250.5, privatePath: 'PRIVATE_MODEL_FILE_PATH', accuracy: 'FAKE_ACCURACY_99%' };
  const item = createLocalCase(observation, parseDiagnosisOutput(rawResult(), observation), '2026-10-09T12:00:00Z', modelInfo);
  saveLocalCases([item], storage);
  const stored = storage.getItem(CASE_STORAGE_KEY)!;
  assert.ok(!stored.includes('PRIVATE_MODEL_FILE_PATH'));
  assert.ok(!stored.includes('FAKE_ACCURACY_99%'));
  assert.deepEqual(loadLocalCases(storage)[0].modelInfo, {
    modelId: modelInfo.modelId, modelName: modelInfo.modelName, engineVersion: modelInfo.engineVersion, durationMs: modelInfo.durationMs,
  });
  assert.throws(() => createLocalCase(observation, item.outcome, undefined, { ...modelInfo, durationMs: -1 }), /模型分析耗时/);
  assert.throws(() => saveLocalCases([{ ...item, modelInfo: { ...modelInfo, durationMs: Number.NaN } }], storage), /模型分析耗时/);
  const corrupted = JSON.parse(stored);
  corrupted[0].modelInfo.durationMs = -1;
  storage.setItem(CASE_STORAGE_KEY, JSON.stringify(corrupted));
  const retained = loadLocalCases(storage);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].modelInfo, undefined);
  assert.equal(retained[0].observation.subject, '菠萝');
  const legacy = createLocalCase(observation, item.outcome);
  saveLocalCases([legacy], storage);
  assert.equal(loadLocalCases(storage)[0].modelInfo, undefined);
});

test('offline educational entries have attributed HTTPS sources and relevant topic selection', () => {
  assert.ok(EDUCATION_ENTRIES.every((entry) => entry.title && entry.body && entry.sourceName && entry.sourceUrl.startsWith('https://')));
  assert.deepEqual(getRelevantGuidance(observation).map((entry) => entry.id), ['monitor', 'photos']);
  assert.ok(getRelevantGuidance({ category: 'animal', subject: '南美白对虾', symptoms: '采食下降' }).some((entry) => entry.id === 'aquaculture'));
  assert.ok(getRelevantGuidance({ category: 'animal', subject: '山羊', symptoms: '精神沉郁' }).some((entry) => entry.id === 'animal-emergency'));
});
