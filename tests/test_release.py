"""Exercise the release interface with real tar/gzip files and extraction."""
import hashlib
import importlib.util
import io
import json
import os
import subprocess
from unittest import mock
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parents[1] / 'tools/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.files = {'build/index.html': b'<script src="/static/main.js"></script>', 'build/static/main.js': b'console.log(1)'}
        self.manifest = {'schemaVersion': 1, 'packageVersion': '0.1.0', 'clientRevision': 'a' * 40,
                         'protocolVersion': '0.1.1', 'protocolArchiveSha256': 'b' * 64,
                         'buildTools': {'node': 'v22.23.4', 'npm': '10.9.9'},
                         'files': {name[6:]: release.digest(data) for name, data in self.files.items()}}
        self.archive = self.root / release.release_name(self.manifest)

    def write_archive(self, extra=()):
        with tarfile.open(self.archive, 'w:gz') as tar:
            entries = [*self.files.items(), ('release-manifest.json', json.dumps(self.manifest).encode()), *extra]
            for name, data in entries:
                if isinstance(data, tarfile.TarInfo):
                    tar.addfile(data)
                else:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    tar.addfile(entry, io.BytesIO(data))
        Path(str(self.archive) + '.sha256').write_text(f'{release.digest(self.archive.read_bytes())}  {self.archive.name}\n')

    def assert_rejected(self):
        target = self.root / 'new-release'
        with self.assertRaises((ValueError, KeyError)):
            release.verify(self.archive, target)
        self.assertFalse(target.exists())
        self.assertEqual(list(self.root.glob('.client-release-*')), [])

    def test_verifies_and_extracts_exact_complete_artifact(self):
        self.write_archive()
        target = self.root / 'release'
        self.assertEqual(release.verify(self.archive, target), self.manifest)
        for name, data in self.files.items():
            self.assertEqual((target / name).read_bytes(), data)
        self.assertEqual(json.loads((target / 'release-manifest.json').read_text()), self.manifest)

    def test_corruption_does_not_replace_existing_release(self):
        self.write_archive()
        target = self.root / 'release'
        release.verify(self.archive, target)
        self.archive.write_bytes(self.archive.read_bytes() + b'corruption')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            release.verify(self.archive, target)
        self.assertEqual((target / 'build/index.html').read_bytes(), self.files['build/index.html'])

    def test_existing_destination_is_never_overwritten(self):
        self.write_archive()
        target = self.root / 'release'
        target.mkdir()
        (target / 'retained').write_text('previous')
        with self.assertRaisesRegex(ValueError, 'already exists'):
            release.verify(self.archive, target)
        self.assertEqual((target / 'retained').read_text(), 'previous')

    def test_missing_unexpected_and_changed_files_are_rejected(self):
        original = dict(self.files)
        for mutation in ('missing', 'extra', 'changed'):
            with self.subTest(mutation=mutation):
                self.files = dict(original)
                if mutation == 'missing':
                    self.files.pop('build/static/main.js')
                elif mutation == 'extra':
                    self.files['build/unexpected'] = b'extra'
                else:
                    self.files['build/index.html'] = b'changed'
                self.write_archive()
                self.assert_rejected()

    def test_unsafe_paths_are_rejected_even_with_matching_checksums(self):
        for path in ('../escaped', '/absolute', 'build/../../escaped', 'build/./main', 'build//main', 'build\\main', 'C:/main'):
            with self.subTest(path=path):
                self.write_archive([(path, b'unsafe')])
                self.assert_rejected()
        self.assertFalse((self.root.parent / 'escaped').exists())

    def test_symlinks_hardlinks_and_directories_are_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.DIRTYPE):
            with self.subTest(kind=kind):
                entry = tarfile.TarInfo('build/link')
                entry.type = kind
                entry.linkname = '../../elsewhere'
                self.write_archive([('build/link', entry)])
                self.assert_rejected()

    def test_duplicate_entries_are_rejected(self):
        self.write_archive([('build/index.html', b'duplicate')])
        self.assert_rejected()

    def test_manifest_provenance_and_shape_are_required(self):
        for field, value in (('schemaVersion', 2), ('clientRevision', 'dirty'), ('protocolArchiveSha256', 'bad'), ('buildTools', {}), ('files', {})):
            with self.subTest(field=field):
                previous = self.manifest[field]
                self.manifest[field] = value
                self.write_archive()
                self.assert_rejected()
                self.manifest[field] = previous

    def test_release_identity_must_match_manifest(self):
        self.manifest['packageVersion'] = '0.2.0'
        self.write_archive()
        self.assert_rejected()

    def test_required_shell_and_static_files_are_checked(self):
        self.files = {'build/other': b'no shell'}
        self.manifest['files'] = {'other': release.digest(b'no shell')}
        self.write_archive()
        self.assert_rejected()

    def test_manifest_paths_cannot_conflict_as_file_and_parent(self):
        self.files['build/static'] = b'file conflicts with static directory'
        self.manifest['files']['static'] = release.digest(self.files['build/static'])
        self.write_archive()
        self.assert_rejected()

    def test_source_edit_or_commit_during_build_prevents_publication(self):
        # Real Git repositories and a fake build executable exercise the public
        # packaging workflow without downloading dependencies or mocking Git.
        for mutation in ('edit', 'commit'):
            with self.subTest(mutation=mutation):
                repo = self.root / mutation
                repo.mkdir()
                binary = self.root / ('bin-' + mutation)
                binary.mkdir()
                executable = binary / 'npm'
                script = '#!/bin/sh\nif [ "$1" = "run" ]; then\n  printf changed >> source.txt\n'
                if mutation == 'commit':
                    script += '  git add source.txt && git commit -qm concurrent\n'
                script += 'fi\n'
                executable.write_text(script)
                executable.chmod(0o755)
                (repo / 'vendor').mkdir()
                protocol = b'test protocol archive'
                (repo / 'vendor/protocol.tgz').write_bytes(protocol)
                (repo / 'source.txt').write_text('original')
                (repo / 'package.json').write_text(json.dumps({'version': '0.1.0', 'dependencies': {'@dronelink/protocol': 'file:vendor/protocol.tgz'}}))
                (repo / 'package-lock.json').write_text(json.dumps({'packages': {'node_modules/@dronelink/protocol': {'version': '0.1.1', 'resolved': 'file:vendor/protocol.tgz', 'integrity': 'sha512-' + release.base64.b64encode(hashlib.sha512(protocol).digest()).decode()}}}))
                def git(*args):
                    subprocess.run(['git', *args], cwd=repo, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                git('init', '-q')
                git('config', 'user.name', 'Release test')
                git('config', 'user.email', 'release@example.test')
                git('add', '.')
                git('commit', '-qm', 'baseline')
                with mock.patch.object(release, 'ROOT', repo), mock.patch.dict(os.environ, {'PATH': str(binary) + os.pathsep + os.environ['PATH']}):
                    with self.assertRaisesRegex(ValueError, 'Source changed during the build'):
                        release.pack()
                self.assertFalse((repo / 'releases').exists())
