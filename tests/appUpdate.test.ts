import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  AppUpdateError, MAX_UPDATE_BYTES, UPDATE_API_URL, UPDATE_REPOSITORY, checkForUpdate, compareUpdateVersions,
  downloadAppUpdate, parseUpdateChecksum, parseUpdateRelease, parseUpdateVersion, trustedUpdateAssetUrl, updateErrorMessage,
} from '../src/lib/appUpdate.ts';

const originalFetch = globalThis.fetch;
const hash = 'a1'.repeat(32);
const checksums = `${hash}  field-letter.apk\n${'b2'.repeat(32)}  weather-farm-source.zip\n`;
const assetUrl = (tag: string, name: string) => `https://github.com/${UPDATE_REPOSITORY}/releases/download/${tag}/${name}`;
function release(tag = 'v0.4.0') {
  return {
    tag_name: tag, draft: false, prerelease: true, name: `田野来信 ${tag}`, body: '<script>remote()</script>\n种植与工坊改进。',
    html_url: `https://github.com/${UPDATE_REPOSITORY}/releases/tag/${tag}`, published_at: '2026-10-13T10:15:00Z',
    assets: [
      { name: 'field-letter.apk', browser_download_url: assetUrl(tag, 'field-letter.apk'), size: 20_000_000, state: 'uploaded' },
      { name: 'SHA256SUMS.txt', browser_download_url: assetUrl(tag, 'SHA256SUMS.txt'), size: checksums.length, state: 'uploaded' },
    ],
  };
}
function response(body: string, status = 200, url = ''): Response {
  const result = new Response(body, { status });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}
function installResponses(releases: unknown, checksum = checksums) {
  const requests: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); requests.push(url);
    return response(url === UPDATE_API_URL ? JSON.stringify(releases) : checksum, 200, url);
  };
  return requests;
}
afterEach(() => { globalThis.fetch = originalFetch; });

