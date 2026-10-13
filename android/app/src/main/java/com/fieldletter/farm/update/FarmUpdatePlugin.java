package com.fieldletter.farm.update;

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Explicit, verified APK updates. The Android installer always asks the user to finish. */
@CapacitorPlugin(name = "FarmUpdate")
public final class FarmUpdatePlugin extends Plugin {
    private static final int MAX_REDIRECTS = 5;
    private static final long MAX_TRANSFER_MS = 10 * 60_000L;
    private static final long CACHE_RETENTION_MS = 24 * 60 * 60_000L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Object stateLock = new Object();
    private File directory;
    private volatile boolean destroyed;
    private volatile DownloadRequest activeDownload;
    private volatile DownloadRequest latestDownload;
    private VerifiedUpdate readyUpdate;
    private InstallRequest activeInstall;

    @Override
    public void load() {
        directory = new File(getContext().getCacheDir(), "farm-updates");
        // No cached APK is offered after a new bridge starts. Recent files remain because
        // the external system installer, or an old bridge's terminating worker, may use them.
        worker.execute(this::pruneExpiredCache);
    }

    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo installed = installedPackage();
            JSObject result = new JSObject();
            result.put("versionName", installed.versionName);
            result.put("versionCode", versionCode(installed));
            result.put("platform", "android");
            result.put("canInstall", canInstall());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("无法读取当前游戏版本，请关闭游戏后重试。", "invalid_update");
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        final DownloadRequest request;
        try {
            request = new DownloadRequest(call,
                UpdatePolicy.initialUri(call.getString("url")),
                UpdatePolicy.expectedHash(call.getString("sha256")),
                UpdatePolicy.expectedSize(call.getDouble("size")),
                UpdatePolicy.expectedVersion(call.getString("versionName")));
            if (!request.uri.getRawPath().endsWith("/v" + request.versionName + "/field-letter.apk")) {
                throw new IllegalArgumentException("更新版本与 APK 发布地址不一致。");
            }
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage(), "invalid_update");
            return;
        }
        synchronized (stateLock) {
            if (destroyed) {
                call.reject("游戏页面已关闭，请重新打开后检查更新。", "cancelled");
                return;
            }
            if (activeDownload != null || activeInstall != null) {
                call.reject("正在处理游戏更新，请等待或取消当前下载。", "busy");
                return;
            }
            request.previousUpdate = readyUpdate;
            readyUpdate = null;
            activeDownload = request;
            latestDownload = request;
        }
        try {
            worker.execute(() -> downloadVerified(request));
        } catch (RejectedExecutionException error) {
            finishDownloadFailure(request, new UpdateError("游戏页面已关闭，请重试。", "cancelled"));
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        DownloadRequest request = activeDownload;
        if (request != null) {
            request.cancelled = true;
            HttpsURLConnection connection = request.connection;
            if (connection != null) connection.disconnect();
        }
        call.resolve();
    }

    private void downloadVerified(DownloadRequest request) {
        // Unique paths keep a previous installer URI valid and prevent a destroyed bridge's
        // cleanup from deleting a later bridge's download.
        File partial = new File(directory, "download-" + request.fileId + ".apk");
        File target = new File(directory, "field-letter-" + request.fileId + ".apk");
        boolean committed = false;
        try {
            checkCancelled(request);
            if (!directory.isDirectory() && !directory.mkdirs()) {
                throw new UpdateError("无法建立更新缓存，请检查手机剩余空间。", "download_failed");
            }
            VerifiedUpdate previous = request.previousUpdate;
            if (previous != null && !previous.offeredToInstaller) previous.file.delete();
            pruneExpiredCache();
            if (directory.getUsableSpace() < request.size + 8L * 1024 * 1024) {
                throw new UpdateError("手机可用空间不足，请清理空间后重试。", "download_failed");
            }
            notifyProgress(request, 0);
            HttpsURLConnection connection = connect(request);
            long headerLength;
            try {
                headerLength = UpdatePolicy.contentLength(connection.getHeaderField("Content-Length"));
            } catch (IllegalArgumentException error) {
                throw new UpdateError(error.getMessage(), "size_mismatch");
            }
            if (headerLength != -1 && headerLength != request.size) {
                throw new UpdateError("APK 长度与发布清单不一致，已拒绝下载。", "size_mismatch");
            }
            String encoding = connection.getHeaderField("Content-Encoding");
            if (encoding != null && !"identity".equalsIgnoreCase(encoding)) {
                throw new UpdateError("服务器返回了非原始 APK 数据，已拒绝下载。", "download_failed");
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0, lastNotification = SystemClock.elapsedRealtime();
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                    FileOutputStream output = new FileOutputStream(partial)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    checkCancelled(request);
                    received += count;
                    if (received > request.size || received > UpdatePolicy.MAX_APK_BYTES) {
                        throw new UpdateError("APK 超出发布清单大小，已终止下载。", "size_mismatch");
                    }
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    long now = SystemClock.elapsedRealtime();
                    if (now - lastNotification >= 200) {
                        notifyProgress(request, received);
                        lastNotification = now;
                    }
                }
                output.getFD().sync();
            }
            checkCancelled(request);
            if (received != request.size) {
                throw new UpdateError("APK 下载不完整，已删除，请重新下载。", "size_mismatch");
            }
            if (!UpdatePolicy.hex(digest.digest()).equals(request.sha256)) {
                throw new UpdateError("APK 的 SHA-256 校验失败，已删除，请重新检查更新。", "hash_mismatch");
            }
            // 100% means bytes arrived. The promise resolves only after APK/package checks.
            notifyProgress(request, received);
            long code = validatePackage(partial, request.versionName);
            checkCancelled(request);
            if (!partial.renameTo(target)) {
                throw new UpdateError("无法保存已校验的更新包，请重试。", "download_failed");
            }
            synchronized (stateLock) {
                checkCancelled(request);
                readyUpdate = new VerifiedUpdate(target, request.sha256, request.size, request.versionName, code);
                if (activeDownload == request) activeDownload = null;
                committed = true;
            }
            JSObject result = new JSObject();
            result.put("versionName", request.versionName);
            if (request.settled.compareAndSet(false, true)) request.call.resolve(result);
        } catch (Exception error) {
            finishDownloadFailure(request, downloadError(request, error));
        } finally {
            HttpsURLConnection connection = request.connection;
            request.connection = null;
            if (connection != null) connection.disconnect();
            partial.delete();
            if (!committed) target.delete();
        }
    }

    private HttpsURLConnection connect(DownloadRequest request) throws Exception {
        URI address = request.uri;
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            checkCancelled(request);
            HttpsURLConnection connection = (HttpsURLConnection) address.toURL().openConnection();
            request.connection = connection;
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "FieldLetter-Android-Updater/1");
            int status = connection.getResponseCode();
            checkCancelled(request);
            if (status == 200) return connection;
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                try {
                    address = UpdatePolicy.redirectedUri(address, location);
                } catch (IllegalArgumentException error) {
                    throw new UpdateError(error.getMessage(), "invalid_update");
                }
            } else {
                connection.disconnect();
                throw new UpdateError("下载更新失败（HTTP " + status + "），请检查网络后重试。", "download_failed");
            }
        }
        throw new UpdateError("更新下载重定向次数过多，已停止。", "download_failed");
    }

    private void notifyProgress(DownloadRequest request, long received) {
        mainHandler.post(() -> {
            if (destroyed || request.cancelled || latestDownload != request) return;
            JSObject event = new JSObject();
            event.put("received", received);
            event.put("total", request.size);
            event.put("progress", Math.min(1.0, received / (double) request.size));
            notifyListeners("updateProgress", event);
        });
    }

    private void checkCancelled(DownloadRequest request) throws UpdateError {
        if (destroyed || request.cancelled || Thread.currentThread().isInterrupted()) {
            throw new UpdateError("本次更新下载已取消，未修改游戏存档。", "cancelled");
        }
        if (SystemClock.elapsedRealtime() - request.startedAt > MAX_TRANSFER_MS) {
            throw new UpdateError("更新下载超过 10 分钟，请检查网络后重新下载。", "download_failed");
        }
    }

    private UpdateError downloadError(DownloadRequest request, Exception error) {
        if (destroyed || request.cancelled || Thread.currentThread().isInterrupted()) {
            return new UpdateError("本次更新下载已取消，未修改游戏存档。", "cancelled");
        }
        if (error instanceof UpdateError) return (UpdateError) error;
        return new UpdateError("下载更新失败，请检查网络与手机空间后重试。", "download_failed");
    }

    private void finishDownloadFailure(DownloadRequest request, UpdateError error) {
        synchronized (stateLock) {
            if (activeDownload == request) activeDownload = null;
        }
        if (request.settled.compareAndSet(false, true)) request.call.reject(error.getMessage(), error.code);
    }

    @PluginMethod
    public void install(PluginCall call) {
        final InstallRequest request;
        synchronized (stateLock) {
            if (destroyed) {
                call.reject("游戏页面已关闭，请重新检查更新。", "cancelled");
                return;
            }
            if (activeDownload != null || activeInstall != null) {
                call.reject("正在处理游戏更新，请等待当前操作完成。", "busy");
                return;
            }
            if (readyUpdate == null || !readyUpdate.file.isFile()) {
                call.reject("还没有已校验的更新包，请先下载更新。", "no_download");
                return;
            }
            request = new InstallRequest(call, readyUpdate);
            // Renew the lease before background verification; a second bridge must not prune
            // a file that this user is actively asking the system installer to open.
            if (!readyUpdate.file.setLastModified(System.currentTimeMillis())) {
                call.reject("无法保留安装缓存，请重新下载更新。", "install_unavailable");
                return;
            }
            activeInstall = request;
        }
        // This settings page is opened only by this explicit install call, never on startup.
        if (!canInstall()) {
            mainHandler.post(() -> openInstallPermission(request));
            return;
        }
        try {
            worker.execute(() -> verifyAndInstall(request));
        } catch (RejectedExecutionException error) {
            finishInstallFailure(request, new UpdateError("游戏页面已关闭，请重试。", "cancelled"), false);
        }
    }

    private void openInstallPermission(InstallRequest request) {
        if (destroyed) {
            finishInstallFailure(request, new UpdateError("游戏页面已关闭，请重试。", "cancelled"), false);
            return;
        }
        try {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(settings);
            finishInstallFailure(request, new UpdateError(
                "请在系统设置中允许本游戏安装更新，返回后再次点击安装。", "install_permission_required"), false);
        } catch (RuntimeException error) {
            finishInstallFailure(request, new UpdateError(
                "无法打开安装权限设置，请在系统应用设置中允许本游戏安装未知应用。", "install_unavailable"), false);
        }
    }

    private void verifyAndInstall(InstallRequest request) {
        try {
            if (destroyed || Thread.currentThread().isInterrupted()) {
                throw new UpdateError("游戏页面已关闭，请重试。", "cancelled");
            }
            verifyCachedFile(request.update);
            long code = validatePackage(request.update.file, request.update.versionName);
            if (code != request.update.versionCode) {
                throw new UpdateError("更新包在校验后发生变化，请重新下载。", "invalid_update");
            }
            mainHandler.post(() -> openInstaller(request));
        } catch (Exception error) {
            UpdateError failure = error instanceof UpdateError ? (UpdateError) error
                : new UpdateError("无法读取已下载的更新包，请重新下载。", "invalid_update");
            finishInstallFailure(request, failure, !"cancelled".equals(failure.code));
        }
    }

    private void openInstaller(InstallRequest request) {
        if (destroyed) {
            finishInstallFailure(request, new UpdateError("游戏页面已关闭，请重试。", "cancelled"), false);
            return;
        }
        if (!canInstall()) {
            openInstallPermission(request);
            return;
        }
        try {
            Uri apk = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".updates", request.update.file);
            Intent installer = new Intent(Intent.ACTION_VIEW);
            installer.setDataAndType(apk, "application/vnd.android.package-archive");
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installer.setClipData(ClipData.newRawUri("田野来信更新", apk));
            if (!request.update.file.setLastModified(System.currentTimeMillis())) {
                throw new IllegalStateException("Unable to retain installer cache");
            }
            request.update.offeredToInstaller = true;
            getActivity().startActivity(installer);
            synchronized (stateLock) {
                if (activeInstall == request) activeInstall = null;
            }
            JSObject result = new JSObject();
            result.put("opened", true);
            if (request.settled.compareAndSet(false, true)) request.call.resolve(result);
        } catch (RuntimeException error) {
            finishInstallFailure(request, new UpdateError(
                "无法打开系统安装器，请检查设备安装限制后重试。", "install_unavailable"), false);
        }
    }

    private void finishInstallFailure(InstallRequest request, UpdateError error, boolean invalidate) {
        synchronized (stateLock) {
            if (activeInstall == request) activeInstall = null;
            if (invalidate && readyUpdate == request.update) readyUpdate = null;
        }
        if (invalidate) request.update.file.delete();
        if (request.settled.compareAndSet(false, true)) request.call.reject(error.getMessage(), error.code);
    }

    private void verifyCachedFile(VerifiedUpdate update) throws Exception {
        if (!update.file.isFile() || update.file.length() != update.size) {
            throw new UpdateError("更新缓存不完整，请重新下载。", "size_mismatch");
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long received = 0;
        try (InputStream input = new BufferedInputStream(new FileInputStream(update.file))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (destroyed || Thread.currentThread().isInterrupted()) {
                    throw new UpdateError("游戏页面已关闭，请重试。", "cancelled");
                }
                received += count;
                if (received > update.size) throw new UpdateError("更新缓存大小发生变化，请重新下载。", "size_mismatch");
                digest.update(buffer, 0, count);
            }
        }
        if (received != update.size || !UpdatePolicy.hex(digest.digest()).equals(update.sha256)) {
            throw new UpdateError("更新缓存校验失败，请重新下载。", "hash_mismatch");
        }
    }

    private boolean canInstall() {
        try {
            return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void pruneExpiredCache() {
        if (!directory.isDirectory()) return;
        long now = System.currentTimeMillis();
        File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) {
            long changedAt = file.lastModified();
            if (file.isFile() && file.getName().endsWith(".apk") && changedAt > 0
                    && now - changedAt >= CACHE_RETENTION_MS) file.delete();
        }
    }

    private int signatureFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    private PackageInfo installedPackage() throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), signatureFlags());
    }

    private long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private Set<String> signers(PackageInfo info) throws Exception {
        Signature[] certificates = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        Set<String> result = new HashSet<>();
        if (certificates != null) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (Signature certificate : certificates) {
                if (certificate != null) result.add(UpdatePolicy.hex(digest.digest(certificate.toByteArray())));
            }
        }
        return result;
    }

    private long validatePackage(File apk, String expectedName) throws Exception {
        PackageInfo downloaded = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), signatureFlags());
        if (downloaded == null) throw new UpdateError("下载文件不是有效的 Android 安装包。", "invalid_update");
        if (!getContext().getPackageName().equals(downloaded.packageName)) {
            throw new UpdateError("更新包不属于田野来信，已拒绝安装。", "package_mismatch");
        }
        PackageInfo installed = installedPackage();
        if (versionCode(downloaded) <= versionCode(installed)) {
            throw new UpdateError("更新包版本没有高于当前游戏，已拒绝覆盖。", "version_not_newer");
        }
        if (!expectedName.equals(downloaded.versionName)) {
            throw new UpdateError("更新包版本与发布清单不一致，请重新检查更新。", "invalid_update");
        }
        if (!UpdatePolicy.signerSetsMatch(signers(installed), signers(downloaded))) {
            throw new UpdateError("更新包签名与当前游戏不同，不能直接覆盖安装。请先导出游戏和真实农场资料备份；本游戏不会卸载应用或清除数据。", "signature_mismatch");
        }
        return versionCode(downloaded);
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        DownloadRequest download = activeDownload;
        if (download != null) {
            download.cancelled = true;
            HttpsURLConnection connection = download.connection;
            if (connection != null) connection.disconnect();
            finishDownloadFailure(download, new UpdateError("游戏页面已关闭，更新下载已取消。", "cancelled"));
        }
        InstallRequest install;
        synchronized (stateLock) { install = activeInstall; }
        if (install != null) finishInstallFailure(install, new UpdateError("游戏页面已关闭，请重试。", "cancelled"), false);
        worker.shutdownNow();
        // Keep a verified APK until the next load: a system installer may still be reading it.
    }

    private static final class UpdateError extends IOException {
        final String code;
        UpdateError(String message, String code) { super(message); this.code = code; }
    }

    private static final class DownloadRequest {
        final PluginCall call;
        final URI uri;
        final String sha256;
        final long size;
        final String versionName;
        final long startedAt = SystemClock.elapsedRealtime();
        final AtomicBoolean settled = new AtomicBoolean();
        final String fileId = UUID.randomUUID().toString();
        volatile boolean cancelled;
        volatile HttpsURLConnection connection;
        VerifiedUpdate previousUpdate;
        DownloadRequest(PluginCall call, URI uri, String sha256, long size, String versionName) {
            this.call = call; this.uri = uri; this.sha256 = sha256; this.size = size; this.versionName = versionName;
        }
    }

    private static final class VerifiedUpdate {
        final File file;
        final String sha256;
        final long size;
        final String versionName;
        final long versionCode;
        volatile boolean offeredToInstaller;
        VerifiedUpdate(File file, String sha256, long size, String versionName, long versionCode) {
            this.file = file; this.sha256 = sha256; this.size = size; this.versionName = versionName; this.versionCode = versionCode;
        }
    }

    private static final class InstallRequest {
        final PluginCall call;
        final VerifiedUpdate update;
        final AtomicBoolean settled = new AtomicBoolean();
        InstallRequest(PluginCall call, VerifiedUpdate update) { this.call = call; this.update = update; }
    }
}
