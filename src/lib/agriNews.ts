import { cacheRead, cacheWrite, fetchOfficialHtml, officialArticle, officialUrl, parseOfficialList, validTimestamp } from './publicDataHttp';

export const NEWS_SOURCE_URL = 'https://www.moa.gov.cn/xw/zwdt/';
const CACHE_KEY = 'fieldletter.news.v1';

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  /** Short source excerpt only; an empty value means the body was unavailable. */
  summary: string;
  source: string;
};
export type NewsFeed = {
  items: NewsItem[];
  fetchedAt: string;
  sourceUrl: string;
  status: 'live' | 'cached';
  warning?: string;
};
export type KnowledgeCard = {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  scope: string;
};

/** Independently verified official guidance, not newly published news. */
export const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    id: 'summer-drip', title: '高温时段安排滴灌',
    summary: '官方原文节选：“在上午10时前或下午4时后进行膜下滴灌，果实膨大期等关键时期可适当增加1—2次。”',
    source: '农业农村部种植业管理司、全国农业技术推广服务中心',
    sourceUrl: 'https://www.moa.gov.cn/gk/nszd_1/2026n/202606/t20260618_6485112.htm',
    publishedAt: '2026-06-18', scope: '夏季蔬菜、高温干旱；灌溉量需结合土壤、作物阶段及实测墒情。',
  },
  {
    id: 'summer-drainage', title: '降雨前检查排水',
    summary: '官方原文节选：“及早疏通排水沟渠，清理淤堵杂物，保持田间垄沟畅通；田间尾菜、秸秆等废弃物及时处理，防止涝灾发生时阻塞沟渠，影响排涝。”',
    source: '农业农村部种植业管理司、全国农业技术推广服务中心',
    sourceUrl: 'https://www.moa.gov.cn/gk/nszd_1/2026n/202606/t20260618_6485112.htm',
    publishedAt: '2026-06-18', scope: '夏季蔬菜、暴雨防范；实地检查田块地势和排涝条件。',
  },
  {
    id: 'winter-ventilation', title: '冬季设施蔬菜通风降湿',
    summary: '官方原文节选：“北方温室或大棚要及时进行通风，降低空气湿度，通风应在晴天中午进行。”',
    source: '农业农村部种植业管理司经济作物处',
    sourceUrl: 'https://www.moa.gov.cn/gk/nszd_1/2023/202311/t20231116_6440654.htm',
    publishedAt: '2023-11-16', scope: '北方冬季温室或大棚、低温雨雪寡照条件；注意通风与保温协调。',
  },
];

function newsItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.title === 'string' && item.title.length > 0 && item.title.length < 500
    && typeof item.url === 'string' && officialUrl(item.url) === item.url
    && typeof item.publishedAt === 'string' && validTimestamp(item.publishedAt, true)
    && typeof item.summary === 'string' && item.summary.length <= 200
    && typeof item.source === 'string';
}

export function readCachedNews(): NewsFeed | null {
  const value = cacheRead(CACHE_KEY);
  if (!value || typeof value !== 'object') return null;
  const feed = value as Record<string, unknown>;
  if (!Array.isArray(feed.items) || !feed.items.length || !feed.items.every(newsItem)
    || typeof feed.fetchedAt !== 'string' || !validTimestamp(feed.fetchedAt)
    || feed.sourceUrl !== NEWS_SOURCE_URL) return null;
  return { items: feed.items, fetchedAt: feed.fetchedAt, sourceUrl: NEWS_SOURCE_URL, status: 'cached', warning: '显示本机保存的官方资讯；标题上的日期是原文发布日期。' };
}

export function parseNewsArticle(html: string, url: string): NewsItem {
  const safeUrl = officialUrl(url);
  if (!safeUrl) throw new Error('新闻来源地址不受支持。');
  const article = officialArticle(html);
  const excerpt = article.text.replace(/\s+/g, ' ').trim();
  return {
    id: safeUrl, title: article.title, url: safeUrl, publishedAt: article.publishedAt,
    summary: excerpt.length > 60 ? `${excerpt.slice(0, 60)}…` : excerpt,
    source: article.source,
  };
}

export async function fetchAgriNews(): Promise<NewsFeed> {
  try {
    const entries = parseOfficialList(await fetchOfficialHtml(NEWS_SOURCE_URL), NEWS_SOURCE_URL).slice(0, 5);
    const articles = await Promise.allSettled(entries.map(async (entry) => parseNewsArticle(await fetchOfficialHtml(entry.url), entry.url)));
    let missing = 0;
    const items = articles.map((result, index): NewsItem => {
      if (result.status === 'fulfilled') return result.value;
      missing += 1;
      const entry = entries[index];
      // Dated headlines are verified from the official list; no invented body.
      return { id: entry.url, title: entry.title, url: entry.url, publishedAt: entry.publishedAt, summary: '', source: '农业农村部' };
    });
    const feed: NewsFeed = {
      items, fetchedAt: new Date().toISOString(), sourceUrl: NEWS_SOURCE_URL, status: 'live',
      warning: missing ? `${missing} 篇正文暂不可读取，保留官方标题和日期，可打开原文。` : undefined,
    };
    cacheWrite(CACHE_KEY, feed);
    return feed;
  } catch (error) {
    const cache = readCachedNews();
    const reason = error instanceof Error ? error.message : '官方资讯暂不可读取。';
    if (cache) return { ...cache, warning: `${reason} 当前显示本机缓存，并非本次更新。` };
    throw new Error(reason);
  }
}
