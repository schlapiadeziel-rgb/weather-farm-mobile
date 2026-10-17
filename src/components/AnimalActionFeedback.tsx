import { useEffect, useState } from 'react';
import { Check, Leaf } from 'lucide-react';

export type AnimalActionFeedbackProps = {
  action: 'feed' | 'collect';
  product?: string;
};

/** Decorative feedback only. The gesture's summary supplies the accessible status. */
export default function AnimalActionFeedback({ action, product }: AnimalActionFeedbackProps) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 1600);
    return () => window.clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return <span className={`animal-action-feedback animal-action-feedback-${action}`} aria-hidden="true">
    {action === 'feed' ? <Leaf size={15} /> : <Check size={15} />}
    <span>{action === 'feed' ? '已喂食' : `${product || '产物'} +1`}</span>
  </span>;
}
