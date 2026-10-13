package com.fieldletter.farm.update;

import static org.junit.Assert.*;
import java.net.URI;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

public class UpdatePolicyTest {
    private static final String APK = "https://github.com/schlapiadeziel-rgb/weather-farm-mobile/releases/download/v0.4.0/field-letter.apk";

    @Test public void initialUrlOnlyAcceptsThisRepositoriesReleaseApk() {
        assertEquals(URI.create(APK), UpdatePolicy.initialUri(APK));
        for (String address : new String[] {
            APK.replace("https:", "http:"), APK.replace("github.com", "github.com.evil.test"),
            APK.replace("weather-farm-mobile/", "another-repository/"), APK + "?other=1",
            APK + "#fragment", APK.replace("field-letter.apk", "source.zip"),
            APK.replace("v0.4.0", "%2e%2e"), APK.replace("v0.4.0", ".."), APK.replace("v0.4.0", "v0.4.0/../v0.3.0"),
            APK.replace("github.com", "user@github.com"), APK.replace("github.com", "github.com:8443"),
            APK.replace("v0.4.0", "v00.4.0"), APK.replace("v0.4.0", "v0.4.0-beta"),
            APK.replace("v0.4.0", "0.4.0"), APK.replace("v0.4.0", "v1000000.4.0")
        }) {
            assertThrows(address, IllegalArgumentException.class, () -> UpdatePolicy.initialUri(address));
        }
    }

    @Test public void redirectsRejectHostConfusionAndTlsDowngrades() {
        URI initial = UpdatePolicy.initialUri(APK);
        assertEquals("release-assets.githubusercontent.com", UpdatePolicy.redirectedUri(initial,
            "https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sig=abc").getHost());
        assertEquals("objects.githubusercontent.com", UpdatePolicy.redirectedUri(initial,
            "https://objects.githubusercontent.com/github-production-release-asset/1/2").getHost());
        for (String redirect : new String[] {
            "http://release-assets.githubusercontent.com/file", "https://evil.test/file",
            "https://release-assets.githubusercontent.com.evil.test/file", "https://api.github.com/file",
            "https://github.com/another/repository/releases/download/v1/field-letter.apk",
            "https://user@release-assets.githubusercontent.com/file", "https://release-assets.githubusercontent.com:8443/file",
            "file:///tmp/update.apk", "", "https://release-assets.githubusercontent.com/file#fragment"
        }) {
            assertThrows(redirect, IllegalArgumentException.class, () -> UpdatePolicy.redirectedUri(initial, redirect));
        }
    }

    @Test public void releaseMetadataRequiresExactBoundedIntegersAndHash() {
        assertEquals(1L, UpdatePolicy.expectedSize(1.0));
        assertEquals(UpdatePolicy.MAX_APK_BYTES, UpdatePolicy.expectedSize((double) UpdatePolicy.MAX_APK_BYTES));
        for (Double value : new Double[] { null, 0.0, -1.0, 1.5, Double.NaN, Double.POSITIVE_INFINITY, (double) UpdatePolicy.MAX_APK_BYTES + 1 }) {
            assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedSize(value));
        }
        String upperHash = "A".repeat(64);
        assertEquals(upperHash.toLowerCase(), UpdatePolicy.expectedHash(upperHash));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedHash("a".repeat(63)));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedHash("z".repeat(64)));
        assertEquals("0.4.0", UpdatePolicy.expectedVersion("0.4.0"));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedVersion("0.4.0\n"));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedVersion("v0.4.0"));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedVersion("00.4.0"));
        assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.expectedVersion("0.4.0-beta"));
    }

    @Test public void serverLengthIsCheckedWithoutSilentlyCoercingGarbage() {
        assertEquals(-1L, UpdatePolicy.contentLength(null));
        assertEquals(20_000_000L, UpdatePolicy.contentLength("20000000"));
        for (String header : new String[] { "0", "-1", "1.5", "20 MB", "300000000", " 2000" }) {
            assertThrows(IllegalArgumentException.class, () -> UpdatePolicy.contentLength(header));
        }
    }

    @Test public void currentSignerSetMustMatchExactlyAndCannotBeMissing() {
        Set<String> first = new HashSet<>(); first.add("certificate-A"); first.add("certificate-B");
        Set<String> reordered = new HashSet<>(); reordered.add("certificate-B"); reordered.add("certificate-A");
        assertTrue(UpdatePolicy.signerSetsMatch(first, reordered));
        assertFalse(UpdatePolicy.signerSetsMatch(first, Set.of("certificate-A")));
        assertFalse(UpdatePolicy.signerSetsMatch(first, Set.of("certificate-C")));
        assertFalse(UpdatePolicy.signerSetsMatch(Set.of(), Set.of()));
        assertFalse(UpdatePolicy.signerSetsMatch(null, first));
    }
}
