package com.fieldletter.farm.ai;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/** Local-only preparation of small JPEG inputs for the on-device model. */
public final class FarmMedia {
    private static final long MAX_IMAGE_BYTES = 20L * 1024L * 1024L;
    private static final long MAX_VIDEO_BYTES = 50L * 1024L * 1024L;
    private static final long MAX_VIDEO_DURATION_MS = 30_000L;
    private static final int PHOTO_EDGE = 768;
    private static final int FRAME_EDGE = 512;
    private static final int PREVIEW_EDGE = 320;
    private static final int JPEG_QUALITY = 85;

    private FarmMedia() {}

    public static final class PreparedMedia {
        public final String id;
        public final String path;
        public final String kind;
        public final String previewDataUrl;
        public final int width;
        public final int height;
        /** Requested frame seek position; null for a photo. */
        public final Double timestampSeconds;

        private PreparedMedia(String id, String path, String kind, String previewDataUrl,
                              int width, int height, Double timestampSeconds) {
            this.id = id;
            this.path = path;
            this.kind = kind;
            this.previewDataUrl = previewDataUrl;
            this.width = width;
            this.height = height;
            this.timestampSeconds = timestampSeconds;
        }
    }

    public static final class PreparedVideo {
        public final List<PreparedMedia> media;
        public final double durationSeconds;

        private PreparedVideo(List<PreparedMedia> media, double durationSeconds) {
            this.media = Collections.unmodifiableList(new ArrayList<>(media));
            this.durationSeconds = durationSeconds;
        }
    }

    public static PreparedMedia prepareImage(Context context, Uri uri) throws IOException {
        requireLocalUri(context, uri);
        requireMime(context, uri, "image/");
        requireSize(context, uri, MAX_IMAGE_BYTES, "照片不能超过 20 MiB");

        File original = File.createTempFile("image-source-", ".bin", mediaDirectory(context));
        Bitmap bitmap = null;
        try {
            copyImage(context, uri, original);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(original.getAbsolutePath(), bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                throw new IOException("无法解码照片，请选择 JPEG、PNG 或 WebP 图片");
            }

            // Inspect dimensions before allocating pixels, even for a tiny compressed file.
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            options.inSampleSize = 1;
            long longest = Math.max(bounds.outWidth, bounds.outHeight);
            while (longest / options.inSampleSize > PHOTO_EDGE * 2L) {
                options.inSampleSize *= 2;
            }
            bitmap = BitmapFactory.decodeFile(original.getAbsolutePath(), options);
            if (bitmap == null) throw new IOException("无法解码这张照片");

            Bitmap oriented = applyExifOrientation(bitmap, original);
            if (oriented != bitmap) {
                bitmap.recycle();
                bitmap = oriented;
            }
            Bitmap scaled = scaleToEdge(bitmap, PHOTO_EDGE);
            if (scaled != bitmap) {
                bitmap.recycle();
                bitmap = scaled;
            }
            return savePrepared(context, bitmap, "photo", null);
        } catch (OutOfMemoryError error) {
            throw new IOException("照片解码内存不足，请选择较小的照片", error);
        } catch (RuntimeException error) {
            throw new IOException("无法读取照片", error);
        } finally {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            original.delete();
        }
    }

