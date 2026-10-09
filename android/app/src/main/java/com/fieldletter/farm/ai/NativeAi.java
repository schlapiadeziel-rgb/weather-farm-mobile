package com.fieldletter.farm.ai;

public final class NativeAi {
    static { System.loadLibrary("farm_ai"); }
    private NativeAi() {}
    public interface TokenSink { void onToken(byte[] utf8, int tokenCount); }
    public static native void load(String modelPath, String projectorPath);
    public static native void unload();
    public static native void stop();
    public static native void resetStop();
    public static native byte[] generate(String system, String user, String[] imagePaths, int maxTokens, TokenSink sink);
}
