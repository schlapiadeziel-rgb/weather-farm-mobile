package com.fieldletter.farm.ai;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.SystemClock;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "LocalAi", permissions = {
    @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
})
public class LocalAiPlugin extends Plugin {
    private static final ExecutorService engineWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService mediaWorker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final Map<String, FarmMedia.PreparedMedia> media = new ConcurrentHashMap<>();
    private volatile ModelProfiles.Profile selected;
    private volatile String state = "missing", lastError = "";
    private volatile boolean loaded = false, cancelDownload = false, stopRequested = false, destroyed = false;
    private volatile boolean generationPending = false;
    private final Object generationLock = new Object();
    private volatile long transferBytes = 0;
    private volatile HttpsURLConnection connection;
    private volatile OnDeviceSpeech speech;
    private Uri cameraUri;
    private Uri videoUri;

    @Override public void load() {
        SharedPreferences prefs = getContext().getSharedPreferences("farm-ai", Context.MODE_PRIVATE);
        String saved = prefs.getString("selected-model", "");
        try { selected = ModelProfiles.find(saved); }
        catch (IllegalArgumentException ignored) {
            long total = memory().totalMem;
            selected = ModelProfiles.ALL.get(total >= (long) (10.3 * ModelProfiles.GIB) ? 2 : total >= (long) (6.8 * ModelProfiles.GIB) ? 1 : 0);
        }
        state = bothPresent(selected) ? "downloaded" : "missing";
        for (ModelProfiles.Profile p : ModelProfiles.ALL) {
            File dir = new File(getContext().getNoBackupFilesDir(), "farm-ai/" + p.id);
            File[] files = dir.listFiles((ignored, name) -> name.endsWith(".part"));
            if (files != null) for (File partial : files) partial.delete();
        }
    }

