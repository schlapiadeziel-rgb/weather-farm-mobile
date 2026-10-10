import { useState } from 'react';
import type { ReactNode } from 'react';
import { Axe, Check, Coins, Fish, Gem, Leaf, Package, Pickaxe, Plus, RefreshCw, Ship, ShoppingBag, Sprout, Store, Timer, Trees, Trophy, Truck, Warehouse, Wheat } from 'lucide-react';
import type { Game, ItemId, OrchardPlot, StorageKind } from '../lib/farmTypes';
import { ITEMS, getItem } from '../lib/farmContent';
import { getLevel, storageUsed } from '../lib/game';
import { ACHIEVEMENTS, BEEHIVE_COST, BEEKEEPING_LEVEL, BOAT_LEVEL, FISHING_LEVEL, HONEY_COOLDOWN_MS, MAX_STORAGE_CAPACITY, MINING_LEVEL, ORCHARD_FRUITS, ORCHARD_LIMIT, SALE_DELAY_MS, achievementProgress, buildBeehive, buySupply, catchFish, claimAchievement, clearOrchard, collectHoney, collectSale, deliverOrder, discardOrder, ensureOrders, expandFarm, farmExpansionCost, harvestOrchard, listForSale, mineOre, plantOrchard, reviveOrchard, storageUpgradeCost, upgradeStorage } from '../lib/farmEconomy';
import './farm-economy.css';

export interface EconomyPanelProps {
  game: Game;
  onChange: (next: Game) => void;
  notify: (message: string) => void;
  now: number;
}

