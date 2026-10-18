import { ArrowUpRight, BarChart3, ClipboardList, CloudSun, Cpu, Droplets, Leaf, MapPin, Newspaper, ScanLine, Sprout, Thermometer, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDate } from '../lib/deviceUi';
import { weatherLabel } from '../lib/weather';
import type { WeatherBundle } from '../lib/weather';
import './farm-assistant.css';

export type AssistantServiceTab = 'home' | 'weather' | 'clinic' | 'news' | 'market' | 'advice';

export type FarmAssistantPortalProps = {
  weather: WeatherBundle | null;
  loading: boolean;
  weatherError: string;
  locationName: string;
  locationChosen: boolean;
  onNavigate: (tab: AssistantServiceTab) => void;
  onChooseLocation: () => void;
};

const services: { tab: AssistantServiceTab; title: string; description: string; detail: string; icon: LucideIcon; tone: string }[] = [
  { tab: 'home', title: '农场工作台', description: '把每天的事，记录清楚。', detail: '农场资料 · 作业待办 · 现场实测', icon: ClipboardList, tone: 'green' },
  { tab: 'weather', title: '真实天气', description: '看气温、空气湿度和未来降雨。', detail: '区域天气模型 · 7 日预报', icon: CloudSun, tone: 'blue' },
  { tab: 'clinic', title: 'AI 现场观察', description: '用照片、视频和语音整理异常线索。', detail: '本地模型辅助 · 观察案例与备份', icon: ScanLine, tone: 'ochre' },
  { tab: 'news', title: '农业资讯', description: '从有来源的消息，了解农业动态。', detail: '官方来源 · 政策信息 · 农业科普', icon: Newspaper, tone: 'blue' },
  { tab: 'market', title: '市场参考', description: '结合成本、真实订单再做安排。', detail: '市场价格 · 收支记录 · 销售依据', icon: BarChart3, tone: 'ochre' },
  { tab: 'advice', title: '农事参考', description: '结合种养阶段，梳理现场检查事项。', detail: '种植与养殖 · 天气参考 · 实测依据', icon: Sprout, tone: 'green' },
];

function isOldWeather(weather: WeatherBundle): boolean {
  const now = Date.now();
  return [weather.fetchedAt, ...(weather.dataTime ? [weather.dataTime] : [])].some(value => {
    const time = Date.parse(value);
    return !Number.isFinite(time) || now - time > 3_600_000 || time > now + 300_000;
  });
}

