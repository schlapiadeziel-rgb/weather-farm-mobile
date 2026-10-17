import { Hand, Leaf, ShoppingBasket } from 'lucide-react';
import type { AnimalMode } from '../lib/animalStroke';
import type { Game } from '../lib/farmTypes';
import './animal-tools.css';

export type AnimalToolsProps = {
  game: Game;
  mode: AnimalMode;
  onModeChange(mode: AnimalMode): void;
};

export function AnimalTools({ game, mode, onModeChange }: AnimalToolsProps) {
  const hungry = game.animals.filter(pen => pen.animal && pen.readyAt === undefined).length;
  const ready = game.animals.filter(pen => pen.animal && pen.progress >= 100).length;
  return <div className="animal-tools" data-no-camera="true">
    <div className="animal-tool-modes" role="group" aria-label="牧场操作方式">
      <button type="button" className={mode === 'browse' ? 'active' : ''} aria-label="浏览牧场，轻触查看，划动滚动畜舍" aria-pressed={mode === 'browse'} onClick={() => onModeChange('browse')}><Hand size={18} /><span>浏览</span></button>
      <button type="button" className={mode === 'feed' ? 'active' : ''} aria-label={`连续投喂，${hungry}个畜舍待喂养`} aria-pressed={mode === 'feed'} onClick={() => onModeChange('feed')}><Leaf size={18} /><span>投喂{hungry > 0 && <small>{hungry}</small>}</span></button>
      <button type="button" className={mode === 'collect' ? 'active' : ''} aria-label={`连续收集，${ready}个畜舍产物可收集`} aria-pressed={mode === 'collect'} onClick={() => onModeChange('collect')}><ShoppingBasket size={18} /><span>收集{ready > 0 && <small>{ready}</small>}</span></button>
    </div>
    <p className="animal-tool-hint">{mode === 'browse' ? '轻触查看 · 划动滚动畜舍' : mode === 'feed' ? '划过待喂动物，松手投喂' : '划过成熟产物，松手收集'}</p>
  </div>;
}

export default AnimalTools;
