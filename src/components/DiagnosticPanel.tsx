import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpRight, Camera, Check, Cpu, Download, FileText, Image, LoaderCircle, Mic, RefreshCw, Save, ScanLine, ShieldCheck, Square, Trash2, Upload, Video, X } from 'lucide-react';
import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeLocalAiAvailable, localAi } from '../lib/localAi';
import type { AiMedia, ModelProfile, ModelStatus, SelectedAiMedia } from '../lib/localAi';
import { buildDiagnosisPrompt, CASE_STORAGE_NOTICE, createLocalCase, getRelevantGuidance, getSafetyTriage, loadLocalCases, MODEL_NOTICE, normalizeObservation, parseDiagnosisOutput, saveLocalCases } from '../lib/fieldDiagnosis';
import type { DiagnosisOutcome, FieldObservation, LocalCase, ModelInfo } from '../lib/fieldDiagnosis';
import { MEASUREMENT_TYPES, readFarmRecords } from '../lib/farmRecords';
import { exportLocalJson, formatDate, messageOf, openSource } from '../lib/deviceUi';
import type { WeatherBundle } from '../lib/weather';
import '../styles/knowledge.css';

type Draft = { category: 'crop' | 'animal'; subject: string; symptoms: string; onset: string; extent: string; affected: string; total: string; stage: string; management: string };
type Attachment = { media: AiMedia; description: string };
type Completed = { observation: FieldObservation; outcome: DiagnosisOutcome; createdAt: string; modelInfo?: ModelInfo; caseId?: string };
// Android pickers may finish after navigation. A new panel waits for an old
// picker before clearing native files, so a late callback cannot erase its media.
let pendingMediaSelection: Promise<SelectedAiMedia> | null = null;
const stateLabels: Record<ModelStatus['state'], string> = { unsupported: '网页不可用', missing: '尚未准备模型', downloading: '下载中', downloaded: '已下载，未加载', loading: '加载中', ready: '本机已就绪', generating: '生成中', error: '需检查状态' };
const riskLabels = { low: '仍需观察', medium: '需要核实', high: '尽快现场排查', urgent: '立即联系专业人员' };
const optionalNumber = (value: string) => value.trim() ? Number(value) : undefined;
function bytes(value: number | undefined): string {
  if (!value || !Number.isFinite(value)) return '未读取';
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GiB` : `${Math.ceil(value / 1024 ** 2)} MiB`;
}
function safeCases(): LocalCase[] { try { return loadLocalCases(); } catch { return []; } }

function Dialog({ titleId, className, onClose, children }: { titleId: string; className: string; onClose: () => void; children: ReactNode }) {
  const container = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    container.current?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]')?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onClick={onClose}><section ref={container} className={`service-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>{children}</section></div>;
}

function TriageNotice({ observation }: { observation: FieldObservation }) {
  const triage = getSafetyTriage(observation);
  return <div className={`triage-box ${triage.risk}`} role={triage.risk === 'urgent' ? 'alert' : 'status'}><strong>{riskLabels[triage.risk]}</strong>{triage.reasons.map(reason => <p key={reason}>{reason}</p>)}{triage.immediateActions.map(action => <p key={action}>{action}</p>)}<p><strong>{triage.contact}</strong></p></div>;
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return <><h4>{title}</h4>{items.length ? <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="card-footnote">未提供，需要继续核实。</p>}</>;
}

