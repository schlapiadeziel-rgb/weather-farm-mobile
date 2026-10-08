import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Sprout, CloudSun, MapPin, Droplets, Wind, Coins, Wheat, ChevronRight, X, LocateFixed, Search, RotateCcw, Info, CalendarDays, Check, RefreshCw, Sun, Leaf, BookOpen, Volume2, VolumeX, PawPrint } from 'lucide-react';
import { CROPS, LIVESTOCK, initialGame, plant, water, harvest, advanceDay, clearPlot, getAdvice, buyAnimal, feedAnimal, collectProduct, clearAnimal } from './lib/game';
import type { Game, CropId, AnimalId } from './lib/game';
import { fetchWeather, searchLocations, PRESET_LOCATIONS, weatherLabel, weatherEmoji } from './lib/weather';
import type { WeatherBundle, Location } from './lib/weather';

const SAVE_KEY = 'fieldletter.game.v1';
const WEATHER_KEY = 'fieldletter.weather.v1';
function readGame(): Game {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (saved?.version === 1 && ['coins', 'xp', 'harvests', 'waterUsed'].every(key => Number.isFinite(saved[key]) && saved[key] >= 0) && Number.isInteger(saved.day) && saved.day >= 1 && Array.isArray(saved.log) && saved.log.every((item: unknown) => typeof item === 'string') && Array.isArray(saved.plots) && saved.plots.length === 12 && saved.plots.every((p: Record<string, unknown>, i: number) => p.id === i + 1 && ['moisture', 'health', 'growth'].every(key => typeof p[key] === 'number' && Number.isFinite(p[key]) && Number(p[key]) >= 0 && Number(p[key]) <= 100) && (p.crop === null || CROPS.some(c => c.id === p.crop)))) {
      const validAnimals = Array.isArray(saved.animals) && saved.animals.length === 3 && saved.animals.every((p: Record<string, unknown>, i: number) => p.id === i + 1 && ['health', 'feed', 'progress'].every(key => typeof p[key] === 'number' && Number.isFinite(p[key]) && Number(p[key]) >= 0 && Number(p[key]) <= 100) && (p.animal === null || LIVESTOCK.some(a => a.id === p.animal)));
      return { ...saved, animals: validAnimals ? saved.animals : initialGame().animals, productsCollected: Number.isFinite(saved.productsCollected) && saved.productsCollected >= 0 ? saved.productsCollected : 0 };
    }
  } catch { /* Start a fresh local game when storage is unavailable. */ }
  return initialGame();
}
function readWeather(): WeatherBundle | null {
  try {
    const w = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null');
    const validDay = (day: Record<string, unknown>) => day && typeof day.date === 'string' && ['temp', 'minTemp', 'maxTemp', 'humidity', 'rain', 'rainChance', 'wind', 'et0', 'code'].every(key => typeof day[key] === 'number' && Number.isFinite(day[key]));
    return w && validDay(w.current) && Array.isArray(w.forecast) && w.forecast.length === 7 && w.forecast.every(validDay) && typeof w.location?.name === 'string' && Number.isFinite(w.location?.latitude) && Number.isFinite(w.location?.longitude) && typeof w.timezone === 'string' && Number.isFinite(Date.parse(w.fetchedAt)) ? w : null;
  } catch { return null; }
}
function shortDate(date: string) { return date.slice(5).replace('-', '/'); }
function Bar({ value, tone = 'green' }: { value: number; tone?: string }) { return <div className={`bar ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }

export default function App() {
  const [game, setGame] = useState<Game>(readGame);
  const [bundle, setBundle] = useState<WeatherBundle | null>(readWeather);
  const [location, setLocation] = useState<Location>(() => readWeather()?.location || PRESET_LOCATIONS[0]);
  const [tab, setTab] = useState<'farm' | 'livestock' | 'advice' | 'weather' | 'journal'>('farm');
  const [selected, setSelected] = useState(1);
  const [seed, setSeed] = useState<CropId>('radish');
  const [selectedPen, setSelectedPen] = useState(1);
  const [animalSeed, setAnimalSeed] = useState<AnimalId>('chicken');
  const [loading, setLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [notice, setNotice] = useState('点击地块开始照顾作物。成熟的萝卜可以直接收获。');
  const [locationOpen, setLocationOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [soil, setSoil] = useState('');
  const [sound, setSound] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const requestId = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const plot = game.plots.find(p => p.id === selected)!;
  const crop = CROPS.find(c => c.id === plot.crop);
  const pen = game.animals.find(p => p.id === selectedPen)!;
  const animal = LIVESTOCK.find(a => a.id === pen.animal);
  const selectedAnimal = LIVESTOCK.find(a => a.id === animalSeed)!;
  const selectedSeed = CROPS.find(c => c.id === seed)!;
  const activeWeather = bundle ? bundle.forecast[(game.day - 1) % bundle.forecast.length] : null;
  const stale = bundle ? Date.now() - new Date(bundle.fetchedAt).getTime() > 3600_000 : false;
  const observedSoil = soil.trim() !== '' && Number.isFinite(Number(soil)) && Number(soil) >= 0 && Number(soil) <= 100 ? Number(soil) : undefined;
  const advice = bundle ? getAdvice(game, observedSoil === undefined ? activeWeather! : bundle.current, observedSoil) : [];
  const showNotice = useCallback((message: string) => {
    setNotice(message); clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setNotice(''), 5200);
  }, []);
  const loadWeather = useCallback(async (place: Location) => {
    const id = ++requestId.current;
    setLoading(true); setWeatherError('');
    try {
      const next = await fetchWeather(place);
      if (id !== requestId.current) return;
      setBundle(next); setLocation(place);
      try { localStorage.setItem(WEATHER_KEY, JSON.stringify(next)); } catch { /* Weather remains in memory. */ }
    } catch (error) {
      if (id === requestId.current) setWeatherError(error instanceof Error ? error.message : '暂时无法连接天气服务，请重试。');
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void loadWeather(location); }, []); // Fetch once on app launch, refresh explicitly thereafter.
  useEffect(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { showNotice('存档暂时无法保存，当前游戏仍可继续。'); } }, [game, showNotice]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
      void StatusBar.hide().catch(() => {});
    }
    const welcomeTimer = setTimeout(() => setNotice(''), 5000);
    return () => { clearTimeout(timeout.current); clearTimeout(welcomeTimer); };
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
  function animalAct(action: 'buy' | 'feed' | 'collect' | 'clear') {
    try {
      const next = action === 'buy' ? buyAnimal(game, selectedPen, animalSeed) : action === 'feed' ? feedAnimal(game, selectedPen) : action === 'collect' ? collectProduct(game, selectedPen) : clearAnimal(game, selectedPen);
      setGame(next); feedback(); showNotice(next.log[0] || '畜舍已更新');
    } catch (error) { showNotice(error instanceof Error ? error.message : '操作未完成'); }
  }
  function act(action: 'plant' | 'water' | 'harvest' | 'clear' | 'advance') {
    try {
      let next: Game;
      if (action === 'plant') next = plant(game, selected, seed);
      else if (action === 'water') next = water(game, selected);
      else if (action === 'harvest') next = harvest(game, selected);
      else if (action === 'clear') next = clearPlot(game, selected);
      else { if (!activeWeather) throw new Error('连接真实天气后，才能推进游戏。'); next = advanceDay(game, activeWeather); }
      setGame(next); feedback(); showNotice(next.log[0] || '农场已更新');
    } catch (error) { showNotice(error instanceof Error ? error.message : '操作未完成'); }
  }
  async function chooseLocation(place: Location) { setLocationOpen(false); setQuery(''); setResults([]); await loadWeather(place); }
  async function locate() {
    setSearchError(''); setSearching(true);
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000 });
      await chooseLocation({ name: '我的位置', latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch { setSearchError('无法获取位置。请允许定位，或手动选择城市。'); }
    finally { setSearching(false); }
  }
  async function search() {
    if (query.trim().length < 2) { setSearchError('请输入至少两个字的城市名称。'); return; }
    setSearching(true); setSearchError('');
    try { const list = await searchLocations(query); setResults(list); if (!list.length) setSearchError('没有找到这个城市，试试英文名或附近城市。'); }
    catch (e) { setSearchError(e instanceof Error ? e.message : '城市搜索暂不可用。'); }
    finally { setSearching(false); }
  }

  return <div className="game-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><Sprout size={25} /></span><div><h1>田野来信</h1><span>WEATHER FARM</span></div></div>
      <button className="location-button" onClick={() => setLocationOpen(true)}><MapPin size={15} /><span>{location.name}</span><ChevronRight size={13} /></button>
      <div className="live-status"><span className={loading ? 'pulse-dot pending' : bundle ? 'pulse-dot' : 'pulse-dot error'} />{loading ? '连接天气中' : bundle ? stale || weatherError ? '上次天气' : '真实天气' : '天气未连接'}</div>
      <div className="top-weather"><CloudSun size={20} /><strong>{bundle ? `${Math.round(bundle.current.temp)}°` : '—'}</strong><span>{bundle ? weatherLabel(bundle.current.code) : '等待数据'}</span><i /><Droplets size={16} /><span>{bundle ? `${Math.round(bundle.current.humidity)}%` : '—'}</span><i /><Wind size={16} /><span>{bundle ? `${Math.round(bundle.current.wind)} km/h` : '—'}</span></div>
      <div className="wallet"><Coins size={20} /><strong>{game.coins}</strong><span>金币</span></div>
      <button className="icon-button sound-button" aria-label={sound ? '关闭音效' : '打开音效'} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
    </header>

    <div className="workspace">
      <nav className="rail" aria-label="游戏页面">
        {([{ id: 'farm', label: '种植', Icon: Sprout }, { id: 'livestock', label: '养殖', Icon: PawPrint }, { id: 'advice', label: '建议', Icon: Leaf }, { id: 'weather', label: '天气', Icon: CloudSun }, { id: 'journal', label: '日记', Icon: BookOpen }] as const).map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'rail-button active' : 'rail-button'} onClick={() => setTab(id)} aria-pressed={tab === id}><Icon size={23} /><span>{label}</span>{id === 'advice' && advice.some(a => a.severity === 'warning') && <b className="notification-dot" />}</button>)}
        <div className="rail-spacer" /><button className="rail-button reset-button" onClick={() => setResetOpen(true)}><RotateCcw size={19} /><span>重开</span></button>
      </nav>

      {tab === 'farm' ? <>
        <main className="farm-scene">
          <div className="farm-art" />
          <div className="scene-shade" />
          <div className="scene-top"><div className="day-pill"><Sun size={17} /><strong>第 {game.day} 天</strong><span>我的农场</span></div><div className="season-pill">{weatherEmoji(activeWeather?.code ?? 0)} {activeWeather ? `${shortDate(activeWeather.date)} 天气参考` : '连接天气后开始生长'}</div></div>
          <div className="field-wrap"><div className="plot-grid">{game.plots.map(p => {
            const c = CROPS.find(s => s.id === p.crop);
            const ready = p.growth >= 100 && p.health > 0;
            return <button key={p.id} className={`plot ${p.id === selected ? 'selected' : ''} ${c ? 'planted' : 'empty'} ${ready ? 'ripe' : ''} ${p.health <= 0 && c ? 'dead' : ''}`} onClick={() => { setSelected(p.id); feedback(); }} aria-label={`${p.id}号地块，${c ? `${c.name}，生长${Math.round(p.growth)}%，${ready ? '可以收获' : `土壤水分${Math.round(p.moisture)}%`}` : '空地，可种植'}`} aria-pressed={p.id === selected}>
              <span className="plot-number">{String(p.id).padStart(2, '0')}</span><span className="crop-sprite">{c ? p.health <= 0 ? '🥀' : p.growth < 30 ? '🌱' : p.growth < 65 ? '🌿' : c.emoji : '+'}</span>
              {c && <span className="plot-label">{ready ? '可收获' : c.name}</span>}{c && !ready && <span className="plot-growth"><i style={{ width: `${p.growth}%` }} /></span>}{ready && <span className="ready-mark"><Check size={11} /></span>}
            </button>;
          })}</div><span className="field-caption">轻触地块，照顾你的作物</span></div>
          <div className="farm-bottom"><div className="farm-level"><span className="level-emblem"><Wheat size={21} /></span><div><strong>Lv. {Math.floor(game.xp / 100) + 1} 新晋农场主</strong><Bar value={game.xp % 100} tone="gold" /><span>{game.xp % 100} / 100 经验</span></div></div><button className="advance-button" disabled={!activeWeather || loading} onClick={() => act('advance')}><Sun size={20} /><span>度过一天</span><ChevronRight size={18} /></button></div>
          {notice && <div className="toast" role="status"><Sprout size={16} />{notice}</div>}
        </main>
        <aside className="plot-panel">
          <div className="panel-body"><div className="panel-heading"><span>地块 {String(selected).padStart(2, '0')}</span><span className="soil-chip">{crop ? plot.health <= 0 ? '已枯萎' : plot.growth >= 100 ? '待收获' : '生长中' : '待种植'}</span></div>
          {crop ? <><div className="crop-profile"><div className="crop-avatar">{crop.emoji}</div><div><h2>{crop.name}</h2><p>{plot.health <= 0 ? '清理地块，开始新的种植' : plot.growth >= 100 ? '丰收就在此刻' : `约 ${crop.days} 个游戏天成熟`}</p></div></div><div className="stat-row"><span>生长进度</span><strong>{Math.round(plot.growth)}%</strong></div><Bar value={plot.growth} /><div className="stat-row"><span>作物健康</span><strong>{Math.round(plot.health)}%</strong></div><Bar value={plot.health} tone={plot.health < 40 ? 'red' : 'green'} /></> : <><div className="empty-plot"><Sprout size={28} /><div><h2>种下新的期待</h2><p>挑选一种作物开始种植</p></div></div><div className="seed-grid">{CROPS.map(c => <button key={c.id} className={seed === c.id ? 'seed-card active' : 'seed-card'} onClick={() => setSeed(c.id)} aria-pressed={seed === c.id}><span>{c.emoji}</span><strong>{c.name}</strong><small>{c.cost} 金币 · {c.days} 天</small></button>)}</div></>}
          <div className="moisture-block"><div className="stat-row"><span><Droplets size={14} />模拟土壤水分</span><strong>{Math.round(plot.moisture)}%</strong></div><Bar value={plot.moisture} tone="blue" /><p>{plot.moisture < (crop?.minMoisture ?? 30) ? '土壤偏干，留意补水' : plot.moisture > (crop?.maxMoisture ?? 85) ? '土壤偏湿，暂缓浇水' : '水分适中'}</p></div>
          </div>
          {crop ? <div className="actions"><button className="primary-action" onClick={() => act(plot.health <= 0 ? 'clear' : plot.growth >= 100 ? 'harvest' : 'water')}>{plot.health <= 0 ? <RotateCcw size={18} /> : plot.growth >= 100 ? <Wheat size={19} /> : <Droplets size={19} />}{plot.health <= 0 ? '清理地块' : plot.growth >= 100 ? `收获 · +${Math.round(crop.value * (0.5 + plot.health / 200))} 金币` : '浇水'}</button>{plot.growth >= 100 && plot.health > 0 && <button className="secondary-action" onClick={() => act('water')} aria-label="浇水"><Droplets size={18} /></button>}</div> : <button className="primary-action" onClick={() => act('plant')} disabled={game.coins < selectedSeed.cost}><Sprout size={19} />种植{selectedSeed.name}<span>−{selectedSeed.cost}</span></button>}
          <div className="tiny-note">游戏进度自动保存在这台设备</div>
        </aside>
      </> : tab === 'livestock' ? <>
        <main className="farm-scene livestock-scene">
          <div className="farm-art" /><div className="scene-shade" />
          <div className="scene-top"><div className="day-pill"><PawPrint size={17} /><strong>第 {game.day} 天</strong><span>我的牧场</span></div><div className="season-pill">{weatherEmoji(activeWeather?.code ?? 0)} {activeWeather ? `${shortDate(activeWeather.date)} 天气参考` : '连接天气后开始养殖'}</div></div>
          <div className="livestock-field"><div className="pen-grid">{game.animals.map(p => {
            const a = LIVESTOCK.find(v => v.id === p.animal);
            const ready = p.progress >= 100 && p.health > 0;
            return <button key={p.id} className={`animal-pen ${p.id === selectedPen ? 'selected' : ''} ${a ? 'occupied' : ''}`} onClick={() => { setSelectedPen(p.id); feedback(); }} aria-pressed={p.id === selectedPen} aria-label={`${p.id}号畜舍，${a ? `${a.name}，${ready ? `${a.product}可收集` : `饱食度${Math.round(p.feed)}%`}` : '空畜舍，可购买动物'}`}>
              <span className="pen-label">畜舍 {String(p.id).padStart(2, '0')}</span><span className="animal-sprite">{a ? p.health <= 0 ? '🪦' : a.emoji : '+'}</span><strong>{a ? a.name : '等待新伙伴'}</strong><span className="animal-product">{a ? ready ? `${a.productEmoji} ${a.product}可收集` : `产出 ${Math.round(p.progress)}%` : '点击选择动物'}</span>{ready && <span className="ready-mark"><Check size={13} /></span>}
            </button>;
          })}</div><span className="field-caption">照顾动物，收集每一天的馈赠</span></div>
          <div className="farm-bottom"><div className="farm-level"><span className="level-emblem"><PawPrint size={21} /></span><div><strong>已收集 {game.productsCollected} 份产物</strong><span>喂养与天气影响游戏产出</span></div></div><button className="advance-button" disabled={!activeWeather || loading} onClick={() => act('advance')}><Sun size={20} /><span>度过一天</span><ChevronRight size={18} /></button></div>
          {notice && <div className="toast" role="status"><PawPrint size={16} />{notice}</div>}
        </main>
        <aside className="plot-panel">
          <div className="panel-body"><div className="panel-heading"><span>畜舍 {String(selectedPen).padStart(2, '0')}</span><span className="soil-chip">{animal ? pen.health <= 0 ? '已死亡' : pen.progress >= 100 ? '待收集' : '养殖中' : '空畜舍'}</span></div>
          {animal ? <><div className="crop-profile"><div className="crop-avatar">{animal.emoji}</div><div><h2>{animal.name}</h2><p>{animal.productEmoji} 每 {animal.productionDays} 个游戏天产出{animal.product}</p></div></div><div className="stat-row"><span>{animal.product}产出</span><strong>{Math.round(pen.progress)}%</strong></div><Bar value={pen.progress} tone="gold" /><div className="stat-row"><span>健康状态</span><strong>{Math.round(pen.health)}%</strong></div><Bar value={pen.health} tone={pen.health < 40 ? 'red' : 'green'} /><div className="moisture-block"><div className="stat-row"><span><Leaf size={14} />饱食度</span><strong>{Math.round(pen.feed)}%</strong></div><Bar value={pen.feed} /><p>{pen.feed < 35 ? '有点饿了，记得补充饲料' : '饲料充足，安心成长'}</p></div><p className="livestock-tip">{activeWeather && activeWeather.maxTemp > 30 ? '天气偏热，现实养殖需检查通风与饮水。' : '保持畜舍清洁，定期检查饮水和动物状态。'}</p></> : <><div className="empty-plot"><PawPrint size={26} /><div><h2>迎接新的伙伴</h2><p>购买动物，开启养殖</p></div></div><div className="animal-options">{LIVESTOCK.map(a => <button key={a.id} className={animalSeed === a.id ? 'animal-option active' : 'animal-option'} aria-pressed={animalSeed === a.id} onClick={() => setAnimalSeed(a.id)}><span>{a.emoji}</span><div><strong>{a.name}</strong><small>{a.productEmoji} {a.product} · {a.productionDays} 天</small></div><b>{a.cost}<Coins size={12} /></b></button>)}</div></>}
          </div>
          {animal ? <div className="animal-actions">{pen.health <= 0 ? <button className="primary-action" onClick={() => animalAct('clear')}><RotateCcw size={17} />清理畜舍</button> : <>{pen.progress >= 100 && <button className="primary-action" onClick={() => animalAct('collect')}><Wheat size={17} />收集{animal.product} · +{Math.round(animal.productValue * (.5 + pen.health / 200))}</button>}<button className={pen.progress >= 100 ? 'secondary-action feed-button' : 'primary-action feed-button'} onClick={() => animalAct('feed')} disabled={game.coins < animal.feedCost}><Leaf size={17} />喂养 · {animal.feedCost} 金币</button></>}</div> : <button className="primary-action" onClick={() => animalAct('buy')} disabled={game.coins < selectedAnimal.cost}><PawPrint size={18} />购买{selectedAnimal.name}<span>−{selectedAnimal.cost}</span></button>}
          <div className="tiny-note">动物状态与产出为游戏模拟</div>
        </aside>
      </> : <main className="content-view">
        <div className="view-heading"><div><span className="eyebrow">{tab === 'advice' ? 'FARM ADVISOR' : tab === 'weather' ? 'WEATHER STATION' : 'FARM JOURNAL'}</span><h2>{tab === 'advice' ? '读懂天气，照顾田地' : tab === 'weather' ? '农场天气站' : '每一份耕耘，都有回响'}</h2></div>{tab !== 'journal' && <button className="refresh-button" onClick={() => void loadWeather(location)} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />刷新天气</button>}</div>
        {weatherError && <div className="error-banner" role="alert">{weatherError}{bundle && ' 当前显示上次成功获取的数据。'}</div>}
        {tab === 'advice' && <div className="advice-layout"><section className="advice-list">{advice.length ? advice.map(a => <article key={a.id} className={`advice-card ${a.severity}`}><span className="advice-symbol">{a.severity === 'warning' ? <Info size={21} /> : a.severity === 'good' ? <Check size={21} /> : <Leaf size={21} />}</span><div><h3>{a.title}</h3><p>{a.detail}</p>{a.action === 'water' && a.plotIds?.length && <button className="text-action" onClick={() => { setSelected(a.plotIds![0]); setTab('farm'); }}>查看需要补水的地块<ChevronRight size={14} /></button>}</div></article>) : <div className="empty-weather"><CloudSun size={40} /><h3>等一封天气来信</h3><p>{loading ? '正在获取真实天气…' : '连接天气服务后，这里会显示农事参考。'}</p><button className="primary-action" onClick={() => void loadWeather(location)} disabled={loading}>重新连接</button></div>}</section><aside className="advice-context"><span className="context-icon"><Droplets size={23} /></span><h3>补充田间记录</h3><p>填写后，农事提示使用当前天气并展示你的记录。留空时显示游戏地块提示。</p><label htmlFor="soil">实测土壤含水率</label><div className="soil-input"><input id="soil" type="number" min="0" max="100" step="1" placeholder="未填写" value={soil} onChange={e => setSoil(e.target.value)} /><span>%</span></div>{soil !== '' && observedSoil === undefined && <p className="validation-error">请输入 0–100 之间的数值</p>}<div className="source-note"><Info size={15} /><p>天气为区域气象数据，非田间传感器。建议来自简化规则，实际农事需结合土壤、作物品种和当地农技指导。</p></div></aside></div>}
        {tab === 'weather' && <><div className="weather-stats"><article><span>当前气温</span><strong>{bundle ? Math.round(bundle.current.temp) : '—'}<small>°C</small></strong><Sun size={28} /></article><article><span>空气湿度</span><strong>{bundle ? Math.round(bundle.current.humidity) : '—'}<small>%</small></strong><Droplets size={28} /></article><article><span>当前风速</span><strong>{bundle ? Math.round(bundle.current.wind) : '—'}<small>km/h</small></strong><Wind size={28} /></article><article><span>今日降水预报</span><strong>{bundle ? bundle.forecast[0].rain.toFixed(1) : '—'}<small>mm</small></strong><CloudSun size={28} /></article></div><div className="forecast-heading"><h3>未来 7 天天气</h3><span>日最低 / 最高气温</span></div><div className="forecast-grid">{bundle?.forecast.map((w, i) => <article key={w.date} className={i === 0 ? 'forecast-day today' : 'forecast-day'}><span>{i === 0 ? '今天' : i === 1 ? '明天' : shortDate(w.date)}</span><b>{weatherEmoji(w.code)}</b><strong>{Math.round(w.minTemp)}° / {Math.round(w.maxTemp)}°</strong><small>{weatherLabel(w.code)}</small><span className="rain-value"><Droplets size={12} />{Math.round(w.rainChance)}%</span></article>)}</div><p className="weather-attribution">数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · {bundle ? `更新于 ${new Date(bundle.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · ${bundle.timezone}` : '尚未连接'}。预报会随气象条件变化。</p></>}
        {tab === 'journal' && <><div className="journal-stats"><article><Wheat size={26} /><strong>{game.harvests}</strong><span>农作物收获</span></article><article><CalendarDays size={26} /><strong>{game.day}</strong><span>农场天数</span></article><article><PawPrint size={26} /><strong>{game.productsCollected}</strong><span>养殖产物</span></article><article><Sprout size={26} /><strong>{game.xp}</strong><span>累计经验</span></article></div><div className="journal-list">{game.log.map((line, i) => <div key={`${game.day}-${i}`}><span className="journal-dot" /><p>{line}</p>{i === 0 && <span className="new-label">最新</span>}</div>)}</div><p className="journal-footnote">游戏天数为加速模拟。天气参考会按 7 日预报循环，不代表实际种植周期。</p></>}
        {notice && <div className="content-toast" role="status">{notice}</div>}
      </main>}
    </div>
    <footer className="statusbar"><span><Leaf size={13} />真实天气驱动 · 种植与养殖为游戏模拟</span><span>{activeWeather ? `参考 ${shortDate(activeWeather.date)} · ${Math.round(activeWeather.minTemp)}–${Math.round(activeWeather.maxTemp)}°C · 降雨 ${activeWeather.rain.toFixed(1)} mm` : weatherError || '正在连接 Open-Meteo…'}</span><button onClick={() => setTab('advice')}>农事参考<ChevronRight size={12} /></button></footer>

    {locationOpen && <div className="modal-backdrop" onClick={() => setLocationOpen(false)}><section className="location-modal" role="dialog" aria-modal="true" aria-labelledby="location-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">FIND YOUR FARM</span><h2 id="location-title">农场在哪里？</h2></div><button className="icon-button" aria-label="关闭城市选择" onClick={() => setLocationOpen(false)}><X size={21} /></button></div><form className="location-search" onSubmit={e => { e.preventDefault(); void search(); }}><Search size={18} /><input autoFocus aria-label="搜索城市" value={query} onChange={e => setQuery(e.target.value)} placeholder="输入城市，例如杭州 / London" /><button disabled={searching} type="submit">{searching ? '查找中' : '搜索'}</button></form>{searchError && <p className="validation-error" role="alert">{searchError}</p>}{results.length > 0 && <div className="search-results">{results.map(p => <button key={`${p.latitude},${p.longitude}`} onClick={() => void chooseLocation(p)}><MapPin size={15} />{p.name}</button>)}</div>}<div className="city-presets">{PRESET_LOCATIONS.map(p => <button key={p.name} className={location.name === p.name ? 'active' : ''} onClick={() => void chooseLocation(p)}>{p.name}</button>)}</div><button className="locate-button" onClick={() => void locate()} disabled={searching}><LocateFixed size={17} />使用手机当前位置</button><p className="modal-note">位置仅用于天气查询。农场存档保存在本机。</p></section></div>}
    {resetOpen && <div className="modal-backdrop"><section className="reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title"><Sprout size={30} /><h2 id="reset-title">重新开始这座农场？</h2><p>这台设备上的金币、地块和种植记录将恢复初始状态。天气位置会保留。</p><div><button className="secondary-action" onClick={() => setResetOpen(false)}>继续耕耘</button><button className="primary-action" onClick={() => { setGame(initialGame()); setSelected(1); setResetOpen(false); showNotice('新一季开始了，种下第一份期待。'); }}>重新开始</button></div></section></div>}
    {!portraitDismissed && <div className="rotate-overlay"><div>📱</div><h2>横过来，田野更宽阔</h2><p>这款游戏为横屏触控设计</p><button onClick={() => setPortraitDismissed(true)}>先用竖屏试玩</button></div>}
  </div>;
}
