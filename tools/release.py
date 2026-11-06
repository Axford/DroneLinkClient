#!/usr/bin/env python3
"""Build, verify and optionally extract an immutable Client release."""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def release_name(manifest):
    return f"dronelink-client-{manifest['packageVersion']}-{manifest['clientRevision']}.tgz"


def safe_path(value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError('Invalid archive path')
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in ('', '.', '..') for p in value.split('/')) or ':' in value:
        raise ValueError(f'Unsafe archive path: {value}')
    return value


def verified_files(archive):
    """Validate all bytes before any destination is touched; never use extractall."""
    archive = Path(archive)
    checksum = Path(str(archive) + '.sha256').read_text().strip()
    archive_bytes = archive.read_bytes()
    if checksum != f'{digest(archive_bytes)}  {archive.name}':
        raise ValueError('Archive checksum mismatch')
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz') as tar:
        for member in tar:
            name = safe_path(member.name)
            if name in files or not member.isfile() or member.issym() or member.islnk():
                raise ValueError(f'Duplicate or non-regular archive entry: {name}')
            files[name] = tar.extractfile(member).read()
    manifest = json.loads(files.pop('release-manifest.json'))
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Unsupported manifest schema')
    for field in ('clientRevision', 'protocolArchiveSha256'):
        length = 40 if field == 'clientRevision' else 64
        if not re.fullmatch(f'[0-9a-f]{{{length}}}', str(manifest.get(field, ''))):
            raise ValueError(f'Invalid manifest {field}')
    for field in ('packageVersion', 'protocolVersion'):
        if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', str(manifest.get(field, ''))):
            raise ValueError(f'Invalid manifest {field}')
    if not isinstance(manifest.get('buildTools'), dict) or any(
        not isinstance(manifest['buildTools'].get(tool), str) or not manifest['buildTools'][tool]
        for tool in ('node', 'npm')
    ):
        raise ValueError('Invalid build tool provenance')
    if archive.name != release_name(manifest):
        raise ValueError('Archive identity differs from manifest')
    hashes = manifest.get('files')
    if not isinstance(hashes, dict) or not hashes:
        raise ValueError('Missing manifest files')
    expected = {}
    for relative, sha in hashes.items():
        safe_path(relative)
        if not re.fullmatch(r'[0-9a-f]{64}', str(sha)):
            raise ValueError('Invalid file checksum')
        expected['build/' + relative] = sha
    if set(expected) != set(files) or any(digest(files[name]) != sha for name, sha in expected.items()):
        raise ValueError('Build file set or checksum mismatch')
    if 'build/index.html' not in files or not any(name.startswith('build/static/') for name in files):
        raise ValueError('Required index.html/static artifact shape missing')
    # Reject a file which would also be another file's parent before writing.
    for name in files:
        if any(str(parent) in files for parent in PurePosixPath(name).parents):
            raise ValueError('Conflicting artifact file paths')
    return manifest, files


def verify(archive, destination=None):
    manifest, files = verified_files(archive)
    if destination is not None:
        destination = Path(destination).absolute()
        if destination.exists() or destination.is_symlink():
            raise ValueError('Extraction destination already exists; select a fresh release directory')
        destination.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix='.client-release-', dir=destination.parent))
        try:
            for name, data in files.items():
                path = staging / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            (staging / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            # Do not replace an existing release, including a concurrent installer.
            destination.mkdir()
            try:
                for path in staging.iterdir():
                    os.rename(path, destination / path.name)
            except BaseException:
                shutil.rmtree(destination)
                raise
        finally:
            shutil.rmtree(staging)
    return manifest


def pack():
    if command('git', 'status', '--porcelain', '--untracked-files=all'):
        raise ValueError('Release requires a clean source checkout; commit source/tests/docs first')
    revision = command('git', 'rev-parse', 'HEAD')
    package = json.loads((ROOT / 'package.json').read_text())
    protocol = package['dependencies']['@dronelink/protocol']
    if not protocol.startswith('file:vendor/'):
        raise ValueError('Expected a vendored pinned protocol archive')
    protocol_path = ROOT / protocol.removeprefix('file:')
    lock = json.loads((ROOT / 'package-lock.json').read_text())['packages']['node_modules/@dronelink/protocol']
    if lock['resolved'] != protocol or lock['integrity'] != 'sha512-' + base64.b64encode(hashlib.sha512(protocol_path.read_bytes()).digest()).decode():
        raise ValueError('Protocol archive differs from lockfile pin')
    subprocess.run(['npm', 'run', 'build'], cwd=ROOT, check=True)
    if command('git', 'rev-parse', 'HEAD') != revision or command('git', 'status', '--porcelain', '--untracked-files=all'):
        raise ValueError('Source changed during the build; no release was published')
    files = {}
    for path in sorted((ROOT / 'build').rglob('*')):
        if path.is_symlink():
            raise ValueError('Build contains a symlink')
        if path.is_file():
            files[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    manifest = {'schemaVersion': 1, 'accessPolicyVersion': 1, 'packageVersion': package['version'], 'clientRevision': revision,
                'protocolVersion': lock['version'], 'protocolArchiveSha256': digest(protocol_path.read_bytes()),
                'buildTools': {'node': command('node', '--version'), 'npm': command('npm', '--version')},
                'files': {name.removeprefix('build/'): digest(data) for name, data in files.items()}}
    files['release-manifest.json'] = (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode()
    if command('git', 'rev-parse', 'HEAD') != revision or command('git', 'status', '--porcelain', '--untracked-files=all'):
        raise ValueError('Source changed during packaging; no release was published')
    output = ROOT / 'releases'
    output.mkdir(exist_ok=True)
    archive = output / release_name(manifest)
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name, data in sorted(files.items()):
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o644
                tar.addfile(entry, io.BytesIO(data))
    data = buffer.getvalue()
    if archive.exists() and archive.read_bytes() != data:
        raise ValueError('Release identity already exists with different bytes')
    archive.write_bytes(data)
    Path(str(archive) + '.sha256').write_text(f'{digest(data)}  {archive.name}\n')
    verify(archive)
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('pack')
    check = sub.add_parser('verify')
    check.add_argument('archive', type=Path)
    check.add_argument('--extract', type=Path, help='Explicit new release directory; never overwrites an existing directory')
    args = parser.parse_args()
    try:
        if args.action == 'pack':
            print(pack())
        else:
            print(json.dumps(verify(args.archive, args.extract), indent=2))
    except (ValueError, KeyError, OSError, tarfile.TarError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Release failed: {error}\n')


if __name__ == '__main__':
    main()