    public static PreparedVideo prepareVideo(Context context, Uri uri) throws IOException {
        requireLocalUri(context, uri);
        requireMime(context, uri, "video/");
        requireSize(context, uri, MAX_VIDEO_BYTES, "视频不能超过 50 MiB");

        File original = File.createTempFile("video-source-", ".mp4", mediaDirectory(context));
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        List<PreparedMedia> prepared = new ArrayList<>();
        Set<String> hashes = new HashSet<>();
        boolean success = false;
        try {
            // Enforce the byte limit even when a document provider omits its size.
            copyBounded(context, uri, original, MAX_VIDEO_BYTES, "视频不能超过 50 MiB");
            retriever.setDataSource(original.getAbsolutePath());
            long durationMs = parseLong(retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_DURATION));
            if (durationMs <= 0) throw new IOException("无法读取视频时长");
            if (durationMs > MAX_VIDEO_DURATION_MS) throw new IOException("请选择不超过 30 秒的视频");
            int videoWidth = parseDimension(retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int videoHeight = parseDimension(retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            if (videoWidth <= 0 || videoHeight <= 0) throw new IOException("文件不包含可读取的视频画面");
            if (Build.VERSION.SDK_INT < 27 && (long) videoWidth * videoHeight > 24_000_000L) {
                throw new IOException("当前系统无法低内存解码此分辨率的视频，请先缩小视频");
            }

            long durationUs = durationMs * 1000L;
            long marginUs = Math.min(250_000L, durationUs / 10L);
            long lastUs = durationUs - 1L;
            long[] slots = {marginUs, durationUs / 2L, Math.max(0L, lastUs - marginUs)};
            long neighborUs = Math.min(350_000L, Math.max(1L, durationUs / 10L));
            for (long slot : slots) {
                Bitmap best = null;
                long bestTimeUs = slot;
                double bestSharpness = -1;
                Set<Long> attempted = new HashSet<>();
                try {
                    // Closest sync frames keep seeking bounded and cheap on a phone.
                    long[] candidates = {slot, slot - neighborUs, slot + neighborUs};
                    for (long candidate : candidates) {
                        long timeUs = Math.max(0L, Math.min(lastUs, candidate));
                        if (!attempted.add(timeUs)) continue;
                        Bitmap frame = readSmallFrame(retriever, timeUs, videoWidth, videoHeight);
                        if (frame == null) continue;
                        try {
                            double sharpness = sharpness(frame);
                            if (sharpness > bestSharpness) {
                                if (best != null) best.recycle();
                                best = frame;
                                frame = null;
                                bestSharpness = sharpness;
                                bestTimeUs = timeUs;
                            }
                        } finally {
                            if (frame != null && !frame.isRecycled()) frame.recycle();
                        }
                    }
                    if (best != null && hashes.add(bitmapHash(best))) {
                        prepared.add(savePrepared(context, best, "video-frame", bestTimeUs / 1_000_000.0));
                    }
                } finally {
                    if (best != null && !best.isRecycled()) best.recycle();
                }
            }
            if (prepared.isEmpty()) throw new IOException("未能提取视频画面，请换一个视频");
            success = true;
            return new PreparedVideo(prepared, durationMs / 1000.0);
        } catch (OutOfMemoryError error) {
            throw new IOException("视频解码内存不足，请选择较小的视频", error);
        } catch (RuntimeException error) {
            throw new IOException("无法读取视频", error);
        } finally {
            try { retriever.release(); } catch (Exception ignored) { }
            original.delete();
            if (!success) {
                for (PreparedMedia media : prepared) new File(media.path).delete();
            }
        }
    }

    public static Uri createCameraUri(Context context) throws IOException {
        if (context == null) throw new IOException("缺少应用上下文");
        File directory = new File(context.getCacheDir(), "camera");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
            throw new IOException("无法创建拍照缓存目录");
        }
        File output = File.createTempFile("camera-", ".jpg", directory);
        try {
            return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", output);
        } catch (RuntimeException error) {
            output.delete();
            throw new IOException("无法创建拍照文件", error);
        }
    }

    public static Intent createCameraIntent(Context context, Uri uri) {
        if (context == null || uri == null) throw new IllegalArgumentException("拍照需要应用上下文和输出 URI");
        int grants = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
        intent.addFlags(grants);
        intent.setClipData(ClipData.newRawUri("farm-camera", uri));
        for (ResolveInfo activity : context.getPackageManager().queryIntentActivities(intent, 0)) {
            context.grantUriPermission(activity.activityInfo.packageName, uri, grants);
        }
        return intent;
    }

    public static Uri createVideoUri(Context context) throws IOException {
        File directory = new File(context.getCacheDir(), "camera");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) throw new IOException("无法创建录像缓存目录");
        File output = File.createTempFile("video-", ".mp4", directory);
        try { return FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", output); }
        catch (RuntimeException error) { output.delete(); throw new IOException("无法创建录像文件", error); }
    }

