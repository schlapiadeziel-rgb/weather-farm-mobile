import { useEffect, useState } from 'react';
import { Leaf, PackageOpen, Sprout, Wheat } from 'lucide-react';
import type { FarmActionFeedbackData } from '../lib/farmActionFeedback';
import './farm-action-feedback.css';

export type FarmActionFeedbackProps = { data: FarmActionFeedbackData };

/** One decorative summary per completed action. Mount with a new key to replay. */
export default function FarmActionFeedback({ data }: FarmActionFeedbackProps) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 2200);
    return () => window.clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  const Icon = { plant: Sprout, harvest: Wheat, feed: Leaf, collect: PackageOpen }[data.action];
  const unit = data.action === 'plant' || data.action === 'harvest' ? '块田' : '个畜舍';
  return <div className={`farm-action-feedback farm-action-feedback-${data.action}`} aria-hidden="true">
    <div className="faf-heading"><Icon size={16} /><strong>{data.title}</strong><span>{data.count} {unit}</span>{data.unsaved && <b className="faf-unsaved">未保存</b>}</div>
    <div className="faf-chips">{data.chips.map(chip => <span key={chip.id} className={chip.delta < 0 ? 'faf-chip faf-consumed' : 'faf-chip'}>
      <span>{chip.label}</span><b>{chip.delta > 0 ? '+' : '−'}{Math.abs(chip.delta)}</b>
    </span>)}{data.remainingCount > 0 && <span className="faf-more">另 {data.remainingCount} 项</span>}</div>
  </div>;
}
