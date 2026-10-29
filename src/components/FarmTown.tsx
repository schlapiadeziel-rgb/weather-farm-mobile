import { useId, useRef, useState } from 'react';
import { ArrowRight, Award, Check, Clock3, Coffee, Coins, Hammer, House, LockKeyhole, PackageCheck, ShoppingBasket, Star, TrainFront, Users } from 'lucide-react';
import type { Game, ItemId } from '../lib/farmTypes';
import { getItem, MACHINES, RECIPES } from '../lib/farmContent';
import { arriveTownTrain, buildTownFacility, collectTownVisitor, getTownFacilityCapacity, getTownUpgradeCost, getTownVisitorPhase, serveTownVisitor, TOWN_BUILDINGS, TOWN_MAX_VISITORS, TOWN_TRAIN_COOLDOWN_MS, upgradeTownFacility } from '../lib/townGame';
import type { TownBuildingId, TownVisitor } from '../lib/townTypes';
import TownScenery from './TownScenery';
import './farm-town.css';

export type FarmTownProps = { game: Game; now: number; onChange(game: Game): void | boolean; notify(text: string): void; onRequestItem?(item: ItemId): void; onNavigate?(tab: 'farm' | 'storage' | 'production' | 'orders'): void };
const looks = { store: { color: '#5d9d92', Icon: ShoppingBasket }, cafe: { color: '#cc826d', Icon: Coffee }, inn: { color: '#8a8eaf', Icon: House } };

function remaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
function sourceLabel(id: ItemId) {
  const item = getItem(id);
  if (item.category === 'crop') return '农田';
  if (item.category === 'animal') return '牧场';
  const recipe = RECIPES.find(entry => entry.output === id);
  if (recipe) return MACHINES.find(entry => entry.id === recipe.machine)?.name ?? '工坊';
  return '仓库';
}

