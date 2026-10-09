import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, CheckCircle2, Newspaper, RefreshCw, Search } from 'lucide-react';
import { fetchAgriNews, KNOWLEDGE_CARDS, NEWS_SOURCE_URL, readCachedNews } from '../lib/agriNews';
import { EDUCATION_ENTRIES } from '../lib/fieldDiagnosis';
import { formatDate, messageOf, openSource } from '../lib/deviceUi';
import '../styles/knowledge.css';

export default function NewsPanel() {
  const [feed, setFeed] = useState(readCachedNews);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<'news' | 'learn'>('news');
  async function refresh() {
    setLoading(true); setError('');
    try { setFeed(await fetchAgriNews()); } catch (e) { setError(messageOf(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const items = feed?.items.filter(item => `${item.title} ${item.summary}`.includes(query.trim())) || [];
  return <main className="service-view news-view"><div className="service-heading"><div><span className="eyebrow">农业资讯 · 有原文可核实</span><h2>读懂变化，经营更有依据</h2><p>官方农业动态与实用科普，发布日期和来源直接展示。</p></div><button className="quiet-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{loading ? '读取中' : '更新资讯'}</button></div>
    <div className="knowledge-tabs"><button className={section === 'news' ? 'active' : ''} onClick={() => setSection('news')}><Newspaper size={17} />官方资讯</button><button className={section === 'learn' ? 'active' : ''} onClick={() => setSection('learn')}><BookOpen size={17} />田间科普</button>{section === 'news' && <label className="news-search"><Search size={16} /><input aria-label="筛选资讯标题" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索标题或摘要" /></label>}</div>
    {section === 'news' ? <>{error && <div className="data-warning" role="alert">{error}{feed && ' 仍可查看上次读取的资讯。'}</div>}{feed?.warning && <div className="data-warning">{feed.warning}</div>}<div className="source-strip"><span><CheckCircle2 size={15} />来源：农业农村部官方发布</span><span>{feed ? `${feed.status === 'cached' ? '本机缓存 · ' : ''}获取于 ${formatDate(feed.fetchedAt, true)}` : '尚未读取到资讯'}</span><button onClick={() => void openSource(NEWS_SOURCE_URL).catch(e => setError(messageOf(e)))}>查看官方列表<ArrowUpRight size={14} /></button></div>
      {items.length ? <div className="news-grid">{items.map(item => <article className="news-card" key={item.id}><div className="news-card-top"><span>{item.source}</span><time>{item.publishedAt.slice(0, 10)}</time></div><h3>{item.title}</h3><p>{item.summary || '摘要未提供，请以官方原文为准。'}</p><button className="text-link" onClick={() => void openSource(item.url).catch(e => setError(messageOf(e)))}>阅读官方原文<ArrowUpRight size={15} /></button></article>)}</div> : <div className="service-empty"><Newspaper size={35} /><h3>{loading ? '正在读取官方资讯' : query ? '没有匹配的资讯' : '当前没有可展示的新闻'}</h3><p>{query ? '换一个标题关键词试试。' : '暂时无法读取资讯，可以直接打开官方列表查看。'}</p></div>}
    </> : <div className="education-grid">{KNOWLEDGE_CARDS.map(entry => <article className="service-card education-card" key={entry.id}><BookOpen size={23} /><h3>{entry.title}</h3><p>{entry.summary}</p><p><strong>适用范围：</strong>{entry.scope}</p><p className="card-footnote">指导发布日期：{entry.publishedAt} · 非本日新闻</p><button className="text-link" onClick={() => void openSource(entry.sourceUrl).catch(e => setError(messageOf(e)))}>参考：{entry.source}<ArrowUpRight size={14} /></button></article>)}{EDUCATION_ENTRIES.map(entry => <article className="service-card education-card" key={entry.id}><BookOpen size={23} /><h3>{entry.title}</h3><p>{entry.body}</p><button className="text-link" onClick={() => void openSource(entry.sourceUrl).catch(e => setError(messageOf(e)))}>参考：{entry.sourceName}<ArrowUpRight size={14} /></button></article>)}</div>}
  </main>;
}
