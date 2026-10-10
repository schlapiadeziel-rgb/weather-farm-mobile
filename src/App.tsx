import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Sprout, CloudSun, MapPin, Droplets, Wind, Coins, Wheat, ChevronRight, X, LocateFixed, Search, RotateCcw, CalendarDays, Check, RefreshCw, Sun, Leaf, BookOpen, Volume2, VolumeX, PawPrint, Building2, ArrowLeft, Flag, Factory, ClipboardList, Warehouse, Compass, Diamond, Lock, Timer } from 'lucide-react';
import { CROPS, LIVESTOCK, initialGame, restoreGame, tickGame, getLevel, plant, harvest, buyAnimal, feedAnimal, collectProduct, speedUpCrop, speedUpAnimal, buildPen } from './lib/game';
import type { Game, CropId, AnimalId } from './lib/game';
import { fetchWeather, searchLocations, PRESET_LOCATIONS, weatherLabel, weatherEmoji } from './lib/weather';
import type { WeatherBundle, Location } from './lib/weather';
import { validDate, validTimestamp } from './lib/publicDataHttp';
import FarmDashboard from './components/FarmDashboard';
import DiagnosticPanel from './components/DiagnosticPanel';
import NewsPanel from './components/NewsPanel';
import MarketPanel from './components/MarketPanel';
import FieldAdvicePanel from './components/FieldAdvicePanel';
import { CropVisual, AnimalVisual } from './components/FarmVisual';
import FarmLandscape from './components/FarmLandscape';
import FarmTown from './components/FarmTown';
import ProductionPanel from './components/ProductionPanel';
import { OrdersPanel, StoragePanel, ExplorationPanel } from './components/EconomyPanels';
import { getItem } from './lib/farmContent';
import { readSelectedLocation, saveSelectedLocation, locationFromPosition, parseManualLocation, formatCoordinates } from './lib/location';
import { getDevicePosition, cancelDevicePosition } from './lib/deviceLocation';

type PlayTab = 'farm' | 'livestock' | 'production' | 'orders' | 'storage' | 'explore' | 'journal';
type Tab = 'home' | 'clinic' | 'news' | 'market' | 'advice' | 'weather' | PlayTab;
const PLAY_TABS: readonly Tab[] = ['farm', 'livestock', 'production', 'orders', 'storage', 'explore', 'journal'];
function sameCoordinates(a: Location, b: Location) { return a.latitude === b.latitude && a.longitude === b.longitude; }

