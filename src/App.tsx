import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import { Sprout, CloudSun, MapPin, Droplets, Wind, Coins, Wheat, ChevronRight, X, LocateFixed, Search, RotateCcw, CalendarDays, Check, RefreshCw, Sun, Leaf, BookOpen, Volume2, VolumeX, PawPrint, Building2, ArrowLeft, Flag, Factory, ClipboardList, Warehouse, Compass, Diamond, Lock, Timer, Download, CircleHelp, Cpu, Newspaper, ChartNoAxesCombined } from 'lucide-react';
import { CROPS, LIVESTOCK, initialGame, tickGame, getLevel, plant, harvest, buyAnimal, feedAnimal, collectProduct, buildPen } from './lib/game';
import type { Game, CropId, AnimalId, ItemId, MachineId } from './lib/game';
import { fetchWeather, searchLocations, PRESET_LOCATIONS, weatherLabel, weatherEmoji } from './lib/weather';
import type { WeatherBundle, Location } from './lib/weather';
import { validDate, validTimestamp } from './lib/publicDataHttp';
import { CropVisual, AnimalVisual } from './components/FarmVisual';
import FarmLandscape from './components/FarmLandscape';
import FarmViewport from './components/FarmViewport';
import FieldInteraction from './components/FieldInteraction';
import FieldTools from './components/FieldTools';
import AnimalInteraction from './components/AnimalInteraction';
import AnimalTools from './components/AnimalTools';
import AnimalActionFeedback from './components/AnimalActionFeedback';
import GemConfirmation from './components/GemConfirmation';
import { prepareGameSpeedUp, readGameSpeedQuote, confirmGameSpeedUp } from './lib/gameSpeedUp';
import type { GameSpeedRequest, SpeedUpKind } from './lib/gameSpeedUp';
import type { AnimalMode } from './lib/animalStroke';
import FarmGuide from './components/FarmGuide';
import FarmActivityBoard from './components/FarmActivityBoard';
import GameBackupControls from './components/GameBackupControls';
import UpdatePanel from './components/UpdatePanel';
import FarmTown from './components/FarmTown';
import FarmAssistantPortal from './components/FarmAssistantPortal';
import ProductionPanel from './components/ProductionPanel';
import { OrdersPanel, StoragePanel, ExplorationPanel } from './components/EconomyPanels';
import { getItem, RECIPES } from './lib/farmContent';
import { getFarmActivity } from './lib/farmActivity';
import type { FarmActivityTarget } from './lib/farmActivity';
import { readSelectedLocation, saveSelectedLocation, locationFromPosition, parseManualLocation, formatCoordinates } from './lib/location';
import { getDevicePosition, cancelDevicePosition } from './lib/deviceLocation';
import { readGameSave, writeGameSave, exportGameBackup } from './lib/gameSave';
import { checkForUpdate } from './lib/appUpdate';
import type { AppUpdate } from './lib/appUpdate';
import type { FieldMode } from './lib/fieldStroke';

const FarmDashboard = lazy(() => import('./components/FarmDashboard'));
const DiagnosticPanel = lazy(() => import('./components/DiagnosticPanel'));
const NewsPanel = lazy(() => import('./components/NewsPanel'));
const MarketPanel = lazy(() => import('./components/MarketPanel'));
const FieldAdvicePanel = lazy(() => import('./components/FieldAdvicePanel'));

type PlayTab = 'farm' | 'livestock' | 'production' | 'orders' | 'storage' | 'explore' | 'journal' | 'town';
type Tab = 'assistant' | 'home' | 'clinic' | 'news' | 'market' | 'advice' | 'weather' | PlayTab;
const PLAY_TABS: readonly Tab[] = ['farm', 'livestock', 'production', 'orders', 'storage', 'explore', 'journal', 'town'];
function sameCoordinates(a: Location, b: Location) { return a.latitude === b.latitude && a.longitude === b.longitude; }

