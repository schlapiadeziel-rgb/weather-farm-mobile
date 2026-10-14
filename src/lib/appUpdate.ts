import { Capacitor, CapacitorHttp, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import packageInfo from '../../package.json';
import { validTimestamp } from './publicDataHttp';

export const UPDATE_REPOSITORY = 'schlapiadeziel-rgb/weather-farm-mobile';
export const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`;
export const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=30`;
export const MAX_UPDATE_BYTES = 200_000_000;

export interface AppUpdate {
  versionName: string;
  tag: string;
  title: string;
  notes: string;
  publishedAt: string;
  releaseUrl: string;
  apkUrl: string;
  checksumUrl: string;
  sha256: string;
  size: number;
  prerelease: boolean;
}
export interface AppUpdateInfo {
  versionName: string;
  versionCode: number;
  platform: 'android' | 'web';
  canInstall: boolean;
  downloadedUpdate?: DownloadedAppUpdate;
}
export interface DownloadedAppUpdate {
  versionName: string;
  versionCode: number;
  sha256: string;
  size: number;
}
export interface UpdateProgress { received: number; total: number; progress: number }
interface FarmUpdatePlugin {
  info(): Promise<AppUpdateInfo>;
  download(options: { url: string; sha256: string; size: number; versionName: string }): Promise<{ versionName: string }>;
  cancelDownload(): Promise<void>;
  install(): Promise<{ opened: true }>;
  addListener(eventName: 'updateProgress', listener: (progress: UpdateProgress) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'updateResume', listener: () => void): Promise<PluginListenerHandle>;
}
const nativeUpdater = registerPlugin<FarmUpdatePlugin>('FarmUpdate');

export class AppUpdateError extends Error {
  constructor(message: string, public readonly code: string) { super(message); this.name = 'AppUpdateError'; }
}

/** Only complete numeric release versions are accepted; no lexical comparisons. */
export function parseUpdateVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string' || value.length > 24) return null;
  const parts = /^(?:v)?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(value);
  return parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : null;
}
export function compareUpdateVersions(left: string, right: string): number {
  const a = parseUpdateVersion(left), b = parseUpdateVersion(right);
  if (!a || !b) throw new AppUpdateError('版本号格式无法识别，请通过发布页核对版本。', 'invalid_version');
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function secureUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash ? url : null;
  } catch { return null; }
}

/** Initial assets must belong to this repository, not just use a GitHub-like host. */
export function trustedUpdateAssetUrl(value: unknown, tag: string, name: string): string | null {
  const url = secureUrl(value);
  if (!url || !/^v(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})$/.test(tag)) return null;
  if (url.hostname === 'github.com' && !url.search && url.pathname === `/${UPDATE_REPOSITORY}/releases/download/${tag}/${name}`) return url.href;
  if (name === 'SHA256SUMS.txt' && url.hostname === 'api.github.com' && !url.search && new RegExp(`^/repos/${UPDATE_REPOSITORY}/releases/assets/[1-9]\\d{0,18}$`).test(url.pathname)) return url.href;
  return null;
}

/** Redirects may be GitHub's signed asset CDN; arbitrary GitHub user content is excluded. */
function trustedResponseUrl(value: string, initial: string, kind: 'api' | 'checksum'): boolean {
  if (!value) return true; // Native HTTP implementations can omit the final URL.
  const url = secureUrl(value);
  if (!url) return false;
  if (kind === 'api') return url.href === initial;
  if (url.href === initial) return true;
  return url.hostname === 'release-assets.githubusercontent.com' || url.hostname === 'objects.githubusercontent.com';
}

