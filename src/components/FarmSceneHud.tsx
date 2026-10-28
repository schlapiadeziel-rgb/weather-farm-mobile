import { useState } from 'react';
import type { ReactNode } from 'react';
import { Coins, Diamond, Leaf, Menu } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import { getLevel } from '../lib/game';
import './farm-scene-hud.css';

/** Slide between real values; screen readers receive the new value immediately. */
function RollingNumber({ value, name }: { value: number; name: 'level' | 'coins' | 'gems' }) {
  const [snapshot, setSnapshot] = useState<{ value: number; previous: number | null; change: number }>({ value, previous: null, change: 0 });
  // Adjusting this component's state during render avoids a frame showing stale props.
  if (snapshot.value !== value) setSnapshot({ value, previous: snapshot.value, change: snapshot.change + 1 });
  const changed = snapshot.previous !== null;
  const formatted = value.toLocaleString('zh-CN');
  return <strong className="fsh-number" data-hud-number={name} data-number-value={value}>
    <span className="fsh-number-readable">{formatted}</span>
    <span key={snapshot.change} className={`fsh-number-visual${changed ? ' fsh-number-changing' : ''}`} data-number-direction={changed && value < snapshot.previous! ? 'down' : 'up'} aria-hidden="true">
      <span className="fsh-number-current" data-number-current={value}>{formatted}</span>
      {changed && <span className="fsh-number-previous" onAnimationEnd={() => setSnapshot(current => current.change === snapshot.change ? { ...current, previous: null } : current)}>{snapshot.previous!.toLocaleString('zh-CN')}</span>}
    </span>
  </strong>;
}

/** Corner-only game HUD; the landscape stays behind every control. */
export default function FarmSceneHud({ game, onMenu, onAssistant, onActivity, ready, hasUpdate, context }: { game: Game; onMenu(): void; onAssistant(): void; onActivity(): void; ready: boolean; hasUpdate: boolean; context?: ReactNode }) {
  const level = getLevel(game);
  const base = 20 * (level - 1) ** 2;
  const target = 20 * level ** 2;
  const progress = Math.min(100, Math.max(0, (game.xp - base) / (target - base) * 100));
  return <div className="farm-scene-hud" aria-label="农场状态与快捷入口">
    <button className="fsh-level" onClick={onActivity} aria-label={`查看农场成长与看板，等级 ${level}，经验 ${game.xp}，下一级 ${target}`} title={`Lv. ${level} · ${game.xp}/${target} 经验`} data-actual-level={level} data-actual-xp={game.xp} data-xp-progress={progress}>
      <span className="fsh-level-seal">
        <svg key={level} className="fsh-xp-ring" viewBox="0 0 53 53" aria-hidden="true">
          <circle className="fsh-xp-ring-track" cx="26.5" cy="26.5" r="23" />
          <circle className="fsh-xp-ring-progress" cx="26.5" cy="26.5" r="23" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress} style={{ opacity: progress === 0 ? 0 : 1 }} />
        </svg>
        <Leaf className="fsh-level-leaf" size={28} aria-hidden="true" /><RollingNumber value={level} name="level" />
      </span>
      <span className="fsh-xp" aria-hidden="true"><span key={level} style={{ transform: `scaleX(${progress / 100})` }} /></span>
    </button>
    {context ? <div className="fsh-context">{context}</div> : <div className="fsh-wallet" aria-label={`金币 ${game.coins}，钻石 ${game.gems}`}>
      <span><RollingNumber value={game.coins} name="coins" /><Coins size={23} aria-hidden="true" /></span>
      <span><RollingNumber value={game.gems} name="gems" /><Diamond size={21} aria-hidden="true" /></span>
    </div>}
    <button className="fsh-corner fsh-menu" onClick={onMenu} aria-label="打开农场菜单" aria-haspopup="dialog" title="农场菜单"><Menu size={24} aria-hidden="true" /><span>经营</span>{(ready || hasUpdate) && <i aria-hidden="true" />}</button>
    <button className="fsh-corner fsh-assistant" onClick={onAssistant} aria-label="进入农场助手" title="独立农场助手"><Leaf size={25} aria-hidden="true" /><span>助手</span></button>
  </div>;
}
