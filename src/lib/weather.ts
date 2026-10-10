/** Public Open-Meteo weather model data, not an on-farm station or soil sensor.
 * https://open-meteo.com/en/docs
 * https://open-meteo.com/en/docs/geocoding-api
 */
export type WeatherDay = {
  date: string;
  temp: number;
  minTemp: number;
  maxTemp: number;
  humidity: number;
  /** Total daily precipitation forecast in mm (rain, showers and snow equivalent). */
  rain: number;
  /** Maximum hourly precipitation probability for the day, in percent. */
  rainChance: number;
  /** Current speed or forecast daily maximum speed, in km/h. */
  wind: number;
  /** Daily reference evapotranspiration in mm, not actual crop water use. */
  et0: number;
  code: number;
};

export type Location = {
  name: string;
  /** WGS84 coordinates used by device geolocation and Open-Meteo. */
  latitude: number;
  longitude: number;
  /** Legacy 'gps' means selected from the phone, not necessarily satellites. */
  source?: 'gps' | 'manual' | 'search' | 'preset';
  /** Actual positioning provider, when reported by the device or browser. */
  provider?: 'gps' | 'network' | 'browser';
  /** Device-reported horizontal accuracy in metres, not weather grid size. */
  accuracy?: number;
  /** Time the device observed this position; distinct from weather fetch time. */
  locatedAt?: string;
};
export type WeatherBundle = {
  location: Location;
  /** Current temperature, humidity, wind and code; other fields cover today. */
  current: WeatherDay;
  /** Seven days including today. Temperature and humidity are daily means. */
  forecast: WeatherDay[];
  fetchedAt: string;
  timezone: string;
  /** Actual model time, with the API's UTC offset, distinct from fetch time. */
  dataTime?: string;
  /** Original local model timestamp for display with timezone. */
  currentTime?: string;
};

export const PRESET_LOCATIONS: Location[] = [
  { name: '杭州', latitude: 30.2741, longitude: 120.1551, source: 'preset' },
  { name: '北京', latitude: 39.9042, longitude: 116.4074, source: 'preset' },
  { name: '上海', latitude: 31.2304, longitude: 121.4737, source: 'preset' },
  { name: '广州', latitude: 23.1291, longitude: 113.2644, source: 'preset' },
  { name: '成都', latitude: 30.5728, longitude: 104.0668, source: 'preset' },
  { name: '昆明', latitude: 25.0389, longitude: 102.7183, source: 'preset' },
  { name: '武汉', latitude: 30.5928, longitude: 114.3055, source: 'preset' },
  { name: '西安', latitude: 34.3416, longitude: 108.9398, source: 'preset' },
];

const presetRegions: Record<string, string> = {
  杭州: '浙江', 北京: '北京', 上海: '上海', 广州: '广东',
  成都: '四川', 昆明: '云南', 武汉: '湖北', 西安: '陕西',
};

const aliases: Record<string, string> = {
  hangzhou: '杭州', beijing: '北京', shanghai: '上海', guangzhou: '广州',
  chengdu: '成都', kunming: '昆明', wuhan: '武汉', xian: '西安', "xi'an": '西安',
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('天气服务返回的数据格式不完整，请稍后重试。');
  }
  return value as Record<string, unknown>;
}

function numeric(value: unknown, name: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`天气服务缺少有效的${name}数据，请稍后重试。`);
  }
  return value;
}

function textValue(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`天气服务缺少${name}，请稍后重试。`);
  return value;
}

function values(value: unknown, expected: number, name: string): unknown[] {
  if (!Array.isArray(value) || value.length !== expected) {
    throw new Error(`天气服务的${name}数据不完整，请稍后重试。`);
  }
  return value;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  // Date parsing can normalize February 30 or fail altogether. Check both
  // before formatting so malformed service data cannot throw a RangeError.
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validLocalTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  return !!match && validCalendarDate(match[1])
    && Number(match[2]) <= 23 && Number(match[3]) <= 59
    && (match[4] === undefined || Number(match[4]) <= 59);
}

