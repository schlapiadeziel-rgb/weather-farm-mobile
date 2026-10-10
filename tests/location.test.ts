import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { LOCATION_KEY, formatCoordinates, locationFromPosition, parseManualLocation, readSelectedLocation, saveSelectedLocation } from '../src/lib/location.ts';
import { PRESET_LOCATIONS, searchLocations } from '../src/lib/weather.ts';
import type { Location } from '../src/lib/weather.ts';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalFetch = globalThis.fetch;
const now = Date.parse('2026-10-09T08:00:00Z');
const position = () => ({ coords: { latitude: 30.2741, longitude: 120.1551, accuracy: 12 }, timestamp: now });

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  } });
  return values;
}
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  globalThis.fetch = originalFetch;
});

test('GPS preserves real device coordinates, accuracy and observation time without inventing a city', () => {
  const place = locationFromPosition(position(), now);
  assert.deepEqual(place, { name: '手机定位', latitude: 30.2741, longitude: 120.1551, source: 'gps', accuracy: 12, locatedAt: '2026-10-09T08:00:00.000Z' });
});

test('system network and browser providers survive device conversion and storage without becoming satellite fixes', () => {
  installStorage();
  for (const provider of ['network', 'browser', 'gps'] as const) {
    const place = locationFromPosition({ ...position(), provider }, now);
    assert.equal(place.source, 'gps'); // Compatible phone-selection category.
    assert.equal(place.provider, provider);
    assert.equal(saveSelectedLocation(place), true);
    assert.equal(readSelectedLocation()?.provider, provider);
  }
  assert.equal(locationFromPosition(position(), now).provider, undefined);
});

test('unrecognized provider data cannot overwrite or masquerade as a saved trusted position', () => {
  const values = installStorage();
  const trusted = locationFromPosition({ ...position(), provider: 'network' }, now);
  assert.equal(saveSelectedLocation(trusted), true);
  for (const provider of ['ip', 'satellite', '', null, 1]) {
    assert.throws(() => locationFromPosition({ ...position(), provider }, now), /定位来源/);
    assert.equal(saveSelectedLocation({ ...trusted, provider } as unknown as Location), false);
    assert.deepEqual(readSelectedLocation(), trusted);
    values.set(LOCATION_KEY, JSON.stringify({ ...trusted, provider }));
    assert.equal(readSelectedLocation(), null);
    assert.equal(saveSelectedLocation(trusted), true);
  }
});

test('old or future device fixes are refused with useful messages; exact freshness boundaries are allowed', () => {
  assert.throws(() => locationFromPosition({ ...position(), timestamp: now - 120_001 }, now), /旧位置/);
  assert.throws(() => locationFromPosition({ ...position(), timestamp: now + 5_001 }, now), /系统时间/);
  assert.equal(locationFromPosition({ ...position(), timestamp: now - 120_000 }, now).source, 'gps');
  assert.equal(locationFromPosition({ ...position(), timestamp: now + 5_000 }, now).source, 'gps');
});

test('GPS rejects missing or impossible numeric coordinates, accuracy and timestamps', () => {
  for (const latitude of [NaN, Infinity, 90.001, -90.001]) assert.throws(() => locationFromPosition({ ...position(), coords: { ...position().coords, latitude } }, now), /经纬度/);
  for (const longitude of [NaN, Infinity, 180.001, -180.001]) assert.throws(() => locationFromPosition({ ...position(), coords: { ...position().coords, longitude } }, now), /经纬度/);
  for (const accuracy of [NaN, Infinity, -1]) assert.throws(() => locationFromPosition({ ...position(), coords: { ...position().coords, accuracy } }, now), /定位精度/);
  for (const timestamp of [NaN, Infinity, 1e20]) assert.throws(() => locationFromPosition({ ...position(), timestamp }, now), /定位时间/);
  assert.throws(() => locationFromPosition(position(), NaN), /定位时间/);
});

test('large GPS uncertainty stays visible and coordinates are not printed with false metre-level precision', () => {
  const place = locationFromPosition({ ...position(), coords: { ...position().coords, accuracy: 3200 } }, now);
  assert.equal(place.accuracy, 3200);
  assert.equal(formatCoordinates(place), '30.27°, 120.16°');
  assert.equal(formatCoordinates(parseManualLocation('30.2741', '120.1551', '茶园')), '30.27410°, 120.15510°');
});