    private ActivityManager.MemoryInfo memory() {
        ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
        ((ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(info);
        return info;
    }

    private File directory(ModelProfiles.Profile profile) {
        File dir = new File(getContext().getNoBackupFilesDir(), "farm-ai/" + profile.id);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("无法创建本机模型目录");
        return dir;
    }
    private File file(ModelProfiles.Profile profile, ModelProfiles.Part part) { return new File(directory(profile), part.fileName); }
    private File marker(File file) { return new File(file.getAbsolutePath() + ".verified"); }
    private String markerText(File file, ModelProfiles.Part part) { return part.sha256 + ":" + file.length() + ":" + file.lastModified(); }
    private boolean present(ModelProfiles.Profile profile, ModelProfiles.Part part) {
        try {
            File file = file(profile, part);
            if (!file.isFile() || file.length() != part.bytes) return false;
            try (InputStream input = new FileInputStream(marker(file))) {
                byte[] bytes = new byte[256]; int count = input.read(bytes);
                return count > 0 && markerText(file, part).equals(new String(bytes, 0, count, StandardCharsets.US_ASCII));
            }
        } catch (Exception ignored) { return false; }
    }
    private boolean bothPresent(ModelProfiles.Profile profile) { return present(profile, profile.model) && present(profile, profile.projector); }
    private boolean memoryAllows(ModelProfiles.Profile profile, ActivityManager.MemoryInfo info) {
        return !info.lowMemory && info.availMem >= profile.requiredAvailableMemory()
            && info.totalMem >= profile.recommendedMemoryBytes * 86 / 100;
    }

    private JSObject status() {
        ModelProfiles.Profile p = selected;
        ActivityManager.MemoryInfo ram = memory();
        boolean model = present(p, p.model), projector = present(p, p.projector);
        long bytes = state.equals("downloading") ? transferBytes : (model ? p.model.bytes : 0) + (projector ? p.projector.bytes : 0);
        JSObject result = new JSObject();
        result.put("state", state); result.put("modelId", p.id); result.put("modelName", p.name);
        result.put("modelPresent", model); result.put("projectorPresent", projector);
        result.put("downloadedBytes", bytes); result.put("totalBytes", p.bytes());
        result.put("progress", Math.min(1.0, bytes / (double) p.bytes()));
        result.put("totalMemoryBytes", ram.totalMem); result.put("availableMemoryBytes", ram.availMem);
        result.put("freeStorageBytes", getContext().getNoBackupFilesDir().getUsableSpace());
        result.put("recommendedMemoryBytes", p.recommendedMemoryBytes);
        result.put("canLoad", !busy.get() && !loaded && model && projector && memoryAllows(p, ram));
        result.put("loaded", loaded);
        result.put("visionSupported", loaded); result.put("speechSupported", OnDeviceSpeech.isSupported(getContext()));
        result.put("engineVersion", "NeoLocalAI cc1ffc71c6d0 / llama.cpp + libmtmd CPU");
        if (!lastError.isEmpty()) result.put("error", lastError);
        else if (model && projector && !loaded && !memoryAllows(p, ram))
            result.put("error", "当前可用内存不足以安全加载此档位，请关闭其他应用或选择较小模型。权重之外还需视觉计算与缓存内存。");
        return result;
    }
    private void emitState() { if (!destroyed) notifyListeners("aiState", status()); }
    private void setState(String next) { state = next; emitState(); }
    private boolean begin(PluginCall call) {
        if (!busy.compareAndSet(false, true)) { call.reject("本机 AI 正在工作，请先停止或等待完成"); return false; }
        lastError = ""; return true;
    }
    private void operationError(PluginCall call, Exception error) {
        lastError = error.getMessage() == null ? "本机操作失败，请重试" : error.getMessage();
        busy.set(false); setState("error"); call.reject(lastError, error);
    }
    private void finish(PluginCall call, String next) { busy.set(false); setState(next); call.resolve(status()); }

    @PluginMethod public void getStatus(PluginCall call) { call.resolve(status()); }
    @PluginMethod public void listModels(PluginCall call) {
        JSArray profiles = new JSArray();
        for (ModelProfiles.Profile p : ModelProfiles.ALL) {
            JSObject row = new JSObject();
            row.put("id", p.id); row.put("name", p.name); row.put("downloadBytes", p.bytes());
            row.put("recommendedMemoryBytes", p.recommendedMemoryBytes); row.put("sourceUrl", p.sourceUrl());
            row.put("license", "Apache-2.0"); row.put("type", "vision-language"); row.put("description", p.description);
            row.put("downloaded", bothPresent(p)); row.put("selected", selected.id.equals(p.id));
            profiles.put(row);
        }
        JSObject result = new JSObject(); result.put("models", profiles); call.resolve(result);
    }
    @PluginMethod public void selectModel(PluginCall call) {
        final ModelProfiles.Profile next;
        try { next = ModelProfiles.find(call.getString("modelId", "")); }
        catch (Exception error) { call.reject(error.getMessage()); return; }
        if (!begin(call)) return;
        engineWorker.execute(() -> {
            try {
                if (loaded) NativeAi.unload();
                loaded = false; selected = next; transferBytes = 0;
                getContext().getSharedPreferences("farm-ai", Context.MODE_PRIVATE).edit().putString("selected-model", next.id).apply();
                finish(call, bothPresent(next) ? "downloaded" : "missing");
            } catch (Exception error) { operationError(call, error); }
        });
    }

    @PluginMethod public void downloadModels(PluginCall call) {
        if (loaded) { call.reject("请先卸载当前模型，再下载或导入文件"); return; }
        if (!begin(call)) return;
        cancelDownload = false;
        final ModelProfiles.Profile p = selected;
        engineWorker.execute(() -> {
            try {
                long missing = (present(p, p.model) ? 0 : p.model.bytes) + (present(p, p.projector) ? 0 : p.projector.bytes);
                if (getContext().getNoBackupFilesDir().getUsableSpace() < missing + 512L * 1024 * 1024)
                    throw new IOException("本机存储空间不足，请至少为模型文件额外保留 512 MiB");
                transferBytes = 0; setState("downloading");
                for (ModelProfiles.Part part : new ModelProfiles.Part[]{p.model, p.projector}) {
                    if (cancelDownload) throw new IOException("模型下载已取消；已完成校验的文件保留");
                    if (present(p, part)) { transferBytes += part.bytes; continue; }
                    downloadPart(p, part);
                }
                finish(call, "downloaded");
            } catch (Exception error) { operationError(call, error); }
        });
    }
    @PluginMethod public void cancelDownload(PluginCall call) {
        cancelDownload = true;
        HttpsURLConnection active = connection;
        if (active != null) active.disconnect();
        call.resolve();
    }

    private HttpsURLConnection connect(String address) throws IOException {
        URL url = new URL(address);
        for (int redirect = 0; redirect < 8; redirect++) {
            if (!url.getProtocol().equals("https")) throw new IOException("拒绝不安全的模型下载链接");
            HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
            c.setInstanceFollowRedirects(false); c.setConnectTimeout(30000); c.setReadTimeout(30000);
            c.setRequestProperty("Accept-Encoding", "identity");
            c.setRequestProperty("User-Agent", "FieldLetter-LocalAI/0.2");
            connection = c;
            int code = c.getResponseCode();
            if (code == 200) return c;
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String location = c.getHeaderField("Location"); c.disconnect();
                if (location == null) throw new IOException("模型下载重定向缺少地址");
                url = new URL(url, location);
            } else { c.disconnect(); throw new IOException("模型下载失败：HTTP " + code + "，请检查网络后重试或导入已下载的文件"); }
        }
        throw new IOException("模型下载重定向次数过多");
    }
    private void downloadPart(ModelProfiles.Profile p, ModelProfiles.Part part) throws Exception {
        File target = file(p, part), temp = new File(target.getAbsolutePath() + ".part");
        HttpsURLConnection c = null;
        try {
            c = connect(p.downloadUrl(part));
            String contentLength = c.getHeaderField("Content-Length");
            long length = contentLength == null ? -1 : Long.parseLong(contentLength);
            if (length >= 0 && length != part.bytes) throw new IOException("模型文件长度与固定版本不符，已拒绝下载");
            try (InputStream input = new BufferedInputStream(c.getInputStream())) { copyVerified(input, temp, p, part); }
            commitVerified(temp, target, part);
        } finally {
            temp.delete(); if (c != null) c.disconnect(); connection = null;
        }
    }
    private void copyVerified(InputStream input, File temp, ModelProfiles.Profile p, ModelProfiles.Part part) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long count = 0, base = transferBytes, lastNotification = 0;
        try (FileOutputStream output = new FileOutputStream(temp)) {
            byte[] buffer = new byte[1024 * 256];
            int size;
            while ((size = input.read(buffer)) != -1) {
                if (cancelDownload || destroyed) throw new IOException("模型文件操作已取消");
                count += size; if (count > part.bytes) throw new IOException("所选模型文件过大，与固定配置不匹配");
                output.write(buffer, 0, size); digest.update(buffer, 0, size); transferBytes = base + count;
                long now = SystemClock.elapsedRealtime();
                if (now - lastNotification >= 250) {
                    JSObject event = new JSObject(); event.put("part", part == p.model ? "model" : "projector");
                    event.put("downloadedBytes", transferBytes); event.put("totalBytes", p.bytes());
                    event.put("progress", Math.min(1.0, transferBytes / (double) p.bytes()));
                    if (!destroyed) notifyListeners("aiProgress", event);
                    lastNotification = now;
                }
            }
            output.getFD().sync();
        }
        if (count != part.bytes || !hex(digest.digest()).equals(part.sha256))
            throw new IOException("文件 SHA256 或大小不匹配：只接受当前所选档位的原始 GGUF 与配套 mmproj，已删除未验证文件");
    }
    private String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
    private void commitVerified(File temp, File target, ModelProfiles.Part part) throws IOException {
        if (target.exists() && !target.delete()) throw new IOException("无法替换旧模型文件");
        if (!temp.renameTo(target)) throw new IOException("无法保存已校验模型文件");
        try (FileOutputStream mark = new FileOutputStream(marker(target))) {
            mark.write(markerText(target, part).getBytes(StandardCharsets.US_ASCII)); mark.getFD().sync();
        }
    }