function remainingTime(readyAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((readyAt - now) / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}小时${Math.ceil((seconds % 3600) / 60)}分`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
  return `${seconds}秒`;
}

function commit(props: EconomyPanelProps, action: () => Game, success: string) {
  try {
    const next = action();
    props.onChange(next);
    props.notify(success);
  } catch (error) {
    props.notify(error instanceof Error ? error.message : '这次操作没有完成，请再试一次。');
  }
}

function PanelHeading({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children?: ReactNode }) {
  return <header className="fe-heading"><span className="fe-heading-icon">{icon}</span><div><p className="fe-eyebrow">田野经营手记</p><h2>{title}</h2><p>{description}</p></div>{children}</header>;
}

function Reward({ coins, xp, gems }: { coins: number; xp?: number; gems?: number }) {
  return <div className="fe-reward"><span><Coins size={15} />{coins}</span>{xp !== undefined && <span className="fe-xp">+{xp} 经验</span>}{!!gems && <span className="fe-gem"><Gem size={14} />{gems}</span>}</div>;
}

function EmptyNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="fe-empty"><span>{icon}</span><p>{children}</p></div>;
}

export function OrdersPanel(props: EconomyPanelProps) {
  const { game, now } = props;
  const [kind, setKind] = useState<'truck' | 'boat'>('truck');
  const orders = game.orders.filter(order => order.kind === kind);
  return <main className="fe-panel fe-orders">
    <PanelHeading icon={<Truck size={29} />} title="今天的订单" description="把田里的收成变成好东西，再送到需要它们的地方。"><span className="fe-level-stamp">已送达 <strong>{game.ordersDelivered}</strong> 单</span></PanelHeading>
    <nav className="fe-tabs" aria-label="配送方式"><button className={kind === 'truck' ? 'is-active' : ''} aria-pressed={kind === 'truck'} onClick={() => setKind('truck')}><Truck size={17} />卡车订单<span>{game.orders.filter(order => order.kind === 'truck').length}</span></button><button className={kind === 'boat' ? 'is-active' : ''} aria-pressed={kind === 'boat'} onClick={() => setKind('boat')}><Ship size={17} />货船订单<span>{game.orders.filter(order => order.kind === 'boat').length}</span></button></nav>
    <section className="fe-order-board" aria-label={kind === 'truck' ? '卡车订单板' : '货船装货板'}>
      <div className="fe-board-caption"><span>{kind === 'truck' ? '合作社 · 发货板' : '河畔码头 · 装货板'}</span><small>收获 → 加工 → 交货</small></div>
      {orders.length ? <div className="fe-order-grid">{orders.map((order, index) => {
        const needs = Object.entries(order.requirements) as [ItemId, number][];
        const ready = needs.every(([id, quantity]) => (game.inventory[id] || 0) >= quantity);
        return <article className={`fe-order-card ${ready ? 'is-ready' : ''}`} key={order.id}>
          <div className="fe-order-top"><span className="fe-paper-pin" /><span>{kind === 'truck' ? '田间小货车' : '河畔货船'} · {index + 1} 号</span>{ready && <span className="fe-ready-label"><Check size={13} />备齐了</span>}</div>
          <h3>{kind === 'truck' ? '邻镇需要这些' : '下一程的货物'}</h3>
          <div className="fe-order-items">{needs.map(([id, quantity]) => {
            const item = getItem(id);
            const owned = game.inventory[id] || 0;
            return <div className={owned >= quantity ? 'has-stock' : ''} key={id}><span className="fe-item-icon" aria-hidden="true">{item.icon}</span><strong>{item.name}</strong><span className="fe-stock-count">{owned}<small> / {quantity}</small></span></div>;
          })}</div>
          <Reward coins={order.coins} xp={order.xp} />
          <div className="fe-order-actions"><button className="fe-button fe-button-green" disabled={!ready} onClick={() => commit(props, () => deliverOrder(game, order.id, now), '货物已经送出！')}><span>{kind === 'truck' ? <Truck size={16} /> : <Ship size={16} />}</span>{ready ? '装好，出发！' : '还差一些货物'}</button><button className="fe-icon-button" aria-label={`更换${index + 1}号订单`} title="更换订单" onClick={() => commit(props, () => discardOrder(game, order.id, now), '订单已经更换。')}><RefreshCw size={17} /></button></div>
        </article>;
      })}</div> : <div className="fe-order-empty"><EmptyNote icon={kind === 'boat' ? <Ship size={37} /> : <Truck size={37} />}>{kind === 'boat' ? `经营等级 ${BOAT_LEVEL} 可以接到货船订单，来安排下一程吧。` : '发货板还没有订单，接一批新订单吧。'}</EmptyNote><button className="fe-button" disabled={kind === 'boat' && getLevel(game) < BOAT_LEVEL} onClick={() => commit(props, () => ensureOrders(game, kind), '新订单来到发货板了。')}>{kind === 'boat' ? <Ship size={17} /> : <Truck size={17} />}{kind === 'boat' && getLevel(game) < BOAT_LEVEL ? `${BOAT_LEVEL} 级开放码头` : '接一批新订单'}</button></div>}
    </section>
    <p className="fe-footnote">本机 NPC 订单 · 交货会消耗库存；缺货时可以先种植、喂养，或去工坊安排加工。</p>
  </main>;
}

function StorageMeter({ game, kind }: { game: Game; kind: StorageKind }) {
  const used = storageUsed(game, kind);
  const capacity = kind === 'silo' ? game.siloCapacity : game.barnCapacity;
  return <article className={`fe-storage-meter fe-storage-${kind}`}><span className="fe-storage-picture">{kind === 'silo' ? <Wheat size={30} /> : <Warehouse size={30} />}</span><div><strong>{kind === 'silo' ? '筒仓' : '谷仓'}<span>{used} / {capacity}</span></strong><div className="fe-capacity-track" role="meter" aria-label={`${kind === 'silo' ? '筒仓' : '谷仓'}容量`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(used, capacity)}><i style={{ width: `${Math.min(100, used / Math.max(1, capacity) * 100)}%` }} /></div><small>{kind === 'silo' ? '粮食、蔬果收在这里' : '动物产物、加工品和工具'}</small></div></article>;
}

function UpgradeCard({ props, kind }: { props: EconomyPanelProps; kind: StorageKind }) {
  const { game } = props;
  const capacity = kind === 'silo' ? game.siloCapacity : game.barnCapacity;
  if (capacity >= MAX_STORAGE_CAPACITY) return <article className="fe-upgrade-card"><span className="fe-card-art">{kind === 'silo' ? <Wheat size={35} /> : <Warehouse size={35} />}</span><div><h3>{kind === 'silo' ? '筒仓' : '谷仓'}空间充足</h3><p>已扩到 {capacity} 格，达到本机农场的容量上限。</p><span className="fe-completed-note"><Check size={15} />全部扩容完成</span></div></article>;
  const cost = storageUpgradeCost(game, kind);
  const materials = Object.entries(cost.materials) as [ItemId, number][];
  const ready = game.coins >= cost.coins && materials.every(([id, amount]) => (game.inventory[id] || 0) >= amount);
  return <article className="fe-upgrade-card"><span className="fe-card-art">{kind === 'silo' ? <Wheat size={35} /> : <Warehouse size={35} />}</span><div><h3>{kind === 'silo' ? '筒仓' : '谷仓'}扩容</h3><p>让收成多一点落脚的地方</p><div className="fe-material-pills">{materials.map(([id, amount]) => <span className={(game.inventory[id] || 0) >= amount ? 'is-enough' : ''} key={id}>{getItem(id).icon} {getItem(id).name} {game.inventory[id] || 0}/{amount}</span>)}</div><button className="fe-button fe-button-green" disabled={!ready} onClick={() => commit(props, () => upgradeStorage(game, kind), '仓储空间变大了！')}><Plus size={15} />扩到 {cost.capacity} 格 · <Coins size={14} />{cost.coins}</button></div></article>;
}

export function StoragePanel(props: EconomyPanelProps) {
  const { game, now } = props;
  const [tab, setTab] = useState<'inventory' | 'supplies' | 'roadside' | 'upgrade'>('inventory');
  const [storage, setStorage] = useState<'all' | StorageKind>('all');
  const [saleItem, setSaleItem] = useState<ItemId>(() => ITEMS.find(item => (game.inventory[item.id] || 0) > 0)?.id || 'wheat');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState(() => String(getItem(saleItem).price));
  const level = getLevel(game);
  const ownedItems = ITEMS.filter(item => (game.inventory[item.id] || 0) > 0);
  const filteredItems = ownedItems.filter(item => storage === 'all' || item.storage === storage);
  const supplies = ITEMS.filter(item => (item.category === 'crop' || item.category === 'feed') && item.level <= level);
  const expansion = game.unlockedPlots >= 12 ? null : farmExpansionCost(game);
  const listings = game.shopListings.filter(listing => !listing.collected);
  return <main className="fe-panel fe-storage">
    <PanelHeading icon={<Warehouse size={29} />} title="把收成收好" description="从谷仓到路边摊，每一份收获都有自己的去处。"><span className="fe-level-stamp"><Coins size={15} /><strong>{game.coins}</strong> 金币</span></PanelHeading>
    <div className="fe-storage-meters"><StorageMeter game={game} kind="silo" /><StorageMeter game={game} kind="barn" /></div>
    <nav className="fe-tabs" aria-label="仓储与商店"><button className={tab === 'inventory' ? 'is-active' : ''} aria-pressed={tab === 'inventory'} onClick={() => setTab('inventory')}><Package size={16} />我的库存</button><button className={tab === 'supplies' ? 'is-active' : ''} aria-pressed={tab === 'supplies'} onClick={() => setTab('supplies')}><ShoppingBag size={16} />补给小铺</button><button className={tab === 'roadside' ? 'is-active' : ''} aria-pressed={tab === 'roadside'} onClick={() => setTab('roadside')}><Store size={16} />路边摊<span>{listings.length}</span></button><button className={tab === 'upgrade' ? 'is-active' : ''} aria-pressed={tab === 'upgrade'} onClick={() => setTab('upgrade')}><Plus size={16} />扩容与扩地</button></nav>
    {tab === 'inventory' && <section className="fe-paper-section"><div className="fe-section-heading"><h3>库存小账本</h3><div className="fe-filter" aria-label="筛选仓库">{(['all', 'silo', 'barn'] as const).map(kind => <button key={kind} aria-pressed={storage === kind} className={storage === kind ? 'is-active' : ''} onClick={() => setStorage(kind)}>{kind === 'all' ? '全部' : kind === 'silo' ? '筒仓' : '谷仓'}</button>)}</div></div>{filteredItems.length ? <div className="fe-inventory-grid">{filteredItems.map(item => <article className="fe-inventory-item" key={item.id}><span className="fe-item-icon" aria-hidden="true">{item.icon}</span><div><strong>{item.name}</strong><small>{item.storage === 'silo' ? '筒仓' : '谷仓'}</small></div><b>×{game.inventory[item.id]}</b></article>)}</div> : <EmptyNote icon={<Package size={34} />}>这里还空着。去田里收获，或到工坊收取做好了的产品吧。</EmptyNote>}</section>}
    {tab === 'supplies' && <section className="fe-paper-section"><div className="fe-section-heading"><h3>急用的种子与饲料</h3><small>经营等级 {level}</small></div><p className="fe-section-intro">补给价格稍高；自己种植、加工更划算。工具和扩建材料会在经营奖励中出现。</p><div className="fe-supply-grid">{supplies.map(item => <article className="fe-supply-card" key={item.id}><span className="fe-item-icon" aria-hidden="true">{item.icon}</span><div><strong>{item.name}</strong><small>库存 {game.inventory[item.id] || 0}</small></div><button className="fe-button fe-button-small" disabled={game.coins < item.price * 3} onClick={() => commit(props, () => buySupply(game, item.id, 1), `买到了${item.name}。`)}><Plus size={13} />1 份 · <Coins size={13} />{item.price * 3}</button></article>)}</div></section>}
    {tab === 'roadside' && <section className="fe-paper-section fe-roadside-section"><div className="fe-stall-banner"><Store size={32} /><div><h3>田边的小摊位</h3><p>本地 NPC 商人约 {Math.round(SALE_DELAY_MS / 60000)} 分钟后来买；售出后记得收款。</p></div></div><form className="fe-sale-form" onSubmit={event => { event.preventDefault(); commit(props, () => listForSale(game, saleItem, Number(quantity), Number(unitPrice), now), '商品摆上摊位了！'); }}><label>摆上什么<select value={saleItem} onChange={event => { const id = event.target.value as ItemId; setSaleItem(id); setUnitPrice(String(getItem(id).price)); }}>{ITEMS.filter(item => (game.inventory[item.id] || 0) > 0 || item.id === saleItem).map(item => <option value={item.id} key={item.id}>{item.icon} {item.name} · {game.inventory[item.id] || 0} 份</option>)}</select></label><label>数量<input inputMode="numeric" type="number" min="1" max="10" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label><label>每份金币<input inputMode="numeric" type="number" min="1" max={getItem(saleItem).price * 3} step="1" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} required /></label><button className="fe-button fe-button-green" type="submit" disabled={!(game.inventory[saleItem] || 0)}><Plus size={16} />摆上摊位</button></form>
      {listings.length ? <div className="fe-listing-grid">{listings.map(listing => {
        const sold = now >= listing.soldAt;
        const item = getItem(listing.item);
        return <article className={`fe-listing ${sold ? 'is-sold' : ''}`} key={listing.id}><span className="fe-item-icon" aria-hidden="true">{item.icon}</span><div><h4>{item.name} ×{listing.quantity}</h4><p><Coins size={13} />{listing.unitPrice * listing.quantity} 金币</p><small>{sold ? 'NPC 商人已经买下了' : `等待 NPC 商人 · ${remainingTime(listing.soldAt, now)}`}</small></div><button className="fe-button fe-button-small" disabled={!sold} onClick={() => commit(props, () => collectSale(game, listing.id, now), '金币已经收到。')}>{sold ? <Coins size={14} /> : <Timer size={14} />}{sold ? '收款' : '售卖中'}</button></article>;
      })}</div> : <EmptyNote icon={<Store size={36} />}>摆上多余的收成，让路过的商人带走它们。</EmptyNote>}<p className="fe-footnote">这是本机的 NPC 交易，没有与其他玩家交换商品。</p></section>}
    {tab === 'upgrade' && <section className="fe-paper-section"><div className="fe-section-heading"><h3>给农场留些新空间</h3><small>材料和金币一起用</small></div><div className="fe-upgrade-grid"><UpgradeCard props={props} kind="silo" /><UpgradeCard props={props} kind="barn" /><article className="fe-upgrade-card fe-expansion-card"><span className="fe-card-art"><Sprout size={35} /></span><div><h3>开垦一块新田</h3><p>已开放 {game.unlockedPlots} / {game.plots.length} 块田</p>{expansion && <small>经营等级 {expansion.level} 可开放下一块</small>}<button className="fe-button fe-button-green" disabled={!expansion || game.unlockedPlots >= game.plots.length || level < expansion.level || game.coins < expansion.coins} onClick={() => commit(props, () => expandFarm(game), '新田地已经开放！')}><Plus size={15} />{expansion ? <>开垦 · <Coins size={14} />{expansion.coins}</> : '田地已全部开放'}</button></div></article></div><p className="fe-footnote">收获与收取动物产物可带来工具和建材，积攒材料再升级。</p></section>}
  </main>;
}

function HoneyHive({ props }: { props: EconomyPanelProps }) {
  const { game, now } = props;
  const level = getLevel(game);
  const mature = game.beehiveBuilt && now >= game.beehiveReadyAt;
  return <section className="fe-paper-section fe-honey-card"><div className="fe-hive-art" aria-hidden="true"><svg viewBox="0 0 120 110"><path d="M28 91h67l-8 8H34z" fill="#9c7951" /><path d="m37 46 50-1 7 47H30z" fill="#dfb763" /><path d="M29 52h65v11H29zM31 69h61v11H31z" fill="#edcb7c" /><path d="m24 47 37-28 40 28z" fill="#bc8554" /><path d="M37 91h48" stroke="#866e47" strokeWidth="4" /><circle cx="63" cy="83" r="7" fill="#87673e" /><ellipse cx="97" cy="19" rx="8" ry="5" fill="#d7e4c8" transform="rotate(-30 97 19)" /><ellipse cx="106" cy="18" rx="8" ry="5" fill="#e1ebd5" transform="rotate(25 106 18)" /><ellipse cx="101" cy="25" rx="10" ry="6" fill="#e7be53" /><path d="M99 20v10m5-9v8" stroke="#796239" strokeWidth="3" /><path d="M102 39q8 17-12 23" stroke="#b8ab70" strokeDasharray="3 4" fill="none" /></svg></div><div><span className="fe-eyebrow">果园旁的甜蜜邻居</span><h3>蜜蜂的小木屋</h3><p>{game.beehiveBuilt ? mature ? '这一轮蜂蜜已经酿好，快收下来吧。' : `蜜蜂在游戏花丛里采蜜 · ${remainingTime(game.beehiveReadyAt, now)}` : `经营等级 ${BEEKEEPING_LEVEL} 可以建蜂箱，蜜蜂会从游戏花丛采蜜。`}</p><div className="fe-honey-footer"><span>{getItem('honey').icon} 蜂蜜 <strong>{game.inventory.honey || 0}</strong> 份</span><button className="fe-button fe-button-small" disabled={game.beehiveBuilt ? !mature : level < BEEKEEPING_LEVEL || game.coins < BEEHIVE_COST} onClick={() => commit(props, () => game.beehiveBuilt ? collectHoney(game, now) : buildBeehive(game, now), game.beehiveBuilt ? '蜂蜜已经收好。' : '蜂箱建好了。')}>{game.beehiveBuilt ? mature ? <ShoppingBag size={14} /> : <Timer size={14} /> : <Plus size={14} />}{game.beehiveBuilt ? mature ? '收取 2 份蜂蜜' : '蜜蜂正在采蜜' : level < BEEKEEPING_LEVEL ? `${BEEKEEPING_LEVEL} 级解锁` : `建蜂箱 · ${BEEHIVE_COST} 金币`}</button></div><small>每轮约 {Math.round(HONEY_COOLDOWN_MS / 60000)} 分钟，蜂蜜还能送到工坊加工。</small></div></section>;
}

export function ExplorationPanel(props: EconomyPanelProps) {
  const { game, now } = props;
  const [tab, setTab] = useState<'orchard' | 'fishing' | 'mine' | 'achievements'>('orchard');
  const level = getLevel(game);
  const fishingOpen = level >= FISHING_LEVEL;
  const mineOpen = level >= MINING_LEVEL;
  return <main className="fe-panel fe-exploration">
    <PanelHeading icon={<Trees size={29} />} title="农场的另一边" description="种一片果园，去河边甩一竿，也别忘了庆祝小小的进步。"><span className="fe-level-stamp">经营等级 <strong>{level}</strong></span></PanelHeading>
    <nav className="fe-tabs" aria-label="探索农场"><button className={tab === 'orchard' ? 'is-active' : ''} aria-pressed={tab === 'orchard'} onClick={() => setTab('orchard')}><Trees size={17} />果园</button><button className={tab === 'fishing' ? 'is-active' : ''} aria-pressed={tab === 'fishing'} onClick={() => setTab('fishing')}><Fish size={17} />河畔钓鱼</button><button className={tab === 'mine' ? 'is-active' : ''} aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}><Pickaxe size={17} />矿山</button><button className={tab === 'achievements' ? 'is-active' : ''} aria-pressed={tab === 'achievements'} onClick={() => setTab('achievements')}><Trophy size={17} />经营成就</button></nav>
    {tab === 'orchard' && <section className="fe-paper-section"><div className="fe-section-heading"><h3>果实慢慢长，日子甜一点</h3><small>{game.orchard.length} / {ORCHARD_LIMIT} 个果园位置</small></div><div className="fe-orchard-shop">{ORCHARD_FRUITS.map(fruit => <button className="fe-fruit-choice" key={fruit.id} disabled={level < fruit.level || game.coins < fruit.cost || game.orchard.length >= ORCHARD_LIMIT} onClick={() => commit(props, () => plantOrchard(game, fruit.id as OrchardPlot['fruit'], now), `种下了${fruit.name}。`)}><span aria-hidden="true">{fruit.icon}</span><strong>{fruit.name}</strong><small>{level < fruit.level ? `${fruit.level} 级解锁` : game.orchard.length >= ORCHARD_LIMIT ? '果园位置已满' : `${fruit.cost} 金币 · 种植`}</small></button>)}</div>
      {game.orchard.length ? <div className="fe-orchard-grid">{game.orchard.map(tree => {
        const fruit = ORCHARD_FRUITS.find(item => item.id === tree.fruit);
        const dead = tree.revived && tree.harvests >= 4;
        const ready = now >= tree.readyAt && !tree.needsHelp && !dead;
        return <article className={`fe-tree-card ${ready ? 'is-ready' : ''} ${dead ? 'is-withered' : ''}`} key={tree.id}><div className="fe-tree-art"><Trees size={57} /><span aria-hidden="true">{fruit?.icon || getItem(tree.fruit).icon}</span></div><div><h4>{fruit?.name || getItem(tree.fruit).name}<small> · 第 {tree.id} 棵</small></h4><p>{dead ? '这一季结束了，清理后可以种新的' : tree.needsHelp ? '需要一次照料，才能再结一季果实' : ready ? '果实成熟了，摘下来吧！' : `正在结果 · ${remainingTime(tree.readyAt, now)}`}</p><small>已收获 {tree.harvests} 次{tree.revived ? ' · 已获照料' : ''}</small><div className="fe-tree-actions">{dead ? <button className="fe-button fe-button-small" onClick={() => commit(props, () => clearOrchard(game, tree.id), '果园已清理。')}><Axe size={15} />用{fruit?.tool === 'axe' ? '斧头' : '锯子'}清理</button> : tree.needsHelp ? <button className="fe-button fe-button-green fe-button-small" onClick={() => commit(props, () => reviveOrchard(game, tree.id, now), 'NPC 邻居来帮忙了。')}><Leaf size={15} />请 NPC 邻居照料</button> : <button className="fe-button fe-button-green fe-button-small" disabled={!ready} onClick={() => commit(props, () => harvestOrchard(game, tree.id, now), '新鲜果实放进筒仓了！')}>{ready ? <ShoppingBag size={15} /> : <Timer size={15} />}{ready ? '采摘果实' : '等果实成熟'}</button>}</div></div></article>;
      })}</div> : <EmptyNote icon={<Trees size={38} />}>从上面挑一棵喜欢的果树，给农场添些甜。</EmptyNote>}<p className="fe-footnote">果树经过几轮收获需要照料；本机 NPC 可以帮一次，枯树用对应工具清理。</p></section>}
    {tab === 'orchard' && <HoneyHive props={props} />}
    {tab === 'fishing' && <section className="fe-paper-section fe-adventure-section"><div className="fe-adventure-art fe-fishing-art" aria-hidden="true"><svg viewBox="0 0 500 210"><path fill="#dae9c2" d="M0 0h500v210H0z" /><path fill="#88b9ac" d="M0 116c95-38 134 34 221 0s170-27 279 5v89H0z" /><path fill="none" stroke="#c6e5d8" strokeWidth="5" d="M19 153h108m184 14h100M172 184h64" /><path fill="#b48650" d="m318 101 76 15-5 16-76-15z" /><path fill="none" stroke="#746546" strokeWidth="4" strokeLinecap="round" d="m360 99-37-71m0 0c-70-4-101 21-105 97" /><path fill="none" stroke="#f4ecd8" strokeWidth="2" d="m218 125-8 23" /><circle fill="#d96c53" cx="210" cy="149" r="6" /><path fill="#567747" d="m45 122 6-43 11 45zm21 2 11-56 4 57zm374 3 2-53 9 55z" /></svg></div><div className="fe-adventure-info"><span className="fe-eyebrow">河畔的慢时光</span><h3>带两份鱼肉回家</h3><p>带回鱼肉，在工坊做一份热腾腾的鱼料理。</p><div className="fe-adventure-stock"><span>{getItem('fish_fillet').icon} 鱼肉 <strong>{game.inventory.fish_fillet || 0}</strong> 份</span></div><button className="fe-button fe-button-green" disabled={!fishingOpen || now < game.fishingReadyAt} onClick={() => commit(props, () => catchFish(game, now), '鱼肉已经放进谷仓。')}><Fish size={17} />{!fishingOpen ? `${FISHING_LEVEL} 级解锁钓鱼` : now < game.fishingReadyAt ? `鱼群休息中 · ${remainingTime(game.fishingReadyAt, now)}` : '到河边钓一竿'}</button><p className="fe-footnote">捕获后鱼群需要休息；这次探索属于你的本机农场。</p></div></section>}
    {tab === 'mine' && <section className="fe-paper-section fe-adventure-section"><div className="fe-adventure-art fe-mine-art" aria-hidden="true"><svg viewBox="0 0 500 210"><path fill="#dfe5cb" d="M0 0h500v210H0z" /><path fill="#8f9270" d="m67 169 74-107 66 14 79-50 68 60 93 83z" /><path fill="#747b5e" d="m115 169 77-83 49 29 52-77 61 61 50 70z" /><path fill="#3e4b40" d="M198 169V110a43 43 0 0 1 86 0v59z" /><path fill="none" stroke="#bd9564" strokeWidth="12" d="M198 169V110a43 43 0 0 1 86 0v59" /><path fill="none" stroke="#bfa785" strokeWidth="5" d="m211 172-22 38m74-38 22 38m-88-27h81m-88 15h97" /><path fill="#bdb19a" d="m106 169 15-11 18 12-8 10zm235 11 11-17 26 9-8 14z" /><path fill="#d7b354" d="m365 132 5-13 10 5-5 13z" /></svg></div><div className="fe-adventure-info"><span className="fe-eyebrow">山脚的小矿坑</span><h3>带工具来，带矿石回去</h3><p>矿石可以送进冶炼炉，做成铁锭、金锭，再加工饰品。</p><div className="fe-adventure-stock"><span>{getItem('shovel').icon} 铁锹 <strong>{game.inventory.shovel || 0}</strong></span><span>{getItem('dynamite').icon} 炸药 <strong>{game.inventory.dynamite || 0}</strong></span></div><button className="fe-button fe-button-green" disabled={!mineOpen || now < game.mineReadyAt || !(game.inventory.shovel || game.inventory.dynamite)} onClick={() => commit(props, () => mineOre(game, now), '开采到的矿石放进谷仓了。')}><Pickaxe size={17} />{!mineOpen ? `${MINING_LEVEL} 级解锁矿山` : now < game.mineReadyAt ? `矿坑休整中 · ${remainingTime(game.mineReadyAt, now)}` : game.inventory.shovel || game.inventory.dynamite ? '使用工具开采' : '先积攒一件采矿工具'}</button><p className="fe-footnote">优先使用铁铲；铁铲用完后使用炸药，{getItem('gold_ore').level} 级起可用炸药带回金矿。工具来自经营奖励。</p></div></section>}
    {tab === 'achievements' && <section className="fe-paper-section"><div className="fe-section-heading"><h3>每一点进步，都记得</h3><small>已领取 {game.achievements.length} 项</small></div><div className="fe-achievement-grid">{ACHIEVEMENTS.map(achievement => {
      const progress = achievementProgress(game, achievement.id);
      const claimed = game.achievements.includes(achievement.id);
      const ready = progress >= achievement.target;
      return <article className={`fe-achievement-card ${claimed ? 'is-claimed' : ''}`} key={achievement.id}><span className="fe-achievement-medal"><Trophy size={27} /></span><div><h4>{achievement.name}</h4><p>{achievement.description}</p><div className="fe-achievement-progress"><div className="fe-capacity-track"><i style={{ width: `${Math.min(100, progress / Math.max(1, achievement.target) * 100)}%` }} /></div><small>{Math.min(progress, achievement.target)} / {achievement.target}</small></div><Reward coins={achievement.coins} gems={achievement.gems} /></div><button className="fe-button fe-button-small" disabled={!ready || claimed} onClick={() => commit(props, () => claimAchievement(game, achievement.id), '成就奖励已经收到！')}>{claimed ? <Check size={14} /> : <Trophy size={14} />}{claimed ? '已领取' : ready ? '领取奖励' : '继续加油'}</button></article>;
    })}</div></section>}
  </main>;
}
