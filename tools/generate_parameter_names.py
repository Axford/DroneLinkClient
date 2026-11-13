#!/usr/bin/env python3
"""Refresh the Inspector label index from a verified DroneNode metadata archive."""

import argparse
import hashlib
import json
from pathlib import Path
import tarfile


def inherited_names(catalog, kind):
    entry = catalog[kind]
    parents = entry.get('inherits', [])
    names = inherited_names(catalog, parents[0]) if parents else {}
    declared = {}
    for field in entry.get('pub', []) + entry.get('sub', []):
        addresses = [field['address']]
        if 'addrAddress' in field:
            addresses.append(field['addrAddress'])
        for address in addresses:
            declared.setdefault(address, set()).add(field['name'])
    for address, labels in declared.items():
        if len(labels) == 1:
            names[address] = next(iter(labels))
        else:
            names.pop(address, None)
    return names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    with tarfile.open(args.archive, 'r:gz') as archive:
        catalog_bytes = archive.extractfile('moduleInfo.json').read()
        manifest = json.load(archive.extractfile('release-manifest.json'))
    digest = hashlib.sha256(catalog_bytes).hexdigest()
    if manifest['kind'] != 'metadata' or manifest['files']['moduleInfo.json'] != digest:
        raise ValueError('Invalid metadata catalog digest')
    catalog = json.loads(catalog_bytes)

    # Keep each module on one line so catalog updates can be reviewed by module.
    rows = [
        f'    {json.dumps(kind)}: {json.dumps(inherited_names(catalog, kind), sort_keys=True)}'
        for kind in sorted(catalog)
    ]
    output = Path(__file__).resolve().parents[1] / 'src/dronelink/parameterNames.json'
    output.write_text(
        '{\n'
        f'  "firmwareRevision": {json.dumps(manifest["sourceRevision"])},\n'
        f'  "catalogSha256": {json.dumps(digest)},\n'
        '  "modules": {\n' + ',\n'.join(rows) + '\n  }\n}\n',
        encoding='utf-8',
    )


if __name__ == '__main__':
    main()
