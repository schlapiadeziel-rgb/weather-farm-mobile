import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Hand, HelpCircle, LockKeyhole, Sprout, Wheat, X } from 'lucide-react';
import { CROPS } from '../lib/farmContent';
import { getLevel } from '../lib/game';
import type { CropId, Game } from '../lib/farmTypes';
import type { FieldMode } from '../lib/fieldStroke';
import { CropVisual } from './FarmVisual';
import './field-tools.css';

export type FieldToolsProps = {
  game: Game;
  mode: FieldMode;
  seed: CropId;
  onModeChange(mode: FieldMode): void;
  onSeedChange(seed: CropId): void;
  onHelp?(): void;
};

export function FieldTools({ game, mode, seed, onModeChange, onSeedChange, onHelp }: FieldToolsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [position, setPosition] = useState({ left: 16, top: 70 });
  const crop = CROPS.find(candidate => candidate.id === seed) ?? CROPS[0];
  const level = getLevel(game);
  const stock = game.inventory[crop.id] ?? 0;

  useEffect(() => {
    if (!pickerOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const place = () => {
      const bounds = anchor.current?.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 24);
      const height = picker.current?.offsetHeight ?? 292;
      setPosition({ left: Math.max(12, Math.min((bounds?.right ?? 156) + 8, window.innerWidth - width - 12)), top: Math.max(12, Math.min(bounds?.top ?? 70, window.innerHeight - height - 12)) });
    };
    place();
    const selected = picker.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)');
    (selected ?? picker.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPickerOpen(false); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...(picker.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('resize', place);
    document.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [pickerOpen]);

  useEffect(() => { if (mode !== 'plant') setPickerOpen(false); }, [mode]);

  return <>
    <div className={`field-tools ${mode === 'plant' ? 'field-tools-with-seed' : ''} ${onHelp ? 'field-tools-with-help' : ''}`} data-no-camera="true">
      <div className="field-tool-modes" role="group" aria-label="田地操作方式">
        <button type="button" className={mode === 'browse' ? 'active' : ''} aria-label="浏览田地" aria-pressed={mode === 'browse'} onClick={() => onModeChange('browse')}><Hand size={18} /><span>浏览</span></button>
        <button type="button" className={mode === 'plant' ? 'active' : ''} aria-label="连续播种" aria-pressed={mode === 'plant'} onClick={() => onModeChange('plant')}><Sprout size={19} /><span>播种</span></button>
        <button type="button" className={mode === 'harvest' ? 'active' : ''} aria-label="连续收获" aria-pressed={mode === 'harvest'} onClick={() => onModeChange('harvest')}><Wheat size={19} /><span>收获</span></button>
      </div>
      {mode === 'plant' && <button ref={anchor} type="button" className={`field-seed-button ${stock ? '' : 'out-of-seeds'}`} aria-label={`选择播种作物，当前${crop.name}，库存${stock}`} aria-haspopup="dialog" aria-expanded={pickerOpen} onClick={() => setPickerOpen(true)}><span className="field-selected-seed"><CropVisual crop={crop.id} growth={100} health={100} /></span><span><strong>{crop.name}</strong><small><span>库存 {stock}</span><span className="field-seed-cost"> · 每块用 1</span></small></span><ChevronRight size={15} /></button>}
      <div className="field-tool-hint"><p>{mode === 'browse' ? '轻触查看 · 划动地图' : mode === 'plant' ? stock ? <><span className="field-tool-seed-name">{crop.name}：</span>划过空地，松手播种</> : '没有种子了，去仓库补给' : '划过成熟作物，松手收获'}</p>{onHelp && <button type="button" aria-label="查看田地操作帮助" onClick={onHelp}><HelpCircle size={17} /></button>}</div>
    </div>
    {pickerOpen && createPortal(<div className="field-seed-overlay" onPointerDown={event => { if (event.target === event.currentTarget) setPickerOpen(false); }}><div ref={picker} className="field-seed-picker" role="dialog" aria-modal="true" aria-labelledby={headingId} style={position}>
      <div className="field-seed-heading"><div><h2 id={headingId}>种子口袋</h2><p>选一份库存，种到空地里</p></div><button type="button" aria-label="收起种子口袋" onClick={() => setPickerOpen(false)}><X size={19} /></button></div>
      <div className="field-seed-grid">{CROPS.map(candidate => {
        const locked = level < candidate.level;
        const quantity = game.inventory[candidate.id] ?? 0;
        return <button type="button" key={candidate.id} disabled={locked} aria-pressed={seed === candidate.id} aria-label={`${candidate.name}，${locked ? `${candidate.level}级解锁` : `库存${quantity}`}`} className={`${seed === candidate.id ? 'selected' : ''} ${!quantity ? 'empty-stock' : ''}`} onClick={() => { onSeedChange(candidate.id); setPickerOpen(false); }}><span className="field-seed-art"><CropVisual crop={candidate.id} growth={100} health={100} /></span><strong>{candidate.name}</strong><small>{locked ? <><LockKeyhole size={10} />Lv. {candidate.level}</> : `库存 ${quantity}`}</small>{seed === candidate.id && <Check className="field-seed-check" size={12} />}</button>;
      })}</div>
      <p className="field-seed-note">播种消耗 1 份作物，收获得到 2 份。</p>
    </div></div>, document.body)}
  </>;
}

export default FieldTools;
