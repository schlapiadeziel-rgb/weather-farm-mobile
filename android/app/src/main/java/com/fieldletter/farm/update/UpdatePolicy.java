package com.fieldletter.farm.update;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Small, platform-independent rules shared by the updater and its unit tests. */
final class UpdatePolicy {
    static final long MAX_APK_BYTES = 200_000_000L;
    private static final String VERSION_NUMBER = "(0|[1-9][0-9]{0,5})\\.(0|[1-9][0-9]{0,5})\\.(0|[1-9][0-9]{0,5})";
    private static final Pattern RELEASE_PATH = Pattern.compile(
        "/schlapiadeziel-rgb/weather-farm-mobile/releases/download/v" + VERSION_NUMBER + "/field-letter\\.apk"
    );
    private static final Pattern HASH = Pattern.compile("[a-fA-F0-9]{64}");
    private static final Pattern VERSION = Pattern.compile(VERSION_NUMBER);

    private UpdatePolicy() {}

    static URI initialUri(String address) {
        URI uri = secureUri(address);
        if (!"github.com".equals(uri.getHost()) || uri.getRawQuery() != null
                || !RELEASE_PATH.matcher(uri.getRawPath()).matches()) {
            throw new IllegalArgumentException("只接受本游戏 GitHub 仓库的 APK 发布地址。");
        }
        return uri;
    }

    static URI redirectedUri(URI previous, String location) {
        if (location == null || location.isEmpty() || location.length() > 8192) {
            throw new IllegalArgumentException("更新下载缺少有效的重定向地址。");
        }
        URI uri;
        try {
            uri = secureUri(previous.resolve(new URI(location)).toString());
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("更新下载的重定向地址无效。");
        }
        String host = uri.getHost();
        if ("github.com".equals(host)) return initialUri(uri.toString());
        if (!"release-assets.githubusercontent.com".equals(host)
                && !"objects.githubusercontent.com".equals(host)) {
            throw new IllegalArgumentException("更新下载被重定向到不受信任的网站。");
        }
        return uri;
    }

    private static URI secureUri(String address) {
        if (address == null || address.length() > 8192) {
            throw new IllegalArgumentException("更新下载地址无效。");
        }
        try {
            URI uri = new URI(address);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null
                    || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443)
                    || uri.getRawPath() == null) {
                throw new IllegalArgumentException("更新只允许通过受信任的 HTTPS 地址下载。");
            }
            return uri;
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("更新下载地址无效。");
        }
    }

    static long expectedSize(Double value) {
        if (value == null || Double.isNaN(value) || Double.isInfinite(value)
                || value < 1 || value > MAX_APK_BYTES || value != Math.floor(value)) {
            throw new IllegalArgumentException("更新 APK 大小无效，最多接受 200 MB。");
        }
        return value.longValue();
    }

    static String expectedHash(String value) {
        if (value == null || !HASH.matcher(value).matches()) {
            throw new IllegalArgumentException("更新缺少有效的 SHA-256 校验值。");
        }
        return value.toLowerCase(Locale.ROOT);
    }

    static String expectedVersion(String value) {
        if (value == null || !VERSION.matcher(value).matches()) {
            throw new IllegalArgumentException("更新版本号无效。");
        }
        return value;
    }

    static long contentLength(String header) {
        if (header == null) return -1;
        try {
            if (!header.matches("[0-9]{1,12}")) throw new NumberFormatException();
            long value = Long.parseLong(header);
            if (value < 1 || value > MAX_APK_BYTES) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("下载服务器返回的 APK 大小无效。");
        }
    }

    static boolean signerSetsMatch(Set<String> installed, Set<String> downloaded) {
        return installed != null && downloaded != null && !installed.isEmpty()
            && installed.equals(downloaded);
    }

    static String hex(byte[] bytes) {
        char[] alphabet = "0123456789abcdef".toCharArray();
        char[] result = new char[bytes.length * 2];
        for (int index = 0; index < bytes.length; index++) {
            result[index * 2] = alphabet[(bytes[index] & 255) >>> 4];
            result[index * 2 + 1] = alphabet[bytes[index] & 15];
        }
        return new String(result);
    }
}