async function requestJson(url: string, service: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 429) throw new Error(`${service}请求过于频繁，请稍后重试。`);
      throw new Error(`${service}暂时不可用（${response.status}），请稍后重试。`);
    }
    try { return await response.json(); }
    catch { throw new Error(`${service}返回了无法读取的数据，请稍后重试。`); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${service}连接超时，请检查网络后重试。`);
    if (error instanceof TypeError) throw new Error(`无法连接${service}，请检查网络后重试。`);
    throw error;
  } finally { clearTimeout(timer); }
}

function parseWeather(payload: unknown, location: Location): WeatherBundle {
  const data = record(payload);
  const daily = record(data.daily);
  const hourly = record(data.hourly);
  const current = record(data.current);
  if (data.current_units !== undefined) {
    const units = record(data.current_units);
    for (const [field, expected] of Object.entries({ temperature_2m: '°C', relative_humidity_2m: '%', wind_speed_10m: 'km/h', precipitation: 'mm' })) {
      if (units[field] !== expected) throw new Error('天气服务返回的单位与请求不一致，请重新获取。');
    }
  }
  const dates = values(daily.time, 7, '日期').map((date) => {
    const result = textValue(date, '日期');
    if (!validCalendarDate(result)) throw new Error('天气服务返回了无效日期。');
    return result;
  });
  if (new Set(dates).size !== dates.length) throw new Error('天气服务返回了重复日期。');
  if (!Array.isArray(hourly.time) || hourly.time.length < 167 || hourly.time.length > 169) throw new Error('天气服务的逐小时日期数据不完整。');
  const times = hourly.time.map((time) => {
    const result = textValue(time, '逐小时日期');
    if (!validLocalTime(result)) throw new Error('天气服务返回了无效逐小时时间。');
    return result;
  });
  const hourlyHumidity = values(hourly.relative_humidity_2m, times.length, '逐小时湿度');
  // Keep hourly precipitation probability in the request and validate it rather
  // than inventing a zero when a model cannot supply this field.
  values(hourly.precipitation_probability, times.length, '逐小时降水概率')
    .forEach((value) => numeric(value, '逐小时降水概率', 0, 100));
  const dailyFields = [
    'temperature_2m_mean', 'temperature_2m_min', 'temperature_2m_max',
    'precipitation_sum', 'precipitation_probability_max', 'wind_speed_10m_max',
    'et0_fao_evapotranspiration', 'weather_code',
  ];
  const fields = Object.fromEntries(dailyFields.map((field) => [field, values(daily[field], dates.length, field)]));
  const forecast = dates.map((date, index): WeatherDay => {
    const humidity = times.flatMap((time, hour) => time.startsWith(`${date}T`) ? [numeric(hourlyHumidity[hour], '空气湿度', 0, 100)] : []);
    if (humidity.length < 23 || humidity.length > 25) throw new Error('天气服务缺少完整的每日湿度数据，请稍后重试。');
    const minTemp = numeric(fields.temperature_2m_min[index], '最低气温', -100, 70);
    const maxTemp = numeric(fields.temperature_2m_max[index], '最高气温', -100, 70);
    if (minTemp > maxTemp) throw new Error('天气服务返回的气温范围无效。');
    return {
      date,
      temp: numeric(fields.temperature_2m_mean[index], '日均气温', minTemp, maxTemp),
      minTemp, maxTemp,
      humidity: Math.round(humidity.reduce((sum, value) => sum + value, 0) / humidity.length * 10) / 10,
      rain: numeric(fields.precipitation_sum[index], '每日降水量', 0),
      rainChance: numeric(fields.precipitation_probability_max[index], '每日降水概率', 0, 100),
      wind: numeric(fields.wind_speed_10m_max[index], '每日最大风速', 0),
      et0: numeric(fields.et0_fao_evapotranspiration[index], '参考蒸散量', 0),
      code: numeric(fields.weather_code[index], '天气状态', 0, 99),
    };
  });
  const currentTime = textValue(current.time, '当前时间');
  if (!validLocalTime(currentTime)) throw new Error('天气服务返回的当前时间无效。');
  let dataTime: string | undefined;
  if (data.utc_offset_seconds !== undefined) {
    const offset = numeric(data.utc_offset_seconds, '时区偏移', -64800, 64800);
    if (!Number.isInteger(offset) || offset % 60 !== 0) throw new Error('天气服务返回的时区偏移无效。');
    const absolute = Math.abs(offset / 60);
    dataTime = `${currentTime}${offset < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
    if (!Number.isFinite(Date.parse(dataTime))) throw new Error('天气服务返回的当前时间无效。');
  }
  const today = forecast.find((day) => day.date === currentTime.slice(0, 10));
  if (!today) throw new Error('当前天气与预报日期不一致，请重新获取。');
  // This 15-minute precipitation amount is not today's total and is never fed
  // into the daily game simulation. Validate it to detect incomplete responses.
  numeric(current.precipitation, '当前降水量', 0);
  return {
    location: { ...location },
    current: {
      ...today,
      temp: numeric(current.temperature_2m, '当前气温', -100, 70),
      humidity: numeric(current.relative_humidity_2m, '当前空气湿度', 0, 100),
      wind: numeric(current.wind_speed_10m, '当前风速', 0),
      code: numeric(current.weather_code, '当前天气状态', 0, 99),
    },
    forecast,
    fetchedAt: new Date().toISOString(),
    timezone: textValue(data.timezone, '时区'),
    currentTime, dataTime,
  };
}

