import { useEffect, useState } from 'react';
import { Check, Sprout } from 'lucide-react';
import './plot-action-feedback.css';

/** Decoration only: the shared action summary announces the actual result. */
export default function PlotActionFeedback({ action, unsaved = false }: { action: 'plant' | 'harvest'; unsaved?: boolean }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 1600);
    return () => window.clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  const Icon = action === 'plant' ? Sprout : Check;
  return <span className="plot-action-feedback" data-plot-action={action} data-unsaved={unsaved} aria-hidden="true">
    <span className="plot-action-feedback-badge"><Icon size={13} />{unsaved ? '未保存' : action === 'plant' ? '已播种' : '已收获'}</span>
  </span>;
}
