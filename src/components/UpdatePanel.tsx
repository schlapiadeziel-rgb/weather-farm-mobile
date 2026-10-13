import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, CheckCircle2, Download, HardDriveDownload, LoaderCircle, RefreshCw, ShieldCheck, Smartphone, X } from 'lucide-react';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  UPDATE_RELEASES_URL, cancelAppUpdateDownload, checkForUpdate, compareUpdateVersions, downloadAppUpdate,
  getAppUpdateInfo, installAppUpdate, listenToUpdateProgress, updateErrorCode, updateErrorMessage,
  type AppUpdate, type AppUpdateInfo, type UpdateProgress,
} from '../lib/appUpdate';
import './app-update.css';
import { openSource } from '../lib/deviceUi';

export interface UpdatePanelProps {
  onClose?: () => void;
  /** Save the current farm before opening Android's installer; false keeps this dialog open. */
  beforeInstall?: () => boolean;
  onBackup?: () => void;
  initialUpdate?: AppUpdate | null;
}
type UpdateStage = 'checking' | 'current' | 'available' | 'downloading' | 'cancelling' | 'downloaded' | 'installing' | 'installer' | 'error';
const sizeLabel = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export function UpdatePanel({ onClose, beforeInstall, onBackup, initialUpdate }: UpdatePanelProps) {
  const titleId = useId(), descriptionId = useId();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [update, setUpdate] = useState<AppUpdate | null>(initialUpdate ?? null);
  const [stage, setStage] = useState<UpdateStage>('checking');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [status, setStatus] = useState('正在读取版本与更新信息…');
  const overlayRef = useRef<HTMLDivElement>(null), dialogRef = useRef<HTMLDivElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(false), operationRef = useRef(0), downloadActiveRef = useRef(false), actionBusyRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null), listenerRef = useRef<PluginListenerHandle | null>(null);
  const closeCallbackRef = useRef(onClose);
  closeCallbackRef.current = onClose;

  const check = async (knownInfo?: AppUpdateInfo, initial?: AppUpdate | null) => {
    if (actionBusyRef.current) return;
    const operation = ++operationRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStage('checking'); setStatus('正在检查 GitHub 发布版本…'); setError(''); setErrorCode('');
    setUpdate(null); setDownloaded(false); setProgress(null);
    try {
      const deviceInfo = knownInfo ?? await getAppUpdateInfo();
      if (!mountedRef.current || operationRef.current !== operation) return;
      setInfo(deviceInfo);
      const latest = initial && compareUpdateVersions(initial.versionName, deviceInfo.versionName) > 0
        ? initial : await checkForUpdate({ signal: controller.signal, currentVersion: deviceInfo.versionName });
      if (!mountedRef.current || operationRef.current !== operation) return;
      setUpdate(latest); setDownloaded(false); setProgress(null);
      setStage(latest ? 'available' : 'current');
      setStatus(latest ? `发现 ${latest.versionName}，点击下载后才会获取安装包。` : '当前已是可用的最新发布版本。');
    } catch (issue) {
      if (!mountedRef.current || operationRef.current !== operation || controller.signal.aborted) return;
      setStage('error'); setError(updateErrorMessage(issue)); setErrorCode(updateErrorCode(issue)); setStatus('这次更新检查没有完成。');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void check(undefined, initialUpdate);
    return () => {
      mountedRef.current = false; operationRef.current++;
      controllerRef.current?.abort();
      void listenerRef.current?.remove().catch(() => {});
      listenerRef.current = null;
      if (downloadActiveRef.current) void cancelAppUpdateDownload().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current, overlay = overlayRef.current;
    if (!dialog || !overlay) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay && !node.contains(overlay));
    const previousInert = siblings.map(node => node.inert);
    siblings.forEach(node => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(node => node.getClientRects().length > 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeCallbackRef.current) { event.preventDefault(); event.stopPropagation(); closeCallbackRef.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = focusable(), first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const onFocusIn = (event: FocusEvent) => { if (event.target instanceof Node && !dialog.contains(event.target)) (closeRef.current ?? dialog).focus({ preventScroll: true }); };
    document.addEventListener('keydown', onKeyDown, true); document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true); document.removeEventListener('focusin', onFocusIn);
      siblings.forEach((node, index) => { node.inert = previousInert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const startDownload = async () => {
    if (!update || info?.platform !== 'android' || actionBusyRef.current) return;
    actionBusyRef.current = true; downloadActiveRef.current = true;
    const operation = ++operationRef.current;
    setStage('downloading'); setError(''); setErrorCode(''); setDownloaded(false);
    setProgress({ received: 0, total: update.size, progress: 0 }); setStatus('正在下载安装包；完成后会校验大小、SHA-256 和应用签名。');
    let listener: PluginListenerHandle | null = null;
    try {
      listener = await listenToUpdateProgress(value => {
        if (mountedRef.current && operationRef.current === operation && downloadActiveRef.current) setProgress(value);
      });
      if (!mountedRef.current || operationRef.current !== operation) { await listener.remove(); return; }
      listenerRef.current = listener;
      const result = await downloadAppUpdate(update);
      if (!mountedRef.current || operationRef.current !== operation) return;
      if (result.versionName !== update.versionName) throw new Error('下载版本与发布信息不一致，请重新检查更新。');
      setDownloaded(true); setStage('downloaded'); setProgress({ received: update.size, total: update.size, progress: 1 });
      setStatus('安装包已通过校验。点击安装后，在 Android 系统页面确认更新。');
    } catch (issue) {
      if (!mountedRef.current || operationRef.current !== operation) return;
      const code = updateErrorCode(issue);
      setError(updateErrorMessage(issue)); setErrorCode(code); setStage('error'); setProgress(null);
      setStatus(code === 'signature_mismatch' ? '安装包签名不一致，已停止安装。' : ['hash_mismatch', 'size_mismatch', 'package_mismatch', 'version_not_newer'].includes(code) ? '安装包未通过校验，已停止安装。' : '下载尚未完成，可以检查网络后重试。');
    } finally {
      await listener?.remove().catch(() => {});
      if (listenerRef.current === listener) listenerRef.current = null;
      if (operationRef.current === operation) { downloadActiveRef.current = false; actionBusyRef.current = false; }
    }
  };
  const cancelDownload = async () => {
    if (!downloadActiveRef.current || stage === 'cancelling') return;
    operationRef.current++; setStage('cancelling'); setStatus('正在取消下载…');
    try {
      await cancelAppUpdateDownload();
      if (!mountedRef.current) return;
      setProgress(null); setDownloaded(false); setError(''); setErrorCode(''); setStage('available'); setStatus('已取消下载，农场可以继续正常游玩。');
    } catch (issue) {
      if (mountedRef.current) { setError(updateErrorMessage(issue)); setStage('error'); }
    } finally { downloadActiveRef.current = false; actionBusyRef.current = false; }
  };
  const install = async () => {
    if (!downloaded || actionBusyRef.current || info?.platform !== 'android') return;
    actionBusyRef.current = true;
    const operation = ++operationRef.current;
    setError(''); setErrorCode('');
    try {
      if (beforeInstall && !beforeInstall()) {
        setError('当前农场未能保存。请先备份存档，处理存储问题后再安装。'); setStage('downloaded'); return;
      }
      setStage('installing'); setStatus('正在打开 Android 安装程序…');
      const result = await installAppUpdate();
      if (!mountedRef.current || operationRef.current !== operation) return;
      if (!result.opened) throw new Error('没有打开安装程序，请稍后重试。');
      setStage('installer'); setStatus('系统安装页面已打开。请确认更新；完成后重新打开田野来信。');
    } catch (issue) {
      if (!mountedRef.current || operationRef.current !== operation) return;
      setError(updateErrorMessage(issue)); setErrorCode(updateErrorCode(issue)); setStage('downloaded');
      setStatus(updateErrorCode(issue) === 'install_permission_required' ? '返回游戏后，点“继续安装”再次打开安装程序。' : '安装没有完成，现有游戏和记录仍保留。');
    } finally { actionBusyRef.current = false; }
  };

  if (typeof document === 'undefined') return null;
  const android = info?.platform === 'android';
  const working = stage === 'checking' || stage === 'downloading' || stage === 'cancelling' || stage === 'installing';
  const percentage = Math.round((progress?.progress ?? 0) * 100);
  return createPortal(<div className="au-overlay" ref={overlayRef}>
    <section className="au-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={dialogRef} tabIndex={-1}>
      <header className="au-header"><span className="au-emblem"><HardDriveDownload size={23} aria-hidden="true" /></span><div><h2 id={titleId}>游戏更新</h2><p id={descriptionId}>让农场继续成长 · 保留已有存档</p></div>{onClose && <button ref={closeRef} className="au-close" aria-label="关闭游戏更新" onClick={onClose}><X size={21} /></button>}</header>
      <div className="au-body">
        <div className="au-versions"><span>当前版本<strong>{info ? `v${info.versionName}` : '读取中…'}</strong></span><span>{update ? '发现新版本' : '发布来源'}<strong>{update ? `v${update.versionName}` : 'GitHub 官方仓库'}</strong></span>{update && <span>安装包<strong>{sizeLabel(update.size)}</strong></span>}</div>
        <p className="au-status" role="status">{working ? <LoaderCircle className="au-spin" size={18} /> : stage === 'current' || downloaded ? <CheckCircle2 size={18} /> : <RefreshCw size={18} />}{status}</p>
        {info && !android && <div className="au-notice"><Smartphone size={19} /><p>这是网页预览。APK 只适用于 Android，iPad / iPhone 请继续使用网页；这里无法安装 Android 更新，也不会下载 APK。</p></div>}
        {progress && <div className="au-download-progress"><div><strong>{percentage === 100 && stage === 'downloading' ? '下载完成，正在校验…' : downloaded ? '安装包已校验' : `下载进度 ${percentage}%`}</strong><span>{sizeLabel(progress.received)} / {sizeLabel(progress.total)}</span></div><progress aria-label="更新安装包下载进度" max={1} value={progress.progress} /><small>更新包只下载到此设备，不上传游戏存档、定位、照片或农场记录。</small></div>}
        {error && <div className={`au-error ${errorCode === 'signature_mismatch' ? 'au-signature-warning' : ''}`} role="alert"><p>{error}</p>{errorCode === 'signature_mismatch' && <p>可先保留当前版本继续使用。若决定手动更换安装，务必分别备份游戏存档和农场工作室记录。</p>}</div>}
        {update && <article className="au-release"><div><h3>{update.title || `田野来信 ${update.tag}`}</h3>{update.prerelease && <span className="au-test-build">测试版本</span>}</div><p className="au-date">发布于 {new Date(update.publishedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p><pre className="au-notes">{update.notes || '发布者尚未提供更新说明，可打开发布页核对。'}</pre></article>}
        {android && <div className="au-safety"><ShieldCheck size={19} /><div><strong>先核对，再安装</strong><p>应用会核对安装包、版本与签名。安装需要你的系统确认；覆盖更新会保留数据，建议提前导出备份。</p><p>Android 8 及以上首次安装时，系统可能要求允许“安装未知应用”。只允许田野来信后返回，再点继续安装。</p>{info && !info.canInstall && <small>当前尚未取得此安装来源的权限，下载完成后可在系统设置授权。</small>}</div></div>}
      </div>
      <footer className="au-footer"><div className="au-links"><a href={update?.releaseUrl ?? UPDATE_RELEASES_URL} target="_blank" rel="noopener noreferrer" onClick={event => { if (android) { event.preventDefault(); void openSource(update?.releaseUrl ?? UPDATE_RELEASES_URL).catch(issue => setError(updateErrorMessage(issue))); } }}>查看发布页<ArrowUpRight size={14} /></a>{onBackup && <button className="au-backup" disabled={stage === 'installing'} onClick={onBackup}>导出游戏备份</button>}</div><div className="au-actions">
        {stage === 'downloading' || stage === 'cancelling' ? <button className="au-secondary" onClick={() => void cancelDownload()} disabled={stage === 'cancelling'}>取消下载</button> : <button className="au-secondary" onClick={() => void check(info ?? undefined)} disabled={working}><RefreshCw size={16} />{stage === 'error' && !update ? '重试检查' : '检查更新'}</button>}
        {android && update && !downloaded && stage !== 'checking' && <button className="au-primary" disabled={working} onClick={() => void startDownload()}><Download size={17} />{stage === 'error' ? '重新下载' : `下载 ${sizeLabel(update.size)}`}</button>}
        {android && downloaded && <button className="au-primary" disabled={working} onClick={() => void install()}><HardDriveDownload size={17} />{errorCode === 'install_permission_required' || stage === 'installer' ? '继续安装' : '安装更新'}</button>}
      </div></footer>
    </section>
  </div>, document.body);
}

export default UpdatePanel;
