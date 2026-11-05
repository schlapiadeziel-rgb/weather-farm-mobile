import { useId } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Factory, Truck, Warehouse } from 'lucide-react';
import type { FarmSeason } from '../lib/farmSeason';
import './farm-journey.css';

interface FarmSeasonCardProps {
  season: FarmSeason;
  collapsed: boolean;
  onToggle(): void;
  onAction(): void;
}

/** A navigation invitation for the mid-game. Real expansions, queues and deliveries advance it. */
export default function FarmSeasonCard({ season, collapsed, onToggle, onAction }: FarmSeasonCardProps) {
  const detailId = useId();
  const Icon = season.step === 'expand' ? Warehouse : season.step === 'workshop' ? Factory : Truck;
  const progress = `${season.completed}/${season.total}`;
  const section = season.target.type === 'storage' ? season.target.section : undefined;
  return <section className={`farm-season${collapsed ? ' is-collapsed' : ''}`} aria-label="中期经营" data-no-camera data-season-step={season.step} data-season-completed={season.completed} data-season-collapsed={collapsed} data-season-target={season.target.type} data-season-section={section}>
    {collapsed ? <button type="button" className="fj-expand" onClick={onToggle} aria-expanded={false} aria-label={`展开中期经营，已完成${season.completed}步，共${season.total}步`} title={season.title}>
      <Icon size={18} aria-hidden="true" /><span>中期经营</span><strong>{progress}</strong><ChevronUp size={16} aria-hidden="true" />
    </button> : <>
      <div className="fj-copy">
        <div className="fj-eyebrow"><span>中期经营</span><span className="fj-progress" role="progressbar" aria-label="中期经营进度" aria-valuemin={0} aria-valuemax={season.total} aria-valuenow={season.completed} aria-valuetext={`已完成${season.completed}步，共${season.total}步`}>
          {Array.from({ length: season.total }, (_, index) => <i key={index} className={index < season.completed ? 'is-complete' : index === season.completed ? 'is-current' : ''} aria-hidden="true" />)}
        </span><strong aria-hidden="true">{progress}</strong></div>
        <h2><Icon size={16} aria-hidden="true" /><span>{season.title}</span></h2>
        <p id={detailId} title={season.detail}>{season.detail}</p>
      </div>
      <button type="button" className="fj-action" onClick={onAction} aria-describedby={detailId}><span>{season.actionLabel}</span><ArrowRight size={16} aria-hidden="true" /></button>
      <button type="button" className="fj-collapse" onClick={onToggle} aria-expanded={true} aria-label="收起中期经营"><ChevronDown size={18} aria-hidden="true" /></button>
    </>}
  </section>;
}
