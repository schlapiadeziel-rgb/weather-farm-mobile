import { useEffect, useState } from 'react';
import { ArrowUpRight, BarChart3, Check, ClipboardList, Download, Info, Plus, RefreshCw, Trash2, TrendingUp } from 'lucide-react';
import { fetchMarketData, MARKET_SOURCE_URL, marketRecommendations, readCachedMarket, validateDemandRecord } from '../lib/market';
import type { DemandRecord } from '../lib/market';
import { exportLocalJson, formatDate, localDateInput, messageOf, openSource } from '../lib/deviceUi';
import '../styles/knowledge.css';

const DEMAND_KEY = 'fieldletter.market-demand.v1';
function readRecords(): DemandRecord[] {
  try { const value: unknown = JSON.parse(localStorage.getItem(DEMAND_KEY) || '[]'); return Array.isArray(value) ? value.filter(validateDemandRecord).slice(-500) : []; } catch { return []; }
}
const kindNames = { purchase: '采购意向', order: '实际订单', cost: '生产成本' };
export default function MarketPanel({ locationName }: { locationName: string }) {
  const [snapshot, setSnapshot] = useState(readCachedMarket);
  const [records, setRecords] = useState(readRecords);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [product, setProduct] = useState('');
  const [region, setRegion] = useState(locationName);
  const [kind, setKind] = useState<DemandRecord['kind']>('purchase');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(localDateInput());
  const [confirmed, setConfirmed] = useState(false);
  const advice = marketRecommendations(snapshot, records);
  async function refresh() { setLoading(true); setError(''); try { setSnapshot(await fetchMarketData()); } catch (e) { setError(messageOf(e)); } finally { setLoading(false); } }
  useEffect(() => { void refresh(); }, []);
  function save(next: DemandRecord[]) { try { localStorage.setItem(DEMAND_KEY, JSON.stringify(next)); setRecords(next); setMessage('经营记录已保存在本机。'); return true; } catch { setMessage('设备存储不可用，记录没有保存。请先导出现有记录。'); return false; } }
  function addRecord() {
    const value: DemandRecord = { id: crypto.randomUUID(), product: product.trim(), region: region.trim(), kind, quantityKg: Number(quantity), date, confirmed, ...(price.trim() ? { unitPrice: Number(price) } : {}) };
    if (!quantity.trim() || !validateDemandRecord(value)) { setMessage('请核实产品、地区、公斤数、日期和单价。'); return; }
    if (save([...records, value].slice(-500))) { setFormOpen(false); setProduct(''); setQuantity(''); setPrice(''); setConfirmed(false); }
  }
  return <main className="service-view market-view"><div className="service-heading"><div><span className="eyebrow">市场与经营 · 先核实需求</span><h2>行情有来源，经营有底数</h2><p>全国批发价格是参考；当地订单、成本和销售时间决定你的经营判断。</p></div><button className="quiet-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{loading ? '读取中' : '更新行情'}</button></div>
    {error && <div className="data-warning" role="alert">{error}{snapshot && ' 当前保留上次读取的报价。'}</div>}{snapshot?.warning && <div className="data-warning">{snapshot.warning}</div>}
    <div className="source-strip"><span><BarChart3 size={16} />农业农村部 · 全国批发市场均价</span><span>{snapshot ? `报价 ${snapshot.quotedAt.slice(0, 16).replace('T', ' ')}（北京时间）${snapshot.status === 'cached' ? ' · 缓存' : ''}` : '尚未读取报价'}</span><button onClick={() => void openSource(snapshot?.sourceUrl || MARKET_SOURCE_URL).catch(e => setError(messageOf(e)))}>核实官方通报<ArrowUpRight size={14} /></button></div>
    {snapshot?.quotes.length ? <div className="quote-grid">{snapshot.quotes.map(quote => <article className="quote-card" key={quote.product}><span>{quote.product}</span><strong>{quote.price.toFixed(2)}<small>{quote.unit}</small></strong><p>{quote.region}</p></article>)}</div> : <div className="small-empty market-empty"><TrendingUp size={30} /><p>{loading ? '正在读取官方行情…' : '当前没有可用报价，可以先记录订单与成本。'}</p></div>}
    {snapshot && <p className="card-footnote">获取于 {formatDate(snapshot.fetchedAt, true)} · 请以官方报价时点和当地成交条件为准。</p>}<p className="card-footnote market-note"><Info size={15} />价格变化不等于需求变化。全国批发均价不包含你所在地的运输、品级、损耗与成交条件，也不是未来收益预测。</p>
    <div className="market-columns"><section className="service-card"><div className="section-heading"><h3>种养经营参考</h3><span>显示依据与缺口</span></div><div className="recommendation-list">{advice.map(item => <article className={`recommendation ${item.severity}`} key={item.id}><span>{item.severity === 'warning' ? <Info size={18} /> : item.severity === 'good' ? <Check size={18} /> : <TrendingUp size={18} />}</span><div><h4>{item.title}</h4><p>{item.detail}</p></div></article>)}</div></section>
    <section className="service-card"><div className="section-heading"><h3>我的需求与成本记录</h3><button className="text-link" onClick={() => { setMessage(''); setFormOpen(true); }}><Plus size={15} />记一笔</button></div>{records.length ? <div className="demand-list">{records.slice(-12).reverse().map(record => <article key={record.id}><div><strong>{record.product}<span>{kindNames[record.kind]}</span></strong><p>{record.quantityKg} kg{record.unitPrice !== undefined ? ` · ${record.unitPrice.toFixed(2)} 元/kg` : ''} · {record.region}</p><small>{record.date} · {record.confirmed ? '本人已核实' : '尚未核实，不作为确定需求'}</small></div><button className="delete-record" aria-label={`删除${record.product}记录`} onClick={() => save(records.filter(item => item.id !== record.id))}><Trash2 size={16} /></button></article>)}</div> : <div className="small-empty"><ClipboardList size={27} /><p>记录买家采购意向、实际订单和每公斤成本。没有核实的意向，不用作扩种扩栏依据。</p></div>}<button className="text-link export-demand" disabled={!records.length} onClick={() => void exportLocalJson({ version: 1, kind: 'market-records', records, exportedAt: new Date().toISOString() }, `fieldletter-market-${localDateInput()}.json`).catch(e => setMessage(messageOf(e)))}><Download size={14} />导出经营记录</button></section></div>
    {message && <p className="inline-message" role="status">{message}</p>}
    {formOpen && <div className="modal-backdrop" onClick={() => setFormOpen(false)}><section className="service-modal" role="dialog" aria-modal="true" aria-labelledby="demand-title" onClick={e => e.stopPropagation()}><h2 id="demand-title">记录真实需求与成本</h2><form onSubmit={e => { e.preventDefault(); addRecord(); }}><div className="form-pair"><label>产品<input required maxLength={100} value={product} onChange={e => setProduct(e.target.value)} placeholder="例如：番茄 / 鸡蛋 / 草鱼" /></label><label>记录类型<select value={kind} onChange={e => setKind(e.target.value as DemandRecord['kind'])}><option value="purchase">买家采购意向</option><option value="order">实际订单</option><option value="cost">生产成本</option></select></label></div><label>买家 / 市场所在地<input required maxLength={100} value={region} onChange={e => setRegion(e.target.value)} placeholder="写具体地区，便于判断本地需求" /></label><div className="form-pair"><label>数量（公斤）<input required type="number" min="0.001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>{kind === 'cost' ? '单位成本' : '单位报价'}（元/公斤，可选）<input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} /></label></div><label>记录 / 确认日期<input required type="date" max={localDateInput()} value={date} onChange={e => setDate(e.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />我已向买家或供应商核实这些数量和条件</label><p className="card-footnote">数量按公斤比较；按头、枚、箱计价时请先核实换算和品级。单价与成本应使用同一产品和口径。</p>{message && <p className="validation-error" role="alert">{message}</p>}<div className="modal-actions"><button className="quiet-button" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="solid-button" type="submit">保存记录</button></div></form></section></div>}
  </main>;
}
