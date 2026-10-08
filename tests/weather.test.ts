import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchWeather, PRESET_LOCATIONS, searchLocations, weatherEmoji, weatherLabel } from '../src/lib/weather.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function fixture() {
  const time = Array.from({ length: 7 }, (_, day) => `2026-10-${String(day + 8).padStart(2, '0')}`);
  return {
    timezone: 'Asia/Shanghai',
    current: { time: `${time[0]}T12:15`, temperature_2m: 26, relative_humidity_2m: 43, wind_speed_10m: 8, precipitation: 0, weather_code: 1 },
    daily: {
      time, temperature_2m_mean: time.map(() => 20), temperature_2m_min: time.map(() => 13),
      temperature_2m_max: time.map(() => 27), precipitation_sum: time.map(() => 4),
      precipitation_probability_max: time.map(() => 72), wind_speed_10m_max: time.map(() => 20),
      et0_fao_evapotranspiration: time.map(() => 3.2), weather_code: time.map(() => 61),
    },
    hourly: {
      time: time.flatMap((date) => Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`)),
      relative_humidity_2m: Array.from({ length: 168 }, (_, hour) => hour % 2 ? 60 : 80) as (number | null)[],
      precipitation_probability: Array.from({ length: 168 }, () => 72),
    },
  };
}

test('current model values stay distinct from daily values and zero rain remains valid', async () => {
  const payload = fixture();
  payload.daily.precipitation_sum[1] = 0;
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('forecast_days'), '7');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
    assert.ok(url.searchParams.get('daily')?.includes('precipitation_sum'));
    return new Response(JSON.stringify(payload));
  }) as typeof fetch;
  const bundle = await fetchWeather(PRESET_LOCATIONS[0]);
  assert.equal(bundle.current.temp, 26);
  assert.equal(bundle.current.humidity, 43);
  assert.equal(bundle.current.wind, 8);
  assert.equal(bundle.current.rain, 4); // not the preceding 15-minute 0 mm
  assert.equal(bundle.forecast[0].temp, 20);
  assert.equal(bundle.forecast[0].humidity, 70);
  assert.equal(bundle.forecast[0].wind, 20);
  assert.equal(bundle.forecast[1].rain, 0);
  assert.equal(bundle.forecast.length, 7);
  assert.equal(bundle.timezone, 'Asia/Shanghai');
});

test('missing hourly humidity is rejected instead of silently becoming zero', async () => {
  const payload = fixture();
  payload.hourly.relative_humidity_2m[7] = null;
  globalThis.fetch = (async () => new Response(JSON.stringify(payload))) as typeof fetch;
  await assert.rejects(fetchWeather(PRESET_LOCATIONS[0]), /缺少有效的空气湿度/);
});

test('incomplete daily data is rejected', async () => {
  const payload = fixture();
  payload.daily.temperature_2m_min.pop();
  globalThis.fetch = (async () => new Response(JSON.stringify(payload))) as typeof fetch;
  await assert.rejects(fetchWeather(PRESET_LOCATIONS[0]), /数据不完整/);
});

test('HTTP failure is shown in Chinese and does not create fake weather', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
  await assert.rejects(fetchWeather(PRESET_LOCATIONS[0]), /请求过于频繁/);
});

test('preset city names and pinyin resolve without a geocoding network request', async () => {
  globalThis.fetch = (async () => { throw new Error('unexpected network request'); }) as typeof fetch;
  assert.equal((await searchLocations('杭州市'))[0].name, '杭州');
  assert.equal((await searchLocations('Chengdu'))[0].name, '成都');
  assert.deepEqual(await searchLocations('  '), []);
});

test('other cities use live Chinese geocoding and preserve disambiguating region names', async () => {
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('language'), 'zh');
    assert.equal(url.searchParams.get('count'), '5');
    return new Response(JSON.stringify({ results: [{ name: '南京', admin1: '江苏', country: '中国', latitude: 32.06, longitude: 118.79 }] }));
  }) as typeof fetch;
  assert.deepEqual(await searchLocations('南京'), [{ name: '南京 · 江苏 · 中国', latitude: 32.06, longitude: 118.79 }]);
});

test('unknown geocoding query returns an empty result', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ generationtime_ms: 1 }))) as typeof fetch;
  assert.deepEqual(await searchLocations('不存在的城市'), []);
});

test('WMO snow, thunder and unknown codes are presented correctly', () => {
  assert.equal(weatherLabel(75), '雪');
  assert.equal(weatherEmoji(95), '⛈️');
  assert.equal(weatherLabel(700), '天气未知');
});
