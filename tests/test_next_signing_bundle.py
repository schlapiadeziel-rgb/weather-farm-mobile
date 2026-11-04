import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("restore_next_signing", pathlib.Path(__file__).parents[1] / "scripts/restore-next-signing.py")
restore_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore_module)


class SigningBundleRestore(unittest.TestCase):
    def archive(self, path, entries):
        with tarfile.open(path, "w") as archive:
            for name, kind in entries:
                entry = tarfile.TarInfo(name)
                if kind == "link":
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = "/tmp/unrelated"
                    archive.addfile(entry)
                else:
                    data = b"fixture data"
                    entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))

    def test_exact_bundle_restores_with_private_permissions(self):
        with tempfile.TemporaryDirectory() as base:
            base = pathlib.Path(base)
            archive, destination = base / "bundle.tar", base / "private"
            self.archive(archive, [(name, "file") for name in restore_module.EXPECTED])
            restore_module.restore(archive, destination)
            self.assertEqual({file.name for file in destination.iterdir()}, restore_module.EXPECTED)
            self.assertEqual(destination.stat().st_mode & 0o777, 0o700)
            for file in destination.iterdir():
                self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_unsafe_or_duplicate_members_never_write_files(self):
        expected = [(name, "file") for name in sorted(restore_module.EXPECTED)]
        bad = [expected + [expected[0]], expected[:-1] + [("../outside", "file")], [(name, "link" if index == 0 else "file") for index, (name, _) in enumerate(expected)]]
        for entries in bad:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as base:
                base = pathlib.Path(base)
                archive, destination = base / "bundle.tar", base / "private"
                self.archive(archive, entries)
                with self.assertRaises(ValueError):
                    restore_module.restore(archive, destination)
                self.assertEqual(list(destination.iterdir()), [])

    def test_existing_private_file_is_preserved(self):
        with tempfile.TemporaryDirectory() as base:
            base = pathlib.Path(base)
            archive, destination = base / "bundle.tar", base / "private"
            self.archive(archive, [(name, "file") for name in restore_module.EXPECTED])
            destination.mkdir()
            saved = destination / "keystore-password"
            saved.write_bytes(b"existing fixture")
            with self.assertRaises(ValueError):
                restore_module.restore(archive, destination)
            self.assertEqual(saved.read_bytes(), b"existing fixture")
            self.assertEqual(len(list(destination.iterdir())), 1)

    def test_source_checkout_cannot_receive_private_material(self):
        with tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parents[1]) as destination:
            with self.assertRaises(ValueError):
                restore_module.restore("unused.tar", destination)


if __name__ == "__main__":
    unittest.main()
