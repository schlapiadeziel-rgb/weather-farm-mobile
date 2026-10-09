import { cacheRead, cacheWrite, fetchOfficialHtml, officialArticle, officialUrl, parseOfficialList, validDate, validTimestamp } from './publicDataHttp';

export const MARKET_SOURCE_URL = 'https://scs.moa.gov.cn/jcyj/';
const CACHE_KEY = 'fieldletter.market.v1';
const REGION = '全国批发市场均价' as const;
const UNIT = '元/公斤' as const;
const DAY_MS = 86_400_000;

export type MarketQuote = {
  product: string;
  price: number;
  unit: '元/公斤';
  region: '全国批发市场均价';
  quotedAt: string;
  sourceUrl: string;
};
export type MarketSnapshot = {
  quotes: MarketQuote[];
  index: number | null;
  quotedAt: string;
  sourceUrl: string;
  fetchedAt: string;
  status: 'live' | 'cached';
  warning?: string;
  history: MarketQuote[];
};
export type DemandRecord = {
  id: string;
  /** Any real farm product; independent of the companion game's crop list. */
  product: string;
  region: string;
  kind: 'purchase' | 'order' | 'cost';
  quantityKg: number;
  date: string;
  unitPrice?: number;
  /** Only verified local requests/orders may support demand suggestions. */
  confirmed: boolean;
};
export type MarketRecommendation = { id: string; title: string; detail: string; severity: 'tip' | 'warning' | 'good' };

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function cleanString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
}

export function validateDemandRecord(value: unknown): value is DemandRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return cleanString(item.id, 200) && cleanString(item.product, 100) && cleanString(item.region, 100)
    && ['purchase', 'order', 'cost'].includes(String(item.kind)) && finitePositive(item.quantityKg)
    && item.quantityKg <= 1e9 && typeof item.date === 'string' && validDate(item.date)
    && typeof item.confirmed === 'boolean'
    && (item.unitPrice === undefined || (typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) && item.unitPrice >= 0 && item.unitPrice <= 1e7));
}

function quoteValid(value: unknown): value is MarketQuote {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return cleanString(item.product, 100) && finitePositive(item.price) && item.price < 100000
    && item.unit === UNIT && item.region === REGION && typeof item.quotedAt === 'string'
    && validTimestamp(item.quotedAt) && typeof item.sourceUrl === 'string'
    && officialUrl(item.sourceUrl) === item.sourceUrl;
}

export function readCachedMarket(): MarketSnapshot | null {
  const value = cacheRead(CACHE_KEY);
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!Array.isArray(item.quotes) || !item.quotes.length || !item.quotes.every(quoteValid)
    || !Array.isArray(item.history) || !item.history.every(quoteValid)
    || !(item.index === null || finitePositive(item.index))
    || typeof item.quotedAt !== 'string' || !validTimestamp(item.quotedAt)
    || typeof item.fetchedAt !== 'string' || !validTimestamp(item.fetchedAt)
    || typeof item.sourceUrl !== 'string' || officialUrl(item.sourceUrl) !== item.sourceUrl) return null;
  return {
    quotes: item.quotes, history: item.history, index: item.index as number | null,
    quotedAt: item.quotedAt, fetchedAt: item.fetchedAt, sourceUrl: item.sourceUrl, status: 'cached',
    warning: '显示本机保存的官方报价；以报价时间为准，不代表本地成交价。',
  };
}