/** The previous original vector art stays available when a bundled image cannot load. */
function VectorTownBuildingArt({ id }: { id: TownBuildingId }) {
  const paint = `town-${useId().replace(/:/g, '')}`;
  const { color, Icon } = looks[id];
  const upper = id === 'inn';
  return <svg className="ft-building-art" data-town-art={id} data-art-status="fallback" viewBox="0 0 200 164" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${paint}-wall`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#fff6da" /><stop offset="1" stopColor="#e0caa4" /></linearGradient><linearGradient id={`${paint}-roof`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor={color} /><stop offset="1" stopColor={id === 'store' ? '#437a72' : id === 'cafe' ? '#a66155' : '#5c6487'} /></linearGradient></defs>
    <ellipse cx="100" cy="142" rx="83" ry="15" fill="#5a784e" opacity=".17" /><path d="m18 137 77-20 88 19-81 23Z" fill="#a7c579" /><path d="m18 137 84 22 81-23v5l-81 22-84-21Z" fill="#81a15a" />
    <path d="M29 132v-20m143 22v-22" stroke="#8d9862" strokeWidth="2" /><g fill="#6d9d58"><circle cx="29" cy="109" r="14" /><circle cx="20" cy="117" r="9" /><circle cx="40" cy="118" r="10" /><circle cx="170" cy="112" r="13" /><circle cx="179" cy="120" r="9" /></g><g fill="#a5c875"><circle cx="25" cy="104" r="8" /><circle cx="165" cy="107" r="7" /></g>
    <path d={`M49 ${upper ? 47 : 64} 117 ${upper ? 31 : 48} 151 ${upper ? 52 : 69}v65l-70 18-32-18Z`} fill={`url(#${paint}-wall)`} stroke="#b8a27f" strokeWidth=".7" /><path d={`m117 ${upper ? 31 : 48} 34 21v65l-34-16Z`} fill="#cdb88f" />
    <path d={upper ? 'm41 48 76-32 43 38-79 25Z' : 'm41 65 76-32 43 38-79 25Z'} fill={`url(#${paint}-roof)`} /><path d={upper ? 'm41 48 40 31v6L41 55Z' : 'm41 65 40 31v6L41 72Z'} fill={id === 'cafe' ? '#9c6054' : '#526d66'} />
    <path d={upper ? 'm58 42 60-23 32 30m-83 1 49-19 35 22' : 'm58 59 60-23 32 30m-83 1 49-19 35 22'} stroke="#fff7d8" strokeOpacity=".18" strokeWidth="1.3" fill="none" />
    {upper && <><path d="m61 63 14 6v18l-14-6Zm29 8 16-4v18l-16 4Zm40-17 12 7v18l-12-6Z" fill="#a8c5be" stroke="#8a9d97" /><path d="m68 67 1 16m29-13v17m37-30v18" stroke="#f5e9c9" strokeWidth="1.5" /><path d="m48 87 33 17 70-18v5l-70 18-33-17Z" fill="#b4a17a" /><path d="M52 89v13m12-8v14m24-6v13m13-17v13m14-17v14m14-18v14m13-18v14" stroke="#f6e5bc" strokeWidth="2" /><path d="M127 37V16l10-2 8 5v27" fill="#c3b08d" /><path d="m125 15 13-6 12 9-13 4Z" fill="#788099" /></>}
    {id === 'cafe' ? <><path d="m51 91 67-17 32 18-70 21Z" fill="#d68f77" /><path d="m60 89 10-3 31 21-10 3Zm22-6 10-2 31 20-11 3Zm22-5 10-3 31 20-11 4Z" fill="#fff0d0" /><path d="m51 91 29 22v7L51 98Zm29 22 70-21v7l-70 21Z" fill="#b16b59" /><path d="M58 120v17m80-32v22" stroke="#ad8c63" strokeWidth="2" /><path d="m140 136 18-5 9 5-18 5Z" fill="#f8e4b8" /><path d="M149 141v10m-7-1 7-3 8 2" stroke="#8c9469" strokeWidth="2" /><ellipse cx="151" cy="132" rx="3" ry="2" fill="#f8f2d7" /><path d="M150 132v-4h3v4" fill="#fff7df" /><path d="m29 138 16-4 8 4-16 4Z" fill="#bc9567" /><path d="M36 141v8m10-10v8" stroke="#8f7f54" strokeWidth="2" /></> : <><path d="m58 95 16 7v25l-16-7Zm76-15 9 4v22l-9-4Z" fill="#acc8bf" stroke="#829d93" /><path d="M66 99v24m-8-13 16 7m64-35v21" stroke="#fff4d6" strokeWidth="1.5" /></>}
    <path d="m94 111 20-5v32l-20 5Z" fill={id === 'inn' ? '#8e91a1' : '#729289'} /><path d="m97 113 14-4v12l-14 4Z" fill="#bfd3c6" /><circle cx="108" cy="130" r="1.3" fill="#f2d282" />
    <path d="m83 146 20-5 21 4-21 6Z" fill="#f1dfb8" /><g transform={upper ? 'translate(94 92)' : 'translate(93 78)'}><rect width="26" height="23" rx="4" fill="#fff3d2" stroke={color} /><Icon x="5" y="4" width="16" height="16" color={color} strokeWidth="1.7" /></g>
    {id === 'store' && <><path d="m50 131 23 9v13l-23-9Z" fill="#b89a66" /><path d="m50 131 13-4 23 9-13 4Z" fill="#ddc085" /><g fill="#d6945c"><circle cx="59" cy="130" r="4" /><circle cx="66" cy="132" r="4" /><circle cx="72" cy="132" r="3" /></g><path d="m64 128 1-5m7 7 3-5" stroke="#749450" strokeWidth="2" /><path d="m139 128 14 7v13l-14-7Z" fill="#ae9268" /><path d="m140 126 14 7-1 11-14-7Z" fill="#f1dca9" /><path d="m142 135 4-4 5 6" fill="none" stroke="#8f9b62" /></>}
    <g stroke="#8caa61" strokeWidth="1.5"><path d="M34 137v-7m127 16v-8m9 3v-7" /></g><g fill="#e8bb83"><circle cx="34" cy="130" r="3" /><circle cx="161" cy="137" r="3" /><circle cx="170" cy="134" r="3" /></g>
  </svg>;
}

function TownBuildingArt({ id }: { id: TownBuildingId }) {
  const [failedFor, setFailedFor] = useState<TownBuildingId | null>(null);
  if (failedFor === id) return <VectorTownBuildingArt id={id} />;
  return <svg className="ft-building-art" data-town-art={id} data-art-status="painted" viewBox="0 0 200 164" aria-hidden="true" focusable="false">
    <ellipse cx="100" cy="153" rx="70" ry="8" fill="#526943" opacity=".14" />
    <image href={`/art/town/${id}.webp`} x="0" y="0" width="200" height="160" preserveAspectRatio="xMidYMax meet" onError={() => setFailedFor(id)} />
  </svg>;
}

function TrainArt() {
  const [failed, setFailed] = useState(false);
  if (failed) return <VectorTrainArt />;
  return <svg className="ft-train-art" data-town-art="train" data-art-status="painted" viewBox="0 0 300 94" aria-hidden="true" focusable="false">
    <ellipse cx="151" cy="80" rx="136" ry="9" fill="#536a47" opacity=".16" />
    <path d="M14 78h274m-274 7h274" stroke="#84917a" strokeWidth="3" /><path d="M17 81h269" stroke="#a6926c" strokeWidth="7" strokeDasharray="4 13" />
    <image href="/art/town/train.webp" x="5" y="-11" width="290" height="94" preserveAspectRatio="xMidYMax meet" onError={() => setFailed(true)} />
  </svg>;
}

function VectorTrainArt() {
  return <svg className="ft-train-art" data-town-art="train" data-art-status="fallback" viewBox="0 0 300 94" aria-hidden="true" focusable="false"><ellipse cx="151" cy="80" rx="136" ry="9" fill="#6c8956" opacity=".16" /><path d="M14 78h274m-274 7h274" stroke="#84917a" strokeWidth="3" /><path d="M17 81h269" stroke="#a6926c" strokeWidth="7" strokeDasharray="4 13" /><g fill="#d3c199" stroke="#9a997b" strokeWidth="1"><rect x="130" y="29" width="67" height="43" rx="4" /><rect x="208" y="29" width="67" height="43" rx="4" /></g><g fill="#91b6aa" stroke="#638c81"><path d="M137 37h14v18h-14zm20 0h14v18h-14zm20 0h13v18h-13zm38 0h14v18h-14zm20 0h14v18h-14zm20 0h13v18h-13Z" /></g><path d="M127 29h72m6 0h73" stroke="#6b8c76" strokeWidth="7" strokeLinecap="round" /><path d="M28 55h89v19H27Zm43-22h40v24H71Z" fill="#5f9d8e" stroke="#3e7d71" /><path d="M41 45h31v25H41Z" fill="#78aa88" /><path d="M32 69h84v7H23Z" fill="#b16f56" /><path d="M79 37h23v17H79Z" fill="#b9d5c1" stroke="#51867a" /><path d="M66 32h50" stroke="#46796c" strokeWidth="6" strokeLinecap="round" /><path d="M39 44V27h13v18" fill="#527b69" /><path d="M36 27h19" stroke="#567f6c" strokeWidth="5" /><path className="ft-steam" d="M44 18C27 8 57 4 45-7" stroke="#fff8df" strokeWidth="7" strokeLinecap="round" fill="none" opacity=".6" /><path d="M115 67h16m65 0h13" stroke="#7d8166" strokeWidth="3" /><g fill="#57746b" stroke="#cfceb0" strokeWidth="3"><circle cx="43" cy="74" r="10" /><circle cx="72" cy="74" r="10" /><circle cx="102" cy="74" r="10" /><circle cx="145" cy="74" r="8" /><circle cx="182" cy="74" r="8" /><circle cx="223" cy="74" r="8" /><circle cx="261" cy="74" r="8" /></g><path d="M43 74h59" stroke="#d6c291" strokeWidth="3" /><circle cx="27" cy="57" r="5" fill="#f0ce80" /></svg>;
}
function VisitorAvatar({ visitor, index = 0 }: { visitor: TownVisitor; index?: number }) {
  const palette = ['#809e9b', '#b18479', '#a49b6b', '#8594b2', '#9aa97b', '#b18d9b'];
  const tint = palette[index % palette.length];
  return <svg className="ft-visitor-avatar" viewBox="0 0 52 60" aria-hidden="true" focusable="false"><ellipse cx="26" cy="55" rx="20" ry="4" fill="#677f4b" opacity=".14" /><path d="M9 54c0-15 6-22 17-22s17 7 17 22" fill={tint} /><path d="m17 35 9 8 9-8" fill="#ece7c9" /><rect x="22" y="28" width="8" height="11" rx="3" fill="#e4be96" /><ellipse cx="26" cy="21" rx="12" ry="14" fill="#edcca5" /><path d="M14 21C11 4 31 1 37 13l2 9-6-7c-4 4-10 3-15 1l-3 6Z" fill={index % 2 ? '#735c4c' : '#8d7355'} /><path d="M22 28q4 3 8 0" fill="none" stroke="#bd876b" strokeWidth="1.2" strokeLinecap="round" /><circle cx="21" cy="22" r="1" fill="#695e4c" /><circle cx="31" cy="22" r="1" fill="#695e4c" />{visitor.id.length % 2 === 0 && <><path d="M11 14q2-16 16-13 13 3 12 13Z" fill={tint} /><path d="M9 14h32" stroke="#e3cc91" strokeWidth="3" strokeLinecap="round" /></>}</svg>;
}

export function FarmTown({ game, now, onChange, notify, onRequestItem, onNavigate }: FarmTownProps) {
  const [selected, setSelected] = useState<TownBuildingId>('store');
  const gameRef = useRef(game);
  const lastPropRef = useRef(game);
  // Keep successful actions current even when a second tap precedes React's next paint.
  if (lastPropRef.current !== game) { lastPropRef.current = game; gameRef.current = game; }
  const town = game.town;
  const building = TOWN_BUILDINGS.find(entry => entry.id === selected) ?? TOWN_BUILDINGS[0];
  const owned = town.buildings.find(entry => entry.id === selected);
  const level = owned?.level ?? 0;
  const capacity = getTownFacilityCapacity(level);
  const visitors = town.visitors.filter(entry => entry.buildingId === selected);
  const occupied = visitors.filter(entry => getTownVisitorPhase(entry, now) !== 'waiting').length;
  const upgradeCost = getTownUpgradeCost(level);
  const readyCount = town.visitors.filter(entry => getTownVisitorPhase(entry, now) === 'ready').length;
  const trainRemaining = Math.max(0, town.nextTrainAt - now);
  const trainFull = town.visitors.length >= TOWN_MAX_VISITORS;
  const locked = town.reputation < building.unlockReputation;
  const { Icon } = looks[selected];
  const apply = (action: (current: Game) => Game, summary: string | ((next: Game, previous: Game) => string)) => {
    try {
      const previous = gameRef.current;
      const next = action(previous);
      gameRef.current = next;
      const saved = onChange(next);
      const message = typeof summary === 'string' ? summary : summary(next, previous);
      notify(saved === false ? `${message}本机未能保存，请在农场日记导出游戏备份。` : message);
    } catch (error) { notify(error instanceof Error ? error.message : '这次操作没有完成，请稍后再试。'); }
  };
  const callTrain = () => apply(current => arriveTownTrain(current, Date.now()), (next, previous) => `火车到站，${next.town.visitors.length - previous.town.visitors.length} 位模拟访客来到小镇。`);
  const requestItem = (id: ItemId) => {
    if (onRequestItem) { onRequestItem(id); return; }
    if (!onNavigate) return;
    const category = getItem(id).category;
    onNavigate(category === 'crop' ? 'farm' : RECIPES.some(entry => entry.output === id) ? 'production' : 'storage');
  };
  return <section className="farm-town-panel" aria-label="游戏访客小镇">
    <header className="ft-header"><span className="ft-town-seal"><TrainFront size={23} aria-hidden="true" /></span><div className="ft-heading"><h2>风禾小镇</h2><p>本机模拟访客 · 把农场的好东西带进小镇</p></div><div className="ft-town-stats"><span><Award size={16} aria-hidden="true" />声望 <b>{town.reputation}</b></span><span><Coins size={16} aria-hidden="true" />游戏金币 <b>{game.coins.toLocaleString()}</b></span></div></header>
    <div className="ft-layout">
      <aside className="ft-map" aria-label="小镇建筑地图"><div className="ft-map-canvas"><TownScenery />
        <div className="ft-station"><div className="ft-station-sign"><TrainFront size={14} aria-hidden="true" /><strong>风禾车站</strong><span>{town.visitors.length}/{TOWN_MAX_VISITORS} 位访客在镇</span></div><TrainArt /><div className="ft-train-controls"><button className="ft-primary ft-arrive" disabled={trainRemaining > 0 || trainFull} onClick={callTrain} data-town-action="arrive"><TrainFront size={16} aria-hidden="true" />{trainFull ? '小镇已满，先接待访客' : trainRemaining > 0 ? `下一班 ${remaining(trainRemaining)}` : '让火车到站'}</button><small>{trainFull ? '领取接待报酬后，访客会离开小镇。' : trainRemaining > 0 ? `火车每 ${TOWN_TRAIN_COOLDOWN_MS / 60000} 分钟可到站一次，需手动迎接。` : '轻触迎接最多 3 位新访客，不会自动扣货。'}</small></div></div>
        <div className="ft-buildings" role="group" aria-label="选择接待建筑">{TOWN_BUILDINGS.map(entry => {
          const builtLevel = town.buildings.find(built => built.id === entry.id)?.level ?? 0;
          const guests = town.visitors.filter(visitor => visitor.buildingId === entry.id);
          const ready = guests.filter(visitor => getTownVisitorPhase(visitor, now) === 'ready').length;
          return <button className={`ft-building ${selected === entry.id ? 'is-selected' : ''} ${!builtLevel ? 'is-unbuilt' : ''}`} key={entry.id} data-town-building={entry.id} aria-pressed={selected === entry.id} aria-label={`${entry.name}，${builtLevel ? `${builtLevel}级，${guests.length}位访客${ready ? `，${ready}份报酬可领取` : ''}` : `待建造，声望${entry.unlockReputation}解锁，${entry.buildCost}游戏金币`}`} onClick={() => setSelected(entry.id)}>
            {ready > 0 && <span className="ft-ready-bubble"><PackageCheck size={15} aria-hidden="true" />{ready}</span>}<TownBuildingArt id={entry.id} /><span className="ft-building-label"><strong>{entry.name}</strong><small>{builtLevel ? `${builtLevel}级 · ${guests.length} 位访客` : <><LockKeyhole size={10} aria-hidden="true" />声望 {entry.unlockReputation} 解锁</>}</small></span>
          </button>;
        })}</div>
        <div className="ft-map-footer"><Users size={14} aria-hidden="true" /><span>{readyCount ? `${readyCount} 份接待报酬等你领取` : '选中建筑，查看访客与接待需求'}</span></div>
      </div></aside>
      <div className="ft-reception" data-town-selected={selected}>
        <div className="ft-reception-heading"><span className="ft-facility-icon"><Icon size={21} aria-hidden="true" /></span><div><h3>{building.name}</h3><p>{building.description}</p></div><span className="ft-facility-level">{level ? `Lv.${level}` : '待建造'}</span></div>
        <div className="ft-facility-tabs" role="group" aria-label="接待建筑">{TOWN_BUILDINGS.map(entry => <button key={entry.id} aria-pressed={selected === entry.id} onClick={() => setSelected(entry.id)}>{entry.name}{town.visitors.some(visitor => visitor.buildingId === entry.id && getTownVisitorPhase(visitor, now) === 'ready') && <span className="ft-tab-ready" aria-label="有报酬可领取" />}</button>)}</div>
        <div className="ft-reception-scroll">
          {!level ? <div className="ft-build-site"><TownBuildingArt id={selected} /><h4>{locked ? `声望 ${building.unlockReputation} 解锁` : '给小镇添一座新建筑'}</h4><p>{locked ? `接待访客并领取报酬可以获得声望，当前 ${town.reputation} / ${building.unlockReputation}。` : `建造后可同时接待 ${getTownFacilityCapacity(1)} 位访客，每次服务约 ${Math.round(building.serviceMs / 60000 * 10) / 10} 分钟。`}</p>{locked && <progress max={building.unlockReputation} value={town.reputation} aria-label={`${building.name}解锁声望进度`} />}<button className="ft-primary" disabled={locked || game.coins < building.buildCost} data-town-action="build" onClick={() => apply(current => buildTownFacility(current, selected, Date.now()), `${building.name}建成了！下一班火车可以带来新访客。`)}><Hammer size={16} aria-hidden="true" />建造 · <Coins size={15} aria-hidden="true" />{building.buildCost.toLocaleString()}</button>{!locked && game.coins < building.buildCost && <small>还差 {(building.buildCost - game.coins).toLocaleString()} 游戏金币，可通过交货和售货赚取。</small>}</div> : <>
            <div className="ft-facility-summary"><div><strong><Users size={15} aria-hidden="true" />接待位 {occupied}/{capacity}</strong><small>服务约 {Math.round(building.serviceMs / 60000 * 10) / 10} 分钟 · 完成后手动领取</small></div>{upgradeCost !== null ? <button className="ft-upgrade" disabled={game.coins < upgradeCost} data-town-action="upgrade" onClick={() => apply(current => upgradeTownFacility(current, selected, Date.now()), `${building.name}已升级，新增一个接待位。`)} aria-label={`升级${building.name}至${level + 1}级，需要${upgradeCost}游戏金币${game.coins < upgradeCost ? `，还差${upgradeCost - game.coins}` : ''}`}><Hammer size={14} aria-hidden="true" />升级 <Coins size={13} aria-hidden="true" />{upgradeCost}</button> : <span className="ft-max-level"><Check size={13} aria-hidden="true" />已满级</span>}</div>
            {visitors.length === 0 ? <div className="ft-empty-visitors"><Users size={35} aria-hidden="true" /><h4>等一班载着故事的火车</h4><p>{town.visitors.length ? '这座建筑暂时没有访客。先到其他建筑完成接待，再迎接下一班火车。' : trainRemaining > 0 ? `车站正在准备下一班火车，${remaining(trainRemaining)} 后可手动迎接。` : '去车站迎接火车，新的模拟访客会带来农产品需求。'}</p>{!trainFull && trainRemaining <= 0 && <button className="ft-primary" onClick={callTrain}><TrainFront size={16} aria-hidden="true" />迎接新访客</button>}</div> : <div className="ft-visitor-list" aria-label={`${building.name}访客`}>{visitors.map(visitor => {
              const phase = getTownVisitorPhase(visitor, now);
              const entries = Object.entries(visitor.requirements) as [ItemId, number][];
              const missing = entries.filter(([id, quantity]) => (game.inventory[id] ?? 0) < quantity);
              const full = occupied >= capacity;
              const progress = visitor.startedAt !== undefined && visitor.readyAt !== undefined ? Math.max(0, Math.min(100, (now - visitor.startedAt) / Math.max(1, visitor.readyAt - visitor.startedAt) * 100)) : 0;
              return <article className={`ft-visitor ft-visitor-${phase}`} key={visitor.id} data-town-visitor={visitor.id}><div className="ft-visitor-heading"><VisitorAvatar visitor={visitor} index={town.visitors.findIndex(entry => entry.id === visitor.id)} /><div><h4>{visitor.name}</h4><span>{phase === 'waiting' ? '等候接待' : phase === 'serving' ? '正在享受小镇时光' : '接待完成'}</span></div><span className={`ft-visitor-phase ${phase}`}>{phase === 'ready' ? <><Check size={13} aria-hidden="true" />可领取</> : phase === 'serving' ? <><Clock3 size={12} aria-hidden="true" />{remaining((visitor.readyAt ?? now) - now)}</> : <><Users size={12} aria-hidden="true" />等候中</>}</span></div>
                {phase === 'waiting' ? <><div className="ft-requirements">{entries.map(([id, quantity]) => <div key={id} className={(game.inventory[id] ?? 0) < quantity ? 'is-short' : ''}><span>{getItem(id).icon}<b>{getItem(id).name}</b></span><span><small>库存</small> {game.inventory[id] ?? 0}<i>/</i><strong>{quantity}</strong></span></div>)}</div>{missing.length > 0 && <div className="ft-missing-items">{missing.map(([id, quantity]) => <div key={id}><span>还缺{getItem(id).name} ×{quantity - (game.inventory[id] ?? 0)}</span>{onRequestItem || onNavigate ? <button onClick={() => requestItem(id)}>去{onRequestItem ? sourceLabel(id) : getItem(id).category === 'crop' ? '农田' : RECIPES.some(entry => entry.output === id) ? '工坊' : '仓库'}<ArrowRight size={12} aria-hidden="true" /></button> : <small>来自{sourceLabel(id)}</small>}</div>)}</div>}</> : <p className="ft-consumed-note">接待用品已交付：{entries.map(([id, quantity]) => `${getItem(id).name} ×${quantity}`).join('、')}</p>}
                {phase === 'serving' && <div className="ft-service-progress" role="progressbar" aria-label={`${visitor.name}接待进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)}><span style={{ width: `${progress}%` }} /></div>}
                <div className="ft-visitor-bottom"><div className="ft-rewards" aria-label={`报酬：${visitor.coins}游戏金币，${visitor.xp}经验，${visitor.reputation}声望`}><span><Coins size={13} aria-hidden="true" />{visitor.coins}</span><span><Star size={12} aria-hidden="true" />{visitor.xp} XP</span><span><Award size={12} aria-hidden="true" />+{visitor.reputation}</span></div>{phase === 'waiting' ? <button className="ft-primary ft-serve" disabled={missing.length > 0 || full} data-town-action="serve" onClick={() => apply(current => serveTownVisitor(current, visitor.id, Date.now()), `已交付接待用品，${visitor.name}开始在${building.name}享受小镇时光。`)}>{missing.length ? '补齐货物后接待' : full ? '接待位已满' : '交付并接待'}</button> : phase === 'ready' ? <button className="ft-primary ft-collect" data-town-action="collect" onClick={() => apply(current => collectTownVisitor(current, visitor.id, Date.now()), `已领取 ${visitor.coins} 游戏金币、${visitor.xp} 经验和 ${visitor.reputation} 声望。${visitor.name}满意离开了小镇。`)}><PackageCheck size={15} aria-hidden="true" />领取报酬</button> : <span className="ft-service-time"><Clock3 size={13} aria-hidden="true" />剩余 {remaining((visitor.readyAt ?? now) - now)}</span>}</div>{phase === 'waiting' && full && <p className="ft-capacity-note">先领取已完成的接待报酬，或升级建筑增加接待位。</p>}
              </article>;
            })}</div>}
          </>}
        </div>
        <footer className="ft-reception-footer"><span><Coins size={12} aria-hidden="true" />小镇经营使用游戏库存与游戏金币</span>{onNavigate && <button onClick={() => onNavigate('farm')}>回农场<ArrowRight size={13} aria-hidden="true" /></button>}</footer>
      </div>
    </div>
  </section>;
}
export default FarmTown;