type PendingUpdate = Omit<AppUpdate, 'sha256'>;
/** Incomplete uploads and drafts are excluded, including during release publication. */
export function parseUpdateRelease(value: unknown, currentVersion: string): PendingUpdate | null {
  const release = object(value);
  if (!release || release.draft !== false || typeof release.prerelease !== 'boolean' || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v') || !parseUpdateVersion(release.tag_name)) return null;
  const tag = release.tag_name;
  if (compareUpdateVersions(tag, currentVersion) <= 0) return null;
  const htmlUrl = secureUrl(release.html_url);
  if (!htmlUrl || htmlUrl.href !== `https://github.com/${UPDATE_REPOSITORY}/releases/tag/${tag}`) return null;
  if (typeof release.published_at !== 'string' || !validTimestamp(release.published_at) || !Array.isArray(release.assets) || release.assets.length > 100) return null;
  const apkAssets = release.assets.filter(asset => object(asset)?.name === 'field-letter.apk');
  const checksumAssets = release.assets.filter(asset => object(asset)?.name === 'SHA256SUMS.txt');
  if (apkAssets.length !== 1 || checksumAssets.length !== 1) return null;
  const apk = object(apkAssets[0])!, checksum = object(checksumAssets[0])!;
  const apkUrl = trustedUpdateAssetUrl(apk.browser_download_url, tag, 'field-letter.apk');
  const checksumUrl = trustedUpdateAssetUrl(checksum.browser_download_url, tag, 'SHA256SUMS.txt');
  if (!apkUrl || !checksumUrl || !Number.isSafeInteger(apk.size) || (apk.size as number) < 1 || (apk.size as number) > MAX_UPDATE_BYTES || !Number.isSafeInteger(checksum.size) || (checksum.size as number) < 1 || (checksum.size as number) > 64_000) return null;
  if (apk.state !== 'uploaded' || checksum.state !== 'uploaded') return null;
  return {
    versionName: tag.slice(1), tag, title: typeof release.name === 'string' ? release.name.slice(0, 200) : tag,
    // React renders these strings as text; remote HTML/Markdown is never executed.
    notes: typeof release.body === 'string' ? release.body.slice(0, 30_000) : '',
    publishedAt: release.published_at, releaseUrl: htmlUrl.href, apkUrl, checksumUrl,
    size: apk.size as number, prerelease: release.prerelease,
  };
}

/** An exact filename and a single hash entry are required; substring matches are unsafe. */
export function parseUpdateChecksum(text: string): string {
  if (typeof text !== 'string' || text.length > 64_000 || text.includes('\0')) throw new AppUpdateError('更新校验文件无效，请稍后重试。', 'invalid_checksum');
  const entries: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})[ \t]+\*?field-letter\.apk[ \t]*$/.exec(line);
    if (match) entries.push(match[1].toLowerCase());
    else if (/field-letter\.apk/.test(line)) throw new AppUpdateError('APK 校验信息格式不正确，已停止更新。', 'invalid_checksum');
  }
  if (entries.length !== 1) throw new AppUpdateError('没有找到唯一的 APK 校验值，已停止更新。', 'invalid_checksum');
  return entries[0];
}

export async function getAppUpdateInfo(): Promise<AppUpdateInfo> {
  if (Capacitor.getPlatform() !== 'android') return { versionName: packageInfo.version, versionCode: 0, platform: 'web', canInstall: false };
  const info = await nativeUpdater.info();
  if (!parseUpdateVersion(info.versionName) || info.versionName.startsWith('v') || !Number.isSafeInteger(info.versionCode) || info.versionCode < 1 || info.platform !== 'android' || typeof info.canInstall !== 'boolean') throw new AppUpdateError('无法读取当前应用版本，请重新打开应用。', 'invalid_version');
  const downloadedUpdate = parseDownloadedUpdate(info.downloadedUpdate, info.versionCode);
  return { versionName: info.versionName, versionCode: info.versionCode, platform: info.platform, canInstall: info.canInstall, ...(downloadedUpdate ? { downloadedUpdate } : {}) };
}