/** Parse only prices and units explicitly printed in the official bulletin. */
export function parseMarketBulletin(html: string, sourceUrl: string): MarketSnapshot {
  const safeUrl = officialUrl(sourceUrl);
  if (!safeUrl) throw new Error('价格通报来源地址不受支持。');
  const article = officialArticle(html);
  if (!article.title.includes('农产品批发价格200指数')) throw new Error('这篇文章不是农产品批发价格每日通报。');
  const text = article.text.replace(/\s+/g, '');
  if (!text.includes('全国农产品批发市场')) throw new Error('通报缺少全国市场统计范围，无法确认报价口径。');
  const time = /截至今日(\d{1,2})[:：](\d{2})时/.exec(text);
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) throw new Error('通报缺少明确的报价时点，请查看原文。');
  const quotedAt = `${article.publishedAt.slice(0, 10)}T${time[1].padStart(2, '0')}:${time[2]}:00+08:00`;
  const definitions = [
    { product: '猪肉', pattern: /猪肉(?:平均价格(?:为)?)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
    { product: '牛肉', pattern: /牛肉(?:平均价格(?:为)?)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
    { product: '羊肉', pattern: /羊肉(?:平均价格(?:为)?)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
    { product: '鸡蛋', pattern: /鸡蛋(?:平均价格(?:为)?)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
    { product: '白条鸡', pattern: /白条鸡(?:平均价格(?:为)?)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
    { product: '28种蔬菜均价', pattern: /(?:重点监测的)?28种蔬菜平均价格(?:为)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
    { product: '6种水果均价', pattern: /(?:重点监测的)?6种水果平均价格(?:为)?([\d.]+)(元\/(?:公斤|千克|kg|KG))/ },
  ];
  const quotes: MarketQuote[] = [];
  const missing: string[] = [];
  for (const definition of definitions) {
    const match = definition.pattern.exec(text);
    const price = match ? Number(match[1]) : NaN;
    if (!finitePositive(price) || price >= 100000) { missing.push(definition.product); continue; }
    quotes.push({ product: definition.product, price, unit: UNIT, region: REGION, quotedAt, sourceUrl: safeUrl });
  }
  if (!quotes.length) throw new Error('通报中未找到可核实的元/公斤报价；没有换算未知单位或补零。');
  const indexMatch = /农产品批发价格200指数[”"」]?为([\d.]+)/.exec(text);
  const index = indexMatch && finitePositive(Number(indexMatch[1])) ? Number(indexMatch[1]) : null;
  return {
    quotes, index, quotedAt, sourceUrl: safeUrl, fetchedAt: new Date().toISOString(), status: 'live', history: [],
    warning: missing.length ? `缺少可核实报价：${missing.join('、')}；其他品种仅供全国批发行情参考。` : undefined,
  };
}

export async function fetchMarketData(): Promise<MarketSnapshot> {
  try {
    const entries = parseOfficialList(await fetchOfficialHtml(MARKET_SOURCE_URL), MARKET_SOURCE_URL)
      .filter((entry) => entry.title.includes('农产品批发价格200指数')).slice(0, 3);
    if (!entries.length) throw new Error('未找到官方每日价格通报，请打开来源查看。');
    const latest = parseMarketBulletin(await fetchOfficialHtml(entries[0].url), entries[0].url);
    const previous = await Promise.allSettled(entries.slice(1).map(async (entry) => parseMarketBulletin(await fetchOfficialHtml(entry.url), entry.url)));
    latest.history = previous.flatMap((result) => result.status === 'fulfilled' ? result.value.quotes : []);
    if (previous.some((result) => result.status === 'rejected')) latest.warning = [latest.warning, '部分历史通报暂不可读取，不作缺失价格推算。'].filter(Boolean).join(' ');
    cacheWrite(CACHE_KEY, latest);
    return latest;
  } catch (error) {
    const cache = readCachedMarket();
    const reason = error instanceof Error ? error.message : '官方价格暂不可读取。';
    if (cache) return { ...cache, warning: `${reason} 当前显示本机缓存，请核对报价时间。` };
    throw new Error(reason);
  }
}

function normalized(value: string): string { return value.trim().replace(/\s+/g, '').toLowerCase(); }
function ageHours(time: string, now: Date): number { return (now.getTime() - Date.parse(time)) / 3_600_000; }
function localDayAge(date: string, now: Date): number {
  const chinaDate = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  return (Date.parse(`${chinaDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS;
}

/** No expansion/profit/consumer-demand conclusion is inferred from prices. */
export function marketRecommendations(snapshot: MarketSnapshot | null, records: DemandRecord[], now = new Date()): MarketRecommendation[] {
  if (!Number.isFinite(now.getTime())) return [{ id: 'clock', title: '先核对设备日期', detail: '设备日期无效，暂不计算报价与需求记录的时效。', severity: 'warning' }];
  const tips: MarketRecommendation[] = [];
  const valid = records.filter(validateDemandRecord);
  const verified = valid.filter((item) => item.confirmed && item.kind !== 'cost' && localDayAge(item.date, now) >= 0 && localDayAge(item.date, now) <= 14);
  const costs = valid.filter((item) => item.confirmed && item.kind === 'cost' && item.unitPrice !== undefined && localDayAge(item.date, now) >= 0 && localDayAge(item.date, now) <= 30);
  const freshQuotes = snapshot?.quotes.filter((quote) => quoteValid(quote) && ageHours(quote.quotedAt, now) >= 0 && ageHours(quote.quotedAt, now) <= 72) || [];
  if (!freshQuotes.length) tips.push({ id: 'stale-prices', title: '行情数据尚不足', detail: '暂无最近 72 小时内可核实的报价。先向当地批发市场和买家询价，并确认品种、等级、单位及收货时间。', severity: 'warning' });
  else tips.push({ id: 'price-scope', title: '全国均价只作行情参考', detail: `报价时间 ${snapshot!.quotedAt.slice(0, 16).replace('T', ' ')}（北京时间）。全国批发均价不能替代当地同等级产品的收购报价，也不能判断买家需求是否增加。`, severity: 'tip' });
  if (!verified.length) {
    tips.push({ id: 'verify-demand', title: '先确认当地销售渠道', detail: '没有近 14 天经核实的当地采购需求或订单。请确认买家、产品规格、数量、收货日期及付款条件；未经确认的采购意向只保留记录，不能作为安排新增产量的依据。', severity: 'warning' });
  } else {
    const groups = new Map<string, DemandRecord[]>();
    for (const item of verified) {
      const key = `${normalized(item.product)}|${normalized(item.region)}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    for (const [key, group] of Array.from(groups).slice(0, 3)) {
      const sample = group[0];
      // Orders and inquiries remain separate: they may concern the same buyer
      // and must never be added together to manufacture aggregate demand.
      const orders = group.filter((item) => item.kind === 'order');
      const inquiries = group.filter((item) => item.kind === 'purchase');
      const quantity = orders.reduce((sum, item) => sum + item.quantityKg, 0);
      const detail = orders.length
        ? `${sample.region} · ${sample.product}：近 14 天录入 ${orders.length} 条已确认订单，共 ${quantity.toLocaleString('zh-CN')} 公斤（未自动去重，需核实是否已履约）。先按订单交付时间核对可采收/出栏数量、等级、保鲜和运输安排。${inquiries.length ? `另有 ${inquiries.length} 条已核实采购询价，未计入订单量。` : ''}`
        : `${sample.region} · ${sample.product}：有 ${inquiries.length} 条已核实采购询价，但没有已确认订单。再次确认收货规格、采购时点和付款条件后，再安排采收与销售。`;
      tips.push({ id: `demand-${key}`, title: orders.length ? '按已确认订单安排交付' : '采购询价仍需转为订单', detail, severity: orders.length ? 'good' : 'tip' });
      const pricedOrders = orders.filter((item) => item.unitPrice !== undefined);
      const matchingCosts = costs.filter((item) => normalized(item.product) === normalized(sample.product) && normalized(item.region) === normalized(sample.region));
      if (pricedOrders.length && matchingCosts.length) {
        const newestCost = matchingCosts.sort((a, b) => b.date.localeCompare(a.date))[0];
        const newestOrder = pricedOrders.sort((a, b) => b.date.localeCompare(a.date))[0];
        const difference = newestOrder.unitPrice! - newestCost.unitPrice!;
        tips.push({ id: `cost-${key}`, title: difference < 0 ? '该订单价低于所录单位成本' : '核对订单价格与完整成本',
          detail: `${sample.product} · ${sample.region}：最近所录订单 ${newestOrder.unitPrice!.toFixed(2)} 元/公斤，单位成本 ${newestCost.unitPrice!.toFixed(2)} 元/公斤，差额 ${difference.toFixed(2)} 元/公斤。仅比较你的记录；还需确认成本是否包含人工、损耗、包装、运输和付款风险，这不是利润预测。`, severity: difference < 0 ? 'warning' : 'tip' });
      }
    }
  }
  if (!costs.length) tips.push({ id: 'record-cost', title: '补齐真实单位成本', detail: '请记录近期生产、人工、损耗、包装和运输成本，再与当地已确认订单价比较。全国行情上涨不等于农场利润增加。', severity: 'tip' });
  // Only exact product/region/unit matches within a three-day interval and
  // two fresh observations can support a descriptive price comparison.
  const comparable = freshQuotes.flatMap((quote) => {
    const prior = snapshot?.history.filter((old) => quoteValid(old) && old.product === quote.product && old.region === quote.region && old.unit === quote.unit
      && ageHours(old.quotedAt, now) >= 0 && ageHours(old.quotedAt, now) <= 72
      && Date.parse(quote.quotedAt) > Date.parse(old.quotedAt) && Date.parse(quote.quotedAt) - Date.parse(old.quotedAt) <= 72 * 3_600_000)
      .sort((a, b) => b.quotedAt.localeCompare(a.quotedAt))[0];
    return prior ? [{ quote, prior }] : [];
  });
  if (comparable.length && verified.length) {
    const { quote, prior } = comparable[0];
    const change = (quote.price - prior.price) / prior.price * 100;
    tips.push({ id: 'observed-price-change', title: '同口径报价变化', detail: `${quote.product}：${prior.quotedAt.slice(0, 10)} 至 ${quote.quotedAt.slice(0, 10)}，全国批发均价由 ${prior.price.toFixed(2)} 到 ${quote.price.toFixed(2)} 元/公斤（${change >= 0 ? '+' : ''}${change.toFixed(1)}%）。这是两次价格观测，不代表当地买家需求或未来售价；销售仍以你已确认的当地订单为准。`, severity: 'tip' });
  }
  return tips;
}