export async function fetchWeather(location: Location): Promise<WeatherBundle> {
  numeric(location.latitude, '纬度', -90, 90);
  numeric(location.longitude, '经度', -180, 180);
  const params = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
    hourly: 'relative_humidity_2m,precipitation_probability',
    daily: 'temperature_2m_mean,temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration,weather_code',
    timezone: 'auto', forecast_days: '7', temperature_unit: 'celsius',
    wind_speed_unit: 'kmh', precipitation_unit: 'mm',
  });
  const payload = await requestJson(`https://api.open-meteo.com/v1/forecast?${params}`, '天气服务');
  return parseWeather(payload, location);
}

export async function searchLocations(query: string): Promise<Location[]> {
  const cleaned = query.trim();
  if (!cleaned) return [];
  const normalized = cleaned.toLowerCase().replace(/市$/, '');
  const targetName = aliases[normalized] || normalized;
  // A two-character city can have namesakes. Always look up live results first;
  // an exact known preset is only an explicitly labelled offline alternative.
  // Qualifiers such as “杭州, 四川” never silently fall back to Zhejiang.
  const preset = PRESET_LOCATIONS.find((place) => place.name === targetName);
  const fallback = (): Location[] => preset ? [{
    ...preset,
    name: [...new Set([preset.name, presetRegions[preset.name], '中国'])].join(' · '),
    source: 'preset',
  }] : [];
  const params = new URLSearchParams({ name: preset ? targetName : cleaned, count: '5', language: 'zh', format: 'json' });
  try {
    const payload = record(await requestJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`, '地点搜索服务'));
    if (payload.results === undefined) return fallback();
    if (!Array.isArray(payload.results)) throw new Error('地点搜索服务返回的数据格式不完整。');
    if (!payload.results.length) return fallback();
    return payload.results.slice(0, 5).map((item: unknown): Location => {
      const place = record(item);
      const name = textValue(place.name, '地名');
      const admin1 = typeof place.admin1 === 'string' ? place.admin1 : '';
      const admin2 = typeof place.admin2 === 'string' ? place.admin2 : '';
      const country = typeof place.country === 'string' ? place.country
        : typeof place.country_code === 'string' ? place.country_code : '国家未标明';
      return {
        name: [...new Set([name, admin1, admin2, country].filter(Boolean))].join(' · '),
        latitude: numeric(place.latitude, '纬度', -90, 90),
        longitude: numeric(place.longitude, '经度', -180, 180),
        source: 'search',
      };
    });
  } catch (error) {
    if (preset) return fallback();
    throw error;
  }
}

export function weatherLabel(code: number): string {
  if (code === 0) return '晴';
  if (code === 1) return '晴间多云';
  if (code === 2) return '多云';
  if (code === 3) return '阴';
  if ([45, 48].includes(code)) return '雾';
  if ([51, 53, 55].includes(code)) return '毛毛雨';
  if ([56, 57, 66, 67].includes(code)) return '冻雨';
  if ([61, 63, 65].includes(code)) return code === 61 ? '小雨' : code === 63 ? '中雨' : '大雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
  if ([80, 81, 82].includes(code)) return '阵雨';
  if ([95, 96, 99].includes(code)) return '雷雨';
  return '天气未知';
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '🌨️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  return '🌡️';
}
