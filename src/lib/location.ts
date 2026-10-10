import type { Location } from './weather';

/** Stored independently of weather: a failed weather request must not lose it. */
export const LOCATION_KEY = 'fieldletter.location.v1';
const LOCATION_SOURCES = new Set(['gps', 'manual', 'search', 'preset']);
const LOCATION_PROVIDERS = new Set(['gps', 'network', 'browser']);

function validProvider(value: unknown): value is NonNullable<Location['provider']> {
  return typeof value === 'string' && LOCATION_PROVIDERS.has(value);
}

function finiteCoordinate(value: unknown, bound: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound;
}
function locationName(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
}
function validRecordedTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
function validLocation(value: unknown): value is Location {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const place = value as Record<string, unknown>;
  if (!locationName(place.name) || !finiteCoordinate(place.latitude, 90) || !finiteCoordinate(place.longitude, 180)) return false;
  if (place.source !== undefined && (typeof place.source !== 'string' || !LOCATION_SOURCES.has(place.source))) return false;
  if (place.provider !== undefined && !validProvider(place.provider)) return false;
  if (place.accuracy !== undefined && (typeof place.accuracy !== 'number' || !Number.isFinite(place.accuracy) || place.accuracy < 0)) return false;
  if (place.locatedAt !== undefined && !validRecordedTime(place.locatedAt)) return false;
  if (place.source === 'gps' && (place.accuracy === undefined || place.locatedAt === undefined)) return false;
  return true;
}
function copyLocation(place: Location): Location {
  const result: Location = { name: place.name.trim(), latitude: place.latitude, longitude: place.longitude };
  if (place.source !== undefined) result.source = place.source;
  if (place.provider !== undefined) result.provider = place.provider;
  if (place.accuracy !== undefined) result.accuracy = place.accuracy;
  if (place.locatedAt !== undefined) result.locatedAt = place.locatedAt;
  return result;
}

export function readSelectedLocation(): Location | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const saved: unknown = JSON.parse(localStorage.getItem(LOCATION_KEY) || 'null');
    // Old valid positions with no source metadata remain usable, but are never
    // promoted to a GPS fix or given fabricated precision/observation times.
    return validLocation(saved) ? copyLocation(saved) : null;
  } catch { return null; }
}

export function saveSelectedLocation(location: Location): boolean {
  if (!validLocation(location)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(LOCATION_KEY, JSON.stringify(copyLocation(location)));
    return true;
  } catch { return false; }
}

export function locationFromPosition(position: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number; provider?: unknown }, now = Date.now()): Location {
  const coords = position?.coords;
  if (!coords || !finiteCoordinate(coords.latitude, 90) || !finiteCoordinate(coords.longitude, 180)) {
    throw new Error('手机返回的经纬度无效，请重新定位或手动填写农场坐标。');
  }
  if (typeof coords.accuracy !== 'number' || !Number.isFinite(coords.accuracy) || coords.accuracy < 0) {
    throw new Error('手机未提供有效定位精度，请重新定位或手动填写坐标。');
  }
  const timestamp = position.timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || !Number.isFinite(now)
    || !Number.isFinite(new Date(timestamp).getTime()) || !Number.isFinite(new Date(now).getTime())) {
    throw new Error('手机定位时间无效，请核对系统时间后重试。');
  }
  if (timestamp - now > 5_000) throw new Error('手机定位时间超过系统时间，请核对手机时间后重新定位。');
  if (now - timestamp > 120_000) throw new Error('手机返回的是超过两分钟前的旧位置，请重新获取当前位置。');
  if (position.provider !== undefined && !validProvider(position.provider)) throw new Error('手机返回的定位来源无法识别，请重新定位。');
  // Never infer a city using IP. Keep the actual device coordinates and its
  // reported uncertainty; the UI must confirm large errors with the farmer.
  const location: Location = {
    name: '手机定位', latitude: coords.latitude, longitude: coords.longitude,
    source: 'gps', accuracy: coords.accuracy, locatedAt: new Date(timestamp).toISOString(),
  };
  if (position.provider !== undefined) location.provider = position.provider;
  return location;
}

function coordinateText(value: string, bound: number, label: string): number {
  const cleaned = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) {
    throw new Error(`${label}需要完整数字，不能带方向、单位或其他文字。`);
  }
  const coordinate = Number(cleaned);
  if (!finiteCoordinate(coordinate, bound)) throw new Error(`${label}必须在 -${bound} 到 ${bound} 之间。`);
  return coordinate;
}

export function parseManualLocation(latitudeText: string, longitudeText: string, label: string): Location {
  if (typeof latitudeText !== 'string' || typeof longitudeText !== 'string' || typeof label !== 'string') {
    throw new Error('请填写有效的农场坐标。');
  }
  const name = label.trim() || '农场坐标';
  if (!locationName(name)) throw new Error('农场名称请控制在 120 个字符内，不要使用换行或控制字符。');
  return { name, latitude: coordinateText(latitudeText, 90, '纬度'), longitude: coordinateText(longitudeText, 180, '经度'), source: 'manual' };
}

export function formatCoordinates(location: Location): string {
  if (!validLocation(location)) return '坐标无效';
  // Avoid displaying metre-like precision when the phone reports a coarse fix.
  const accuracy = location.source === 'gps' ? location.accuracy! : 0;
  const decimals = accuracy >= 10_000 ? 1 : accuracy >= 1_000 ? 2 : accuracy >= 100 ? 3 : accuracy >= 10 ? 4 : 5;
  return `${location.latitude.toFixed(decimals)}°, ${location.longitude.toFixed(decimals)}°`;
}
