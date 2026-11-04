"""Restore only the four expected files from an authenticated signing bundle."""
import pathlib
import sys
import tarfile

EXPECTED = {"fieldletter-next-release.p12", "keystore-password", "key-alias", "certificate-sha256"}


def restore(archive, destination):
    destination = pathlib.Path(destination).resolve()
    if destination.is_relative_to(pathlib.Path(__file__).resolve().parent.parent):
        raise ValueError("Private signing files must remain outside the source checkout")
    destination.mkdir(parents=True, exist_ok=True)
    destination.chmod(0o700)
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if len(members) != len(EXPECTED) or {member.name for member in members} != EXPECTED or any(not member.isfile() for member in members):
            raise ValueError("Signing bundle has unexpected, duplicate or non-file entries")
        if any(member.size < 1 or member.size > 1_000_000 for member in members):
            raise ValueError("Signing bundle contains an invalid file size")
        for member in members:
            target = destination / member.name
            if target.exists() or target.is_symlink():
                raise ValueError("Refusing to overwrite existing signing files")
        for member in members:
            target = destination / member.name
            with target.open("xb") as output:
                target.chmod(0o600)
                output.write(tar.extractfile(member).read())


if __name__ == "__main__":
    restore(*sys.argv[1:])
