import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Upload, X } from 'lucide-react';
import type { Game } from '../lib/game';
import { getLevel } from '../lib/game';
import { parseGameBackup } from '../lib/gameSave';
import './game-backup.css';

export default function GameBackupControls({ onRestore, onExport, exporting, notify }: {
  onRestore: (game: Game) => void;
  onExport: () => Promise<void>;
  exporting: boolean;
  notify: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<Game | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPending(null); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus({ preventScroll: true }); };
  }, [pending]);
  async function readFile(file: File) {
    setReading(true);
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('游戏备份超过 4 MB，请选择导出的游戏 JSON 文件。');
      let value: unknown;
      try { value = JSON.parse(await file.text()) as unknown; } catch { throw new Error('文件不是有效的 JSON 游戏备份。'); }
      setPending(parseGameBackup(value));
    } catch (error) { notify(error instanceof Error ? error.message : '游戏备份无法读取。'); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  }
  return <section className="game-backup-controls" aria-label="游戏进度备份">
    <div><strong>把这一季好好保存</strong><p>备份包含游戏进度。真实农场记录请在小镇的农场工作室另行导出。</p></div>
    <div className="game-backup-actions">
      <button disabled={exporting} onClick={() => void onExport()}><Download size={17} />{exporting ? '正在导出…' : '导出游戏备份'}</button>
      <button disabled={reading} onClick={() => input.current?.click()}><Upload size={17} />{reading ? '读取中…' : '导入游戏备份'}</button>
    </div>
    <input ref={input} type="file" accept=".json,application/json" aria-label="选择游戏备份文件" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
    {pending && createPortal(<div className="game-import-overlay"><section ref={dialog} className="game-import-dialog" role="alertdialog" aria-modal="true" aria-labelledby="game-import-title">
      <button className="game-import-close" aria-label="取消导入游戏备份" onClick={() => setPending(null)}><X size={20} /></button>
      <h2 id="game-import-title">恢复这份游戏进度？</h2>
      <p>备份中的农场为 Lv. {getLevel(pending)}，拥有 {pending.coins} 金币、{pending.gems} 钻石，已完成 {pending.ordersDelivered} 个订单。</p>
      <p>确认后会替换当前游戏进度。建议先导出当前游戏备份。真实农场记录和位置设置仍会保留。</p>
      <div><button onClick={() => setPending(null)}>保留当前进度</button><button className="confirm" onClick={() => { onRestore(pending); setPending(null); }}>确认恢复游戏</button></div>
    </section></div>, document.body)}
  </section>;
}