test('manual coordinates parse the complete number with boundaries, negatives and zero remaining valid', () => {
  assert.deepEqual(parseManualLocation(' -33.86 ', ' +151.2 ', '  牧场  '), { name: '牧场', latitude: -33.86, longitude: 151.2, source: 'manual' });
  assert.deepEqual(parseManualLocation('0', '0', ''), { name: '农场坐标', latitude: 0, longitude: 0, source: 'manual' });
  assert.equal(parseManualLocation('90', '-180', '').longitude, -180);
  assert.equal(parseManualLocation('.5', '1.2e2', '').latitude, 0.5);
  for (const bad of ['', '   ', '30.2abc', '30.2°N', '0x20', 'Infinity', 'NaN', '30,2', '30 2', '1e999']) assert.throws(() => parseManualLocation(bad, '120', ''));
  assert.throws(() => parseManualLocation('90.1', '120', ''), /纬度/);
  assert.throws(() => parseManualLocation('30', '180.1', ''), /经度/);
  assert.throws(() => parseManualLocation('30', '120', 'a'.repeat(121)), /名称/);
  assert.throws(() => parseManualLocation('30', '120', '田块\n1'), /名称/);
});

test('selected location persists independently from a failed weather cache and survives a new session', () => {
  const values = installStorage();
  const place = locationFromPosition(position(), now);
  assert.equal(saveSelectedLocation(place), true);
  assert.ok(values.has(LOCATION_KEY));
  assert.equal(values.has('fieldletter.weather.v1'), false);
  assert.deepEqual(readSelectedLocation(), place);
});

test('legacy saved coordinates remain readable without fabricating GPS metadata', () => {
  const values = installStorage();
  values.set(LOCATION_KEY, JSON.stringify({ name: '原来的农场', latitude: 28.6, longitude: 111.6 }));
  assert.deepEqual(readSelectedLocation(), { name: '原来的农场', latitude: 28.6, longitude: 111.6 });
});

test('invalid saved data is refused including strings, incomplete GPS provenance and impossible dates', () => {
  const values = installStorage();
  const base = { name: '农场', latitude: 30, longitude: 120 };
  const invalid = [null, [], { ...base, latitude: '30' }, { ...base, longitude: 190 }, { ...base, name: '' }, { ...base, source: 'ip' }, { ...base, accuracy: -1 }, { ...base, source: 'gps' }, { ...base, source: 'gps', accuracy: 5, locatedAt: '2026-02-30T08:00:00.000Z' }, { ...base, locatedAt: '2026-10-09T24:00:00.000Z' }];
  for (const value of invalid) {
    values.set(LOCATION_KEY, JSON.stringify(value));
    assert.equal(readSelectedLocation(), null);
    assert.equal(saveSelectedLocation(value as Location), false);
  }
  values.set(LOCATION_KEY, 'invalid-json');
  assert.equal(readSelectedLocation(), null);
});

test('storage denial and missing browser storage do not crash selecting a location', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.equal(saveSelectedLocation(PRESET_LOCATIONS[0]), false);
  assert.equal(readSelectedLocation(), null);
  Reflect.deleteProperty(globalThis, 'localStorage');
  assert.equal(saveSelectedLocation(PRESET_LOCATIONS[0]), false);
  assert.equal(readSelectedLocation(), null);
});

test('live Chinese city search preserves namesakes rather than overriding them with a preset', async () => {
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('name'), '杭州');
    assert.equal(url.searchParams.get('language'), 'zh');
    return new Response(JSON.stringify({ results: [
      { name: '杭州', admin1: '浙江', admin2: '杭州市', country: '中国', latitude: 30.29365, longitude: 120.16142 },
      { name: '杭州', admin1: '四川', admin2: '甘孜藏族自治州', country: '中国', latitude: 30.06517, longitude: 102.19527 },
    ] }));
  }) as typeof fetch;
  const places = await searchLocations('杭州市');
  assert.equal(places.length, 2);
  assert.equal(places[0].name, '杭州 · 浙江 · 杭州市 · 中国');
  assert.equal(places[1].name, '杭州 · 四川 · 甘孜藏族自治州 · 中国');
  assert.equal(places[1].longitude, 102.19527);
  assert.equal(places[1].source, 'search');
});

test('offline fallback is an exact known preset; qualified and partial searches never select an unrelated city', async () => {
  globalThis.fetch = (async () => { throw new TypeError('offline'); }) as typeof fetch;
  const place = (await searchLocations('hangzhou'))[0];
  assert.equal(place.source, 'preset');
  assert.equal(place.name, '杭州 · 浙江 · 中国');
  await assert.rejects(searchLocations('杭州, 四川'), /无法连接/);
  await assert.rejects(searchLocations('杭'), /无法连接/);
  assert.ok(PRESET_LOCATIONS.every((preset) => preset.source === 'preset'));
});
