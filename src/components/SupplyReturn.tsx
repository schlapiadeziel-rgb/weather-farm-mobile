import { ArrowLeft, X } from 'lucide-react';
import type { ItemId } from '../lib/farmTypes';
import { getItem } from '../lib/farmContent';
import { getTownBuilding } from '../lib/townState';
import type { TownSupplyOrigin } from './FarmTown';
import type { OrderSupplyOrigin } from '../lib/orderSupply';
import './supply-return.css';

type SupplyReturnProps = { onReturn(): void; onClear(): void } & (
  | { item: ItemId; depth: number; town?: never; order?: never }
  | { town: TownSupplyOrigin; item?: never; depth?: never; order?: never }
  | { order: OrderSupplyOrigin; item?: never; depth?: never; town?: never }
);

export default function SupplyReturn({ item, depth, town, order, onReturn, onClear }: SupplyReturnProps) {
  const label = town ? `返回${town.visitorName}访客` : order ? `返回${order.kind === 'boat' ? '货船' : '卡车'}${order.orderNumber}号订单` : `返回${getItem(item).name}配方`;
  const detail = town ? `${getTownBuilding(town.buildingId).name} · 补货途中` : order ? '补货途中 · 回到原订单' : `补货途中${depth > 1 ? ` · ${depth} 层配方` : ''}`;
  const context = town ? '小镇' : order ? '订单' : '配方';
  return <div className="supply-return" role="group" aria-label={`${context}补货返回`} data-no-camera data-supply-return={town ? 'town' : order ? 'order' : 'recipe'}>
    <button type="button" className="supply-return-main" onClick={onReturn} aria-label={label}><ArrowLeft size={17} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span></button>
    <button type="button" className="supply-return-close" onClick={onClear} aria-label={`结束本次${context}补货导航`}><X size={16} aria-hidden="true" /></button>
  </div>;
}