test('release versions compare numeric major/minor/patch fields, including multi-digit increments', () => {
  assert.deepEqual(parseUpdateVersion('v0.4.0'), [0, 4, 0]);
  assert.equal(compareUpdateVersions('0.10.0', 'v0.9.99'), 1);
  assert.equal(compareUpdateVersions('v1.0.0', '0.999.999'), 1);
  assert.equal(compareUpdateVersions('v0.4.0', '0.4.0'), 0);
  assert.equal(compareUpdateVersions('0.4.0', '0.4.1'), -1);
});
test('partial versions, leading zeroes, suffixes and oversized numeric fields never masquerade as an update', () => {
  for (const value of ['0.4', 'v04.0.0', ' 0.4.0', '0.4.0 ', 'v0.4.0-beta', '0.4.0+build', '1.2.3.4', '1000000.0.0', '', null, 1]) assert.equal(parseUpdateVersion(value), null);
  assert.throws(() => compareUpdateVersions('future', '0.3.0'), /版本号/);
});
test('the same-repository prerelease is accepted with exact assets and a real publication date', () => {
  const parsed = parseUpdateRelease(release(), '0.3.0');
  assert.equal(parsed?.versionName, '0.4.0');
  assert.equal(parsed?.prerelease, true);
  assert.equal(parsed?.size, 20_000_000);
  assert.equal(parsed?.notes, '<script>remote()</script>\n种植与工坊改进。'); // Text is retained, never executed or interpreted as HTML.
  assert.equal(parseUpdateRelease(release(), '0.4.0'), null);
  assert.equal(parseUpdateRelease(release(), '0.5.0'), null);
});
test('drafts, invalid dates, mismatching release pages and incomplete uploads are excluded', () => {
  for (const changes of [
    { draft: true }, { tag_name: '0.4.0' }, { tag_name: 'v0.4.0-rc' }, { prerelease: 'false' },
    { published_at: '2026-02-30T10:15:00Z' }, { published_at: 'yesterday' },
    { html_url: 'https://github.com/attacker/weather-farm-mobile/releases/tag/v0.4.0' },
    { html_url: `${release().html_url}?from=other` }, { assets: [] },
  ]) assert.equal(parseUpdateRelease({ ...release(), ...changes }, '0.3.0'), null);
  const duplicate = release(); duplicate.assets.push(duplicate.assets[0]);
  assert.equal(parseUpdateRelease(duplicate, '0.3.0'), null);
  const incomplete = release(); incomplete.assets[0].state = 'new';
  assert.equal(parseUpdateRelease(incomplete, '0.3.0'), null);
});
test('APK and checksum assets enforce size bounds and exact trusted URLs', () => {
  for (const size of [0, -1, MAX_UPDATE_BYTES + 1, 1.5, NaN, Infinity]) {
    const item = release(); item.assets[0].size = size;
    assert.equal(parseUpdateRelease(item, '0.3.0'), null);
  }
  const valid = release(); valid.assets[0].size = MAX_UPDATE_BYTES;
  assert.equal(parseUpdateRelease(valid, '0.3.0')?.size, MAX_UPDATE_BYTES);
  const invalidChecksum = release(); invalidChecksum.assets[1].size = 64_001;
  assert.equal(parseUpdateRelease(invalidChecksum, '0.3.0'), null);
  const wrongApk = release(); wrongApk.assets[0].browser_download_url = assetUrl('v0.3.0', 'field-letter.apk');
  assert.equal(parseUpdateRelease(wrongApk, '0.3.0'), null);
});
test('GitHub-like domains, foreign repositories, credentials and alternate paths are never trusted as initial assets', () => {
  assert.equal(trustedUpdateAssetUrl(assetUrl('v0.4.0', 'field-letter.apk'), 'v0.4.0', 'field-letter.apk'), assetUrl('v0.4.0', 'field-letter.apk'));
  const apiAsset = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/assets/123`;
  assert.equal(trustedUpdateAssetUrl(apiAsset, 'v0.4.0', 'field-letter.apk'), null);
  assert.equal(trustedUpdateAssetUrl(apiAsset, 'v0.4.0', 'SHA256SUMS.txt'), apiAsset);
  for (const url of [
    assetUrl('v0.4.0', 'field-letter.apk').replace('github.com', 'github.com.evil.example'),
    assetUrl('v0.4.0', 'field-letter.apk').replace('https:', 'http:'),
    assetUrl('v0.4.0', 'field-letter.apk').replace('github.com', 'user:password@github.com'),
    assetUrl('v0.4.0', 'field-letter.apk').replace('schlapiadeziel-rgb', 'someone-else'),
    `${assetUrl('v0.4.0', 'field-letter.apk')}?redirect=elsewhere`, `${assetUrl('v0.4.0', 'field-letter.apk')}#fragment`,
    'https://raw.githubusercontent.com/attacker/field-letter.apk', 'https://release-assets.githubusercontent.com/unrelated.apk',
    `https://api.github.com/repos/someone-else/weather-farm-mobile/releases/assets/123`,
  ]) assert.equal(trustedUpdateAssetUrl(url, 'v0.4.0', 'field-letter.apk'), null);
});
test('SHA-256 parsing requires 64 hex characters and one exact APK filename', () => {
  assert.equal(parseUpdateChecksum(checksums), hash);
  assert.equal(parseUpdateChecksum(`${hash.toUpperCase()} *field-letter.apk\r\n`), hash);
  for (const value of [
    `${hash.slice(1)}  field-letter.apk`, `${hash}  field-letter.apk.old`, `${hash}  ./field-letter.apk`,
    `${hash}  not-field-letter.apk`, `${hash}  field-letter.apk\n${hash}  field-letter.apk`,
    `${'z'.repeat(64)}  field-letter.apk`, 'no checksum', `${hash}  field-letter.apk\0`, 'x'.repeat(64_001),
  ]) assert.throws(() => parseUpdateChecksum(value), AppUpdateError);
});
test('checking selects the greatest numeric complete release, includes prereleases and never downloads an APK', async () => {
  const requests = installResponses([release('v0.9.0'), { ...release('v2.0.0'), draft: true }, release('v0.10.0'), release('v0.3.0')]);
  const result = await checkForUpdate({ currentVersion: '0.3.0' });
  assert.equal(result?.versionName, '0.10.0'); assert.equal(result?.sha256, hash);
  assert.deepEqual(requests, [UPDATE_API_URL, assetUrl('v0.10.0', 'SHA256SUMS.txt')]);
});
test('an equal or older release returns no update without fetching any assets', async () => {
  const requests = installResponses([release('v0.2.0'), release('v0.3.0')]);
  assert.equal(await checkForUpdate({ currentVersion: 'v0.3.0' }), null);
  assert.deepEqual(requests, [UPDATE_API_URL]);
});
test('malicious or missing release metadata cannot create an update or trigger asset fetches', async () => {
  const invalid = release(); invalid.assets[0].browser_download_url = 'https://evil.example/update.apk';
  const requests = installResponses([invalid, { ...release(), assets: [] }]);
  assert.equal(await checkForUpdate({ currentVersion: '0.3.0' }), null);
  assert.equal(requests.length, 1);
});
test('a bad checksum on the newest release stops updating rather than silently offering another build', async () => {
  const requests = installResponses([release('v0.4.0'), release('v0.5.0')], 'malformed');
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0' }), error => error instanceof AppUpdateError && error.code === 'invalid_checksum');
  assert.equal(requests[1], assetUrl('v0.5.0', 'SHA256SUMS.txt')); assert.equal(requests.length, 2);
});
test('GitHub rate limiting is an explicit retryable error, never a fake latest-version result', async () => {
  for (const status of [403, 429]) {
    globalThis.fetch = async () => response('{"message":"rate limit"}', status);
    await assert.rejects(checkForUpdate({ currentVersion: '0.3.0' }), error => error instanceof AppUpdateError && error.code === 'rate_limit');
  }
});
test('offline and malformed server replies fail with an error rather than an invented version', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0' }), /暂时无法连接/);
  for (const body of ['not json', '{"message":"not a release list"}', 'x'.repeat(1_000_001)]) {
    globalThis.fetch = async () => response(body);
    await assert.rejects(checkForUpdate({ currentVersion: '0.3.0' }), AppUpdateError);
  }
});
test('unexpected metadata or checksum redirects are rejected but signed GitHub asset CDN redirects are allowed', async () => {
  globalThis.fetch = async () => response(JSON.stringify([release()]), 200, 'https://evil.example/releases');
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0' }), /重定向不受信任/);
  globalThis.fetch = async input => response(String(input) === UPDATE_API_URL ? JSON.stringify([release()]) : checksums, 200, String(input) === UPDATE_API_URL ? UPDATE_API_URL : 'https://release-assets.githubusercontent.com/github-production-release-asset/123/abc?sig=signed');
  assert.equal((await checkForUpdate({ currentVersion: '0.3.0' }))?.sha256, hash);
  globalThis.fetch = async input => response(String(input) === UPDATE_API_URL ? JSON.stringify([release()]) : checksums, 200, String(input) === UPDATE_API_URL ? UPDATE_API_URL : 'https://raw.githubusercontent.com/attacker/checksums');
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0' }), /重定向不受信任/);
});
test('a timed out check aborts network work and cannot report a valid update', async () => {
  globalThis.fetch = async (_input, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0', timeoutMs: 5 }), error => error instanceof AppUpdateError && error.code === 'timeout');
});
test('closing a check cancels its request and a late reply cannot proceed to fetch checksums', async () => {
  const controller = new AbortController(); let requests = 0;
  globalThis.fetch = async () => { requests++; controller.abort(); return response(JSON.stringify([release()])); };
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0', signal: controller.signal }), error => error instanceof AppUpdateError && error.code === 'cancelled');
  assert.equal(requests, 1);
  globalThis.fetch = async () => { requests++; return response('[]'); };
  await assert.rejects(checkForUpdate({ currentVersion: '0.3.0', signal: controller.signal }), /已取消/);
  assert.equal(requests, 1);
});
test('the web never invokes native APK download and signature/permission failures carry clear guidance', async () => {
  const metadata = parseUpdateRelease(release(), '0.3.0')!;
  await assert.rejects(downloadAppUpdate({ ...metadata, sha256: hash }), /仅支持 Android/);
  assert.match(updateErrorMessage({ code: 'signature_mismatch' }), /先备份/);
  assert.match(updateErrorMessage({ code: 'signature_mismatch' }), /不会替你卸载或清除数据/);
  assert.match(updateErrorMessage({ code: 'install_permission_required' }), /返回后再点/);
});
