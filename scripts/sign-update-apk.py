"""Re-sign a verified build using the existing private key kept outside git."""
import argparse
import os
import pathlib
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("apk")
parser.add_argument("output")
parser.add_argument("--signing-dir", required=True)
parser.add_argument("--sdk", required=True)
args = parser.parse_args()
if pathlib.Path(args.apk).resolve() == pathlib.Path(args.output).resolve():
    parser.error("Input and output APK paths must differ to preserve the verified original")
private = pathlib.Path(args.signing_dir).resolve()
key = private / "fieldletter-release.p12"
password = private / "keystore-password"
if not key.is_file() or not password.is_file():
    parser.error("Existing signing key and password file are required; never generate a replacement update key")
apksigner = str(pathlib.Path(args.sdk) / "build-tools/35.0.0/apksigner")
pathlib.Path(args.output).parent.mkdir(parents=True, exist_ok=True)
subprocess.run([
    apksigner, "sign", "--ks", str(key), "--ks-key-alias", "fieldletter",
    "--ks-pass", "file:" + str(password),
    "--out", args.output, args.apk,
], check=True, env=os.environ.copy())
root = pathlib.Path(__file__).resolve().parent.parent
subprocess.run([
    "python", str(root / "scripts/verify-update-apk.py"), args.apk, args.output,
    apksigner, str(root / "docs/android-signing-certificate.sha256"),
], check=True)
