import { Coins, Diamond, Leaf, Menu } from 'lucide-react';
import type { Game } from '../lib/farmTypes';
import { getLevel } from '../lib/game';
import './farm-scene-hud.css';

/** Corner-only game HUD; the landscape stays behind every control. */
export default function FarmSceneHud({ game, onMenu, onAssistant, onActivity, ready, hasUpdate }: { game: Game; onMenu(): void; onAssistant(): void; onActivity(): void; ready: boolean; hasUpdate: boolean }) {
  const level = getLevel(game);
  const base = 20 * (level - 1) ** 2;
  const target = 20 * level ** 2;
  const progress = Math.min(100, Math.max(0, (game.xp - base) / (target - base) * 100));
  return <div className="farm-scene-hud" aria-label="农场状态与快捷入口">
    <button className="fsh-level" onClick={onActivity} aria-label={`查看农场成长与看板，等级 ${level}，经验 ${game.xp}，下一级 ${target}`} title={`Lv. ${level} · ${game.xp}/${target} 经验`}>
      <span className="fsh-level-seal"><Leaf size={28} aria-hidden="true" /><strong>{level}</strong></span>
      <span className="fsh-xp"><span style={{ width: `${progress}%` }} /></span>
    </button>
    <div className="fsh-wallet" aria-label={`金币 ${game.coins}，钻石 ${game.gems}`}>
      <span><strong>{game.coins.toLocaleString('zh-CN')}</strong><Coins size={23} aria-hidden="true" /></span>
      <span><strong>{game.gems.toLocaleString('zh-CN')}</strong><Diamond size={21} aria-hidden="true" /></span>
    </div>
    <button className="fsh-corner fsh-menu" onClick={onMenu} aria-label="打开农场菜单" aria-haspopup="dialog" title="农场菜单"><Menu size={24} aria-hidden="true" /><span>经营</span>{(ready || hasUpdate) && <i aria-hidden="true" />}</button>
    <button className="fsh-corner fsh-assistant" onClick={onAssistant} aria-label="进入农场助手" title="独立农场助手"><Leaf size={25} aria-hidden="true" /><span>助手</span></button>
  </div>;
}
