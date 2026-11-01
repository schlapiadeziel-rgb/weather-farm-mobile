import { ArrowLeft, X } from 'lucide-react';
import type { ItemId } from '../lib/farmTypes';
import { getItem } from '../lib/farmContent';
import { getTownBuilding } from '../lib/townState';
import type { TownSupplyOrigin } from './FarmTown';
import './supply-return.css';

type SupplyReturnProps = { onReturn(): void; onClear(): void } & (
  | { item: ItemId; depth: number; town?: never }
  | { town: TownSupplyOrigin; item?: never; depth?: never }
);

export default function SupplyReturn({ item, depth, town, onReturn, onClear }: SupplyReturnProps) {
  const label = town ? `返回${town.visitorName}访客` : `返回${getItem(item).name}配方`;
  const detail = town ? `${getTownBuilding(town.buildingId).name} · 补货途中` : `补货途中${depth > 1 ? ` · ${depth} 层配方` : ''}`;
  return <div className="supply-return" role="group" aria-label={town ? '小镇补货返回' : '配方补货返回'} data-no-camera data-supply-return={town ? 'town' : 'recipe'}>
    <button type="button" className="supply-return-main" onClick={onReturn} aria-label={label}><ArrowLeft size={17} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span></button>
    <button type="button" className="supply-return-close" onClick={onClear} aria-label={town ? '结束本次小镇补货导航' : '结束本次配方补货导航'}><X size={16} aria-hidden="true" /></button>
  </div>;
}
