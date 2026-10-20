import { ChevronRight, Clock3, MessageCircle } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import { getItem } from '../lib/farmContent';
import { getFarmVisitorProfile } from '../lib/farmVisitors';
import { FarmVisitorPortrait } from './FarmVisitorArt';
import './farm-visitor-entry.css';

/** A screen-fixed entrance: no saved farm layout is occupied or moved. */
export default function FarmVisitorEntry({ game, now, onOpen }: { game: Game; now: number; onOpen(): void }) {
  const { visitor, nextArrivalAt } = game.farmVisitors;
  const remaining = Math.max(0, Math.ceil((nextArrivalAt - now) / 1000));
  const available = !!visitor || remaining === 0;
  const profile = getFarmVisitorProfile(visitor?.profileId ?? 'seed_post');
  return <button className={`farm-visitor-entry${available ? ' farm-visitor-entry-ready' : ''}`} onClick={onOpen} aria-label="打开农场门口" aria-haspopup="dialog" data-visitor-entry>
    <span className="farm-visitor-entry-art"><FarmVisitorPortrait profileId={profile.id} compact /></span>
    <span className="farm-visitor-entry-copy"><strong><MessageCircle size={13} aria-hidden="true" />农场门口</strong><small>{visitor ? `${getItem(visitor.item).name} ×${visitor.quantity} · 邻居等你` : available ? '看看谁来了' : <><Clock3 size={11} aria-hidden="true" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} 后再来</>}</small></span>
    <ChevronRight size={15} aria-hidden="true" />
    {available && <span className="farm-visitor-entry-dot" aria-hidden="true" />}
  </button>;
}