/** Native metadata is a hint from this process, never permission to install an arbitrary file. */
export function parseDownloadedUpdate(value: unknown, installedVersionCode: number): DownloadedAppUpdate | null {
  const update = object(value);
  if (!Number.isSafeInteger(installedVersionCode) || installedVersionCode < 1 || !update
      || typeof update.versionName !== 'string' || update.versionName.startsWith('v') || !parseUpdateVersion(update.versionName)
      || !Number.isSafeInteger(update.versionCode) || (update.versionCode as number) <= installedVersionCode
      || typeof update.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(update.sha256)
      || !Number.isSafeInteger(update.size) || (update.size as number) < 1 || (update.size as number) > MAX_UPDATE_BYTES) return null;
  return { versionName: update.versionName, versionCode: update.versionCode as number, sha256: update.sha256, size: update.size as number };
}

/** Reuse only the exact package described by the release checked for this dialog. */
export function matchesDownloadedUpdate(info: AppUpdateInfo, update: AppUpdate | null): boolean {
  if (info.platform !== 'android' || !update) return false;
  const downloaded = parseDownloadedUpdate(info.downloadedUpdate, info.versionCode);
  return !!downloaded && downloaded.versionName === update.versionName && downloaded.sha256 === update.sha256 && downloaded.size === update.size;
}

