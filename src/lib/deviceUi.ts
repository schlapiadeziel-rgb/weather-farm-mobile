import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function formatDate(value: string | undefined, includeTime = false): string {
  if (!value) return '未提供时间';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间无效';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}), hour12: false });
}

export function localDateInput(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTimeInput(date = new Date()): string {
  return `${localDateInput(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '操作未完成，请重试。';
}

export async function openSource(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('来源链接不是有效的 HTTPS 地址。');
  if (Capacitor.isNativePlatform()) await Browser.open({ url: parsed.href });
  else window.open(parsed.href, '_blank', 'noopener,noreferrer');
}

export async function exportLocalJson(value: unknown, filename: string): Promise<void> {
  if (!/^[a-z0-9_.-]+\.json$/i.test(filename)) throw new Error('导出文件名无效。');
  const text = JSON.stringify(value, null, 2);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const file = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: '田野来信 · 本机农场记录', files: [file.uri] });
  } else {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
