"""Public identity checks for the independent Android installation channel."""
import json
import pathlib
import re
import subprocess

PACKAGE_ID = "com.fieldletter.farm.next"


def package_info(badging):
    rows = re.findall(r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'(?: .*)?$", badging, re.MULTILINE)
    if len(rows) != 1:
        raise ValueError("APK package metadata is missing or ambiguous")
    name, code, version = rows[0]
    return name, int(code), version


def validate_identity(badging, expected_version, expected_code):
    name, code, version = package_info(badging)
    if name != PACKAGE_ID:
        raise ValueError("APK is not the independent com.fieldletter.farm.next application")
    if version != expected_version or code != expected_code:
        raise ValueError("APK version does not match the verified source")


def source_version(root):
    version = json.loads((root / "package.json").read_text())["version"]
    gradle = (root / "android/app/build.gradle").read_text()
    codes = re.findall(r"^\s*versionCode\s+([1-9][0-9]*)\s*$", gradle, re.MULTILINE)
    names = re.findall(r'^\s*versionName\s+"([^"]+)"\s*$', gradle, re.MULTILINE)
    if len(codes) != 1 or names != [version]:
        raise ValueError("Source Android and JavaScript versions disagree")
    return version, int(codes[0])


def check_apk(apk, apksigner, root):
    aapt = pathlib.Path(apksigner).resolve().parent / "aapt"
    badging = subprocess.run([str(aapt), "dump", "badging", str(apk)], check=True, text=True, capture_output=True).stdout
    validate_identity(badging, *source_version(root))