const SAVE_KEY = 'fieldletter.game.v1';
const WEATHER_KEY = 'fieldletter.weather.v1';
function readGame(): Game {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return initialGame();
    return restoreGame(JSON.parse(raw));
  } catch {
    const fresh = initialGame();
    if (raw) {
      try {
        const backupKey = 'fieldletter.game.recovery.v1';
        if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, raw);
        fresh.log.unshift('旧游戏存档未能读取，已保留本机恢复副本；真实农场记录不受影响。');
      } catch { fresh.log.unshift('旧游戏存档未能读取，且本机存储无法保留恢复副本。'); }
    }
    return fresh;
  }
}
function readWeather(): WeatherBundle | null {
  try {
    const w = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null');
    const validDay = (day: Record<string, unknown>) => day && typeof day.date === 'string' && validDate(day.date) && ['temp', 'minTemp', 'maxTemp', 'humidity', 'rain', 'rainChance', 'wind', 'et0', 'code'].every(key => typeof day[key] === 'number' && Number.isFinite(day[key])) && Number(day.minTemp) <= Number(day.maxTemp) && Number(day.temp) >= -100 && Number(day.temp) <= 70 && Number(day.humidity) >= 0 && Number(day.humidity) <= 100 && Number(day.rainChance) >= 0 && Number(day.rainChance) <= 100 && ['rain', 'wind', 'et0'].every(key => Number(day[key]) >= 0) && Number(day.code) >= 0 && Number(day.code) <= 99;
    return w && validDay(w.current) && Array.isArray(w.forecast) && w.forecast.length === 7 && w.forecast.every(validDay) && typeof w.location?.name === 'string' && Number.isFinite(w.location?.latitude) && Number.isFinite(w.location?.longitude) && Math.abs(w.location.latitude) <= 90 && Math.abs(w.location.longitude) <= 180 && typeof w.timezone === 'string' && typeof w.fetchedAt === 'string' && validTimestamp(w.fetchedAt) && (w.dataTime === undefined || typeof w.dataTime === 'string' && validTimestamp(w.dataTime)) ? w : null;
  } catch { return null; }
}
function shortDate(date: string) { return date.slice(5).replace('-', '/'); }
function timerText(milliseconds: number) { const seconds = Math.max(0, Math.ceil(milliseconds / 1000)); return seconds >= 3600 ? `${Math.floor(seconds / 3600)}时${Math.ceil(seconds % 3600 / 60)}分` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function gemCost(milliseconds: number) { return Math.max(1, Math.ceil(Math.max(0, milliseconds) / 300000)); }
function Bar({ value, tone = 'green' }: { value: number; tone?: string }) { return <div className={`bar ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }

export default function App() {
  const [game, setGame] = useState<Game>(readGame);
  const [location, setLocation] = useState<Location>(() => readSelectedLocation() || PRESET_LOCATIONS[0]);
  const [locationChosen, setLocationChosen] = useState(() => !!readSelectedLocation());
  const [bundle, setBundle] = useState<WeatherBundle | null>(() => { const cached = readWeather(); return cached && sameCoordinates(cached.location, location) ? cached : null; });
  const [tab, setTab] = useState<Tab>('farm');
  const [lastPlayTab, setLastPlayTab] = useState<PlayTab>('farm');
  const [townOpen, setTownOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState(1);
  const [seed, setSeed] = useState<CropId>('wheat');
  const [selectedPen, setSelectedPen] = useState(1);
  const [animalSeed, setAnimalSeed] = useState<AnimalId>('chicken');
  const [loading, setLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [notice, setNotice] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<Location | null>(null);
  const [manualLatitude, setManualLatitude] = useState('');
  const [manualLongitude, setManualLongitude] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [searchError, setSearchError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const requestId = useRef(0);
  const locationAttempt = useRef(0);
  const searchAttempt = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const plot = (game.plots.find(p => p.id === selected) || game.plots[0]);
  const crop = CROPS.find(c => c.id === plot.crop);
  const pen = (game.animals.find(p => p.id === selectedPen) || game.animals[0]);
  const animal = LIVESTOCK.find(a => a.id === pen.animal);
  const selectedAnimal = LIVESTOCK.find(a => a.id === animalSeed)!;
  const selectedSeed = CROPS.find(c => c.id === seed)!;
  const stale = bundle ? clock - Date.parse(bundle.fetchedAt) > 3600_000 || Date.parse(bundle.fetchedAt) > clock + 300000 || !!bundle.dataTime && (clock - Date.parse(bundle.dataTime) > 3600_000 || Date.parse(bundle.dataTime) > clock + 300000) : false;
  const simulation = PLAY_TABS.includes(tab);
  const level = getLevel(game);
  const levelBase = 20 * (level - 1) ** 2, nextLevelXp = 20 * level ** 2;
  const cropRemaining = Math.max(0, (plot.readyAt ?? clock) - clock);
  const animalRemaining = Math.max(0, (pen.readyAt ?? clock) - clock);
  const serviceWeather = locationChosen ? bundle : null;
  const serviceWeatherError = locationChosen ? weatherError : '先设置真实农场位置，再获取当地天气与农事提醒。';
  function navigate(next: Tab) {
    if (PLAY_TABS.includes(next)) { setLastPlayTab(next as PlayTab); if (next !== tab) setDetailsOpen(false); }
    setTab(next); setTownOpen(false);
  }
  const goal = game.harvests === 0 ? { title: '第一份收成', detail: '收获作物，留种再播', action: () => { navigate('farm'); setSelected(game.plots.find(p => p.crop && p.growth >= 100)?.id || 1); } }
    : game.productsCollected === 0 ? { title: '牧场的馈赠', detail: '去牧场收集鸡蛋', action: () => { navigate('livestock'); setSelectedPen(1); } }
    : game.ordersDelivered === 0 ? { title: '装满第一辆货车', detail: '加工、备货，完成订单', action: () => navigate('orders') }
    : { title: '让农场更热闹', detail: '加工、扩建，探索新区域', action: () => navigate('production') };
  const showNotice = useCallback((message: string) => {
    setNotice(message); clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setNotice(''), 5200);
  }, []);
  const loadWeather = useCallback(async (place: Location) => {
    const id = ++requestId.current;
    setBundle(previous => previous && sameCoordinates(previous.location, place) ? previous : null);
    setLoading(true); setWeatherError('');
    try {
      const next = await fetchWeather(place);
      if (id !== requestId.current) return;
      setBundle(next);
      try { localStorage.setItem(WEATHER_KEY, JSON.stringify(next)); } catch { /* Weather remains in memory. */ }
    } catch (error) {
      if (id === requestId.current) setWeatherError(error instanceof Error ? error.message : '暂时无法连接天气服务，请重试。');
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void loadWeather(location); }, []); // Refresh at launch; a foreground timer keeps regional weather current.
  useEffect(() => { const timer = setInterval(() => { const now = Date.now(); setClock(now); setGame(previous => tickGame(previous, now)); }, 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === 'visible' && !loading && bundle && Date.now() - Date.parse(bundle.fetchedAt) >= 900000) void loadWeather(location);
    }, 60000);
    return () => clearInterval(timer);
  }, [bundle, loading, location, loadWeather]);
  useEffect(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { showNotice('存档暂时无法保存，当前游戏仍可继续。'); } }, [game, showNotice]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
      void StatusBar.hide().catch(() => {});
    }
    return () => { clearTimeout(timeout.current); ++locationAttempt.current; ++searchAttempt.current; void cancelDevicePosition().catch(() => {}); };
  }, []);

  function feedback() {
    if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    if (sound) {
      try {
        const audio = new AudioContext(); const osc = audio.createOscillator(); const gain = audio.createGain();
        osc.type = 'sine'; osc.frequency.setValueAtTime(660, audio.currentTime); osc.frequency.exponentialRampToValueAtTime(880, audio.currentTime + .08);
        gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .13);
        osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .14); osc.onended = () => void audio.close();
      } catch { /* Audio may be unavailable on some WebViews. */ }
    }
  }
  function commitGame(next: Game) { setGame(next); feedback(); showNotice(next.log[0] || '农场已更新'); }
  function animalAct(action: 'buy' | 'feed' | 'collect' | 'speed', target = selectedPen) {
    try {
      const next = action === 'buy' ? buyAnimal(game, target, animalSeed) : action === 'feed' ? feedAnimal(game, target) : action === 'collect' ? collectProduct(game, target) : speedUpAnimal(game, target);
      commitGame(next);
    } catch (error) { showNotice(error instanceof Error ? error.message : '操作未完成'); }
  }
  function act(action: 'plant' | 'harvest' | 'speed', target = selected) {
    try {
      let next: Game;
      if (action === 'plant') next = plant(game, target, seed);
      else if (action === 'harvest') next = harvest(game, target);
      else next = speedUpCrop(game, target);
      commitGame(next);
    } catch (error) { showNotice(error instanceof Error ? error.message : '操作未完成'); }
  }
  async function chooseLocation(place: Location) {
    ++locationAttempt.current; setLocating(false); setPendingPosition(null);
    ++searchAttempt.current; setSearching(false);
    void cancelDevicePosition().catch(() => {});
    setLocation(place); setLocationChosen(true);
    if (!saveSelectedLocation(place)) showNotice('位置已用于本次查询，但无法保存设置。');
    setLocationOpen(false); setQuery(''); setResults([]); setSearchError('');
    await loadWeather(place);
  }
  function closeLocation() { ++locationAttempt.current; ++searchAttempt.current; void cancelDevicePosition().catch(() => {}); setSearching(false); setLocating(false); setPendingPosition(null); setLocationOpen(false); }
  async function locate() {
    const attempt = ++locationAttempt.current;
    setSearchError(''); setPendingPosition(null); setLocating(true);
    try {
      if (!Capacitor.isNativePlatform() && !window.isSecureContext) throw new Error('网页定位需要 HTTPS 或 localhost。请使用安卓安装包，或输入农场坐标。');
      const position = await getDevicePosition();
      if (attempt !== locationAttempt.current) return;
      const place = locationFromPosition(position);
      if ((place.accuracy ?? Infinity) > 1000) { setPendingPosition(place); setSearchError('定位范围较大，可能偏离农场。请核对坐标后确认，或输入农场实际坐标。'); }
      else await chooseLocation(place);
    } catch (error) {
      if (attempt !== locationAttempt.current) return;
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const message = code === 'PERMISSION_DENIED' || code === '1' ? '定位权限被拒绝。请在系统设置中允许定位，或手动设置农场坐标。'
        : code === 'POSITION_DISABLED' ? '系统位置服务未开启。请开启手机定位/GPS后重试。'
        : code === 'POSITION_TIMEOUT' || code === '3' ? '定位超时。请到信号较好的地方重试，或输入农场坐标。'
        : error instanceof Error ? error.message : '暂时无法获取位置。请检查定位权限、GPS与网络，或输入农场坐标。';
      setSearchError(message);
    } finally { if (attempt === locationAttempt.current) setLocating(false); }
  }
  async function setManualLocation() {
    try { await chooseLocation(parseManualLocation(manualLatitude, manualLongitude, manualLabel)); }
    catch (error) { setSearchError(error instanceof Error ? error.message : '请输入有效的农场经纬度。'); }
  }
  async function search() {
    if (query.trim().length < 2) { setSearchError('请输入至少两个字的城市名称。'); return; }
    const attempt = ++searchAttempt.current;
    setSearching(true); setSearchError('');
    try { const list = await searchLocations(query); if (attempt !== searchAttempt.current) return; setResults(list); if (!list.length) setSearchError('没有找到这个城市，试试英文名或附近城市。'); }
    catch (e) { if (attempt === searchAttempt.current) setSearchError(e instanceof Error ? e.message : '城市搜索暂不可用。'); }
    finally { if (attempt === searchAttempt.current) setSearching(false); }
  }

  return <div className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><Sprout size={25} /></span><div><h1>田野来信</h1><span>WEATHER FARM</span></div></div>
      <button className="location-button" onClick={() => { setSearchError(''); setLocationOpen(true); }} aria-label={`设置农场位置：${location.name}${!locationChosen ? '，示例城市' : ''}`}><MapPin size={15} /><span>{location.name}{!locationChosen && ' · 示例'}</span><ChevronRight size={13} /></button>
      <div className="live-status"><span className={loading ? 'pulse-dot pending' : bundle ? 'pulse-dot' : 'pulse-dot error'} />{loading ? '连接天气中' : bundle ? stale || weatherError ? '上次天气' : '区域天气' : '天气未连接'}</div>
      <div className="top-weather"><CloudSun size={20} /><strong>{bundle ? `${Math.round(bundle.current.temp)}°` : '—'}</strong><span>{bundle ? weatherLabel(bundle.current.code) : '等待数据'}</span><i /><Droplets size={16} /><span>{bundle ? `${Math.round(bundle.current.humidity)}%` : '—'}</span><i /><Wind size={16} /><span>{bundle ? `${Math.round(bundle.current.wind)} km/h` : '—'}</span></div>
      {simulation && <><div className="wallet"><Coins size={20} /><strong>{game.coins}</strong><span>金币</span><Diamond size={17} /><strong>{game.gems}</strong><span>钻石</span></div><button className="icon-button" aria-label="打开谷仓与筒仓" onClick={() => navigate('storage')}><Warehouse size={21} /></button><button className="icon-button diary-button" aria-label="查看农场日记" onClick={() => navigate('journal')}><BookOpen size={19} /></button></>}
      <button className="icon-button sound-button" aria-label={sound ? '关闭音效' : '打开音效'} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
    </header>

    <div className={`workspace ${simulation ? 'play-workspace' : 'town-service-workspace'}`}>
      <nav className="rail game-rail" aria-label="农场游戏地图">
        {([{ id: 'farm', label: '农田', Icon: Sprout }, { id: 'livestock', label: '牧场', Icon: PawPrint }, { id: 'production', label: '工坊', Icon: Factory }, { id: 'orders', label: '订单', Icon: ClipboardList }, { id: 'explore', label: '探索', Icon: Compass }] as const).map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'rail-button active' : 'rail-button'} onClick={() => navigate(id)} aria-pressed={tab === id}><Icon size={22} /><span>{label}</span></button>)}
        <button className={`rail-button town-map-button ${!simulation || townOpen ? 'active' : ''}`} aria-label="进入农场小镇" aria-haspopup="dialog" onClick={() => setTownOpen(true)}><Building2 size={23} /><span>小镇</span></button>
        {!simulation && <button className="rail-button return-farm-button" onClick={() => navigate(lastPlayTab)}><ArrowLeft size={20} /><span>回农场</span></button>}
        <div className="rail-spacer" />{simulation && <button className="rail-button reset-button" aria-label="重置模拟农场" onClick={() => setResetOpen(true)}><RotateCcw size={19} /><span>重开</span></button>}
      </nav>

      {tab === 'home' ? <FarmDashboard weather={serviceWeather} loading={loading} weatherError={serviceWeatherError} refresh={() => locationChosen ? void loadWeather(location) : setLocationOpen(true)} navigate={navigate} /> : tab === 'clinic' ? <DiagnosticPanel weather={weatherError || stale ? null : serviceWeather} /> : tab === 'news' ? <NewsPanel /> : tab === 'market' ? <MarketPanel locationName={locationChosen ? location.name : '请先设置真实农场位置'} /> : tab === 'advice' ? <FieldAdvicePanel weather={serviceWeather} weatherError={serviceWeatherError} navigate={() => navigate('clinic')} /> : tab === 'production' ? <ProductionPanel game={game} now={clock} onChange={commitGame} notify={showNotice} /> : tab === 'orders' ? <OrdersPanel game={game} now={clock} onChange={commitGame} notify={showNotice} /> : tab === 'storage' ? <StoragePanel game={game} now={clock} onChange={commitGame} notify={showNotice} /> : tab === 'explore' ? <ExplorationPanel game={game} now={clock} onChange={commitGame} notify={showNotice} /> : tab === 'farm' ? <>
        <main className="farm-scene map-scene">
          <FarmLandscape onVisit={area => area === 'town' ? setTownOpen(true) : navigate(area)} /><div className="scene-shade" />
          <div className="scene-top"><div className="day-pill"><Sun size={17} /><strong>我的农田</strong><span>{game.unlockedPlots} 块耕地</span></div><button className="quest-sign" onClick={goal.action}><Flag size={17} /><span><strong>{goal.title}</strong><small>{goal.detail}</small></span><ChevronRight size={15} /></button></div>
          <div className="field-wrap"><div className="plot-grid">{game.plots.map(p => {
            const c = CROPS.find(s => s.id === p.crop), ready = p.growth >= 100 && !!c, locked = p.id > game.unlockedPlots;
            return <button key={p.id} className={`plot ${p.id === selected ? 'selected' : ''} ${c ? 'planted' : 'empty'} ${ready ? 'ripe' : ''} ${locked ? 'locked' : ''}`} onClick={() => { if (locked) { navigate('storage'); return; } setSelected(p.id); if (ready) act('harvest', p.id); else { setDetailsOpen(true); feedback(); } }} aria-label={`${p.id}号地块，${locked ? '未解锁，前往扩建' : c ? `${c.name}，${ready ? '轻触收获2份' : `生长${Math.round(p.growth)}%`}` : '空地，可播种'}`} aria-pressed={p.id === selected}>
              <span className="plot-number">{String(p.id).padStart(2, '0')}</span><span className="crop-sprite">{locked ? <Lock size={24} /> : <CropVisual crop={p.crop} growth={p.growth} health={100} moisture={62} />}</span>
              {!locked && c && <span className="plot-label">{ready ? '收获 ×2' : timerText((p.readyAt ?? clock) - clock)}</span>}{locked && <span className="plot-label">可扩建</span>}{!locked && c && !ready && <span className="plot-growth"><i style={{ width: `${p.growth}%` }} /></span>}{ready && <span className="ready-mark"><Check size={11} /></span>}
            </button>;
          })}</div><span className="field-caption">播种用 1 份 · 收获得 2 份 · 留种、加工，再去交订单</span></div>
          <div className="farm-bottom"><div className="farm-level"><span className="level-emblem"><Wheat size={21} /></span><div><strong>Lv. {level} 农场主</strong><Bar value={(game.xp - levelBase) / (nextLevelXp - levelBase) * 100} tone="gold" /><span>{game.xp} / {nextLevelXp} 经验</span></div></div><button className="advance-button" onClick={() => navigate('orders')}><ClipboardList size={20} /><span>订单板</span><ChevronRight size={18} /></button></div>
          {notice && <div className="toast" role="status"><Sprout size={16} />{notice}</div>}
        </main>
        {detailsOpen && <aside className="plot-panel">
          <button className="panel-close" onClick={() => setDetailsOpen(false)} aria-label="收起地块面板"><X size={18} /></button>
          <div className="panel-body"><div className="panel-heading"><span>地块 {String(selected).padStart(2, '0')}</span><span className="soil-chip">{crop ? plot.growth >= 100 ? '待收获' : '生长中' : '待播种'}</span></div>
          {crop ? <><div className="crop-profile"><div className="crop-avatar"><CropVisual crop={crop.id} growth={plot.growth} health={100} /></div><div><h2>{crop.name}</h2><p>成熟后收获 2 份，留 1 份做种子</p></div></div><div className="stat-row"><span>生长进度</span><strong>{Math.round(plot.growth)}%</strong></div><Bar value={plot.growth} /><div className="crop-countdown"><Timer size={20} /><strong>{plot.growth >= 100 ? '可以收获了' : timerText(cropRemaining)}</strong></div><p className="game-care-note">作物会按倒计时成熟，不会因断网或离开游戏枯萎。</p></> : <><div className="empty-plot"><Sprout size={28} /><div><h2>留一份，再种一季</h2><p>选择库存中的作物播种</p></div></div><div className="seed-grid">{CROPS.map(c => <button key={c.id} className={seed === c.id ? 'seed-card active' : 'seed-card'} onClick={() => setSeed(c.id)} aria-pressed={seed === c.id} disabled={level < c.level}><span><CropVisual crop={c.id} growth={100} health={100} /></span><strong>{c.name}</strong><small>{level < c.level ? `Lv. ${c.level} 解锁` : `库存 ${game.inventory[c.id] || 0} · ${timerText(c.durationMs)}`}</small></button>)}</div></>}
          <div className="seed-cycle-note"><Warehouse size={17} /><p>收成进入筒仓。没有种子时可去仓库的补给商店，成品可加工、交订单或挂到路边摊。</p><button onClick={() => navigate('storage')}>查看仓库<ChevronRight size={13} /></button></div>
          </div>
          {crop ? <button className="primary-action" onClick={() => act(plot.growth >= 100 ? 'harvest' : 'speed')} disabled={plot.growth < 100 && game.gems < gemCost(cropRemaining)}>{plot.growth >= 100 ? <Wheat size={19} /> : <Diamond size={18} />}{plot.growth >= 100 ? `收获 · ${crop.name} ×2` : `立即成熟 · ${gemCost(cropRemaining)} 钻石`}</button> : <button className="primary-action" onClick={() => act('plant')} disabled={!((game.inventory[selectedSeed.id] || 0) > 0) || level < selectedSeed.level}><Sprout size={19} />播种{selectedSeed.name}<span>−1 库存</span></button>}
          <div className="tiny-note">游戏库存与真实农场记录分别保存</div>
        </aside>}
      </> : tab === 'livestock' ? <>
        <main className="farm-scene livestock-scene map-scene">
          <FarmLandscape onVisit={area => area === 'town' ? setTownOpen(true) : navigate(area)} /><div className="scene-shade" />
          <div className="scene-top"><div className="day-pill"><PawPrint size={17} /><strong>我的牧场</strong><span>饲料换产物</span></div><button className="quest-sign" onClick={() => navigate('production')}><Factory size={17} /><span><strong>先备好动物的口粮</strong><small>饲料厂里加工饲料</small></span><ChevronRight size={15} /></button></div>
          <div className="livestock-field"><div className="pen-grid">{game.animals.map(p => {
            const a = LIVESTOCK.find(v => v.id === p.animal), ready = p.progress >= 100 && !!a;
            return <button key={p.id} className={`animal-pen ${p.id === selectedPen ? 'selected' : ''} ${a ? 'occupied' : ''}`} onClick={() => { setSelectedPen(p.id); if (ready) animalAct('collect', p.id); else { setDetailsOpen(true); feedback(); } }} aria-pressed={p.id === selectedPen} aria-label={`${p.id}号畜舍，${a ? `${a.name}，${ready ? `轻触收集${a.productName}` : p.readyAt ? `剩余${timerText(p.readyAt-clock)}` : '等待喂食'}` : '空畜舍，可购买动物'}`}>
              <span className="pen-label">畜舍 {String(p.id).padStart(2, '0')}</span><span className="animal-sprite"><AnimalVisual animal={p.animal} healthy /></span><strong>{a ? a.name : '等待新伙伴'}</strong><span className="animal-product">{a ? ready ? `${a.productEmoji} ${a.productName}可收集` : p.readyAt ? timerText(p.readyAt-clock) : '需要一份饲料' : '点击选择动物'}</span>{ready && <span className="ready-mark"><Check size={13} /></span>}
            </button>;
          })}</div><span className="field-caption">投喂一份饲料，等待产物 · 收集后再投喂下一轮</span></div>
          <div className="farm-bottom"><div className="farm-level"><span className="level-emblem"><PawPrint size={21} /></span><div><strong>已收集 {game.productsCollected} 份产物</strong><span>动物安心等待，不会饿死</span></div></div><button className="advance-button" onClick={() => { try { commitGame(buildPen(game)); } catch(error) { showNotice(error instanceof Error ? error.message : '暂时无法扩建'); } }}><Building2 size={19} /><span>扩建畜舍</span></button></div>
          {notice && <div className="toast" role="status"><PawPrint size={16} />{notice}</div>}
        </main>
        {detailsOpen && <aside className="plot-panel">
          <button className="panel-close" onClick={() => setDetailsOpen(false)} aria-label="收起畜舍面板"><X size={18} /></button>
          <div className="panel-body"><div className="panel-heading"><span>畜舍 {String(selectedPen).padStart(2, '0')}</span><span className="soil-chip">{animal ? pen.progress >= 100 ? '待收集' : pen.readyAt ? '生产中' : '待喂养' : '空畜舍'}</span></div>
          {animal ? <><div className="crop-profile"><div className="crop-avatar"><AnimalVisual animal={animal.id} healthy /></div><div><h2>{animal.name}</h2><p>产出{animal.productName} · {timerText(animal.durationMs)}</p></div></div><div className="stat-row"><span>产物进度</span><strong>{Math.round(pen.progress)}%</strong></div><Bar value={pen.progress} tone="gold" /><div className="crop-countdown"><Timer size={20} /><strong>{pen.progress >= 100 ? '可以收集了' : pen.readyAt ? timerText(animalRemaining) : '等待投喂'}</strong></div><div className="seed-cycle-note"><Leaf size={17} /><p>{getItem(animal.feedItem).name}库存：{game.inventory[animal.feedItem] || 0}。没有饲料时，先去饲料厂加工。</p><button onClick={() => navigate('production')}>去饲料厂<ChevronRight size={13} /></button></div></> : <><div className="empty-plot"><PawPrint size={26} /><div><h2>迎接新的伙伴</h2><p>买动物，喂养后收集产物</p></div></div><div className="animal-options">{LIVESTOCK.map(a => <button key={a.id} className={animalSeed === a.id ? 'animal-option active' : 'animal-option'} disabled={level < a.level} aria-pressed={animalSeed === a.id} onClick={() => setAnimalSeed(a.id)}><span><AnimalVisual animal={a.id} healthy /></span><div><strong>{a.name}</strong><small>{level < a.level ? `Lv. ${a.level} 解锁` : `${a.productName} · ${timerText(a.durationMs)}`}</small></div><b>{a.cost}<Coins size={12} /></b></button>)}</div></>}
          </div>
          {animal ? <button className="primary-action" onClick={() => animalAct(pen.progress >= 100 ? 'collect' : pen.readyAt ? 'speed' : 'feed')} disabled={pen.progress < 100 && (pen.readyAt ? game.gems < gemCost(animalRemaining) : !((game.inventory[animal.feedItem] || 0) > 0))}>{pen.progress >= 100 ? <Wheat size={18} /> : pen.readyAt ? <Diamond size={18} /> : <Leaf size={18} />}{pen.progress >= 100 ? `收集${animal.productName} ×1` : pen.readyAt ? `立即完成 · ${gemCost(animalRemaining)} 钻石` : `投喂${getItem(animal.feedItem).name} ×1`}</button> : <button className="primary-action" onClick={() => animalAct('buy')} disabled={game.coins < selectedAnimal.cost || level < selectedAnimal.level}><PawPrint size={18} />购买{selectedAnimal.name}<span>−{selectedAnimal.cost}</span></button>}
          <div className="tiny-note">产物进入谷仓，可加工或交订单</div>
        </aside>}
      </> : <main className="content-view">
        <div className="view-heading"><div><span className="eyebrow">{tab === 'weather' ? 'WEATHER STATION' : 'SIMULATION JOURNAL'}</span><h2>{tab === 'weather' ? '农场天气站' : '每一份耕耘，都有回响'}</h2></div>{tab !== 'journal' && <button className="refresh-button" onClick={() => void loadWeather(location)} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />刷新天气</button>}</div>
        {weatherError && <div className="error-banner" role="alert">{weatherError}{bundle && ' 当前显示上次成功获取的数据。'}</div>}
        {tab === 'weather' && <><div className="weather-stats"><article><span>当前气温</span><strong>{bundle ? Math.round(bundle.current.temp) : '—'}<small>°C</small></strong><Sun size={28} /></article><article><span>空气湿度</span><strong>{bundle ? Math.round(bundle.current.humidity) : '—'}<small>%</small></strong><Droplets size={28} /></article><article><span>当前风速</span><strong>{bundle ? Math.round(bundle.current.wind) : '—'}<small>km/h</small></strong><Wind size={28} /></article><article><span>今日降水预报</span><strong>{bundle ? bundle.forecast[0].rain.toFixed(1) : '—'}<small>mm</small></strong><CloudSun size={28} /></article></div><div className="forecast-heading"><h3>未来 7 天天气</h3><span>日最低 / 最高气温</span></div><div className="forecast-grid">{bundle?.forecast.map((w, i) => <article key={w.date} className={i === 0 ? 'forecast-day today' : 'forecast-day'}><span>{i === 0 ? '今天' : i === 1 ? '明天' : shortDate(w.date)}</span><b>{weatherEmoji(w.code)}</b><strong>{Math.round(w.minTemp)}° / {Math.round(w.maxTemp)}°</strong><small>{weatherLabel(w.code)}</small><span className="rain-value"><Droplets size={12} />{Math.round(w.rainChance)}%</span></article>)}</div><p className="weather-attribution">数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · {bundle ? `更新于 ${new Date(bundle.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · ${bundle.timezone}` : '尚未连接'}。预报会随气象条件变化。</p></>}
        {tab === 'journal' && <><div className="journal-stats"><article><Wheat size={26} /><strong>{game.harvests}</strong><span>农作物收获</span></article><article><CalendarDays size={26} /><strong>{game.ordersDelivered}</strong><span>完成订单</span></article><article><PawPrint size={26} /><strong>{game.productsCollected}</strong><span>养殖产物</span></article><article><Sprout size={26} /><strong>{game.xp}</strong><span>累计经验</span></article></div><div className="journal-list">{game.log.map((line, i) => <div key={`${game.day}-${i}`}><span className="journal-dot" /><p>{line}</p>{i === 0 && <span className="new-label">最新</span>}</div>)}</div><p className="journal-footnote">作物、动物和加工按真实倒计时推进。游戏库存与金币不参与真实农场建议。</p></>}
        {notice && <div className="content-toast" role="status">{notice}</div>}
      </main>}
    </div>
    <footer className="statusbar"><span><Leaf size={13} />{simulation ? '我的农场 · 播种，照料，等待丰收' : '小镇服务 · 真实农场资料独立保存'}</span><span>{!locationChosen ? '当前为示例城市天气，请设置你的农场位置' : bundle ? `${bundle.location.name} · ${stale || weatherError ? '上次获取' : '区域模型'} · ${bundle.timezone}` : weatherError || '正在连接 Open-Meteo…'}</span><button onClick={() => simulation ? setTownOpen(true) : navigate(lastPlayTab)}>{simulation ? '逛逛小镇' : '返回农场'}<ChevronRight size={12} /></button></footer>
    {townOpen && <FarmTown onVisit={navigate} onClose={() => setTownOpen(false)} />}

    {locationOpen && <div className="modal-backdrop" onClick={closeLocation}>
      <section className="location-modal farm-location-modal" role="dialog" aria-modal="true" aria-labelledby="location-title" onClick={e => e.stopPropagation()}>
        <div className="modal-heading"><div><span className="eyebrow">FIND YOUR FARM</span><h2 id="location-title">农场在哪里？</h2></div><button className="icon-button" aria-label="关闭城市选择" onClick={closeLocation}><X size={21} /></button></div>
        <div className="selected-location"><MapPin size={18} /><div><strong>{location.name}{!locationChosen && '（示例城市，尚未定位）'}</strong><span>{formatCoordinates(location)}{location.accuracy !== undefined && ` · 定位精度约 ±${Math.round(location.accuracy)} 米`}</span></div></div>
        {location.provider && <p className="location-help">来源：{location.provider === 'gps' ? '系统卫星定位' : location.provider === 'network' ? '系统网络定位' : '浏览器位置服务'}，精度以设备返回的误差范围为准。</p>}
        {location.locatedAt && <p className="location-help">保存于 {new Date(location.locatedAt).toLocaleString('zh-CN')}。这是上次选定的位置，点击下方按钮重新定位。</p>}
        <button className="locate-button" onClick={() => void locate()} disabled={locating}><LocateFixed size={17} />{locating ? '正在获取新的手机位置…' : '使用手机当前位置'}</button>
        <p className="location-help">请在农场现场定位。手机位置与农场不同，请输入农场坐标；定位不会根据 IP 猜测城市。</p>
        {searchError && <p className="validation-error" role="alert">{searchError}</p>}
        {pendingPosition && <div className="position-confirm"><strong>精度约 ±{Math.round(pendingPosition.accuracy ?? 0)} 米</strong><p>{formatCoordinates(pendingPosition)}</p><button onClick={() => void chooseLocation(pendingPosition)}>已核对，使用这个大致位置</button></div>}
        <details className="manual-location" open><summary>设置农场坐标</summary><form onSubmit={e => { e.preventDefault(); void setManualLocation(); }}><div><label>农场纬度<input aria-label="农场纬度" inputMode="decimal" value={manualLatitude} onChange={e => setManualLatitude(e.target.value)} placeholder="例如 30.2741" /></label><label>农场经度<input aria-label="农场经度" inputMode="decimal" value={manualLongitude} onChange={e => setManualLongitude(e.target.value)} placeholder="例如 120.1551" /></label></div><label>位置名称（可选）<input aria-label="位置名称（可选）" value={manualLabel} onChange={e => setManualLabel(e.target.value)} maxLength={60} placeholder="例如 北侧蔬菜基地" /></label><p>使用 GPS / WGS84 经纬度。城市中心天气不能代替农场实测。</p><button type="submit">使用农场坐标</button></form></details>
        <form className="location-search" onSubmit={e => { e.preventDefault(); void search(); }}><Search size={18} /><input aria-label="搜索城市" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索城市，核对地区与国家" /><button disabled={searching} type="submit">{searching ? '查找中' : '搜索'}</button></form>
        {results.length > 0 && <div className="search-results">{results.map(p => <button key={`${p.latitude},${p.longitude}`} onClick={() => void chooseLocation(p)}><MapPin size={15} /><span>{p.name}<small>{formatCoordinates(p)}</small></span></button>)}</div>}
        <div className="city-presets">{PRESET_LOCATIONS.map(p => <button key={p.name} className={locationChosen && sameCoordinates(location, p) ? 'active' : ''} onClick={() => void chooseLocation(p)}>{p.name}</button>)}</div>
        <p className="modal-note">位置仅用于天气查询。切换位置会移除上一地区的天气；查询失败时不会换回其他城市。</p>
      </section>
    </div>}
    {resetOpen && <div className="modal-backdrop"><section className="reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title"><Sprout size={30} /><h2 id="reset-title">重置模拟农场？</h2><p>游戏金币、钻石、库存、地块、动物、工坊、订单、果园和日记将恢复初始状态。真实农场记录、问诊和位置设置单独保存。</p><div><button className="secondary-action" onClick={() => setResetOpen(false)}>继续耕耘</button><button className="primary-action" onClick={() => { setGame(initialGame()); setSelected(1); setSelectedPen(1); setDetailsOpen(false); setResetOpen(false); showNotice('新一季开始了，种下第一份期待。'); }}>重新开始</button></div></section></div>}
    {!portraitDismissed && <div className="rotate-overlay"><div>📱</div><h2>横过来，田野更宽阔</h2><p>这款游戏为横屏触控设计</p><button onClick={() => setPortraitDismissed(true)}>先用竖屏试玩</button></div>}
  </div>;
}
