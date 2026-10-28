import { ArrowLeft, X } from 'lucide-react';
import type { ItemId } from '../lib/farmTypes';
import { getItem } from '../lib/farmContent';
import './supply-return.css';

export default function SupplyReturn({ item, depth, onReturn, onClear }: { item: ItemId; depth: number; onReturn(): void; onClear(): void }) {
  const name = getItem(item).name;
  return <div className="supply-return" role="group" aria-label="配方补货返回" data-no-camera>
    <button type="button" className="supply-return-main" onClick={onReturn} aria-label={`返回${name}配方`}><ArrowLeft size={17} aria-hidden="true" /><span><strong>返回{name}配方</strong><small>补货途中{depth > 1 ? ` · ${depth} 层配方` : ''}</small></span></button>
    <button type="button" className="supply-return-close" onClick={onClear} aria-label="结束本次配方补货导航"><X size={16} aria-hidden="true" /></button>
  </div>;
}
