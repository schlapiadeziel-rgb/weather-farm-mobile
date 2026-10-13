"""Verify official signing and that re-signing changed no application contents."""
import hashlib
import pathlib
import re
import subprocess
import sys
import zipfile


def payload(path):
    with zipfile.ZipFile(path) as archive:
        result = {}
        for entry in archive.infolist():
            # Only JAR signing metadata may change when an APK is re-signed.
            upper = entry.filename.upper()
            if re.fullmatch(r"META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))", upper):
                continue
            if entry.filename in result:
                raise ValueError("APK contains duplicate entries")
            result[entry.filename] = hashlib.sha256(archive.read(entry)).digest()
        return result


def main():
    original, signed, apksigner, fingerprint_file = sys.argv[1:]
    if payload(original) != payload(signed):
        raise ValueError("Signed APK differs from the verified build contents")
    certificate = pathlib.Path(fingerprint_file).read_text().strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", certificate):
        raise ValueError("Invalid pinned signing certificate")
    verification = subprocess.run(
        [apksigner, "verify", "--verbose", "--print-certs", signed],
        check=True, text=True, capture_output=True,
    ).stdout
    digests = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)$", verification, re.MULTILINE)
    if digests != [certificate]:
        raise ValueError("APK does not use the pinned official signing certificate")
    print("APK signature and unchanged application contents verified.")


if __name__ == "__main__":
    main()
