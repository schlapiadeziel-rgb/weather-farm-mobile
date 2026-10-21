import { Factory, PackageCheck } from 'lucide-react';
import type { FarmMapSignal } from '../lib/farmMapSignals';
import './farm-map-signals.css';

/** These hints live in the camera world and follow each saved building anchor. */
export default function FarmMapSignals({ signals, onVisit, currentArea, blocked = false }: { signals: FarmMapSignal[]; onVisit(area: FarmMapSignal['area']): void; currentArea?: FarmMapSignal['area']; blocked?: boolean }) {
  return <div className="farm-map-signals" aria-label="建筑待收提示">
    {signals.filter(signal => signal.area !== currentArea).map(signal => <button key={signal.area} type="button" className={`farm-map-signal farm-map-signal-${signal.area}`} style={{ left: `${signal.x / 12}%`, top: `${signal.y / 7}%` }} aria-label={signal.label} title={signal.label} data-map-signal={signal.area} data-ready-count={signal.count} onClick={() => onVisit(signal.area)} disabled={blocked}>
      {signal.area === 'production' ? <Factory size={19} aria-hidden="true" /> : <PackageCheck size={19} aria-hidden="true" />}<strong>{signal.count > 99 ? '99+' : signal.count}</strong><span className="farm-map-signal-tail" aria-hidden="true" />
    </button>)}
  </div>;
}
