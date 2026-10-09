import { useState } from 'react';
import { ArrowUpRight, ClipboardPlus, Droplets, Info, ScanLine, ShieldCheck, Wind } from 'lucide-react';
import type { WeatherBundle } from '../lib/weather';
import { MEASUREMENT_TYPES, readFarmRecords, writeFarmRecords } from '../lib/farmRecords';
import { formatDate, localDateInput, messageOf, openSource } from '../lib/deviceUi';
import '../styles/knowledge.css';

export default function FieldAdvicePanel({ weather, weatherError, navigate }: { weather: WeatherBundle | null; weatherError: string; navigate: () => void }) {
  const [message, setMessage] = useState('');
  const [records] = useState(readFarmRecords);
  const recent = records.measurements.slice(-6).reverse();
  const fresh = weather && !weatherError && Date.now() - Date.parse(weather.fetchedAt) <= 3600_000 && (!weather.dataTime || Date.now() - Date.parse(weather.dataTime) <= 3600_000);
  const reminders = [
    ...(fresh && weather.current.temp >= 32 ? [{ id: 'heat', title: '高温时先检查水分、通风和饮水', detail: `当前区域气温 ${weather.current.temp.toFixed(1)}°C。到现场观察萎蔫、呼吸和饮水情况；是否补水应结合根区水分、土壤和生产阶段。`, action: '检查田间根区水分、通风与动物饮水' }] : []),
    ...(fresh && weather.current.temp <= 5 ? [{ id: 'cold', title: '低温前检查防寒设施', detail: `当前区域气温 ${weather.current.temp.toFixed(1)}°C。检查棚膜、幼苗、幼畜和供暖安全；具体耐寒范围取决于品种和阶段。`, action: '检查棚室与幼苗幼畜防寒设施' }] : []),
    ...(fresh && weather.forecast[0].rain >= 20 ? [{ id: 'rain', title: '降雨前先巡查排水和畜舍', detail: `今日区域降水预报 ${weather.forecast[0].rain.toFixed(1)} mm，不是已经下过的雨量。检查低洼地、排水沟、垫料和电气设施，保留现场观察。`, action: '巡查排水沟、低洼地与畜舍垫料' }] : []),
    ...(fresh && weather.forecast[0].wind >= 35 ? [{ id: 'wind', title: '留意大风预报与设施固定', detail: `今日最大风速预报 ${weather.forecast[0].wind.toFixed(1)} km/h。检查棚膜、支架和遮阳网，结合所在地气象预警安排作业。`, action: '检查棚膜、支架和室外设施固定' }] : []),
    { id: 'scout', title: '固定时间巡田、巡舍，记录变化', detail: '观察叶片正反面、根区和相邻植株，或动物采食、饮水、呼吸与活动。异常出现时记录时间、范围和近期管理变化，不先猜病名。', action: '巡田巡舍并记录异常与管理变化' },
    { id: 'orders', title: '生产计划先与买家核实', detail: '将近期采购意向与已确认订单分开，记录品级、公斤数、运输、交付时间和每公斤成本。价格上涨本身不能证明需求增加。', action: '核实买家订单、交付时间与单位成本' },
  ];
  function addTask(title: string) {
    try { const next = readFarmRecords(); const today = localDateInput(); if (next.tasks.some(t => t.title === title && t.dueDate === today && !t.completedAt)) { setMessage('这项工作已在今天的待办中。'); return; } next.tasks.push({ id: crypto.randomUUID(), title, dueDate: today, createdAt: new Date().toISOString() }); writeFarmRecords(next); setMessage('已加入今天的真实农场待办。'); } catch (e) { setMessage(messageOf(e)); }
  }
  return <main className="service-view"><div className="service-heading"><div><span className="eyebrow">农事参考 · 现场观察优先</span><h2>把天气线索变成当天的检查</h2><p>提醒使用区域天气和你的实测记录，具体管理需结合当地条件。</p></div><button className="quiet-button" onClick={navigate}><ScanLine size={17} />记录田间异常</button></div>
    {!fresh && <div className="data-warning" role="alert">当前天气未连接、连接失败或已过时，暂不生成新的天气作业提醒；通用检查和实测记录仍可查看。</div>}
    <div className="dashboard-columns"><section className="service-card"><div className="section-heading"><h3>今日检查清单</h3><ShieldCheck size={19} /></div><div className="recommendation-list">{reminders.map(reminder => <article className="recommendation" key={reminder.id}><span>{reminder.id === 'rain' ? <Droplets size={18} /> : reminder.id === 'wind' ? <Wind size={18} /> : <ShieldCheck size={18} />}</span><div><h4>{reminder.title}</h4><p>{reminder.detail}</p><button className="text-link" onClick={() => addTask(reminder.action)}><ClipboardPlus size={14} />加入作业待办</button></div></article>)}</div></section>
    <section className="service-card"><div className="section-heading"><h3>依据与测量记录</h3><Info size={18} /></div><p className="card-footnote">{weather ? `区域天气：${weather.location.name}，获取于 ${formatDate(weather.fetchedAt, true)}，模型时次 ${weather.currentTime || '未提供'}（${weather.timezone}）。` : '尚未获取区域天气。'}空气湿度不能代替土壤含水率，空气气温不能代替养殖水温。</p>{recent.map(entry => <article className="measurement-list" key={entry.id}><p><strong>{MEASUREMENT_TYPES[entry.kind].label} {entry.value} {MEASUREMENT_TYPES[entry.kind].unit}</strong><br />{entry.place} · {formatDate(entry.observedAt, true)} · {entry.instrument || '检测方法未记录'}</p></article>)}{!recent.length && <div className="small-empty"><Droplets size={26} /><p>在农场工作台记录位置、时间、仪器和实测值，帮助后续判断。</p></div>}<div className="source-note"><Info size={15} /><p>上述阈值仅用于通用检查提示，不是作物或动物的病害判定标准。区域模型与实际地块可能有差异。FAO 推荐综合观察与监测，再选择适合当地的管理措施。</p></div><button className="text-link" onClick={() => void openSource('https://www.fao.org/pest-and-pesticide-management/ipm/en/').catch(e => setMessage(messageOf(e)))}>FAO 综合病虫害管理资料<ArrowUpRight size={14} /></button></section></div>{message && <p className="inline-message" role="status">{message}</p>}
  </main>;
}
