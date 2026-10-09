import { Capacitor, CapacitorHttp } from '@capacitor/core';

const OFFICIAL_HOSTS = new Set(['www.moa.gov.cn', 'scs.moa.gov.cn', 'moa.gov.cn']);

/** Allow only HTTPS MOA sources; upgrading their own old HTTP links is safe. */
export function officialUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    if (!OFFICIAL_HOSTS.has(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.protocol = 'https:';
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

/** Extract text only. No remote HTML is inserted into the page or executed. */
export function plainText(html: string): string {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
    .replace(/[\t\r\u3000\u00a0 ]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const expression = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(expression)) result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4]);
  return result;
}

export function metaValue(html: string, name: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = attributes(match[0]);
    if (attr.name?.toLowerCase() === name.toLowerCase() && attr.content) return plainText(attr.content);
  }
  return null;
}

/** Balanced div extraction tolerates MOA's deeply nested inline formatting. */
export function classContent(html: string, className: string): string | null {
  const tags = /<\/?div\b[^>]*>/gi;
  let start = -1;
  let depth = 0;
  for (const match of html.matchAll(tags)) {
    const closing = /^<\//.test(match[0]);
    if (start < 0) {
      if (!closing && attributes(match[0]).class?.split(/\s+/).includes(className)) {
        start = match.index! + match[0].length;
        depth = 1;
      }
    } else {
      depth += closing ? -1 : 1;
      if (depth === 0) return html.slice(start, match.index);
    }
  }
  return null;
}

export type OfficialListItem = { title: string; url: string; publishedAt: string };

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Check calendar and clock fields before Date.parse can normalize them. */
export function validTimestamp(value: string, allowDate = false): boolean {
  if (allowDate && validDate(value)) return true;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !validDate(parts[1]) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return false;
  if (parts[5] !== 'Z') {
    const [hours, minutes] = parts[5].slice(1).split(':').map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
}

export function parseOfficialList(html: string, sourceUrl: string): OfficialListItem[] {
  if (!officialUrl(sourceUrl)) throw new Error('资讯来源地址不受支持。');
  const results: OfficialListItem[] = [];
  const seen = new Set<string>();
  // Both verified MOA lists place each dated headline in one li element.
  for (const row of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)) {
    const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/i.exec(row[1]);
    if (!anchor) continue;
    const attr = attributes(anchor[1]);
    const url = attr.href ? officialUrl(attr.href, sourceUrl) : null;
    const date = plainText(row[1]).match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    const title = plainText(attr.title || anchor[2]).replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim();
    if (!url || !/\/t\d{8}_\d+\.htm$/.test(new URL(url).pathname) || !date || !validDate(date) || !title || seen.has(url)) continue;
    seen.add(url);
    results.push({ title, url, publishedAt: date });
  }
  if (!results.length) throw new Error('官网资讯列表暂时无法解析，请通过来源链接查看原文。');
  return results.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function officialArticle(html: string): { title: string; publishedAt: string; source: string; text: string } {
  const title = metaValue(html, 'ArticleTitle') || plainText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '');
  const rawDate = metaValue(html, 'PubDate') || '';
  const publishedAt = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(rawDate)
    ? rawDate.replace(' ', 'T') + '+08:00' : rawDate;
  const content = classContent(html, 'TRS_Editor') || classContent(html, 'sj_arc_body') || classContent(html, 'content');
  const text = content ? plainText(content) : '';
  if (!title || !validTimestamp(publishedAt, true) || text.length < 10) throw new Error('官网文章格式已变化或正文缺失，请通过来源链接查看原文。');
  return { title, publishedAt, source: metaValue(html, 'source') || metaValue(html, 'ContentSource') || '农业农村部', text };
}

export async function fetchOfficialHtml(sourceUrl: string): Promise<string> {
  const url = officialUrl(sourceUrl);
  if (!url) throw new Error('公开数据来源地址不受支持。');
  let html: unknown;
  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 10_000, readTimeout: 15_000, headers: { Accept: 'text/html' } });
      if (response.status < 200 || response.status >= 300) throw new Error(`官网读取失败（${response.status}）。`);
      if (response.url && !officialUrl(response.url)) throw new Error('官网重定向到了不受支持的地址。');
      html = response.data;
    } catch (error) {
      throw new Error(error instanceof Error && /官网/.test(error.message) ? error.message : '官网暂时无法连接，请检查网络或打开官方来源。');
    }
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`官网读取失败（${response.status}）。`);
      if (response.url && !officialUrl(response.url)) throw new Error('官网重定向到了不受支持的地址。');
      html = await response.text();
    } catch (error) {
      if (controller.signal.aborted) throw new Error('官网读取超时，请稍后重试或打开来源链接。');
      if (error instanceof TypeError) throw new Error('网页预览受官网跨域或网络限制，请在 Android 应用中刷新，或打开官方来源。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  if (typeof html !== 'string' || html.length > 1_500_000 || !/<(?:html|meta|body)\b/i.test(html)) throw new Error('官网返回了无效的文章数据。');
  return html;
}

export function cacheRead(key: string): unknown {
  try { return typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}
export function cacheWrite(key: string, value: unknown): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value)); } catch { /* Read-only/incognito storage can be unavailable. */ }
}
