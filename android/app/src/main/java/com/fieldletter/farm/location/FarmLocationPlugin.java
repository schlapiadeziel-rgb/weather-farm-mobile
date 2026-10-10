package com.fieldletter.farm.location;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/** One foreground location request using Android providers, without Google Play Services. */
@CapacitorPlugin(
    name = "FarmLocation",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION
        }),
        @Permission(alias = "coarseLocation", strings = { Manifest.permission.ACCESS_COARSE_LOCATION })
    }
)
public final class FarmLocationPlugin extends Plugin {
    private static final long TIMEOUT_MS = 25_000L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    // These fields and all LocationManager operations belong to the main looper.
    private final List<String> registeredProviders = new ArrayList<>();
    private LocationManager manager;
    private PluginCall pendingCall;
    private LocationListener listener;
    private Runnable timeout;
    private Location bestLocation;
    private long startedElapsedNanos;
    private boolean waitingPermission;
    private boolean permissionInFlight;
    private boolean waitingResume;
    private boolean foreground;
    private boolean destroyed;
    private boolean precisePermission;

    @Override
    public void load() {
        manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
    }

    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        mainHandler.post(() -> {
            if (destroyed || !foreground) {
                call.reject("请在游戏前台页面重新获取位置。", "POSITION_UNAVAILABLE");
                return;
            }
            if (pendingCall != null || permissionInFlight) {
                call.reject("正在获取位置，请等待这次定位完成。", "POSITION_UNAVAILABLE");
                return;
            }
            pendingCall = call;
            if (!locationEnabled()) {
                fail("请先打开手机的系统位置服务，再重新定位。", "POSITION_DISABLED");
                return;
            }
            if (permissionGranted(Manifest.permission.ACCESS_FINE_LOCATION)
                    || permissionGranted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                startListening();
                return;
            }
            // Request fine and coarse together as required by Android 12. Respect an existing
            // approximate grant rather than repeatedly asking the user to upgrade to precise.
            waitingPermission = true;
            permissionInFlight = true;
            try {
                requestPermissionForAlias("location", call, "locationPermissionResult");
            } catch (RuntimeException error) {
                permissionInFlight = false;
                fail("无法申请位置权限，请在系统应用设置中允许定位。", "PERMISSION_DENIED");
            }
        });
    }

    @PermissionCallback
    private void locationPermissionResult(PluginCall call) {
        mainHandler.post(() -> {
            permissionInFlight = false;
            if (call == null || pendingCall != call || destroyed) return;
            waitingPermission = false;
            if (!permissionGranted(Manifest.permission.ACCESS_FINE_LOCATION)
                    && !permissionGranted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                fail("未允许位置权限；可以在系统应用设置中允许，或手动选择城市。", "PERMISSION_DENIED");
            } else if (foreground) {
                startListening();
            } else {
                // Permission activity results can precede onResume. Never start a background fix.
                waitingResume = true;
            }
        });
    }

    @PluginMethod
    public void cancelCurrentPosition(PluginCall call) {
        mainHandler.post(() -> {
            fail("本次定位已取消。", "POSITION_UNAVAILABLE");
            call.resolve();
        });
    }

    private boolean permissionGranted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean locationEnabled() {
        try {
            return manager != null && LocationManagerCompat.isLocationEnabled(manager);
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void startListening() {
        waitingResume = false;
        if (pendingCall == null || destroyed || !foreground) return;
        if (!locationEnabled()) {
            fail("手机的位置服务已关闭，请打开后重试。", "POSITION_DISABLED");
            return;
        }
        precisePermission = permissionGranted(Manifest.permission.ACCESS_FINE_LOCATION);
        if (!precisePermission && !permissionGranted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            fail("位置权限已被撤销，请重新允许定位。", "PERMISSION_DENIED");
            return;
        }
        startedElapsedNanos = SystemClock.elapsedRealtimeNanos();
        final PluginCall request = pendingCall;
        listener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                if (pendingCall != request || location == null) return;
                // Some providers immediately deliver a cached fix even to a newly registered
                // listener. maximumAge=0 means only observations acquired after this request.
                long measured = location.getElapsedRealtimeNanos();
                if (measured < startedElapsedNanos || measured > SystemClock.elapsedRealtimeNanos()) return;
                if (!location.hasAccuracy() || Float.isNaN(location.getAccuracy()) || Float.isInfinite(location.getAccuracy())
                        || location.getAccuracy() <= 0 || Double.isNaN(location.getLatitude()) || Double.isInfinite(location.getLatitude())
                        || Double.isNaN(location.getLongitude()) || Double.isInfinite(location.getLongitude()) || Math.abs(location.getLatitude()) > 90
                        || Math.abs(location.getLongitude()) > 180) return;
                if (bestLocation == null || location.getAccuracy() < bestLocation.getAccuracy()) {
                    bestLocation = new Location(location);
                }
                // A fine GPS fix may arrive after a rough network fix. Give it the same bounded
                // 25-second window; approximate-only permission returns the actual coarse fix.
                if (!precisePermission || bestLocation.getAccuracy() <= 100f) succeed();
            }

            @Override
            public void onProviderDisabled(String provider) {
                if (pendingCall != request) return;
                if (!locationEnabled()) {
                    fail("手机的位置服务已关闭，请打开后重试。", "POSITION_DISABLED");
                }
            }

            @Override
            public void onProviderEnabled(String provider) {}

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {}
        };
        boolean permissionFailure = false;
        for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
            // Android 12+ can supply a system-obfuscated coarse GPS fix. Trying that provider
            // also supports approximate permission on devices without a network provider.
            if (LocationManager.GPS_PROVIDER.equals(provider) && !precisePermission
                    && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) continue;
            try {
                if (manager.isProviderEnabled(provider)) {
                    manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
                    registeredProviders.add(provider);
                }
            } catch (SecurityException error) {
                permissionFailure = true;
            } catch (RuntimeException error) {
                // Some devices lack a network provider. Continue using GPS if registration worked.
            }
        }
        if (registeredProviders.isEmpty()) {
            fail(permissionFailure ? "位置权限不可用，请在系统设置中重新允许。"
                    : precisePermission ? "设备没有可用的系统 GPS 或网络定位，请手动选择城市。"
                    : "近似定位暂不可用；可以允许精确定位，或手动选择城市。",
                permissionFailure ? "PERMISSION_DENIED" : "POSITION_UNAVAILABLE");
            return;
        }
        timeout = () -> {
            if (pendingCall != request) return;
            if (bestLocation != null) succeed();
            else fail("25 秒内没有获取到新位置；请到开阔处重试，或手动选择城市。", "POSITION_TIMEOUT");
        };
        mainHandler.postDelayed(timeout, TIMEOUT_MS);
    }

    private void succeed() {
        PluginCall call = pendingCall;
        Location position = bestLocation;
        if (call == null || position == null) return;
        JSObject coords = new JSObject();
        coords.put("latitude", position.getLatitude());
        coords.put("longitude", position.getLongitude());
        coords.put("accuracy", position.getAccuracy());
        JSObject result = new JSObject();
        result.put("coords", coords);
        result.put("timestamp", position.getTime());
        result.put("provider", position.getProvider());
        cleanup();
        call.resolve(result);
    }

    private void fail(String message, String code) {
        PluginCall call = pendingCall;
        cleanup();
        if (call != null) call.reject(message, code);
    }

    private void cleanup() {
        if (timeout != null) mainHandler.removeCallbacks(timeout);
        if (manager != null && listener != null) {
            try {
                manager.removeUpdates(listener);
            } catch (RuntimeException error) {
                // The permission may have been revoked during this request.
            }
        }
        registeredProviders.clear();
        pendingCall = null;
        listener = null;
        timeout = null;
        bestLocation = null;
        waitingPermission = false;
        waitingResume = false;
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
        if (waitingResume && pendingCall != null) startListening();
    }

    @Override
    protected void handleOnPause() {
        foreground = false;
        // A permission dialog may pause the activity. There is no listener active at that point.
        if (pendingCall != null && !waitingPermission) {
            fail("定位已停止；请回到游戏页面重新获取位置。", "POSITION_UNAVAILABLE");
        }
    }

    @Override
    protected void handleOnStop() {
        foreground = false;
        fail("定位已停止；请回到游戏页面重新获取位置。", "POSITION_UNAVAILABLE");
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        foreground = false;
        fail("定位页面已关闭。", "POSITION_UNAVAILABLE");
    }
}
