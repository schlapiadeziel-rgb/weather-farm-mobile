"""Sign only the new independent package; signing material stays outside git."""
import argparse
import os
import pathlib
import subprocess
import sys

from next_apk_policy import check_apk


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk")
    parser.add_argument("output")
    parser.add_argument("--signing-dir", required=True)
    parser.add_argument("--sdk", required=True)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parent.parent
    private = pathlib.Path(args.signing_dir).resolve()
    key, password = private / "fieldletter-next-release.p12", private / "keystore-password"
    if private.is_relative_to(root):
        parser.error("Private signing files must remain outside the source checkout")
    if not key.is_file() or not password.is_file():
        parser.error("The existing independent-channel signing key and password file are required")
    if pathlib.Path(args.apk).resolve() == pathlib.Path(args.output).resolve():
        parser.error("Preserve the original verified APK in a separate file")
    apksigner = str(pathlib.Path(args.sdk) / "build-tools/35.0.0/apksigner")
    check_apk(args.apk, apksigner, root)
    pathlib.Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        apksigner, "sign", "--ks", str(key), "--ks-key-alias", "fieldletter-next-release",
        "--ks-pass", "file:" + str(password), "--key-pass", "file:" + str(password),
        "--v4-signing-enabled", "false", "--out", args.output, args.apk,
    ], check=True, env=os.environ.copy())
    subprocess.run([sys.executable, str(root / "scripts/verify-next-apk.py"), args.apk, args.output, apksigner], check=True)


if __name__ == "__main__":
    main()
