import { useEffect, useId, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { MAX_CLINIC_DRAFT_BYTES, parseClinicDraftJson } from '../lib/clinicDraft';
import type { ClinicDraftSnapshot } from '../lib/clinicDraft';
import './draft-restore.css';

type PendingDraft = { snapshot: ClinicDraftSnapshot; expectedSignature: string; fileName: string };

export interface DraftRestoreControlsProps {
  active: boolean;
  disabled: boolean;
  currentSignature: string;
  /** Persist first and throw on failure. Called only after explicit confirmation. */
  onRestore: (snapshot: ClinicDraftSnapshot, expectedSignature: string) => void;
}

export default function DraftRestoreControls({ active, disabled, currentSignature, onRestore }: DraftRestoreControlsProps) {
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const [pending, setPending] = useState<PendingDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const request = useRef(0);
  const hasPending = useRef(false);
  const isReading = useRef(false);
  const context = useRef({ active, disabled, currentSignature, onRestore });
  context.current = { active, disabled, currentSignature, onRestore };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current += 1; };
  }, []);

  useEffect(() => {
    request.current += 1;
    if (hasPending.current || isReading.current) {
      hasPending.current = false;
      isReading.current = false;
      setPending(null);
      setReading(false);
      setMessage(active ? '当前表单或问诊状态已变化，请重新选择草稿并核对预览。' : '已取消草稿导入。');
    }
  }, [active, disabled, currentSignature]);

  async function readFile(file: File): Promise<void> {
    if (!mounted.current || !context.current.active || context.current.disabled) return;
    const id = ++request.current;
    const signature = context.current.currentSignature;
    const isCurrent = () => mounted.current && request.current === id
      && context.current.active && !context.current.disabled && context.current.currentSignature === signature;
    hasPending.current = false;
    setPending(null);
    isReading.current = true;
    setReading(true);
    setMessage('');
    try {
      if (file.size > MAX_CLINIC_DRAFT_BYTES) throw new Error('文字草稿超过 128 KiB，请选择从问诊页面导出的草稿 JSON 文件。');
      const snapshot = parseClinicDraftJson(await file.text());
      if (!isCurrent()) return;
      hasPending.current = true;
      setPending({ snapshot, expectedSignature: signature, fileName: file.name.slice(0, 200) });
      setMessage('已读取草稿，请核对下方预览后决定是否替换当前文字。');
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : '无法读取文字草稿。');
    } finally {
      if (isCurrent()) { isReading.current = false; setReading(false); }
    }
  }

  function cancel(): void {
    request.current += 1;
    hasPending.current = false;
    isReading.current = false;
    setPending(null);
    setReading(false);
    setMessage('已取消草稿导入，当前文字保留。');
  }

  function confirm(): void {
    if (!pending) return;
    const latest = context.current;
    if (!latest.active || latest.disabled || latest.currentSignature !== pending.expectedSignature) {
      cancel();
      setMessage('当前表单或问诊状态已变化，请重新选择草稿并核对预览。');
      return;
    }
    try {
      latest.onRestore(pending.snapshot, pending.expectedSignature);
      request.current += 1;
      hasPending.current = false;
      setPending(null);
      setMessage('已恢复文字草稿，请核对后再继续问诊。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '草稿未恢复，请保留当前文字后重试。');
    }
  }

  const otherFields = pending ? [
    ['出现时间', pending.snapshot.fields.onset], ['分布范围', pending.snapshot.fields.extent],
    ['异常数量', pending.snapshot.fields.affected], ['总数量', pending.snapshot.fields.total],
    ['生长或饲养阶段', pending.snapshot.fields.stage], ['近期管理', pending.snapshot.fields.management],
  ].filter(([, value]) => value !== '') : [];

  return <section className="draft-restore-controls" aria-label="恢复问诊文字草稿">
    <button className="quiet-button" disabled={!active || disabled || reading} onClick={() => input.current?.click()}>
      <Upload size={16} />{reading ? '读取草稿中…' : '导入文字草稿'}
    </button>
    <input ref={input} type="file" accept=".json,application/json" aria-label="选择问诊文字草稿 JSON 文件" hidden onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (file) void readFile(file);
    }} />
    {message && <p className="draft-restore-message" role="status">{message}</p>}
    {pending && <div className="draft-restore-preview" aria-labelledby={headingId}>
      <h4 id={headingId}>替换当前问诊文字？</h4>
      <p className="draft-restore-file">文件：{pending.fileName || '文字草稿 JSON'}</p>
      <dl>
        <div><dt>类别</dt><dd>{pending.snapshot.fields.category === 'animal' ? '动物' : '作物'}</dd></div>
        <div><dt>名称</dt><dd>{pending.snapshot.fields.subject || '尚未填写'}</dd></div>
        <div><dt>现场表现</dt><dd>{pending.snapshot.fields.symptoms || '尚未填写'}</dd></div>
      </dl>
      {otherFields.length > 0 && <details><summary>查看其余文字</summary><dl>{otherFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>}
      <p><strong>确认后会替换当前表单的文字，请先导出需要保留的当前草稿。</strong></p>
      <p>导入后实测记录和天气均需重新选择；原设备的记录编号不会关联到本机记录。已有案例和上次结果保留。</p>
      {pending.snapshot.hadMedia && <p className="draft-restore-warning">这份草稿曾附带图片。文件仅含文字，恢复后需重新选择图片，或明确选择“本次仅用文字”。</p>}
      {!pending.snapshot.speechReviewed && <p className="draft-restore-warning">其中的语音转写尚未确认，恢复后请先核对文字。</p>}
      <div className="draft-restore-actions">
        <button className="quiet-button" onClick={cancel}><X size={16} />保留当前文字</button>
        <button className="solid-button" disabled={!active || disabled} onClick={confirm}>确认替换文字草稿</button>
      </div>
    </div>}
  </section>;
}
