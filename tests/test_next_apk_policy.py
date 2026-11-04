import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("next_apk_policy", pathlib.Path(__file__).parents[1] / "scripts/next_apk_policy.py")
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class IndependentApkPolicy(unittest.TestCase):
    def test_accepts_exact_new_package_and_source_version(self):
        policy.validate_identity("package: name='com.fieldletter.farm.next' versionCode='30' versionName='0.29.0' platformBuildVersionName='15'\n", "0.29.0", 30)

    def test_rejects_legacy_and_similar_package_names(self):
        for name in ["com.fieldletter.farm", "com.fieldletter.farm.next.fake", "com.fieldletter.farmnext"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                policy.validate_identity(f"package: name='{name}' versionCode='30' versionName='0.29.0'\n", "0.29.0", 30)

    def test_rejects_stale_or_changed_source_versions(self):
        for version, code in [("0.28.0", 30), ("0.29.0", 29), ("0.29.0", 31)]:
            with self.subTest(version=version, code=code), self.assertRaises(ValueError):
                policy.validate_identity(f"package: name='com.fieldletter.farm.next' versionCode='{code}' versionName='{version}'\n", "0.29.0", 30)

    def test_rejects_missing_and_duplicate_package_metadata(self):
        row = "package: name='com.fieldletter.farm.next' versionCode='30' versionName='0.29.0'\n"
        for badging in ["", "package: invalid", row + row]:
            with self.subTest(badging=badging), self.assertRaises(ValueError):
                policy.package_info(badging)


if __name__ == "__main__":
    unittest.main()