function aborted(signal: AbortSignal): never { throw new AppUpdateError(signal.reason === 'update-timeout' ? '检查更新超时，请稍后重试。' : '已取消检查更新。', signal.reason === 'update-timeout' ? 'timeout' : 'cancelled'); }
async function updateText(url: string, kind: 'api' | 'checksum', signal: AbortSignal): Promise<string> {
  if (signal.aborted) aborted(signal);
  const headers = { Accept: kind === 'api' ? 'application/vnd.github+json' : 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' };
  let status: number, responseUrl: string, body: unknown;
  try {
    if (Capacitor.getPlatform() === 'android') {
      const response = await new Promise<Awaited<ReturnType<typeof CapacitorHttp.get>>>((resolve, reject) => {
        const cancel = () => { try { aborted(signal); } catch (error) { reject(error); } };
        signal.addEventListener('abort', cancel, { once: true });
        CapacitorHttp.get({ url, headers, responseType: 'text', connectTimeout: 10_000, readTimeout: 15_000 }).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
      });
      status = response.status; responseUrl = response.url; body = typeof response.data === 'object' && kind === 'api' ? JSON.stringify(response.data) : response.data;
    } else {
      const response = await fetch(url, { headers, signal });
      status = response.status; responseUrl = response.url; body = await response.text();
    }
  } catch (error) {
    if (signal.aborted) aborted(signal);
    if (error instanceof AppUpdateError) throw error;
    throw new AppUpdateError('暂时无法连接更新服务器，请检查网络或打开 GitHub 发布页。', 'network');
  }
  if (signal.aborted) aborted(signal);
  if (status === 403 || status === 429) throw new AppUpdateError('GitHub 暂时限制了更新检查，请稍后重试。', 'rate_limit');
  if (status < 200 || status >= 300) throw new AppUpdateError(`更新服务器读取失败（${status}），请稍后重试。`, 'server');
  if (!trustedResponseUrl(responseUrl, url, kind)) throw new AppUpdateError('更新来源重定向不受信任，已停止检查。', 'invalid_source');
  if (typeof body !== 'string' || body.length > (kind === 'api' ? 1_000_000 : 64_000)) throw new AppUpdateError('更新服务器返回了无效数据。', 'invalid_response');
  return body;
}

/** Checking never downloads an APK. Prereleases are included because current releases are test builds. */
export async function checkForUpdate(options: { signal?: AbortSignal; currentVersion?: string; timeoutMs?: number } = {}): Promise<AppUpdate | null> {
  if (options.signal?.aborted) aborted(options.signal);
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort('update-timeout'), Math.min(60_000, Math.max(1, options.timeoutMs ?? 20_000)));
  try {
    const current = options.currentVersion ?? (await getAppUpdateInfo()).versionName;
    if (controller.signal.aborted) aborted(controller.signal);
    if (!parseUpdateVersion(current)) throw new AppUpdateError('当前应用版本无法识别，请通过发布页核对。', 'invalid_version');
    const raw = await updateText(UPDATE_API_URL, 'api', controller.signal);
    let releases: unknown;
    try { releases = JSON.parse(raw); } catch { throw new AppUpdateError('更新服务器返回了无效的版本列表。', 'invalid_response'); }
    if (!Array.isArray(releases) || releases.length > 100) throw new AppUpdateError('更新版本列表格式无法识别。', 'invalid_response');
    const candidates = releases.map(value => parseUpdateRelease(value, current)).filter((value): value is PendingUpdate => value !== null).sort((a, b) => compareUpdateVersions(b.versionName, a.versionName));
    const release = candidates[0];
    if (!release) return null;
    const checksum = await updateText(release.checksumUrl, 'checksum', controller.signal);
    return { ...release, sha256: parseUpdateChecksum(checksum) };
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}

export function updateErrorCode(error: unknown): string {
  const data = object(error);
  return typeof data?.code === 'string' ? data.code : '';
}
export function updateErrorMessage(error: unknown): string {
  const messages: Record<string, string> = {
    signature_mismatch: '这个安装包与已安装版本的签名不同，无法直接覆盖。请先备份游戏和现实农场记录；应用不会替你卸载或清除数据。',
    version_not_newer: '安装包不是更新的版本，请重新检查更新。', package_mismatch: '安装包不属于田野来信，已停止安装。',
    hash_mismatch: '安装包校验失败，已删除这次下载。请重新下载。', size_mismatch: '安装包大小不符合发布信息，请重新下载。',
    invalid_update: '更新下载信息无效，请重新检查版本。', download_failed: '安装包下载失败，请检查网络、存储空间后重试。',
    busy: '还有一个下载正在进行，请等待或取消后重试。', cancelled: '下载已取消。', no_download: '还没有可安装的更新，请先下载。',
    install_permission_required: '已打开系统设置。请允许田野来信安装应用，返回后再点“继续安装”。',
    install_unavailable: '此设备暂时无法打开安装程序，可以到 GitHub 发布页下载安装包。',
  };
  return messages[updateErrorCode(error)] || (error instanceof Error ? error.message : '这次更新操作没有完成，请稍后重试。');
}
export async function downloadAppUpdate(update: AppUpdate): Promise<{ versionName: string }> {
  if (Capacitor.getPlatform() !== 'android') throw new AppUpdateError('APK 更新仅支持 Android。', 'unsupported');
  if (!trustedUpdateAssetUrl(update.apkUrl, update.tag, 'field-letter.apk') || !/^[a-f0-9]{64}$/.test(update.sha256) || !Number.isSafeInteger(update.size) || update.size < 1 || update.size > MAX_UPDATE_BYTES || update.versionName !== update.tag.slice(1)) throw new AppUpdateError('更新下载信息无效，请重新检查版本。', 'invalid_update');
  return nativeUpdater.download({ url: update.apkUrl, sha256: update.sha256, size: update.size, versionName: update.versionName });
}
export async function listenToUpdateProgress(listener: (progress: UpdateProgress) => void): Promise<PluginListenerHandle> {
  return nativeUpdater.addListener('updateProgress', progress => {
    if (!Number.isFinite(progress.received) || !Number.isFinite(progress.total) || progress.received < 0 || progress.total < 1 || progress.received > progress.total || !Number.isFinite(progress.progress)) return;
    listener({ received: progress.received, total: progress.total, progress: Math.max(0, Math.min(1, progress.received / progress.total)) });
  });
}
export async function listenToAppUpdateResume(listener: () => void): Promise<PluginListenerHandle | null> {
  return Capacitor.getPlatform() === 'android' ? nativeUpdater.addListener('updateResume', listener) : null;
}
export async function cancelAppUpdateDownload(): Promise<void> { if (Capacitor.getPlatform() === 'android') await nativeUpdater.cancelDownload(); }
export async function installAppUpdate(): Promise<{ opened: true }> {
  if (Capacitor.getPlatform() !== 'android') throw new AppUpdateError('APK 更新仅支持 Android。', 'unsupported');
  return nativeUpdater.install();
}
