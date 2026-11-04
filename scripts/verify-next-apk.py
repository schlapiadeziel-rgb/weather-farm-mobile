"""Verify the independent APK's package, version, pinned certificate and payload."""
import pathlib
import subprocess
import sys

from next_apk_policy import check_apk


def main():
    original, signed, apksigner = sys.argv[1:]
    root = pathlib.Path(__file__).resolve().parent.parent
    check_apk(original, apksigner, root)
    check_apk(signed, apksigner, root)
    subprocess.run([
        sys.executable, str(root / "scripts/verify-update-apk.py"), original, signed,
        apksigner, str(root / "docs/android-next-signing-certificate.sha256"),
    ], check=True)
    zipalign = pathlib.Path(apksigner).resolve().parent / "zipalign"
    subprocess.run([str(zipalign), "-c", "-P", "16", "4", signed], check=True, capture_output=True)
    print("Independent package, source version and 16 KB APK alignment verified.")


if __name__ == "__main__":
    main()
