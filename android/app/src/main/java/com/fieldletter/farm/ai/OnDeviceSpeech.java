package com.fieldletter.farm.ai;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;

/** Chinese voice input using Android's explicitly on-device recognizer only. */
public final class OnDeviceSpeech {
    public interface Callback {
        void onResult(String text);
        void onError(String message);
    }

    private static final long TIMEOUT_MS = 45_000L;
    private static final String UNAVAILABLE =
            "本机离线中文语音不可用，请手输；不会云端替代";

    private final Activity activity;
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    // Session state and all recognizer operations are confined to the UI thread.
    private Session activeSession;

    private static final class Session {
        final Callback callback;
        SpeechRecognizer recognizer;
        Runnable timeout;
        boolean completed;

        Session(Callback callback) {
            this.callback = callback;
        }
    }

    public OnDeviceSpeech(Activity activity) {
        if (activity == null) {
            throw new IllegalArgumentException("Activity is required");
        }
        this.activity = activity;
    }

    /** Availability does not imply that a Chinese language pack is installed. */
    public static boolean isSupported(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return false;
        }
        try {
            return SpeechRecognizer.isOnDeviceRecognitionAvailable(context);
        } catch (RuntimeException | LinkageError exception) {
            return false;
        }
    }

    /** The caller must request RECORD_AUDIO before invoking this method. */
    public void start(Callback callback) {
        if (callback == null) {
            throw new IllegalArgumentException("Callback is required");
        }
        Session session = new Session(callback);
        activity.runOnUiThread(() -> startOnUiThread(session));
    }

    public void stop() {
        activity.runOnUiThread(() -> finish(activeSession, null, "语音输入已停止"));
    }

    private void startOnUiThread(Session session) {
        Session previous = activeSession;
        // Install the new session first: a previous callback may re-enter start/stop.
        activeSession = session;
        finish(previous, null, "语音输入已停止");
        if (!isActive(session)) {
            return;
        }

        try {
            if (activity.isFinishing() || activity.isDestroyed()) {
                finish(session, null, "当前页面已关闭，语音输入已停止");
                return;
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                finish(session, null, UNAVAILABLE + "（需要 Android 12 或以上系统）");
                return;
            }
            if (!isSupported(activity)) {
                finish(session, null, UNAVAILABLE + "（未检测到本机离线语音引擎）");
                return;
            }
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                finish(session, null, "麦克风权限未开启，请授权后重试或手输；不会云端替代");
                return;
            }

            session.recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity);
            session.recognizer.setRecognitionListener(listenerFor(session));

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);

            session.timeout = () -> finish(session, null,
                    "语音输入超时（45 秒），请重试或手输；不会云端替代");
            if (!uiHandler.postDelayed(session.timeout, TIMEOUT_MS)) {
                finish(session, null, "当前页面无法启动语音输入，请手输；不会云端替代");
                return;
            }
            session.recognizer.startListening(intent);
        } catch (SecurityException exception) {
            finish(session, null, "麦克风权限不可用，请授权后重试或手输；不会云端替代");
        } catch (RuntimeException | LinkageError exception) {
            finish(session, null, UNAVAILABLE + "（本机离线引擎启动失败）");
        }
    }

    private RecognitionListener listenerFor(Session session) {
        return new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onPartialResults(Bundle partialResults) { }
            @Override public void onEvent(int eventType, Bundle params) { }

            @Override
            public void onError(int error) {
                activity.runOnUiThread(() -> {
                    if (isActive(session)) {
                        finish(session, null, errorMessage(error));
                    }
                });
            }

            @Override
            public void onResults(Bundle results) {
                activity.runOnUiThread(() -> {
                    if (!isActive(session)) {
                        return;
                    }
                    try {
                        ArrayList<String> texts = results == null ? null
                                : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        String text = texts == null || texts.isEmpty() || texts.get(0) == null
                                ? "" : texts.get(0).trim();
                        if (text.isEmpty()) {
                            finish(session, null, "没有识别到中文语音，请重试或手输；不会云端替代");
                        } else {
                            finish(session, text, null);
                        }
                    } catch (RuntimeException | LinkageError exception) {
                        finish(session, null, "本机语音结果无法读取，请重试或手输；不会云端替代");
                    }
                });
            }
        };
    }

    private boolean isActive(Session session) {
        return activeSession == session && !session.completed;
    }

    private void finish(Session session, String text, String error) {
        if (session == null || session.completed) {
            return;
        }
        // Mark complete before cancel/destroy, which may produce late callbacks.
        session.completed = true;
        if (activeSession == session) {
            activeSession = null;
        }
        if (session.timeout != null) {
            uiHandler.removeCallbacks(session.timeout);
            session.timeout = null;
        }
        SpeechRecognizer recognizer = session.recognizer;
        session.recognizer = null;
        if (recognizer != null) {
            try {
                recognizer.cancel();
            } catch (RuntimeException | LinkageError ignored) { }
            try {
                recognizer.destroy();
            } catch (RuntimeException | LinkageError ignored) { }
        }
        try {
            if (error == null) {
                session.callback.onResult(text);
            } else {
                session.callback.onError(error);
            }
        } catch (RuntimeException | LinkageError ignored) {
            // A consumer exception must not deliver a second terminal callback.
        }
    }

    private static String errorMessage(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
                return UNAVAILABLE + "（本机离线引擎不支持 zh-CN 中文）";
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                return UNAVAILABLE + "（缺少已下载的 zh-CN 中文语音包，请在系统设置中安装）";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "麦克风权限不可用，请授权后重试或手输；不会云端替代";
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "没有识别到中文语音，请重试或手输；不会云端替代";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "未听到语音，请重试或手输；不会云端替代";
            case SpeechRecognizer.ERROR_AUDIO:
                return "麦克风录音失败，请检查麦克风后重试或手输；不会云端替代";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "本机离线语音引擎正忙，请稍后重试或手输；不会云端替代";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return UNAVAILABLE + "（本机离线引擎返回网络错误，未切换云端服务）";
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
                return UNAVAILABLE + "（本机离线语音服务异常或已断开）";
            case SpeechRecognizer.ERROR_CLIENT:
                return UNAVAILABLE + "（本机离线语音请求失败）";
            case SpeechRecognizer.ERROR_TOO_MANY_REQUESTS:
                return "本机离线语音请求过于频繁，请稍后重试或手输；不会云端替代";
            default:
                return UNAVAILABLE + "（本机离线引擎错误 " + error + "）";
        }
    }
}