    public static Intent createVideoIntent(Context context, Uri uri) {
        int grants = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        Intent intent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri);
        intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 30);
        intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1);
        intent.addFlags(grants); intent.setClipData(ClipData.newRawUri("farm-video", uri));
        for (ResolveInfo activity : context.getPackageManager().queryIntentActivities(intent, 0))
            context.grantUriPermission(activity.activityInfo.packageName, uri, grants);
        return intent;
    }

    private static void requireLocalUri(Context context, Uri uri) throws IOException {
        if (context == null || uri == null) throw new IOException("未选择媒体文件");
        String scheme = uri.getScheme();
        if (!"content".equalsIgnoreCase(scheme) && !"file".equalsIgnoreCase(scheme)) {
            throw new IOException("只能读取手机上的本地媒体文件");
        }
    }

    private static void requireMime(Context context, Uri uri, String prefix) throws IOException {
        String mime;
        try {
            mime = context.getContentResolver().getType(uri);
        } catch (RuntimeException error) {
            throw new IOException("无法读取媒体类型", error);
        }
        if (mime == null && "file".equalsIgnoreCase(uri.getScheme())) {
            String path = uri.getPath();
            int dot = path == null ? -1 : path.lastIndexOf('.');
            if (dot >= 0) mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                    path.substring(dot + 1).toLowerCase(Locale.ROOT));
        }
        // Some document providers omit MIME; the actual decoder still verifies their contents.
        if (mime != null && !mime.toLowerCase(Locale.ROOT).startsWith(prefix)) {
            throw new IOException(prefix.equals("image/") ? "请选择图片文件" : "请选择视频文件");
        }
    }

    private static void requireSize(Context context, Uri uri, long maximum, String message) throws IOException {
        long size = -1;
        if ("file".equalsIgnoreCase(uri.getScheme()) && uri.getPath() != null) {
            File file = new File(uri.getPath());
            if (file.isFile()) size = file.length();
        } else {
            try (Cursor cursor = context.getContentResolver().query(
                    uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int column = cursor.getColumnIndex(OpenableColumns.SIZE);
                    if (column >= 0 && !cursor.isNull(column)) size = cursor.getLong(column);
                }
            } catch (RuntimeException ignored) { }
        }
        if (size < 0) {
            try (AssetFileDescriptor descriptor = context.getContentResolver().openAssetFileDescriptor(uri, "r")) {
                if (descriptor != null) size = descriptor.getLength();
            } catch (IOException | RuntimeException ignored) { }
        }
        if (size > maximum) throw new IOException(message);
    }

    private static File mediaDirectory(Context context) throws IOException {
        File directory = new File(context.getCacheDir(), "farm-media");
        if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
            throw new IOException("无法创建媒体缓存目录");
        }
        return directory;
    }

    private static void copyImage(Context context, Uri uri, File destination) throws IOException {
        copyBounded(context, uri, destination, MAX_IMAGE_BYTES, "照片不能超过 20 MiB");
    }

    private static void copyBounded(Context context, Uri uri, File destination, long maximum, String limitError) throws IOException {
        try (InputStream input = context.getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(destination)) {
            if (input == null) throw new IOException("无法打开本机媒体文件");
            byte[] buffer = new byte[64 * 1024];
            long count = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                count += read;
                if (count > maximum) throw new IOException(limitError);
                output.write(buffer, 0, read);
            }
            if (count == 0) throw new IOException("媒体文件为空");
        }
    }

    private static Bitmap applyExifOrientation(Bitmap source, File original) {
        int orientation;
        try {
            orientation = new ExifInterface(original.getAbsolutePath()).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (IOException | RuntimeException ignored) {
            return source;
        }
        Matrix transform = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: transform.setScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_180: transform.setRotate(180); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: transform.setScale(1, -1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE:
                transform.setRotate(90); transform.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_90: transform.setRotate(90); break;
            case ExifInterface.ORIENTATION_TRANSVERSE:
                transform.setRotate(-90); transform.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_270: transform.setRotate(270); break;
            default: return source;
        }
        return Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), transform, true);
    }

    private static Bitmap scaleToEdge(Bitmap source, int maximum) {
        int longest = Math.max(source.getWidth(), source.getHeight());
        if (longest <= maximum) return source;
        double scale = maximum / (double) longest;
        return Bitmap.createScaledBitmap(source,
                Math.max(1, (int) Math.round(source.getWidth() * scale)),
                Math.max(1, (int) Math.round(source.getHeight() * scale)), true);
    }

    private static Bitmap readSmallFrame(MediaMetadataRetriever retriever, long timeUs, int width, int height) {
        Bitmap frame = null;
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                double scale = Math.min(1.0, FRAME_EDGE / (double) Math.max(width, height));
                frame = retriever.getScaledFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC,
                        Math.max(1, (int) Math.round(width * scale)),
                        Math.max(1, (int) Math.round(height * scale)));
            } else {
                frame = retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            }
            if (frame == null) return null;
            Bitmap scaled = scaleToEdge(frame, FRAME_EDGE);
            if (scaled != frame) frame.recycle();
            return scaled;
        } catch (RuntimeException error) {
            if (frame != null && !frame.isRecycled()) frame.recycle();
            return null;
        } catch (OutOfMemoryError error) {
            if (frame != null && !frame.isRecycled()) frame.recycle();
            throw error;
        }
    }

    private static double sharpness(Bitmap source) {
        Bitmap small = scaleToEdge(source, 128);
        try {
            int width = small.getWidth();
            int height = small.getHeight();
            if (width < 3 || height < 3) return 0;
            int[] pixels = new int[width * height];
            small.getPixels(pixels, 0, width, 0, 0, width, height);
            for (int i = 0; i < pixels.length; i++) {
                int pixel = pixels[i];
                pixels[i] = (77 * Color.red(pixel) + 150 * Color.green(pixel) + 29 * Color.blue(pixel)) >> 8;
            }
            double sum = 0;
            double squares = 0;
            int count = 0;
            for (int y = 1; y < height - 1; y++) {
                for (int x = 1; x < width - 1; x++) {
                    int i = y * width + x;
                    int value = 4 * pixels[i] - pixels[i - 1] - pixels[i + 1]
                            - pixels[i - width] - pixels[i + width];
                    sum += value;
                    squares += (double) value * value;
                    count++;
                }
            }
            return Math.max(0, squares / count - (sum / count) * (sum / count));
        } finally {
            if (small != source) small.recycle();
        }
    }

    private static String bitmapHash(Bitmap bitmap) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            digest.update((width + "x" + height + ":").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            int[] row = new int[width];
            byte[] bytes = new byte[width * 3];
            for (int y = 0; y < height; y++) {
                bitmap.getPixels(row, 0, width, 0, y, width, 1);
                for (int x = 0; x < width; x++) {
                    bytes[x * 3] = (byte) Color.red(row[x]);
                    bytes[x * 3 + 1] = (byte) Color.green(row[x]);
                    bytes[x * 3 + 2] = (byte) Color.blue(row[x]);
                }
                digest.update(bytes);
            }
            return Base64.encodeToString(digest.digest(), Base64.NO_WRAP);
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("无法计算视频帧摘要", error);
        }
    }

    private static PreparedMedia savePrepared(Context context, Bitmap source, String kind,
                                              Double timestampSeconds) throws IOException {
        String id = UUID.randomUUID().toString();
        File output = new File(mediaDirectory(context), id + ".jpg");
        Bitmap jpeg = source;
        Bitmap preview = null;
        boolean success = false;
        try {
            if (source.hasAlpha()) {
                jpeg = Bitmap.createBitmap(source.getWidth(), source.getHeight(), Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(jpeg);
                canvas.drawColor(Color.WHITE);
                canvas.drawBitmap(source, 0, 0, null);
            }
            try (FileOutputStream stream = new FileOutputStream(output)) {
                if (!jpeg.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)) {
                    throw new IOException("无法保存媒体画面");
                }
            }
            preview = scaleToEdge(jpeg, PREVIEW_EDGE);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            if (!preview.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, bytes)) {
                throw new IOException("无法生成媒体预览");
            }
            String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
            PreparedMedia result = new PreparedMedia(id, output.getAbsolutePath(), kind, dataUrl,
                    source.getWidth(), source.getHeight(), timestampSeconds);
            success = true;
            return result;
        } finally {
            if (preview != null && preview != jpeg && preview != source) preview.recycle();
            if (jpeg != source) jpeg.recycle();
            if (!success) output.delete();
        }
    }

    private static long parseLong(String value) {
        try { return value == null ? -1 : Long.parseLong(value); }
        catch (NumberFormatException ignored) { return -1; }
    }

    private static int parseDimension(String value) {
        long parsed = parseLong(value);
        return parsed > 0 && parsed <= Integer.MAX_VALUE ? (int) parsed : -1;
    }
}