const WEATHER_KEY = 'fieldletter.weather.v1';
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
  const [startup] = useState(readGameSave);
  const [game, setGame] = useState<Game>(startup.game);
  const [location, setLocation] = useState<Location>(() => readSelectedLocation() || PRESET_LOCATIONS[0]);
  const [locationChosen, setLocationChosen] = useState(() => !!readSelectedLocation());
  const [bundle, setBundle] = useState<WeatherBundle | null>(() => { const cached = readWeather(); return cached && sameCoordinates(cached.location, location) ? cached : null; });
  const [tab, setTab] = useState<Tab>('farm');
  const [clinicVisited, setClinicVisited] = useState(false);
  const [lastPlayTab, setLastPlayTab] = useState<PlayTab>('farm');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState(1);
  const [seed, setSeed] = useState<CropId>('wheat');
  const [fieldMode, setFieldMode] = useState<FieldMode>('browse');
  const [animalMode, setAnimalMode] = useState<AnimalMode>('browse');
  const [penFeedback, setPenFeedback] = useState<Record<number, { key: number; action: 'feed' | 'collect'; product?: string }>>({});
  const penFeedbackSerial = useRef(0);
  const [speedRequest, setSpeedRequest] = useState<GameSpeedRequest | null>(null);
  const speedRequestRef = useRef<GameSpeedRequest | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [productionFocus, setProductionFocus] = useState<{ machineId?: MachineId; item?: ItemId; requestId: number }>();
  const [storageView, setStorageView] = useState<{ section: 'inventory' | 'supplies' | 'roadside' | 'upgrade'; requestId: number }>({ section: 'inventory', requestId: 0 });
  const [exploreView, setExploreView] = useState<{ section: 'orchard' | 'fishing' | 'mine' | 'honey' | 'achievements'; requestId: number }>({ section: 'orchard', requestId: 0 });
  const [orderView, setOrderView] = useState<{ kind: 'truck' | 'boat'; requestId: number }>({ kind: 'truck', requestId: 0 });
  const navigationRequest = useRef(0);
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
  const [updateOpen, setUpdateOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdate | null>(null);
  const [exportingGame, setExportingGame] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const requestId = useRef(0);
  const weatherAttemptAt = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;
  const saveWarning = useRef(false);
  const backupBusy = useRef(false);
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
  const speedQuote = speedRequest ? readGameSpeedQuote(game, speedRequest, clock) : null;
  const serviceWeather = locationChosen ? bundle : null;
  const serviceWeatherError = locationChosen ? weatherError : '先设置真实农场位置，再获取当地天气与农事提醒。';
  const activity = getFarmActivity(game, clock);
  const readyCounts = Object.fromEntries(activity.sections.map(section => [section.id, section.count]));
  const readyTotal = activity.sections.reduce((sum, section) => sum + section.count, 0);
  function navigate(next: Tab) {
    if (PLAY_TABS.includes(next) !== simulation) { clearTimeout(timeout.current); setNotice(''); }
    if (locationOpen || locating || searching) closeLocation();
    setGuideOpen(false); setResetOpen(false);
    if (next === 'clinic') setClinicVisited(true);
    if (PLAY_TABS.includes(next)) { setLastPlayTab(next as PlayTab); if (next !== tab) setDetailsOpen(false); }
    setTab(next); setActivityOpen(false); setFieldMode('browse'); setAnimalMode('browse'); setPenFeedback({}); closeSpeedRequest();
  }
  function openGuide() { setAnimalMode('browse'); closeSpeedRequest(); setFieldMode('browse'); setDetailsOpen(false); setGuideOpen(true); }
  function openActivity() { setAnimalMode('browse'); closeSpeedRequest(); setFieldMode('browse'); setDetailsOpen(false); setActivityOpen(true); }
  function focusProduction(focus: { machineId?: MachineId; item?: ItemId }) { setProductionFocus({ ...focus, requestId: ++navigationRequest.current }); navigate('production'); }
  function visitActivity(target: FarmActivityTarget) {
    if (target.tab === 'farm') { navigate('farm'); setSelected(target.plotId); setDetailsOpen(true); }
    else if (target.tab === 'livestock') { navigate('livestock'); setSelectedPen(target.penId); setDetailsOpen(true); }
    else if (target.tab === 'production') focusProduction({ machineId: target.machineId });
    else if (target.tab === 'orders') { setOrderView({ kind: target.kind, requestId: ++navigationRequest.current }); navigate('orders'); }
    else { setStorageView({ section: target.section, requestId: ++navigationRequest.current }); navigate('storage'); }
  }
  function requestItem(id: ItemId) {
    const item = getItem(id), recipe = RECIPES.find(entry => entry.output === id);
    if (recipe) { focusProduction({ item: id }); return; }
    if (item.category === 'crop') {
      const plots = game.plots.slice(0, game.unlockedPlots);
      navigate('farm'); setSeed(id as CropId); setSelected((plots.find(plot => plot.crop === id) ?? plots.find(plot => !plot.crop) ?? plots[0]).id); setDetailsOpen(true); return;
    }
    const sourceAnimal = LIVESTOCK.find(entry => entry.product === id);
    if (sourceAnimal) {
      navigate('livestock'); setAnimalSeed(sourceAnimal.id); setSelectedPen((game.animals.find(pen => pen.animal === sourceAnimal.id) ?? game.animals.find(pen => !pen.animal) ?? game.animals[0]).id); setDetailsOpen(true); return;
    }
    const section = id === 'honey' ? 'honey' : item.category === 'fruit' ? 'orchard' : item.category === 'fish' ? 'fishing' : ['coal', 'iron_ore', 'gold_ore'].includes(id) ? 'mine' : null;
    if (section) { setExploreView({ section, requestId: ++navigationRequest.current }); navigate('explore'); }
    else { setStorageView({ section: 'inventory', requestId: ++navigationRequest.current }); navigate('storage'); }
  }
  function chooseFieldMode(mode: FieldMode) { setFieldMode(mode); if (mode !== 'browse') setDetailsOpen(false); }
  const activeFieldMode = guideOpen || activityOpen || updateOpen || locationOpen || resetOpen ? 'browse' : fieldMode;
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
    weatherAttemptAt.current = Date.now();
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
  useEffect(() => {
    if (simulation || !locationChosen) return;
    const now = Date.now();
    const due = !bundle || now - Date.parse(bundle.fetchedAt) >= 900000 || Date.parse(bundle.fetchedAt) > now + 300000;
    if (!loading && due) void loadWeather(location);
  }, [simulation, locationChosen, location, loadWeather]);
  useEffect(() => {
    const advance = () => { if (document.visibilityState === 'visible') { const now = Date.now(); setClock(now); setGame(previous => tickGame(previous, now)); } };
    const timer = setInterval(advance, 1000);
    document.addEventListener('visibilitychange', advance);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', advance); };
  }, []);
  useEffect(() => {
    if (simulation || !locationChosen) return;
    const refresh = () => {
      const now = Date.now(); setClock(now);
      const due = bundle ? now - Date.parse(bundle.fetchedAt) >= 900000 : now - weatherAttemptAt.current >= 60000;
      if (document.visibilityState === 'visible' && !loading && due) void loadWeather(location);
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [bundle, loading, location, loadWeather, simulation, locationChosen]);
  const saveCurrentGame = useCallback((next = gameRef.current) => {
    const saved = writeGameSave(next);
    if (!saved && !saveWarning.current) showNotice('本机存档暂时无法保存，请在农场日记导出游戏备份。');
    saveWarning.current = !saved;
    return saved;
  }, [showNotice]);
  useEffect(() => {
    if (startup.warning) showNotice(startup.warning);
    saveCurrentGame();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') saveCurrentGame(); }, 15000);
    const flush = () => { saveCurrentGame(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { clearInterval(timer); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); saveCurrentGame(); };
  }, [startup, saveCurrentGame, showNotice]);
  useEffect(() => {
    const controller = new AbortController();
    void checkForUpdate({ signal: controller.signal }).then(setAvailableUpdate).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      void ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
      void StatusBar.hide().catch(() => {});
    }
    return () => { clearTimeout(timeout.current); ++requestId.current; ++locationAttempt.current; ++searchAttempt.current; void cancelDevicePosition().catch(() => {}); };
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
  function commitGame(next: Game) { gameRef.current = next; setGame(next); feedback(); const saved = saveCurrentGame(next), message = next.log[0] || '农场已更新'; showNotice(saved ? message : `${message}本机未能保存，请在农场日记导出游戏备份。`); return saved; }
  async function backupGame() {
    if (backupBusy.current) return;
    backupBusy.current = true; setExportingGame(true);
    try {
      const result = await exportGameBackup(gameRef.current);
      showNotice(result.shared ? '已打开游戏备份分享，请在目标应用确认保存。真实记录需另行备份。' : '已下载游戏备份，请保管好 JSON 文件。');
    } catch (error) { showNotice(error instanceof Error ? error.message : '游戏备份导出失败，请重试。'); }
    finally { backupBusy.current = false; setExportingGame(false); }
  }
  function closeSpeedRequest() { speedRequestRef.current = null; setSpeedRequest(null); }
  function requestSpeed(kind: SpeedUpKind, target: number) {
    try {
      const request = prepareGameSpeedUp(gameRef.current, kind, target);
      speedRequestRef.current = request; setSpeedRequest(request);
    } catch (error) { showNotice(error instanceof Error ? error.message : '暂时不能加速。'); }
  }
  function confirmSpeed(approvedCost: number) {
    const request = speedRequestRef.current;
    if (!request) return;
    closeSpeedRequest();
    try { commitGame(confirmGameSpeedUp(gameRef.current, request, approvedCost)); }
    catch (error) { showNotice(error instanceof Error ? error.message : '本次加速未完成。'); }
  }
  function showPenFeedback(ids: number[], action: 'feed' | 'collect') {
    const next: typeof penFeedback = {};
    for (const id of ids) {
      const pen = gameRef.current.animals.find(item => item.id === id);
      next[id] = { key: ++penFeedbackSerial.current, action, product: LIVESTOCK.find(item => item.id === pen?.animal)?.productName };
    }
    setPenFeedback(previous => ({ ...previous, ...next }));
  }
  function chooseAnimalMode(mode: AnimalMode) { setAnimalMode(mode); setDetailsOpen(false); }
  function animalAct(action: 'buy' | 'feed' | 'collect' | 'speed', target = selectedPen) {
    if (action === 'speed') { requestSpeed('animal', target); return; }
    try {
      const latest = gameRef.current;
      const next = action === 'buy' ? buyAnimal(latest, target, animalSeed) : action === 'feed' ? feedAnimal(latest, target) : collectProduct(latest, target);
      commitGame(next);
      if (action !== 'buy') showPenFeedback([target], action);
      if (action === 'collect') { setSelectedPen(target); setDetailsOpen(true); }
    } catch (error) { showNotice(error instanceof Error ? error.message : '操作未完成'); }
  }
  function act(action: 'plant' | 'harvest' | 'speed', target = selected) {
    if (action === 'speed') { requestSpeed('crop', target); return; }
    try { commitGame(action === 'plant' ? plant(gameRef.current, target, seed) : harvest(gameRef.current, target)); }
    catch (error) { showNotice(error instanceof Error ? error.message : '操作未完成'); }
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

  return <div className={`game-shell ${simulation ? 'game-mode' : 'assistant-shell'}`}>
    <header className={`topbar ${simulation ? 'game-topbar' : 'assistant-topbar'}`}>
      <div className="brand"><span className="brand-icon"><Sprout size={26} /></span><div><h1>{simulation ? '田野来信' : '农场助手'}</h1><span>{simulation ? 'WEATHER FARM' : 'REAL FARM SERVICES'}</span></div></div>
      {!simulation && <><button className="location-button" onClick={() => { setSearchError(''); setLocationOpen(true); }} aria-label={`设置农场位置：${locationChosen ? location.name : '尚未设置'}`}><MapPin size={15} /><span>{locationChosen ? location.name : '设置农场位置'}</span><ChevronRight size={13} /></button><div className="live-status"><span className={loading ? 'pulse-dot pending' : bundle && locationChosen ? 'pulse-dot' : 'pulse-dot error'} />{loading ? '连接天气中' : !locationChosen ? '请选择真实位置' : bundle ? stale || weatherError ? '上次天气' : '区域天气' : '天气未连接'}</div></>}
      {simulation && <><div className="wallet"><Coins size={20} /><strong>{game.coins}</strong><span>金币</span><Diamond size={17} /><strong>{game.gems}</strong><span>钻石</span></div><button className="icon-button" aria-label="打开谷仓与筒仓" onClick={() => navigate('storage')}><Warehouse size={21} /></button><button className="icon-button activity-button" aria-label="打开农场看板" aria-haspopup="dialog" onClick={openActivity}><BookOpen size={19} />{readyTotal > 0 && <span className="activity-dot" />}</button></>}
      <button className={`icon-button update-button ${availableUpdate ? 'has-update' : ''}`} aria-label={availableUpdate ? '应用更新：发现新版本' : '应用更新'} aria-haspopup="dialog" onClick={() => setUpdateOpen(true)}><Download size={19} />{availableUpdate && <span className="update-dot" />}</button>
      {simulation && <button className="icon-button sound-button" aria-label={sound ? '关闭音效' : '打开音效'} onClick={() => setSound(!sound)}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>}
      <button className="app-mode-switch" aria-label={simulation ? '进入农场助手' : '返回农场游戏'} onClick={() => navigate(simulation ? 'assistant' : lastPlayTab)}>{simulation ? <Leaf size={18} /> : <ArrowLeft size={18} />}<span>{simulation ? '农场助手' : '返回游戏'}</span></button>
    </header>

    <div className={`workspace ${simulation ? 'play-workspace' : 'town-service-workspace'}`}>
      {simulation ? <nav className="rail game-rail" aria-label="农场游戏地图">
        {([{ id: 'farm', label: '农田', Icon: Sprout }, { id: 'livestock', label: '牧场', Icon: PawPrint }, { id: 'production', label: '工坊', Icon: Factory }, { id: 'orders', label: '订单', Icon: ClipboardList }, { id: 'explore', label: '探索', Icon: Compass }] as const).map(({ id, label, Icon }) => <button key={id} className={tab === id ? 'rail-button active' : 'rail-button'} onClick={() => navigate(id)} aria-pressed={tab === id} aria-label={label} aria-describedby={readyCounts[id] ? `ready-count-${id}` : undefined}><Icon size={22} /><span>{label}</span>{!!readyCounts[id] && <span className="rail-ready-count" id={`ready-count-${id}`} aria-label={`已就绪 ${readyCounts[id]} ${id === 'production' ? '批' : id === 'farm' ? '块' : id === 'livestock' ? '栏' : '份'}`}>{readyCounts[id] > 99 ? '99+' : readyCounts[id]}</span>}</button>)}
        <button className={`rail-button town-map-button ${tab === 'town' ? 'active' : ''}`} aria-label="进入农场小镇" aria-pressed={tab === 'town'} onClick={() => navigate('town')}><Building2 size={23} /><span>小镇</span></button>
        <div className="rail-spacer" /><button className="rail-button reset-button" aria-label="重置模拟农场" onClick={() => setResetOpen(true)}><RotateCcw size={19} /><span>重开</span></button>
      </nav> : <nav className="rail assistant-rail" aria-label="真实农场服务导航">{([{ id: 'assistant', label: '首页', Icon: Building2 }, { id: 'home', label: '工作台', Icon: ClipboardList }, { id: 'weather', label: '天气', Icon: CloudSun }, { id: 'clinic', label: 'AI诊所', Icon: Cpu }, { id: 'news', label: '资讯', Icon: Newspaper }, { id: 'market', label: '市场', Icon: ChartNoAxesCombined }, { id: 'advice', label: '农事', Icon: Leaf }] as const).map(({ id, label, Icon }) => <button key={id} className={`rail-button ${tab === id ? 'active' : ''}`} aria-label={label} aria-pressed={tab === id} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>}


      <Suspense fallback={<main className="content-view service-loading" role="status"><span className="brand-icon"><Building2 size={26} /></span><h2>{simulation ? '正在准备农场…' : '正在打开农场助手…'}</h2><p>{simulation ? '继续今天的经营。' : '真实现场资料独立保存。'}</p></main>}>
      {tab === 'assistant' ? <FarmAssistantPortal weather={serviceWeather} loading={loading} weatherError={weatherError || (stale ? '天气数据已过时，请刷新后核对。' : '')} locationName={location.name} locationChosen={locationChosen} onNavigate={navigate} onChooseLocation={() => { setSearchError(''); setLocationOpen(true); }} /> : tab === 'town' ? <FarmTown game={game} now={clock} onChange={commitGame} notify={showNotice} onRequestItem={requestItem} onNavigate={navigate} /> : tab === 'home' ? <FarmDashboard weather={serviceWeather} loading={loading} weatherError={serviceWeatherError} refresh={() => locationChosen ? void loadWeather(location) : setLocationOpen(true)} navigate={navigate} /> : tab === 'clinic' ? null : tab === 'news' ? <NewsPanel /> : tab === 'market' ? <MarketPanel locationName={locationChosen ? location.name : '请先设置真实农场位置'} /> : tab === 'advice' ? <FieldAdvicePanel weather={serviceWeather} weatherError={serviceWeatherError} navigate={() => navigate('clinic')} /> : tab === 'production' ? <ProductionPanel game={game} now={clock} onChange={commitGame} notify={showNotice} onNavigate={navigate} focus={productionFocus} onRequestItem={requestItem} /> : tab === 'orders' ? <OrdersPanel requestId={orderView.requestId} game={game} now={clock} onChange={commitGame} notify={showNotice} onRequestItem={requestItem} initialKind={orderView.kind} /> : tab === 'storage' ? <StoragePanel requestId={storageView.requestId} game={game} now={clock} onChange={commitGame} notify={showNotice} initialTab={storageView.section} /> : tab === 'explore' ? <ExplorationPanel requestId={exploreView.requestId} game={game} now={clock} onChange={commitGame} notify={showNotice} initialTab={exploreView.section} /> : tab === 'farm' ? <>
        <main className={`farm-scene map-scene ${activeFieldMode !== 'browse' ? 'field-mode-active' : ''}`}>
          <div className="scene-top"><div className="day-pill"><Sun size={17} /><strong>我的农田</strong><span>{game.unlockedPlots} 块耕地</span></div><button className="quest-sign" onClick={goal.action}><Flag size={17} /><span><strong>{goal.title}</strong><small>{goal.detail}</small></span><ChevronRight size={15} /></button></div>
          <FieldTools game={game} mode={fieldMode} seed={seed} onModeChange={chooseFieldMode} onSeedChange={next => { setSeed(next); chooseFieldMode('plant'); }} onHelp={openGuide} />
          <FarmViewport>
          <FarmLandscape onVisit={area => area === 'town' ? navigate('town') : navigate(area)} /><div className="scene-shade" />
          <FieldInteraction game={game} mode={activeFieldMode} seed={seed} blocked={guideOpen || activityOpen || updateOpen || locationOpen || resetOpen || !!speedRequest} onChange={commitGame} onNotice={showNotice}>
          <div className="field-wrap"><div className="plot-grid">{game.plots.map(p => {
            const c = CROPS.find(s => s.id === p.crop), ready = p.growth >= 100 && !!c, locked = p.id > game.unlockedPlots;
            return <button key={p.id} data-plot-id={p.id} className={`plot ${p.id === selected ? 'selected' : ''} ${c ? 'planted' : 'empty'} ${ready ? 'ripe' : ''} ${locked ? 'locked' : ''}`} onClick={() => { if (locked) { navigate('storage'); return; } setSelected(p.id); if (ready) act('harvest', p.id); else { setDetailsOpen(true); feedback(); } }} aria-label={`${p.id}号地块，${locked ? '未解锁，前往扩建' : c ? `${c.name}，${ready ? '轻触收获2份' : `生长${Math.round(p.growth)}%`}` : '空地，可播种'}`} aria-pressed={p.id === selected}>
              <span className="plot-number">{String(p.id).padStart(2, '0')}</span><span className="crop-sprite">{locked ? <Lock size={24} /> : <CropVisual crop={p.crop} growth={p.growth} health={100} moisture={62} />}</span>
              {!locked && c && <span className="plot-label">{ready ? '收获 ×2' : timerText((p.readyAt ?? clock) - clock)}</span>}{locked && <span className="plot-label">可扩建</span>}{!locked && c && !ready && <span className="plot-growth"><i style={{ width: `${p.growth}%` }} /></span>}{ready && <span className="ready-mark"><Check size={11} /></span>}
            </button>;
          })}</div><span className="field-caption">播种用 1 份 · 收获得 2 份 · 留种、加工，再去交订单</span></div>
          </FieldInteraction>
          </FarmViewport>
          <div className="farm-bottom"><div className="farm-level"><span className="level-emblem"><Wheat size={21} /></span><div><strong>Lv. {level} 农场主</strong><Bar value={(game.xp - levelBase) / (nextLevelXp - levelBase) * 100} tone="gold" /><span>{game.xp} / {nextLevelXp} 经验</span></div></div><button className="advance-button" onClick={() => navigate('orders')}><ClipboardList size={20} /><span>订单板</span><ChevronRight size={18} /></button></div>

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
          <FarmViewport><FarmLandscape onVisit={area => area === 'town' ? navigate('town') : navigate(area)} /><div className="scene-shade" /></FarmViewport>
          <div className="scene-top"><div className="day-pill"><PawPrint size={17} /><strong>我的牧场</strong><span>饲料换产物</span></div><button className="quest-sign" onClick={() => requestItem(animal?.feedItem ?? selectedAnimal.feedItem)}><Factory size={17} /><span><strong>先备好动物的口粮</strong><small>饲料厂里加工饲料</small></span><ChevronRight size={15} /></button></div>
          <AnimalTools game={game} mode={animalMode} onModeChange={chooseAnimalMode} />
          <AnimalInteraction game={game} mode={detailsOpen ? 'browse' : animalMode} blocked={guideOpen || activityOpen || updateOpen || locationOpen || resetOpen || !!speedRequest} onChange={commitGame} onNotice={showNotice} onApplied={showPenFeedback}>
          <div className="livestock-field"><div className="pen-grid">{game.animals.map(p => {
            const a = LIVESTOCK.find(v => v.id === p.animal), ready = p.progress >= 100 && !!a;
            return <button key={p.id} data-pen-id={p.id} className={`animal-pen ${p.id === selectedPen ? 'selected' : ''} ${a ? 'occupied' : ''} ${ready ? 'ready' : ''}`} onClick={() => { setSelectedPen(p.id); if (ready) animalAct('collect', p.id); else { setDetailsOpen(true); feedback(); } }} aria-pressed={p.id === selectedPen} aria-label={`${p.id}号畜舍，${a ? `${a.name}，${ready ? `轻触收集${a.productName}` : p.readyAt ? `剩余${timerText(p.readyAt-clock)}` : '等待喂食'}` : '空畜舍，可购买动物'}`}>
              {penFeedback[p.id] && <AnimalActionFeedback key={penFeedback[p.id].key} action={penFeedback[p.id].action} product={penFeedback[p.id].product} />}<span className="pen-label">畜舍 {String(p.id).padStart(2, '0')}</span><span className="animal-sprite"><AnimalVisual animal={p.animal} healthy /></span><strong>{a ? a.name : '等待新伙伴'}</strong><span className="animal-product">{a ? ready ? `${a.productEmoji} ${a.productName}可收集` : p.readyAt ? timerText(p.readyAt-clock) : '需要一份饲料' : '点击选择动物'}</span>{ready && <span className="ready-mark"><Check size={13} /></span>}
            </button>;
          })}</div><span className="field-caption">投喂一份饲料，等待产物 · 收集后再投喂下一轮</span></div>
          </AnimalInteraction>
          <div className="farm-bottom"><div className="farm-level"><span className="level-emblem"><PawPrint size={21} /></span><div><strong>已收集 {game.productsCollected} 份产物</strong><span>动物安心等待，不会饿死</span></div></div><button className="advance-button" onClick={() => { try { commitGame(buildPen(game)); } catch(error) { showNotice(error instanceof Error ? error.message : '暂时无法扩建'); } }}><Building2 size={19} /><span>扩建畜舍</span></button></div>

        </main>
        {detailsOpen && <aside className="plot-panel">
          <button className="panel-close" onClick={() => setDetailsOpen(false)} aria-label="收起畜舍面板"><X size={18} /></button>
          <div className="panel-body"><div className="panel-heading"><span>畜舍 {String(selectedPen).padStart(2, '0')}</span><span className="soil-chip">{animal ? pen.progress >= 100 ? '待收集' : pen.readyAt ? '生产中' : '待喂养' : '空畜舍'}</span></div>
          {animal ? <><div className="crop-profile"><div className="crop-avatar"><AnimalVisual animal={animal.id} healthy /></div><div><h2>{animal.name}</h2><p>产出{animal.productName} · {timerText(animal.durationMs)}</p></div></div><div className="stat-row"><span>产物进度</span><strong>{Math.round(pen.progress)}%</strong></div><Bar value={pen.progress} tone="gold" /><div className="crop-countdown"><Timer size={20} /><strong>{pen.progress >= 100 ? '可以收集了' : pen.readyAt ? timerText(animalRemaining) : '等待投喂'}</strong></div><div className="seed-cycle-note"><Leaf size={17} /><p>{getItem(animal.feedItem).name}库存：{game.inventory[animal.feedItem] || 0}。没有饲料时，先去饲料厂加工。</p><button onClick={() => requestItem(animal.feedItem)}>去饲料厂<ChevronRight size={13} /></button></div></> : <><div className="empty-plot"><PawPrint size={26} /><div><h2>迎接新的伙伴</h2><p>买动物，喂养后收集产物</p></div></div><div className="animal-options">{LIVESTOCK.map(a => <button key={a.id} className={animalSeed === a.id ? 'animal-option active' : 'animal-option'} disabled={level < a.level} aria-pressed={animalSeed === a.id} onClick={() => setAnimalSeed(a.id)}><span><AnimalVisual animal={a.id} healthy /></span><div><strong>{a.name}</strong><small>{level < a.level ? `Lv. ${a.level} 解锁` : `${a.productName} · ${timerText(a.durationMs)}`}</small></div><b>{a.cost}<Coins size={12} /></b></button>)}</div></>}
          </div>
          {animal ? <button className="primary-action" onClick={() => animalAct(pen.progress >= 100 ? 'collect' : pen.readyAt ? 'speed' : 'feed')} disabled={pen.progress < 100 && (pen.readyAt ? game.gems < gemCost(animalRemaining) : !((game.inventory[animal.feedItem] || 0) > 0))}>{pen.progress >= 100 ? <Wheat size={18} /> : pen.readyAt ? <Diamond size={18} /> : <Leaf size={18} />}{pen.progress >= 100 ? `收集${animal.productName} ×1` : pen.readyAt ? `立即完成 · ${gemCost(animalRemaining)} 钻石` : `投喂${getItem(animal.feedItem).name} ×1`}</button> : <button className="primary-action" onClick={() => animalAct('buy')} disabled={game.coins < selectedAnimal.cost || level < selectedAnimal.level}><PawPrint size={18} />购买{selectedAnimal.name}<span>−{selectedAnimal.cost}</span></button>}
          <div className="tiny-note">产物进入谷仓，可加工或交订单</div>
        </aside>}
      </> : <main className="content-view">
        <div className="view-heading"><div><span className="eyebrow">{tab === 'weather' ? 'WEATHER STATION' : 'SIMULATION JOURNAL'}</span><h2>{tab === 'weather' ? '农场天气站' : '每一份耕耘，都有回响'}</h2></div>{tab !== 'journal' && <button className="refresh-button" onClick={() => locationChosen ? void loadWeather(location) : setLocationOpen(true)} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />刷新天气</button>}</div>
        {tab === 'weather' && locationChosen && weatherError && <div className="error-banner" role="alert">{weatherError}{bundle && ' 当前显示上次成功获取的数据。'}</div>}
        {tab === 'weather' && (!locationChosen ? <div className="service-empty assistant-location-required"><MapPin size={30} /><h3>先设置真实农场位置</h3><p>城市示例和旧缓存不作为你的农场天气。请选择所在城市、现场定位或农场坐标。</p><button className="solid-button" onClick={() => { setSearchError(''); setLocationOpen(true); }}>设置真实农场位置</button></div> : <><div className="weather-stats"><article><span>当前气温</span><strong>{bundle ? Math.round(bundle.current.temp) : '—'}<small>°C</small></strong><Sun size={28} /></article><article><span>空气湿度</span><strong>{bundle ? Math.round(bundle.current.humidity) : '—'}<small>%</small></strong><Droplets size={28} /></article><article><span>当前风速</span><strong>{bundle ? Math.round(bundle.current.wind) : '—'}<small>km/h</small></strong><Wind size={28} /></article><article><span>今日降水预报</span><strong>{bundle ? bundle.forecast[0].rain.toFixed(1) : '—'}<small>mm</small></strong><CloudSun size={28} /></article></div><div className="forecast-heading"><h3>未来 7 天天气</h3><span>日最低 / 最高气温</span></div><div className="forecast-grid">{bundle?.forecast.map((w, i) => <article key={w.date} className={i === 0 ? 'forecast-day today' : 'forecast-day'}><span>{i === 0 ? '今天' : i === 1 ? '明天' : shortDate(w.date)}</span><b>{weatherEmoji(w.code)}</b><strong>{Math.round(w.minTemp)}° / {Math.round(w.maxTemp)}°</strong><small>{weatherLabel(w.code)}</small><span className="rain-value"><Droplets size={12} />{Math.round(w.rainChance)}%</span></article>)}</div><p className="weather-attribution">数据：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · {bundle ? `更新于 ${new Date(bundle.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · ${bundle.timezone}` : '尚未连接'}。预报会随气象条件变化。</p></>)}
        {tab === 'journal' && <><GameBackupControls onExport={backupGame} exporting={exportingGame} notify={showNotice} onRestore={next => { const saved = commitGame(next); setSelected(1); setSelectedPen(1); setSeed('wheat'); setAnimalSeed('chicken'); setFieldMode('browse'); setDetailsOpen(false); showNotice(saved ? '已恢复并保存游戏进度。真实农场记录和位置设置保留。' : '本次已恢复，但本机存档无法保存。请立即导出游戏备份，再处理存储问题。'); }} /><button className="journal-update-link" onClick={() => setUpdateOpen(true)}><Download size={17} />游戏版本与更新</button><button className="journal-update-link" onClick={openActivity}><ClipboardList size={17} />农场看板</button><button className="journal-update-link" onClick={openGuide}><CircleHelp size={17} />农场新手手册</button><button className="journal-update-link" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}{sound ? '关闭音效' : '打开音效'}</button><div className="journal-stats"><article><Wheat size={26} /><strong>{game.harvests}</strong><span>农作物收获</span></article><article><CalendarDays size={26} /><strong>{game.ordersDelivered}</strong><span>完成订单</span></article><article><PawPrint size={26} /><strong>{game.productsCollected}</strong><span>养殖产物</span></article><article><Sprout size={26} /><strong>{game.xp}</strong><span>累计经验</span></article></div><div className="journal-list">{game.log.map((line, i) => <div key={`${game.day}-${i}`}><span className="journal-dot" /><p>{line}</p>{i === 0 && <span className="new-label">最新</span>}</div>)}</div><p className="journal-footnote">作物、动物和加工按真实倒计时推进。游戏库存与金币不参与真实农场建议。</p></>}

      </main>}
      </Suspense>
      {clinicVisited && <div className="clinic-session-slot" hidden={tab !== 'clinic'}>
        <Suspense fallback={<main className="content-view service-loading" role="status"><h2>正在打开 AI 诊所…</h2><p>准备本次现场观察。</p></main>}>
          <DiagnosticPanel weather={weatherError || stale ? null : serviceWeather} active={tab === 'clinic'} onDraftWarning={showNotice} />
        </Suspense>
      </div>}
      <div className={`game-notice ${notice ? 'is-visible' : ''}`} role="status" aria-atomic="true">{notice && <><Sprout size={17} aria-hidden="true" /><span>{notice}</span></>}</div>
    </div>
    <footer className="statusbar"><span><Leaf size={13} />{simulation ? '我的农场 · 按你的节奏经营' : '农场助手 · 真实现场资料'}</span><span>{simulation ? '收获、加工、订单与小镇访客' : !locationChosen ? '先设置真实农场位置' : bundle ? `${bundle.location.name} · ${stale || weatherError ? '上次获取的天气' : '区域气象模型'}` : weatherError || '真实资料与游戏进度分别保存'}</span><button onClick={() => navigate(simulation ? tab === 'town' ? 'farm' : 'town' : lastPlayTab)}>{simulation ? tab === 'town' ? '返回农田' : '逛逛小镇' : '返回游戏'}<ChevronRight size={12} /></button></footer>
    {speedRequest && speedQuote && <GemConfirmation cost={speedQuote.cost} heading={`加速${speedRequest.label}？`} description={speedRequest.kind === 'crop' ? `${speedRequest.id} 号田的${speedRequest.label}将立即成熟，之后仍需手动收获。` : `${speedRequest.id} 号畜舍的${speedRequest.label}将立即完成产出，之后仍需手动收集。`} cancelLabel="继续等待" confirmLabel="确认使用钻石" blockedReason={speedQuote.blockedReason} onCancel={closeSpeedRequest} onConfirm={() => confirmSpeed(speedQuote.cost)} />}
    {activityOpen && <FarmActivityBoard game={game} now={clock} onClose={() => setActivityOpen(false)} onVisit={visitActivity} onJournal={() => navigate('journal')} />}
    {guideOpen && <FarmGuide game={game} onClose={() => setGuideOpen(false)} onNavigate={next => { setGuideOpen(false); setFieldMode('browse'); navigate(next); }} />}
    {updateOpen && <UpdatePanel onClose={() => setUpdateOpen(false)} initialUpdate={availableUpdate} beforeInstall={() => saveCurrentGame()} onBackup={() => void backupGame()} />}

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
    {resetOpen && <div className="modal-backdrop"><section className="reset-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title"><Sprout size={30} /><h2 id="reset-title">重置模拟农场？</h2><p>游戏金币、钻石、库存、地块、动物、工坊、订单、果园、小镇设施、访客和日记将恢复初始状态。真实农场记录、问诊和位置设置单独保存。</p><div><button className="secondary-action" onClick={() => setResetOpen(false)}>继续耕耘</button><button className="primary-action" onClick={() => { const saved = commitGame(initialGame()); setSelected(1); setSelectedPen(1); setSeed('wheat'); setAnimalSeed('chicken'); setFieldMode('browse'); setDetailsOpen(false); setResetOpen(false); showNotice(saved ? '新一季开始了，种下第一份期待。' : '本次已重新开始，但本机存档无法保存。请导出游戏备份，避免重启丢失进度。'); }}>重新开始</button></div></section></div>}
    {!portraitDismissed && <div className="rotate-overlay"><div>📱</div><h2>横过来，田野更宽阔</h2><p>这款游戏为横屏触控设计</p><button onClick={() => setPortraitDismissed(true)}>先用竖屏试玩</button></div>}
  </div>;
}
