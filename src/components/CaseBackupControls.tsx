import { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, LoaderCircle, Upload, X } from 'lucide-react';
import { commitCaseImport, createCaseBackup, MAX_CASE_BACKUP_BYTES, prepareCaseImport, readCaseBackupCases } from '../lib/caseBackup';
import type { CaseImportPreview } from '../lib/caseBackup';
import { exportLocalJson, messageOf } from '../lib/deviceUi';
import type { LocalCase } from '../lib/fieldDiagnosis';
import './case-backup.css';

interface CaseBackupControlsProps {
  active: boolean;
  disabled?: boolean;
  cases: LocalCase[];
  onImported: (cases: LocalCase[]) => void;
}

export default function CaseBackupControls({ active, disabled = false, cases, onImported }: CaseBackupControlsProps) {
  const [preview, setPreview] = useState<CaseImportPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [reading, setReading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const request = useRef(0);
  const activeRef = useRef(active); activeRef.current = active;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; };
  }, []);

  useEffect(() => {
    if (active) return;
    request.current += 1;
    setReading(false);
    setPreview(null);
    setFilename('');
    setNotice(null);
    if (input.current) input.current.value = '';
  }, [active]);

  const currentRequest = (serial: number) => mounted.current && activeRef.current && request.current === serial;

  async function readBackup(file: File | undefined) {
    if (!file || !activeRef.current || disabledRef.current || busy.current) return;
    const serial = ++request.current;
    setPreview(null);
    setFilename('');
    setNotice(null);
    setReading(true);
    try {
      if (file.size > MAX_CASE_BACKUP_BYTES) throw new Error('案例备份过大，请选择 2 MiB 以内的 JSON 文件。');
      const text = await file.text();
      if (!currentRequest(serial)) return;
      const next = prepareCaseImport(text);
      // Keep the original preview object: the core binds it to the exact file
      // and storage baseline, then validates both again before writing.
      setPreview(next);
      setFilename(file.name);
    } catch (error) {
      if (currentRequest(serial)) setNotice({ kind: 'error', text: `未能读取案例备份：${messageOf(error)}` });
    } finally {
      if (currentRequest(serial)) setReading(false);
    }
  }

  function cancelPreview() {
    request.current += 1;
    setReading(false);
    setPreview(null);
    setFilename('');
    setNotice(null);
  }

  function mergeBackup() {
    if (!preview || !activeRef.current || disabledRef.current || busy.current || reading || preview.blockedReason || !preview.added.length) return;
    busy.current = true;
    try {
      const next = commitCaseImport(preview);
      const count = preview.added.length;
      setPreview(null);
      setFilename('');
      setNotice({ kind: 'status', text: `已合并新增 ${count} 个案例；原有案例均已保留。导入案例的模型来源仍需核实。` });
      onImported(next);
    } catch (error) {
      // A stale preview cannot be confirmed a second time without reading the
      // file and the current store again.
      setPreview(null);
      setFilename('');
      setNotice({ kind: 'error', text: `案例合并未完成：${messageOf(error)} 请重新选择备份，查看新的预览。` });
    } finally {
      busy.current = false;
    }
  }

  async function exportCases() {
    if (!activeRef.current || disabledRef.current || busy.current || reading) return;
    busy.current = true;
    setExporting(true);
    setNotice(null);
    const serial = request.current;
    try {
      // Use the strict storage reader. The ordinary list reader intentionally
      // skips damaged entries and would otherwise produce a misleading backup.
      const saved = readCaseBackupCases();
      await exportLocalJson(createCaseBackup(saved), `fieldletter-cases-${Date.now()}.json`);
      if (currentRequest(serial)) setNotice({ kind: 'status', text: `已生成 ${saved.length} 个案例的备份，请确认文件已保存。` });
    } catch (error) {
      if (currentRequest(serial)) setNotice({ kind: 'error', text: `案例备份导出未完成：${messageOf(error)}` });
    } finally {
      busy.current = false;
      if (mounted.current) setExporting(false);
    }
  }

  return <section className="case-backup-controls" aria-label="案例备份与恢复" aria-busy={reading || exporting}>
    <div className="case-backup-heading"><div><h3>备份与恢复</h3><p>选择 JSON 后先查看预览，再确认合并新增案例。</p></div><div className="case-backup-actions">
      <button type="button" className="quiet-button" disabled={!active || disabled || reading || exporting || !cases.length} onClick={() => void exportCases()}>{exporting ? <LoaderCircle size={15} className="case-backup-spinner" /> : <Download size={15} />}导出全部案例</button>
      <button type="button" className="quiet-button" disabled={!active || disabled || exporting} onClick={() => input.current?.click()}><Upload size={15} />{preview || reading ? '选择其他备份' : '导入案例备份'}</button>
      <input ref={input} hidden type="file" accept="application/json,.json" aria-label="选择案例 JSON 备份" disabled={!active || disabled || exporting} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void readBackup(file); }} />
    </div></div>
    <p className="case-backup-explainer">支持本应用导出的单个案例与全部案例备份。最多保留 20 个案例；相同编号有差异时保留本机内容。导入只恢复记录和附件说明，照片、视频需要重新选择。</p>
    {reading && <div className="case-backup-reading" role="status"><LoaderCircle size={16} className="case-backup-spinner" /><span>正在读取并校验案例备份…</span><button type="button" className="text-link" onClick={cancelPreview}>取消读取</button></div>}
    {preview && <div className="case-import-preview">
      <h4><FileCheck2 size={17} />导入预览</h4><p className="case-backup-filename">文件：{filename}</p>
      <dl className="case-import-counts"><div><dt>新增</dt><dd>{preview.added.length}</dd></div><div><dt>完全重复</dt><dd>{preview.duplicates.length}</dd></div><div><dt>编号冲突</dt><dd>{preview.conflicts.length}</dd></div><div><dt>本机总数</dt><dd>{preview.beforeCount} → {preview.afterCount}</dd></div></dl>
      {preview.added.length > 0 && <div className="case-import-list"><strong>将新增的案例</strong><ul>{preview.added.map(item => <li key={item.id}><span>{item.observation.subject}</span><small>{item.observation.category === 'crop' ? '种植' : '养殖'} · {item.modelInfo || item.outcome.raw ? '含外部 AI 输出，来源待核实' : '仅观察记录'}</small></li>)}</ul></div>}
      {preview.duplicates.length > 0 && <details className="case-import-details"><summary>完全重复的 {preview.duplicates.length} 个案例将跳过</summary><ul>{preview.duplicates.map(item => <li key={item.id}>{item.observation.subject}</li>)}</ul></details>}
      {preview.conflicts.length > 0 && <details open className="case-import-details case-import-conflicts"><summary>保留 {preview.conflicts.length} 个有冲突的本机案例</summary><p>这些编号的备份内容与本机不同，不会覆盖；其他无冲突的新案例仍可合并。</p><ul>{preview.conflicts.map(item => <li key={item.id}><strong>本机：{item.existing.observation.subject}</strong><span>备份：{item.incoming.observation.subject}</span></li>)}</ul></details>}
      <p className="case-import-provenance">导入案例会标为“来自备份”。备份中的模型名称、结果和实测来源都需要核实；系统重新校验原始输出，导入不会启动 AI 分析。</p>
      {preview.blockedReason ? <p className="case-import-blocked" role="alert">当前无法合并：{preview.blockedReason}</p> : !preview.added.length && <p className="case-import-empty">没有可新增的案例，本机记录保持不变。</p>}
      <div className="case-import-confirm"><button type="button" className="solid-button" disabled={!active || disabled || reading || exporting || !!preview.blockedReason || !preview.added.length} onClick={mergeBackup}>仅合并新增 {preview.added.length} 个案例</button><button type="button" className="quiet-button" onClick={cancelPreview}><X size={15} />取消预览</button></div>
    </div>}
    {notice && <p className={`case-backup-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
  </section>;
}
