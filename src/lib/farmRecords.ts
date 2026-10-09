export const FARM_RECORDS_KEY = 'fieldletter.real-farm.v1';

export type FarmProfile = { name: string; production: string; stage: string; notes: string };
export type FarmTask = { id: string; title: string; dueDate: string; createdAt: string; completedAt?: string };
export const MEASUREMENT_TYPES = {
  'air-temp': { label: '田间空气温度', unit: '°C', min: -60, max: 70 },
  'air-humidity': { label: '田间空气湿度', unit: '%', min: 0, max: 100 },
  'soil-water': { label: '土壤体积含水率', unit: '%', min: 0, max: 100 },
  'soil-ph': { label: '土壤 pH', unit: 'pH', min: 0, max: 14 },
  'water-temp': { label: '养殖水温', unit: '°C', min: -5, max: 60 },
  'water-ph': { label: '养殖水体 pH', unit: 'pH', min: 0, max: 14 },
  'oxygen': { label: '养殖水体溶氧', unit: 'mg/L', min: 0, max: 40 },
} as const;
export type MeasurementKind = keyof typeof MEASUREMENT_TYPES;
export type FarmMeasurement = { id: string; kind: MeasurementKind; value: number; place: string; instrument: string; observedAt: string };
export type FarmRecords = { version: 1; profile: FarmProfile; tasks: FarmTask[]; measurements: FarmMeasurement[] };

export function initialFarmRecords(): FarmRecords {
  return { version: 1, profile: { name: '', production: '', stage: '', notes: '' }, tasks: [], measurements: [] };
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }
function id(value: unknown): value is string { return text(value, 100) && value.trim().length > 0; }
function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return false;
  const year = Number(parts[1]); const month = Number(parts[2]); const day = Number(parts[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !calendarDate(parts[1]) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4] ?? 0) > 59) return false;
  const zone = parts[6];
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}
function validTask(value: unknown): value is FarmTask {
  return record(value) && id(value.id) && text(value.title, 200) && value.title.trim().length > 0 && calendarDate(value.dueDate) && timestamp(value.createdAt) && (value.completedAt === undefined || timestamp(value.completedAt));
}
export function validateMeasurement(value: unknown): value is FarmMeasurement {
  if (!record(value) || !id(value.id) || typeof value.kind !== 'string' || !Object.hasOwn(MEASUREMENT_TYPES, value.kind) || typeof value.value !== 'number' || !Number.isFinite(value.value) || !text(value.place, 200) || !value.place.trim() || !text(value.instrument, 200) || !timestamp(value.observedAt)) return false;
  // A small grace period accommodates device clock skew, not future observations.
  if (Date.parse(value.observedAt) > Date.now() + 5 * 60 * 1000) return false;
  const definition = MEASUREMENT_TYPES[value.kind as MeasurementKind];
  return value.value >= definition.min && value.value <= definition.max;
}
export function parseFarmRecords(value: unknown): FarmRecords {
  if (!record(value) || value.version !== 1 || !record(value.profile) || !['name', 'production', 'stage', 'notes'].every(key => text((value.profile as Record<string, unknown>)[key], key === 'notes' ? 2000 : 200)) || !Array.isArray(value.tasks) || !Array.isArray(value.measurements)) throw new Error('不是有效的田野来信农场记录文件。');
  if (value.tasks.length > 500 || value.measurements.length > 1000 || !value.tasks.every(validTask) || !value.measurements.every(validateMeasurement)) throw new Error('记录包含无效的时间、单位或数值，请核实后再导入。');
  const profile = value.profile as FarmProfile;
  return { version: 1, profile: { name: profile.name, production: profile.production, stage: profile.stage, notes: profile.notes }, tasks: value.tasks.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, createdAt: t.createdAt, ...(t.completedAt ? { completedAt: t.completedAt } : {}) })), measurements: value.measurements.map(m => ({ id: m.id, kind: m.kind, value: m.value, place: m.place, instrument: m.instrument, observedAt: m.observedAt })) };
}
export function readFarmRecords(): FarmRecords {
  try { const value = localStorage.getItem(FARM_RECORDS_KEY); return value ? parseFarmRecords(JSON.parse(value)) : initialFarmRecords(); }
  catch { return initialFarmRecords(); }
}
export function writeFarmRecords(records: FarmRecords): void {
  localStorage.setItem(FARM_RECORDS_KEY, JSON.stringify(parseFarmRecords(records)));
}
export function mergeFarmRecords(current: FarmRecords, incoming: FarmRecords): FarmRecords {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => [...a, ...b.filter(item => !a.some(existing => existing.id === item.id))];
  return parseFarmRecords({ version: 1, profile: current.profile.name ? current.profile : incoming.profile, tasks: merge(current.tasks, incoming.tasks).slice(-500), measurements: merge(current.measurements, incoming.measurements).slice(-1000) });
}
