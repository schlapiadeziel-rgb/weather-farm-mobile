import { useId } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, ClipboardCheck, PawPrint, Wheat } from 'lucide-react';
import type { FarmJourney } from '../lib/farmJourney';
import './farm-journey.css';

interface FarmJourneyCardProps {
  journey: FarmJourney;
  collapsed: boolean;
  onToggle(): void;
  onAction(): void;
}

/** A navigation invitation; completing real farm actions advances the journey. */
export default function FarmJourneyCard({ journey, collapsed, onToggle, onAction }: FarmJourneyCardProps) {
  const detailId = useId();
  const Icon = journey.step === 'harvest' ? Wheat : journey.step === 'animal' ? PawPrint : ClipboardCheck;
  const progress = `${journey.completed}/${journey.total}`;
  return <section className={`farm-journey${collapsed ? ' is-collapsed' : ''}`} aria-label="第一轮经营" data-no-camera data-journey-step={journey.step} data-journey-completed={journey.completed} data-journey-collapsed={collapsed}>
    {collapsed ? <button type="button" className="fj-expand" onClick={onToggle} aria-expanded={false} aria-label={`展开第一轮经营，已完成${journey.completed}步，共${journey.total}步`} title={journey.title}>
      <Icon size={18} aria-hidden="true" /><span>第一轮经营</span><strong>{progress}</strong><ChevronUp size={16} aria-hidden="true" />
    </button> : <>
      <div className="fj-copy">
        <div className="fj-eyebrow"><span>第一轮经营</span><span className="fj-progress" role="progressbar" aria-label="第一轮经营进度" aria-valuemin={0} aria-valuemax={journey.total} aria-valuenow={journey.completed} aria-valuetext={`已完成${journey.completed}步，共${journey.total}步`}>
          {Array.from({ length: journey.total }, (_, index) => <i key={index} className={index < journey.completed ? 'is-complete' : index === journey.completed ? 'is-current' : ''} aria-hidden="true" />)}
        </span><strong aria-hidden="true">{progress}</strong></div>
        <h2><Icon size={16} aria-hidden="true" /><span>{journey.title}</span></h2>
        <p id={detailId} title={journey.detail}>{journey.detail}</p>
      </div>
      <button type="button" className="fj-action" onClick={onAction} aria-describedby={detailId}><span>{journey.actionLabel}</span><ArrowRight size={16} aria-hidden="true" /></button>
      <button type="button" className="fj-collapse" onClick={onToggle} aria-expanded={true} aria-label="收起第一轮经营"><ChevronDown size={18} aria-hidden="true" /></button>
    </>}
  </section>;
}