    @PluginMethod public void importModel(PluginCall call) {
        String part = call.getString("part", "");
        if (!part.equals("model") && !part.equals("projector")) { call.reject("请选择导入主模型或配套 mmproj"); return; }
        if (loaded) { call.reject("请先卸载当前模型，再导入文件"); return; }
        if (!begin(call)) return;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
            startActivityForResult(call, intent, "modelSelected");
        } catch (Exception error) { operationError(call, error); }
    }
    @ActivityCallback private void modelSelected(PluginCall call, ActivityResult result) {
        if (call == null) { busy.set(false); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            busy.set(false); call.reject("已取消模型导入"); return;
        }
        Uri uri = result.getData().getData();
        if (!"content".equals(uri.getScheme()) && !"file".equals(uri.getScheme())) { busy.set(false); call.reject("只能导入本机选择的文件"); return; }
        ModelProfiles.Profile p = selected;
        ModelProfiles.Part part = "model".equals(call.getString("part")) ? p.model : p.projector;
        engineWorker.execute(() -> {
            File target = file(p, part), temp = new File(target.getAbsolutePath() + ".part");
            try {
                cancelDownload = false;
                if (getContext().getNoBackupFilesDir().getUsableSpace() < part.bytes + 512L * 1024 * 1024) throw new IOException("本机存储空间不足以导入此模型");
                transferBytes = present(p, part == p.model ? p.projector : p.model) ? (part == p.model ? p.projector.bytes : p.model.bytes) : 0;
                setState("downloading");
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("无法读取所选模型文件");
                    copyVerified(input, temp, p, part);
                }
                commitVerified(temp, target, part);
                finish(call, bothPresent(p) ? "downloaded" : "missing");
            } catch (Exception error) { operationError(call, error); }
            finally { temp.delete(); }
        });
    }

    private void verifyFile(File file, ModelProfiles.Part part) throws Exception {
        if (!file.isFile() || file.length() != part.bytes) throw new IOException("模型文件缺失或大小发生变化，请重新下载/导入");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[1024 * 256]; int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        if (!hex(digest.digest()).equals(part.sha256)) { marker(file).delete(); throw new IOException("模型完整性校验失败，禁止加载"); }
    }
    @PluginMethod public void loadModel(PluginCall call) {
        if (loaded && !state.equals("error")) { call.resolve(status()); return; }
        if (!begin(call)) return;
        final ModelProfiles.Profile p = selected;
        engineWorker.execute(() -> {
            try {
                if (loaded) { NativeAi.unload(); loaded = false; }
                if (!bothPresent(p)) throw new IOException("请先下载或分别导入当前档位的主模型与配套 mmproj");
                if (!memoryAllows(p, memory())) throw new IOException("当前总内存或可用内存不足以安全加载，请选择较小档位或关闭其他应用");
                setState("loading");
                verifyFile(file(p, p.model), p.model); verifyFile(file(p, p.projector), p.projector);
                if (!memoryAllows(p, memory())) throw new IOException("加载前可用内存不足，已停止");
                NativeAi.load(file(p, p.model).getAbsolutePath(), file(p, p.projector).getAbsolutePath());
                loaded = true; finish(call, "ready");
            } catch (Exception error) { operationError(call, error); }
            catch (LinkageError error) { operationError(call, new IOException("当前安装包无法加载本机 AI 原生库，请使用 ARM64 安卓安装包", error)); }
        });
    }
    @PluginMethod public void unloadModel(PluginCall call) {
        if (!begin(call)) return;
        engineWorker.execute(() -> {
            try { if (loaded) NativeAi.unload(); loaded = false; finish(call, bothPresent(selected) ? "downloaded" : "missing"); }
            catch (Exception error) { operationError(call, error); }
            catch (LinkageError error) { operationError(call, new IOException("原生库卸载失败，请关闭并重新启动应用或重新安装 ARM64 版本", error)); }
        });
    }

    @PluginMethod public void selectImage(PluginCall call) {
        try {
            if ("camera".equals(call.getString("source"))) {
                cameraUri = FarmMedia.createCameraUri(getContext());
                call.getData().put("captureUri", cameraUri.toString());
                startActivityForResult(call, FarmMedia.createCameraIntent(getContext(), cameraUri), "imageSelected");
            } else {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("image/*");
                intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
                startActivityForResult(call, intent, "imageSelected");
            }
        } catch (Exception error) { if ("camera".equals(call.getString("source"))) cleanCapture(cameraUri); call.reject("无法打开相机/照片选择器，请确认设备有可用相机应用", error); }
    }
    @ActivityCallback private void imageSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = "camera".equals(call.getString("source")) ? captureUri(call, cameraUri) : result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            if ("camera".equals(call.getString("source"))) cleanCapture(uri);
            call.reject("已取消照片选择"); return;
        }
        mediaWorker.execute(() -> {
            try { call.resolve(mediaResult(Collections.singletonList(FarmMedia.prepareImage(getContext(), uri)), null)); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
            finally {
                if ("camera".equals(call.getString("source"))) {
                    cleanCapture(uri);
                }
            }
        });
    }
    @PluginMethod public void selectVideo(PluginCall call) {
        try {
            if ("camera".equals(call.getString("source"))) {
                videoUri = FarmMedia.createVideoUri(getContext());
                call.getData().put("captureUri", videoUri.toString());
                startActivityForResult(call, FarmMedia.createVideoIntent(getContext(), videoUri), "videoSelected");
            } else {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("video/*");
                intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
                startActivityForResult(call, intent, "videoSelected");
            }
        } catch (Exception error) { cleanCapture(videoUri); call.reject("无法打开本机录像/视频选择器，请确认设备有可用录像应用", error); }
    }
    @ActivityCallback private void videoSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = "camera".equals(call.getString("source")) ? captureUri(call, videoUri) : result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            if ("camera".equals(call.getString("source"))) cleanCapture(uri);
            call.reject("已取消视频选择"); return;
        }
        mediaWorker.execute(() -> {
            try { FarmMedia.PreparedVideo video = FarmMedia.prepareVideo(getContext(), uri); call.resolve(mediaResult(video.media, video.durationSeconds)); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
            finally { if ("camera".equals(call.getString("source"))) cleanCapture(uri); }
        });
    }
    private void cleanCapture(Uri uri) {
        if (uri == null) return;
        try { getContext().revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); }
        catch (Exception ignored) {}
        try { getContext().getContentResolver().delete(uri, null, null); }
        catch (Exception ignored) {}
    }
    private Uri captureUri(PluginCall call, Uri fallback) {
        String saved = call.getString("captureUri");
        return saved == null ? fallback : Uri.parse(saved);
    }
    private JSObject mediaResult(List<FarmMedia.PreparedMedia> inputs, Double duration) {
        JSArray rows = new JSArray();
        for (FarmMedia.PreparedMedia item : inputs) {
            media.put(item.id, item);
            JSObject row = new JSObject(); row.put("id", item.id); row.put("kind", item.kind);
            row.put("uri", Uri.fromFile(new File(item.path)).toString()); row.put("previewDataUrl", item.previewDataUrl);
            row.put("width", item.width); row.put("height", item.height);
            if (item.timestampSeconds != null) row.put("timestampSeconds", item.timestampSeconds);
            rows.put(row);
        }
        JSObject result = new JSObject(); result.put("media", rows);
        if (duration != null) result.put("videoDurationSeconds", duration);
        return result;
    }
    @PluginMethod public void clearMedia(PluginCall call) {
        if (state.equals("generating")) { call.reject("请先停止推理再清除照片"); return; }
        for (FarmMedia.PreparedMedia item : media.values()) new File(item.path).delete();
        media.clear(); call.resolve();
    }

    @PluginMethod public void transcribeSpeech(PluginCall call) {
        if (!OnDeviceSpeech.isSupported(getContext())) { call.reject("此设备没有可用的本机离线语音引擎，请手动输入；不会调用云端替代"); return; }
        if (getPermissionState("microphone") != PermissionState.GRANTED) { requestPermissionForAlias("microphone", call, "speechPermission"); return; }
        startSpeech(call);
    }
    @PermissionCallback private void speechPermission(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) { call.reject("未允许麦克风权限，请手动输入"); return; }
        startSpeech(call);
    }
    private void startSpeech(PluginCall call) {
        if (speech != null) { call.reject("语音输入正在进行，请先停止"); return; }
        OnDeviceSpeech session = new OnDeviceSpeech(getActivity()); speech = session;
        session.start(new OnDeviceSpeech.Callback() {
            @Override public void onResult(String text) {
                speech = null; JSObject result = new JSObject(); result.put("text", text); call.resolve(result);
            }
            @Override public void onError(String message) { speech = null; call.reject(message); }
        });
    }
    @PluginMethod public void stopSpeech(PluginCall call) { OnDeviceSpeech active = speech; if (active != null) active.stop(); call.resolve(); }

    @PluginMethod public void generate(PluginCall call) {
        String system = call.getString("system", ""), user = call.getString("user", "");
        if (user.trim().isEmpty() || system.length() + user.length() > 6000) { call.reject("请输入现场观察，提示词总长不能超过 6000 字符"); return; }
        if (!loaded) { call.reject("请先加载当前档位的本机模型；推理不会自动联网下载"); return; }
        JSArray ids = call.getArray("mediaIds", new JSArray());
        if (ids.length() > 3) { call.reject("每次最多使用 3 张照片或关键帧"); return; }
        String[] paths = new String[ids.length()];
        try {
            for (int i = 0; i < ids.length(); i++) {
                FarmMedia.PreparedMedia item = media.get(ids.getString(i));
                if (item == null || !new File(item.path).isFile()) throw new IOException("照片/关键帧已失效，请重新选择");
                paths[i] = item.path;
            }
        } catch (Exception error) { call.reject(error.getMessage(), error); return; }
        int tokens = Math.max(64, Math.min(1024, call.getInt("maxTokens", 768)));
        if (!begin(call)) return;
        synchronized (generationLock) {
            stopRequested = false; NativeAi.resetStop(); generationPending = true;
        }
        engineWorker.execute(() -> {
            try {
                if (stopRequested || destroyed) {
                    JSObject result = new JSObject(); result.put("text", ""); result.put("stopped", true);
                    result.put("tokens", 0); result.put("durationMs", 0); result.put("modelId", selected.id);
                    busy.set(false); setState("ready"); call.resolve(result); return;
                }
                ActivityManager.MemoryInfo info = memory();
                if (info.lowMemory || info.availMem < 384L * 1024 * 1024) throw new IOException("可用内存过低，请停止其他应用后重试");
                if (stopRequested || destroyed) {
                    JSObject result = new JSObject(); result.put("text", ""); result.put("stopped", true);
                    result.put("tokens", 0); result.put("durationMs", 0); result.put("modelId", selected.id);
                    busy.set(false); setState("ready"); call.resolve(result); return;
                }
                setState("generating");
                long started = SystemClock.elapsedRealtime(); final int[] tokenCount = {0};
                byte[] output = NativeAi.generate(system, user, paths, tokens, (utf8, count) -> {
                    tokenCount[0] = count;
                    JSObject event = new JSObject(); event.put("text", new String(utf8, StandardCharsets.UTF_8)); event.put("tokenCount", count);
                    if (!destroyed) notifyListeners("aiToken", event);
                });
                String text = output == null ? "" : new String(output, StandardCharsets.UTF_8);
                if (text.trim().isEmpty() && !stopRequested) throw new IOException("本机模型未产生有效文字，请补充观察或更换输入");
                JSObject result = new JSObject(); result.put("text", text); result.put("stopped", stopRequested);
                result.put("tokens", tokenCount[0]); result.put("durationMs", SystemClock.elapsedRealtime() - started); result.put("modelId", selected.id);
                busy.set(false); setState("ready"); call.resolve(result);
            } catch (Exception error) { operationError(call, error); }
            finally { generationPending = false; }
        });
    }
    @PluginMethod public void stopGeneration(PluginCall call) {
        synchronized (generationLock) {
            if (generationPending || state.equals("generating")) { stopRequested = true; NativeAi.stop(); }
        }
        call.resolve();
    }
    @Override protected void handleOnDestroy() {
        destroyed = true; cancelDownload = true; stopRequested = true;
        if (loaded) NativeAi.stop();
        HttpsURLConnection c = connection; if (c != null) c.disconnect();
        OnDeviceSpeech active = speech; if (active != null) active.stop();
        mediaWorker.shutdownNow();
        engineWorker.execute(() -> { if (loaded) NativeAi.unload(); loaded = false; });
    }
}