export default function DiagnosticPanel({ weather }: { weather: WeatherBundle | null }) {
  const native = isNativeLocalAiAvailable();
  const [draft, setDraft] = useState<Draft>({ category: 'crop', subject: '', symptoms: '', onset: '', extent: '', affected: '', total: '', stage: '', management: '' });
  const [farmRecords, setFarmRecords] = useState(readFarmRecords);
  const [measurementIds, setMeasurementIds] = useState<string[]>([]);
  const [includeWeather, setIncludeWeather] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mediaReady, setMediaReady] = useState(!native);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechReviewed, setSpeechReviewed] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [stream, setStream] = useState('');
  const [tokenCount, setTokenCount] = useState(0);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [cases, setCases] = useState(safeCases);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [modelBusy, setModelBusy] = useState('');
  const [progress, setProgress] = useState<{ part: string; progress: number; downloadedBytes: number; totalBytes: number } | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [casesOpen, setCasesOpen] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(false);
  const generation = useRef<{ stopped: boolean } | null>(null);
  const speech = useRef<{ stopped: boolean } | null>(null);
  const capture = useRef(false);
  const operation = useRef(false);
  const completedRef = useRef<Completed | null>(null);
  const formLocked = generating || speechBusy || captureBusy;
  const modelLocked = formLocked || !!modelBusy || status?.state === 'downloading' || status?.state === 'loading' || status?.state === 'generating';
  const previewObservation: FieldObservation = { category: draft.category, subject: draft.subject, symptoms: draft.symptoms, onset: draft.onset, extent: draft.extent };
  const selectedModel = models.find(model => model.id === status?.modelId) || models.find(model => model.selected);
  const observationOnly = !!completed && !completed.modelInfo && completed.outcome.raw === '';

  function showMessage(text: string) { if (mounted.current) setMessage(text); }
  function showCompleted(value: Completed | null) { completedRef.current = value; if (mounted.current) setCompleted(value); }
  async function refreshModels() {
    const [nextStatus, profiles] = await Promise.all([localAi.getStatus(), localAi.listModels()]);
    if (mounted.current) { setStatus(nextStatus); setModels(profiles.models); }
  }

  useEffect(() => {
    mounted.current = true;
    const listeners: PluginListenerHandle[] = [];
    let disposed = false;
    const register = async () => {
      const registrations = await Promise.allSettled([
        localAi.addListener('aiState', next => {
          if (!disposed) {
            setStatus(next);
            if (next.state === 'generating' && generation.current?.stopped) void localAi.stopGeneration().catch(() => {});
          }
        }),
        localAi.addListener('aiProgress', next => { if (!disposed) setProgress(next); }),
        localAi.addListener('aiToken', next => {
          if (!disposed && generation.current && !generation.current.stopped) { setStream(previous => previous + next.text); setTokenCount(next.tokenCount); }
        }),
      ]);
      for (const result of registrations) {
        if (result.status === 'fulfilled') {
          if (disposed) void result.value.remove().catch(() => {});
          else listeners.push(result.value);
        } else if (!disposed) showMessage('本机状态监听暂不可用，请刷新模型状态后重试。');
      }
    };
    void register();
    void refreshModels().catch(error => showMessage(messageOf(error)));
    // A new panel has no visible attachments. Clear stale native files before
    // allowing selection so the plugin's accumulating media map stays bounded.
    if (native) void (async () => {
      await pendingMediaSelection?.catch(() => {});
      if (disposed) return;
      await localAi.clearMedia();
      if (!disposed) setMediaReady(true);
    })().catch(error => { if (!disposed) showMessage(messageOf(error)); });
    return () => {
      disposed = true; mounted.current = false;
      listeners.forEach(listener => { void listener.remove().catch(() => {}); });
      if (speech.current) { speech.current.stopped = true; void localAi.stopSpeech().catch(() => {}); }
      if (generation.current) { generation.current.stopped = true; void localAi.stopGeneration().catch(() => {}); }
      // Model downloads are explicitly started by the user and may continue
      // when navigating to another page; do not cancel them on unmount.
    };
  }, [native]);

  async function modelAction(label: string, action: () => Promise<unknown>) {
    if (operation.current || generation.current || speech.current || capture.current) return;
    operation.current = true; setModelBusy(label); setMessage('');
    try { await action(); await refreshModels(); }
    catch (error) { showMessage(messageOf(error)); }
    finally { operation.current = false; if (mounted.current) setModelBusy(''); }
  }

  async function clearAttachments() {
    if (generation.current || capture.current || speech.current) return false;
    capture.current = true; setCaptureBusy(true);
    try { await localAi.clearMedia(); if (mounted.current) { setAttachments([]); setMediaReady(true); } return true; }
    catch (error) { showMessage(messageOf(error)); return false; }
    finally { capture.current = false; if (mounted.current) setCaptureBusy(false); }
  }

  async function selectMedia(source: 'camera' | 'gallery' | 'video-camera' | 'video-gallery') {
    const isVideo = source.startsWith('video-');
    if (!native || !mediaReady || generation.current || speech.current || capture.current || operation.current || pendingMediaSelection || attachments.length >= 3 || (isVideo && attachments.length > 0)) return;
    capture.current = true; setCaptureBusy(true); setMessage('');
    const request = isVideo ? localAi.selectVideo({ source: source === 'video-camera' ? 'camera' : 'gallery' }) : localAi.selectImage({ source: source as 'camera' | 'gallery' });
    pendingMediaSelection = request;
    try {
      const selection = await request;
      if (!mounted.current) return;
      if (!Array.isArray(selection.media) || selection.media.length + attachments.length > 3) {
        await localAi.clearMedia(); setAttachments([]);
        throw new Error('这次附件超过 3 张照片或关键帧，已清空；请重新选择。');
      }
      setAttachments(previous => [...previous, ...selection.media.map(media => ({ media, description: '' }))]);
      if (isVideo) showMessage(`已提取 ${selection.media.length} 个静态关键帧${selection.videoDurationSeconds !== undefined ? `，原视频约 ${selection.videoDurationSeconds.toFixed(1)} 秒` : ''}。只分析这些帧，不分析连续动作或原视频音轨。`);
    } catch (error) { showMessage(messageOf(error)); }
    finally { if (pendingMediaSelection === request) pendingMediaSelection = null; capture.current = false; if (mounted.current) setCaptureBusy(false); }
  }

  async function startSpeech() {
    if (!native || !status?.speechSupported || generation.current || speech.current || capture.current || operation.current) return;
    const session = { stopped: false }; speech.current = session; setSpeechBusy(true); setMessage('');
    try {
      const result = await localAi.transcribeSpeech();
      if (!mounted.current || session.stopped || speech.current !== session) return;
      const combined = [draft.symptoms.trim(), result.text.trim()].filter(Boolean).join('\n');
      if (combined.length > 4000) throw new Error('转写后症状超过 4000 字，请精简已有描述后重新录音。');
      if (!result.text.trim()) throw new Error('没有识别到文字，请重试或手动输入。');
      setDraft(previous => ({ ...previous, symptoms: combined })); setSpeechReviewed(false);
      showMessage('离线转写已填入症状描述，请逐字核对。录音本身不会交给诊断模型。');
    } catch (error) { if (!session.stopped) showMessage(messageOf(error)); }
    finally { if (speech.current === session) speech.current = null; if (mounted.current) setSpeechBusy(false); }
  }

  async function stopSpeech() {
    if (!speech.current) return;
    speech.current.stopped = true;
    try { await localAi.stopSpeech(); showMessage('已停止语音输入；停止后的转写不会加入观察。'); }
    catch (error) { showMessage(messageOf(error)); }
  }

  function observationSnapshot(): FieldObservation {
    const affected = optionalNumber(draft.affected), total = optionalNumber(draft.total);
    if ([affected, total].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('数量请填实际统计的非负整数；数量未知时留空。');
    const measurements = farmRecords.measurements.filter(item => measurementIds.includes(item.id)).map(item => ({ name: MEASUREMENT_TYPES[item.kind].label, value: item.value, unit: MEASUREMENT_TYPES[item.kind].unit, observedAt: item.observedAt, place: item.place, instrument: item.instrument || undefined }));
    return normalizeObservation({
      category: draft.category, subject: draft.subject, symptoms: draft.symptoms, onset: draft.onset, extent: draft.extent,
      affectedCount: affected, totalCount: total, ageOrStage: draft.stage, managementNotes: draft.management,
      measurements: measurements.length ? measurements : undefined,
      media: attachments.length ? attachments.map(item => ({ id: item.media.id, kind: item.media.kind, description: item.description || undefined, timestampSeconds: item.media.timestampSeconds })) : undefined,
      weather: includeWeather && weather && (weather.dataTime || weather.currentTime) ? {
        sourceName: `Open-Meteo · ${weather.location.name} · 区域天气模型（气温湿度风速为当前模型值，降雨为今日全日预报）`, sourceKind: 'forecast',
        observedAt: weather.dataTime || `${weather.currentTime} (${weather.timezone})`, temperature: weather.current.temp, humidity: weather.current.humidity,
        rainMm: weather.forecast[0].rain, windKmh: weather.current.wind,
      } : undefined,
    });
  }

  async function generate() {
    if (generation.current || speech.current || capture.current || operation.current) return;
    if (!native || !mediaReady || status?.state !== 'ready') { showMessage('请先在模型中心准备并加载本机模型，等待附件初始化完成。'); return; }
    if (!speechReviewed) { showMessage('请先核对语音转写文字。'); return; }
    if (attachments.length && !status.visionSupported) { showMessage('当前模型没有就绪的图像能力，请检查模型和配套视觉文件。'); return; }
    let observation: FieldObservation;
    let prompt: ReturnType<typeof buildDiagnosisPrompt>;
    try { observation = observationSnapshot(); prompt = buildDiagnosisPrompt(observation); }
    catch (error) { showMessage(messageOf(error)); return; }
    const session = { stopped: false }; generation.current = session;
    const modelAtStart = { modelId: status.modelId, modelName: status.modelName, engineVersion: status.engineVersion };
    setGenerating(true); setStopRequested(false); setStream(''); setTokenCount(0); setMessage(''); showCompleted(null);
    try {
      const output = await localAi.generate({ ...prompt, mediaIds: attachments.map(item => item.media.id), maxTokens: 1024 });
      if (!mounted.current || generation.current !== session) return;
      if (session.stopped || output.stopped) { setStream(''); showMessage('生成已停止；未保存为完成结果或案例。'); return; }
      const outcome = parseDiagnosisOutput(output.text, observation);
      showCompleted({ observation, outcome, createdAt: new Date().toISOString(), modelInfo: { ...modelAtStart, modelId: output.modelId, durationMs: output.durationMs } });
      setStream('');
    } catch (error) { if (!session.stopped) showMessage(messageOf(error)); }
    finally {
      if (generation.current === session) generation.current = null;
      if (mounted.current) { setGenerating(false); setStopRequested(false); void refreshModels().catch(error => showMessage(messageOf(error))); }
    }
  }

  async function stopGeneration() {
    if (!generation.current) return;
    generation.current.stopped = true; setStopRequested(true);
    try { await localAi.stopGeneration(); showMessage('已请求停止，等待本机引擎结束；这次输出不会保存为完成结果。'); }
    catch (error) { showMessage(messageOf(error)); }
  }

  function saveCase() {
    const result = completedRef.current;
    if (!result || generation.current || result.caseId) return;
    try {
      const item = createLocalCase(result.observation, result.outcome, result.createdAt, result.modelInfo);
      const next = [item, ...safeCases()].slice(0, 20); saveLocalCases(next); setCases(next);
      showCompleted({ ...result, caseId: item.id }); showMessage('已保存本次分析使用的观察快照，最近最多保留 20 个案例。');
    } catch (error) { showMessage(messageOf(error)); }
  }

  function saveObservation() {
    if (generation.current || speech.current || capture.current) return;
    if (!speechReviewed) { showMessage('请先核对语音转写文字。'); return; }
    try {
      const observation = observationSnapshot();
      const outcome = parseDiagnosisOutput('', observation);
      const item = createLocalCase(observation, outcome);
      const next = [item, ...safeCases()].slice(0, 20);
      saveLocalCases(next); setCases(next);
      showCompleted({ observation: item.observation, outcome: item.outcome, createdAt: item.createdAt, caseId: item.id });
      showMessage('真实观察已保存在本设备；仅观察记录，未生成 AI 建议。');
    } catch (error) { showMessage(messageOf(error)); }
  }

  async function exportCompleted() {
    const result = completedRef.current;
    if (!result) return;
    try {
      const item = createLocalCase(result.observation, result.outcome, result.createdAt, result.modelInfo);
      await exportLocalJson(item, `fieldletter-observation-${Date.now()}.json`);
    } catch (error) { showMessage(messageOf(error)); }
  }

  async function viewCase(item: LocalCase) {
    if (generation.current || capture.current || speech.current) return;
    // Saved cases contain descriptions, not retained native images. Drop the
    // current attachment session before viewing history to prevent reuse.
    if (native && !(await clearAttachments())) return;
    if (!mounted.current) return;
    showCompleted({ observation: item.observation, outcome: item.outcome, createdAt: item.createdAt, modelInfo: item.modelInfo, caseId: item.id });
    setCasesOpen(false);
    showMessage('正在查看历史记录快照。左侧文字仍是当前观察；附件已清空，新的分析需要重新选择现场照片。');
  }

  function deleteCase(id: string) {
    if (generation.current || capture.current || speech.current) return;
    try {
      const next = cases.filter(item => item.id !== id); saveLocalCases(next); setCases(next);
      if (completedRef.current?.caseId === id) showCompleted({ ...completedRef.current, caseId: undefined });
      showMessage('该案例已从本设备删除。');
    } catch (error) { showMessage(messageOf(error)); }
  }

  return <main className="service-view clinic-view">
    <div className="service-heading"><div><span className="eyebrow">真实观察 · 本机辅助排查</span><h2>把现场线索记录清楚</h2><p>作物、牲畜与水产异常先看事实，紧急情况立即联系专业人员。</p></div><div className="clinic-heading-actions"><button className="quiet-button" disabled={generating} onClick={() => { setCases(safeCases()); setCasesOpen(true); }}><FileText size={16} />本机案例 {cases.length}</button><button className="quiet-button" onClick={() => { setModelOpen(true); void refreshModels().catch(error => showMessage(messageOf(error))); }}><Cpu size={16} />模型中心</button></div></div>
    <div className="model-summary"><Cpu size={22} /><div><strong>{status?.modelName || '安卓本机模型'}<span className={`model-state ${status?.state || ''}`}>{status ? stateLabels[status.state] : '正在读取状态'}</span></strong><p>{native ? '模型需由你下载或导入，再手动加载。分析在设备内运行。' : '网页预览没有本机 AI 引擎，请安装安卓版本；观察表单和历史案例仍可查看。'}</p></div><button className="quiet-button" onClick={() => setModelOpen(true)}>管理模型</button></div>
    {message && <p className="inline-message" role="status">{message}</p>}
    <div className="clinic-layout"><section className="service-card observation-form"><div className="section-heading"><h3>这次现场观察</h3><span>不采用游戏数据</span></div>
      <div className="category-toggle" role="group" aria-label="观察类别"><button type="button" className={draft.category === 'crop' ? 'active' : ''} aria-pressed={draft.category === 'crop'} disabled={formLocked} onClick={() => setDraft({ ...draft, category: 'crop' })}>种植作物</button><button type="button" className={draft.category === 'animal' ? 'active' : ''} aria-pressed={draft.category === 'animal'} disabled={formLocked} onClick={() => setDraft({ ...draft, category: 'animal' })}>养殖动物 / 水产</button></div>
      <form onSubmit={event => { event.preventDefault(); void generate(); }}>
        <label>实际品种 / 动物名称<input required maxLength={100} disabled={formLocked} value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} placeholder={draft.category === 'crop' ? '例如：番茄，注明品种更有帮助' : '例如：蛋鸡 / 猪 / 草鱼'} /></label>
        <label>亲眼观察到的异常<textarea required maxLength={4000} disabled={formLocked} value={draft.symptoms} onChange={event => setDraft({ ...draft, symptoms: event.target.value })} placeholder="写颜色、形态、行为、发生位置和变化，未知情况不要猜测。" /></label>
        {!speechReviewed && <label className="checkbox-label"><input type="checkbox" disabled={formLocked} checked={speechReviewed} onChange={event => setSpeechReviewed(event.target.checked)} />我已核对语音转写与实际情况一致</label>}
        <div className="form-pair"><label>最早发现时间<input maxLength={200} disabled={formLocked} value={draft.onset} onChange={event => setDraft({ ...draft, onset: event.target.value })} placeholder="例如：10 月 9 日清晨开始，具体未知可写未知" /></label><label>{draft.category === 'crop' ? '生长期' : '日龄 / 养殖阶段'}<input maxLength={200} disabled={formLocked} value={draft.stage} onChange={event => setDraft({ ...draft, stage: event.target.value })} placeholder="实际记录，可留空" /></label></div>
        <label>发生范围与变化<input maxLength={400} disabled={formLocked} value={draft.extent} onChange={event => setDraft({ ...draft, extent: event.target.value })} placeholder="例如：北棚两行 / 2 号池；是否正在扩大" /></label>
        <div className="form-pair"><label>受影响数量（株 / 只 / 尾）<input type="number" min="0" step="1" disabled={formLocked} value={draft.affected} onChange={event => setDraft({ ...draft, affected: event.target.value })} /></label><label>同范围总数量<input type="number" min="0" step="1" disabled={formLocked} value={draft.total} onChange={event => setDraft({ ...draft, total: event.target.value })} /></label></div>
        <label>近期管理变化<textarea maxLength={1000} disabled={formLocked} value={draft.management} onChange={event => setDraft({ ...draft, management: event.target.value })} placeholder="实际施肥、投喂、换水、灌溉、转群等时间；没有记录可留空" /></label>
        {draft.symptoms.trim() && <TriageNotice observation={previewObservation} />}
        <div className="capture-actions" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}><button type="button" disabled={!native || !mediaReady || modelLocked || attachments.length >= 3} onClick={() => void selectMedia('camera')}><Camera size={19} />拍照</button><button type="button" disabled={!native || !mediaReady || modelLocked || attachments.length >= 3} onClick={() => void selectMedia('gallery')}><Image size={19} />选照片</button><button type="button" disabled={!native || !mediaReady || modelLocked || attachments.length > 0} onClick={() => void selectMedia('video-camera')}><Video size={19} />拍短视频</button><button type="button" disabled={!native || !mediaReady || modelLocked || attachments.length > 0} onClick={() => void selectMedia('video-gallery')}><Video size={19} />选视频</button><button type="button" disabled={!native || !status?.speechSupported || modelLocked} onClick={() => void startSpeech()}><Mic size={19} />离线转写</button></div>
        {speechBusy && <button type="button" className="quiet-button" onClick={() => void stopSpeech()}><Square size={14} />停止录音</button>}
        <p className="card-footnote">照片和视频关键帧合计最多 3 张。选择视频前请清空照片，视频限 30 秒、50 MiB，只取最多 3 个静态帧；原视频、连续动作和音轨不参与分析。录音仅由可用的离线语音服务转成文字，核对后作为描述。</p>
        <p className="card-footnote">尽量在自然光下拍摄，先擦净镜头并对焦；过暗、模糊或反光时补拍。{draft.category === 'crop' ? '作物建议补拍整株、受影响部位近景和叶背，并对照同批正常植株。' : '动物建议补拍全身、异常部位，并用文字记录呼吸和行为；静态关键帧不能证明连续行为。'}</p>{native && status && !status.speechSupported && <p className="card-footnote">这台设备暂无可用的离线语音服务，请手动输入；不会改用云端转写。</p>}
        {attachments.length > 0 && <><div className="media-thumbnails">{attachments.map((item, index) => <div className="media-thumb" key={item.media.id}><img src={item.media.previewDataUrl} alt={item.media.kind === 'photo' ? `现场照片 ${index + 1}` : `视频静态帧 ${index + 1}`} /><small>{item.media.kind === 'photo' ? `照片 ${index + 1}` : `约 ${item.media.timestampSeconds?.toFixed(1) ?? '未知时点'} 秒关键帧`}</small></div>)}</div>{attachments.map((item, index) => <label key={item.media.id}>附件 {index + 1} 说明<input maxLength={700} disabled={formLocked} value={item.description} onChange={event => setAttachments(previous => previous.map((attachment, position) => position === index ? { ...attachment, description: event.target.value } : attachment))} placeholder="部位、位置、实际拍摄时间；不确定的时间请留空" /></label>)}<button type="button" className="text-link" disabled={formLocked} onClick={() => void clearAttachments()}><Trash2 size={14} />清空全部附件</button></>}
        {!mediaReady && native && <button type="button" className="text-link" disabled={formLocked} onClick={() => void clearAttachments()}>重试初始化附件</button>}
        <details><summary>主动选择现场实测记录（已选 {measurementIds.length} 项）</summary><button type="button" className="text-link" disabled={formLocked} onClick={() => { const next = readFarmRecords(); setFarmRecords(next); setMeasurementIds(previous => previous.filter(id => next.measurements.some(item => item.id === id))); }}><RefreshCw size={13} />刷新农场记录</button>{farmRecords.measurements.length ? farmRecords.measurements.slice(-30).reverse().map(item => <label className="checkbox-label" key={item.id}><input type="checkbox" disabled={formLocked || (!measurementIds.includes(item.id) && measurementIds.length >= 12)} checked={measurementIds.includes(item.id)} onChange={event => setMeasurementIds(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /><span>{MEASUREMENT_TYPES[item.kind].label} {item.value} {MEASUREMENT_TYPES[item.kind].unit}<br />{item.place} · {formatDate(item.observedAt, true)}{item.instrument ? ` · ${item.instrument}` : ''}</span></label>) : <p className="card-footnote">没有已保存实测记录，可先去工作台添加。未勾选的记录不会交给模型。</p>}</details>
        <label className="checkbox-label"><input type="checkbox" disabled={formLocked || !weather || !(weather.dataTime || weather.currentTime)} checked={includeWeather && !!weather} onChange={event => setIncludeWeather(event.target.checked)} />附上当前区域天气模型数据（不是田间实测）</label>
        {includeWeather && weather && <p className="card-footnote">Open-Meteo · {weather.location.name} · 模型时点 {weather.currentTime || weather.dataTime} · {weather.timezone}。空气气温 {weather.current.temp}°C、湿度 {weather.current.humidity}%、风速 {weather.current.wind} km/h；今日全日降水预报 {weather.forecast[0].rain} mm。空气天气不能代替水温、溶氧或土壤实测。</p>}
        <div className="analyze-actions">{!generating && <button type="button" className="quiet-button" disabled={formLocked || !speechReviewed || !draft.subject.trim() || !draft.symptoms.trim()} onClick={saveObservation}><Save size={15} />保存观察</button>}{generating ? <button type="button" className="quiet-button" disabled={stopRequested} onClick={() => void stopGeneration()}><Square size={15} />{stopRequested ? '等待停止' : '停止本次生成'}</button> : <button type="submit" className="solid-button" disabled={!native || !mediaReady || status?.state !== 'ready' || formLocked || !!modelBusy || !speechReviewed}><ScanLine size={17} />在设备内整理观察</button>}{captureBusy && <span>读取附件中…</span>}</div>
        <p className="privacy-note"><ShieldCheck size={14} /><span>本次分析只使用上述文字、勾选的记录及所选静态图片。原媒体留在设备，不上传诊断服务；模型下载和查看外部参考资料需要网络。</span></p>
      </form>
    </section>
    <section className="service-card diagnosis-card"><header><h3>{observationOnly ? '观察记录（未生成 AI 建议）' : completed ? '本次观察整理结果' : '辅助排查结果'}</h3>{completed?.outcome.result && <span className={`diagnosis-tag ${completed.outcome.result.risk}`}>{riskLabels[completed.outcome.result.risk]}</span>}</header>
      <p className="diagnosis-source-note">{MODEL_NOTICE}</p>
      {generating ? <><div className="diagnosis-placeholder"><LoaderCircle className="spin" size={28} /><h3>{stopRequested ? '正在结束本次生成' : '本机正在整理观察'}</h3><p>已生成 {tokenCount} 个 token。完整输出仍需通过结构与内容校验。</p></div><details className="raw-response"><summary>查看生成中的原始文字（未经校验）</summary><pre>{stream || '等待模型输出…'}</pre></details></> : completed ? <>
        <p className="card-footnote">观察对象：{completed.observation.subject} · 本次结果对应下方记录快照，修改左侧表单不会改写已完成结果。</p>
        <TriageNotice observation={completed.observation} />
        {completed.outcome.status === 'structured' && completed.outcome.result ? <>
          <ResultList title="观察依据" items={completed.outcome.result.observations} /><h4>可能原因（需要核验）</h4>
          {completed.outcome.result.possibleCauses.length ? completed.outcome.result.possibleCauses.map((cause, index) => <div className="cause-card" key={`${index}-${cause.name}`}><strong>{cause.name}</strong><ul>{cause.evidence.map((evidence, position) => <li key={position}>{evidence}</li>)}</ul><p>不确定性：{cause.uncertainty}</p></div>) : <p className="card-footnote">信息不足，未列出可能原因。</p>}
          <ResultList title="需要补问、补拍或实测" items={completed.outcome.result.missingInformation} /><ResultList title="低风险的观察与管理措施" items={completed.outcome.result.lowRiskActions} /><ResultList title="联系专业人员的条件" items={completed.outcome.result.escalation} /><ResultList title="本次限制" items={completed.outcome.result.limitations} />
        </> : observationOnly ? <p className="inline-message">仅保存真实观察，尚未生成 AI 建议。可根据现场警讯联系农技、兽医或水产技术人员。</p> : <div className="data-warning"><strong>输出未通过校验，不能作为诊断或处理指令。</strong><ul>{completed.outcome.validationErrors.map((error, index) => <li key={index}>{error}</li>)}</ul><p>继续依据真实观察和上方警讯联系专业人员。原始输出仅供核对记录。</p></div>}
        <details className="raw-response"><summary>本次使用的现场记录快照</summary><p>{completed.observation.symptoms}</p><p>最早发现：{completed.observation.onset || '未知'} · 阶段：{completed.observation.ageOrStage || '未知'}</p><p>发生范围：{completed.observation.extent || '未知'} · 受影响数量 {completed.observation.affectedCount ?? '未知'} / 总数量 {completed.observation.totalCount ?? '未知'}</p>{completed.observation.managementNotes && <p>管理记录：{completed.observation.managementNotes}</p>}{completed.observation.measurements?.map((item, index) => <p key={index}>实测：{item.name} {item.value} {item.unit} · {item.place} · {formatDate(item.observedAt, true)}{item.instrument ? ` · ${item.instrument}` : ''}</p>)}{completed.observation.weather && <p>天气来源：{completed.observation.weather.sourceName} · {completed.observation.weather.observedAt}</p>}{completed.observation.media?.map((item, index) => <p key={item.id}>附件 {index + 1}：{item.kind === 'photo' ? '照片' : `约 ${item.timestampSeconds ?? '未知'} 秒关键帧`} · {item.description || '未提供说明'}</p>)}</details>
        {!observationOnly && <details className="raw-response"><summary>查看模型原始输出（不是确诊或处理指令）</summary><pre>{completed.outcome.raw}</pre></details>}
        <div className="diagnosis-meta"><span>{observationOnly ? '记录于' : '生成于'} {formatDate(completed.createdAt, true)}</span>{completed.modelInfo && <><span>{completed.modelInfo.modelName}</span><span>{(completed.modelInfo.durationMs / 1000).toFixed(1)} 秒</span></>}</div>
        {completed.modelInfo && <p className="card-footnote">模型编号：{completed.modelInfo.modelId} · 引擎：{completed.modelInfo.engineVersion}</p>}
        <div className="result-actions"><button className="solid-button" disabled={!!completed.caseId} onClick={saveCase}>{completed.caseId ? <Check size={15} /> : <Save size={15} />}{completed.caseId ? '已保存本机案例' : '保存本次观察与结果'}</button><button className="quiet-button" onClick={() => void exportCompleted()}><Download size={15} />导出记录</button></div>
        <p className="card-footnote">{CASE_STORAGE_NOTICE}</p>
      </> : <div className="diagnosis-placeholder"><ScanLine size={35} /><h3>从真实观察开始</h3><p>先填写实际对象与异常，再选择有关照片和实测。文字警讯会立即显示；模型未就绪也不要延误紧急处置。</p></div>}
      <h4>相关观察与管理参考</h4>{getRelevantGuidance(completed?.observation || previewObservation).map(entry => <div className="cause-card" key={entry.id}><strong>{entry.title}</strong><p>{entry.body}</p><button className="text-link" onClick={() => void openSource(entry.sourceUrl).catch(error => showMessage(messageOf(error)))}>{entry.sourceName}<ArrowUpRight size={13} /></button></div>)}
    </section></div>
    {modelOpen && <Dialog titleId="model-center-title" className="model-modal" onClose={() => setModelOpen(false)}><header><h2 id="model-center-title">本机模型中心</h2><button className="modal-close" aria-label="关闭模型中心" onClick={() => setModelOpen(false)}><X size={19} /></button></header>
      {!native ? <div className="data-warning">网页预览没有安卓本机引擎，不能下载、加载或运行模型。这里不会调用云端模型代替。</div> : <>
        <label>选择模型档位<select aria-label="本机模型档位" value={status?.modelId || ''} disabled={modelLocked} onChange={event => void modelAction('选择模型', () => localAi.selectModel({ modelId: event.target.value }))}>{!models.length && <option value="">读取模型列表中</option>}{models.map(model => <option key={model.id} value={model.id}>{model.name} · {bytes(model.downloadBytes)}{model.downloaded ? ' · 文件已齐备' : ''}</option>)}</select></label>
        <div className="model-spec"><h3>{selectedModel?.name || status?.modelName || '待选择模型'}</h3><p>{selectedModel?.description || '读取本机可用档位后，核实存储、内存和来源再操作。'}</p><p>下载大小：{bytes(selectedModel?.downloadBytes || status?.totalBytes)} · 建议总内存：{bytes(selectedModel?.recommendedMemoryBytes || status?.recommendedMemoryBytes)}</p>{selectedModel && <><p>许可证：{selectedModel.license}</p><button className="text-link" onClick={() => void openSource(selectedModel.sourceUrl).catch(error => showMessage(messageOf(error)))}>查看模型发布来源<ArrowUpRight size={13} /></button></>}</div>
        <div className="model-facts"><div><span>设备总内存</span><strong>{bytes(status?.totalMemoryBytes)}</strong></div><div><span>当前可用内存</span><strong>{bytes(status?.availableMemoryBytes)}</strong></div><div><span>可用存储</span><strong>{bytes(status?.freeStorageBytes)}</strong></div></div>
        <p className="card-footnote">{status ? stateLabels[status.state] : '正在读取状态'} · 主模型 {status?.modelPresent ? '已准备' : '未准备'} · 配套视觉文件 {status?.projectorPresent ? '已准备' : '未准备'}。文件在原生端核验后才能加载，下载完成不会自动加载。</p>
        {(status?.state === 'downloading' || modelBusy === '下载模型') && <><div className="model-progress" role="progressbar" aria-label="模型下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, Math.max(0, (progress?.progress ?? status?.progress ?? 0) * 100)))}><span style={{ width: `${Math.min(100, Math.max(0, (progress?.progress ?? status?.progress ?? 0) * 100))}%` }} /></div><p className="card-footnote">总进度（正在读取{progress?.part === 'projector' ? '配套视觉文件' : '主模型'}）：{bytes(progress?.downloadedBytes ?? status?.downloadedBytes)} / {bytes(progress?.totalBytes ?? status?.totalBytes)}</p></>}
        {status?.error && <p className="data-warning" role="alert">{status.error}{status.visionSupported && ' 若模型仍占用内存，可先卸载再加载。'}</p>}
        <div className="model-controls"><button className="solid-button" disabled={modelLocked || !selectedModel || (status?.modelPresent && status?.projectorPresent)} onClick={() => { setProgress(null); void modelAction('下载模型', () => localAi.downloadModels()); }}><Download size={15} />下载当前档位文件</button>{(status?.state === 'downloading' || modelBusy === '下载模型') && <button className="quiet-button" onClick={() => void localAi.cancelDownload().then(() => showMessage('已请求取消下载。已校验完成的文件会保留。')).catch(error => showMessage(messageOf(error)))}><Square size={14} />取消下载</button>}<button className="quiet-button" disabled={modelLocked || !status?.canLoad || !status?.modelPresent || !status?.projectorPresent || status?.state === 'ready'} onClick={() => void modelAction('加载模型', () => localAi.loadModel())}><Cpu size={15} />加载到内存</button><button className="quiet-button" disabled={modelLocked || !status?.visionSupported} onClick={() => void modelAction('卸载模型', () => localAi.unloadModel())}>从内存卸载</button></div>
        <div className="model-import-controls"><button className="text-link" disabled={modelLocked} onClick={() => void modelAction('导入主模型', () => localAi.importModel({ part: 'model' }))}><Upload size={14} />导入主模型 GGUF</button><button className="text-link" disabled={modelLocked} onClick={() => void modelAction('导入配套视觉文件', () => localAi.importModel({ part: 'projector' }))}><Upload size={14} />导入配套 mmproj</button><button className="text-link" disabled={!!modelBusy && status?.state !== 'downloading'} onClick={() => void refreshModels().catch(error => showMessage(messageOf(error)))}><RefreshCw size={14} />刷新状态与列表</button></div>
      </>}
      <p className="model-privacy"><ShieldCheck size={15} /><span>选择、下载、导入、加载均由你主动操作。切换页面不会取消已开始的下载；只有点击取消下载才发出取消请求。模型未就绪或内存不足时请先记录观察并联系专业人员。</span></p>{status?.engineVersion && <p className="card-footnote">引擎：{status.engineVersion}</p>}{message && <p className="inline-message" role="status">{message}</p>}
    </Dialog>}
    {casesOpen && <Dialog titleId="local-cases-title" className="cases-modal" onClose={() => setCasesOpen(false)}><header><h2 id="local-cases-title">本机观察案例</h2><button className="modal-close" aria-label="关闭本机案例" onClick={() => setCasesOpen(false)}><X size={19} /></button></header><p className="card-footnote">{CASE_STORAGE_NOTICE} 最近最多保留 20 个案例。</p>
      {cases.length ? <><div className="case-list">{cases.map(item => <article key={item.id}><strong>{item.observation.subject} · {item.observation.category === 'crop' ? '种植' : '养殖'}</strong><p>{item.observation.symptoms}</p><small>{formatDate(item.createdAt, true)} · {!item.modelInfo && !item.outcome.raw ? '仅观察，未生成 AI 建议' : item.outcome.status === 'structured' ? '通过结构校验，仍需现场核实' : '原始输出未通过校验'}{item.modelInfo ? ` · ${item.modelInfo.modelName}` : item.outcome.raw ? ' · 未记录模型来源' : ''}</small><div className="case-actions"><button className="text-link" disabled={formLocked} onClick={() => void viewCase(item)}>查看快照与结果</button><button className="text-link" onClick={() => void exportLocalJson(item, `fieldletter-case-${Date.now()}.json`).catch(error => showMessage(messageOf(error)))}><Download size={14} />导出</button><button className="delete-record" disabled={formLocked} aria-label={`删除 ${item.observation.subject} 的案例`} onClick={() => deleteCase(item.id)}><Trash2 size={16} /></button></div></article>)}</div><div className="result-actions"><button className="quiet-button" onClick={() => void exportLocalJson({ version: 1, exportedAt: new Date().toISOString(), cases }, `fieldletter-cases-${Date.now()}.json`).catch(error => showMessage(messageOf(error)))}><Download size={15} />导出全部案例</button></div></> : <div className="service-empty"><FileText size={30} /><h3>还没有保存的案例</h3><p>完成分析后可手动保存本次实际使用的观察、实测和模型来源。</p></div>}{message && <p className="inline-message" role="status">{message}</p>}
    </Dialog>}
  </main>;
}