export default function FarmAssistantPortal({ weather, loading, weatherError, locationName, locationChosen, onNavigate, onChooseLocation }: FarmAssistantPortalProps) {
  // The preset used to render the game must never become the farmer's location.
  const selectedWeather = locationChosen ? weather : null;
  const oldWeather = !!selectedWeather && (isOldWeather(selectedWeather) || !!weatherError);
  const weatherState = !locationChosen ? '尚未设置位置' : selectedWeather ? oldWeather ? '上次数据 · 请核对时间' : loading ? '正在更新' : '区域天气模型' : loading ? '正在获取天气' : '天气暂未就绪';

  return <main className="farm-assistant-portal" aria-label="真实农场服务首页">
    <div className="assistant-portal-content">
      <header className="assistant-intro">
        <div className="assistant-intro-copy">
          <span className="assistant-eyebrow"><Leaf size={15} aria-hidden="true" />真实农场服务</span>
          <h2>照顾农场，也照顾每一个决定。</h2>
          <p>从现场记录到天气、资讯与市场，找到今天需要的帮助。</p>
        </div>
        <button type="button" className={`assistant-location ${locationChosen ? '' : 'needs-location'}`} onClick={onChooseLocation} aria-label={locationChosen ? '更改真实农场位置' : '设置真实农场位置'}>
          <MapPin size={22} aria-hidden="true" />
          <span><small>{locationChosen ? '已选择的农场位置' : '先确认你的农场在哪里'}</small><strong>{locationChosen ? locationName : '设置农场位置'}</strong><span>{locationChosen ? '点击更改地区或核对定位' : '手机定位、搜索城市或输入坐标'}</span></span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </header>

      <section className={`assistant-weather ${oldWeather ? 'is-old' : ''}`} aria-label="农场位置与区域天气概览">
        <div className="assistant-weather-summary">
          <span className="assistant-weather-icon"><CloudSun size={27} aria-hidden="true" /></span>
          <div><span className="assistant-weather-state">{weatherState}</span><h3>{selectedWeather ? `${selectedWeather.location.name} · ${weatherLabel(selectedWeather.current.code)}` : locationChosen ? locationName : '设置位置后查看当地天气'}</h3></div>
        </div>
        {selectedWeather ? <div className="assistant-weather-metrics">
          <div><Thermometer size={16} aria-hidden="true" /><span>气温</span><strong>{selectedWeather.current.temp.toFixed(1)}<small>°C</small></strong></div>
          <div><Droplets size={16} aria-hidden="true" /><span>空气湿度</span><strong>{Math.round(selectedWeather.current.humidity)}<small>%</small></strong></div>
          <div><Wind size={16} aria-hidden="true" /><span>风速</span><strong>{selectedWeather.current.wind.toFixed(1)}<small>km/h</small></strong></div>
        </div> : <p className="assistant-weather-empty">{!locationChosen ? '位置由你确认后，天气与农事参考才有当地依据。' : loading ? '正在连接天气来源，请稍候。' : '可以先使用工作台和现场观察，稍后到天气页面重试。'}</p>}
        <button type="button" className="assistant-weather-link" onClick={() => locationChosen ? onNavigate('weather') : onChooseLocation()} aria-label={locationChosen ? '查看真实天气详情' : '设置位置以查看真实天气'}>{locationChosen ? '查看天气' : '设置位置'}<ArrowUpRight size={16} aria-hidden="true" /></button>
        <div className="assistant-weather-source">
          {selectedWeather ? <>
            <span>Open-Meteo 区域模型 · 不是田间实测</span>
            <span>模型时点 {selectedWeather.currentTime?.replace('T', ' ') || formatDate(selectedWeather.dataTime || selectedWeather.fetchedAt, true)}（{selectedWeather.timezone}）</span>
            <span>获取于 {formatDate(selectedWeather.fetchedAt, true)}</span>
          </> : <span>空气湿度不代表土壤含水量；田间与畜舍情况请结合实测。</span>}
          {locationChosen && weatherError && <span className="assistant-weather-error">{weatherError}{selectedWeather ? ' · 此处保留上次数据。' : ''}</span>}
        </div>
      </section>

      <section className="assistant-services" aria-labelledby="assistant-services-title">
        <div className="assistant-section-heading"><h3 id="assistant-services-title">今天需要什么帮助？</h3><span>种植 · 养殖 · 日常经营</span></div>
        <div className="assistant-service-grid">{services.map(({ tab, title, description, detail, icon: Icon, tone }) => <button type="button" className={`assistant-service-card tone-${tone}`} key={tab} onClick={() => onNavigate(tab)} aria-label={`打开${title}`}>
          <span className="assistant-service-icon"><Icon size={25} strokeWidth={1.7} aria-hidden="true" /></span>
          <span className="assistant-service-copy"><strong>{title}</strong><span>{description}</span><small>{detail}</small></span>
          <ArrowUpRight className="assistant-service-arrow" size={18} aria-hidden="true" />
        </button>)}</div>
      </section>

      <footer className="assistant-portal-footnotes">
        <span><Cpu size={15} aria-hidden="true" />AI 提供观察辅助，尚未经农作物或动物诊断准确性验证。</span>
        <span><BarChart3 size={15} aria-hidden="true" />全国均价不代表当地成交价或实际需求。</span>
      </footer>
    </div>
  </main>;
}
