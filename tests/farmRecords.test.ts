import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialFarmRecords, mergeFarmRecords, parseFarmRecords, validateMeasurement } from '../src/lib/farmRecords.ts';

test('real-farm records start empty and do not import game scores or simulated health', () => {
  const value = initialFarmRecords();
  assert.deepEqual(value.tasks, []);
  assert.deepEqual(value.measurements, []);
  assert.equal('coins' in value, false);
  assert.throws(() => parseFarmRecords({ version: 1, coins: 500, plots: [] }), /有效/);
});
test('water quality and soil measurements preserve units and reject invalid values', () => {
  const m = { id: 'measurement-1', kind: 'oxygen', value: 4.2, place: '1号池底层', instrument: '溶氧仪', observedAt: '2026-10-08T06:30:00+08:00' };
  assert.equal(validateMeasurement(m), true);
  assert.equal(validateMeasurement({ ...m, value: -1 }), false);
  assert.equal(validateMeasurement({ ...m, kind: 'water-ph', value: 15 }), false);
  assert.equal(validateMeasurement({ ...m, kind: '__proto__' }), false);
  assert.equal(validateMeasurement({ ...m, value: Number.NaN }), false);
  assert.equal(validateMeasurement({ ...m, observedAt: 'unknown' }), false);
});
test('backup merge deduplicates records and preserves an existing farm identity', () => {
  const current = initialFarmRecords(); current.profile.name = '我的农场';
  current.tasks.push({ id: 'a', title: '检查饮水', dueDate: '2026-10-08', createdAt: '2026-10-08T00:00:00Z' });
  const incoming = initialFarmRecords(); incoming.profile.name = '备份农场';
  incoming.tasks.push(...current.tasks, { id: 'b', title: '联系收购商', dueDate: '2026-10-09', createdAt: '2026-10-08T00:00:00Z' });
  const combined = mergeFarmRecords(current, incoming);
  assert.equal(combined.profile.name, '我的农场');
  assert.deepEqual(combined.tasks.map(t => t.id), ['a', 'b']);
});

test('task due dates must exist in the calendar and preserve valid leap-day records', () => {
  const task = { id: 'leap-inspection', title: '检查覆盖物', dueDate: '2024-02-29', createdAt: '2024-02-28T12:00:00+08:00' };
  const records = { ...initialFarmRecords(), tasks: [task] };
  assert.equal(parseFarmRecords(records).tasks[0].dueDate, '2024-02-29');
  for (const dueDate of ['2024-02-30', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10']) {
    assert.throws(() => parseFarmRecords({ ...records, tasks: [{ ...task, dueDate }] }), /无效的时间/);
  }
  const centuries = { ...records, tasks: [{ ...task, dueDate: '2000-02-29' }] };
  assert.equal(parseFarmRecords(centuries).tasks[0].dueDate, '2000-02-29');
  assert.throws(() => parseFarmRecords({ ...records, tasks: [{ ...task, dueDate: '1900-02-29' }] }), /无效的时间/);
});

test('task and measurement IDs cannot be empty or whitespace-only', () => {
  const task = { id: 'task-1', title: '巡查池塘', dueDate: '2026-10-09', createdAt: '2026-10-08T06:30:00Z' };
  const measurement = { id: 'measurement-1', kind: 'water-ph', value: 7.2, place: '池边', instrument: 'pH计', observedAt: '2026-10-08T06:30:00+08:00' };
  for (const id of ['', '   ', '\t\n']) {
    assert.throws(() => parseFarmRecords({ ...initialFarmRecords(), tasks: [{ ...task, id }] }), /无效/);
    assert.equal(validateMeasurement({ ...measurement, id }), false);
  }
});

test('real record timestamps reject date normalization and invalid clock components', () => {
  const task = { id: 'task-1', title: '检查苗情', dueDate: '2026-10-09', createdAt: '2026-10-08T06:30:00Z' };
  const measurement = { id: 'measurement-1', kind: 'soil-water', value: 28, place: '田边 20cm', instrument: '便携探头', observedAt: '2026-10-08T06:30:00+08:00' };
  for (const invalid of ['2026-02-30T06:30:00Z', '2026-10-08T24:00:00Z', '2026-10-08T06:60:00Z', '2026-10-08T06:30:60Z', '2026-10-08T06:30:00+08:60', '2026-10-08', 'not-a-time']) {
    assert.equal(validateMeasurement({ ...measurement, observedAt: invalid }), false, invalid);
    assert.throws(() => parseFarmRecords({ ...initialFarmRecords(), tasks: [{ ...task, createdAt: invalid }] }), /无效的时间/, invalid);
    assert.throws(() => parseFarmRecords({ ...initialFarmRecords(), tasks: [{ ...task, completedAt: invalid }] }), /无效的时间/, invalid);
  }
  const records = parseFarmRecords({ ...initialFarmRecords(), measurements: [{ ...measurement, observedAt: '2024-02-29T06:30:00.123+08:00' }], tasks: [{ ...task, completedAt: '2026-10-08T06:45:00Z' }] });
  assert.equal(records.measurements[0].observedAt, '2024-02-29T06:30:00.123+08:00');
  assert.equal(records.tasks[0].completedAt, '2026-10-08T06:45:00Z');
});

test('future measurement imports are rejected beyond clock-skew tolerance while history is retained', () => {
  const now = Date.now();
  const measurement = { id: 'measurement-1', kind: 'oxygen', value: 5.4, place: '1号池', instrument: '溶氧仪', observedAt: new Date(now - 60_000).toISOString() };
  assert.equal(validateMeasurement(measurement), true);
  assert.equal(validateMeasurement({ ...measurement, observedAt: new Date(now + 2 * 60_000).toISOString() }), true);
  const future = { ...measurement, observedAt: new Date(now + 20 * 60_000).toISOString() };
  assert.equal(validateMeasurement(future), false);
  assert.throws(() => parseFarmRecords({ ...initialFarmRecords(), measurements: [future] }), /无效的时间/);
  assert.equal(parseFarmRecords({ ...initialFarmRecords(), measurements: [measurement] }).measurements[0].observedAt, measurement.observedAt);
});
