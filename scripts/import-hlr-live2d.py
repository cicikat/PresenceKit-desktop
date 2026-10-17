"""Restore a runtime from an extracted MPK index. Assets remain outside Git.

Requires Python, lz4==4.4.5, texture2ddecoder==1.0.6, Pillow (see --help).
Only the observed Messiah 0x2001 ETC2 RGBA8 layout is accepted.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import struct
import tempfile


def decode_texture(data):
    import lz4.block
    import texture2ddecoder
    from PIL import Image
    if data[:4] != bytes.fromhex('02020201') or struct.unpack_from('<I', data, 4)[0] != 0x12001:
        raise ValueError('Unsupported texture header; refusing to guess a decoder')
    width, height = struct.unpack_from('<HH', data, 12)
    if not (0 < width <= 16384 and 0 < height <= 16384) or data[56:60] != b'ZZZ4':
        raise ValueError('Unsupported texture dimensions or compression layout')
    size = struct.unpack_from('<I', data, 60)[0]
    expected = ((width + 3) // 4) * ((height + 3) // 4) * 16
    if size != expected:
        raise ValueError('ETC2 RGBA8 payload size does not match dimensions')
    raw = lz4.block.decompress(data[64:], uncompressed_size=size)
    bgra = texture2ddecoder.decode_etc2a8(raw, width, height)
    return Image.frombytes('RGBA', (width, height), bgra, 'raw', 'BGRA')


def safe_file(root, rel):
    path = PurePosixPath(rel.replace('\\', '/'))
    if path.is_absolute() or '..' in path.parts or ':' in rel:
        raise ValueError(f'Unsafe reference: {rel}')
    dest = root.joinpath(*path.parts).resolve()
    if not dest.is_relative_to(root.resolve()):
        raise ValueError(f'Reference escapes output: {rel}')
    return dest


def convert(source, output, model, base_only=False):
    rows = json.loads((source / '资源索引.json').read_text(encoding='utf-8'))
    by_name = {}
    for row in rows:
        if row.get('original_name'):
            by_name.setdefault(row['original_name'], []).append(row)
    def resolve(name):
        matches = by_name.get(name, [])
        if len(matches) != 1:
            raise ValueError(f'Expected one source for {name}, found {len(matches)}')
        row = matches[0]
        return row, safe_file(source, row['file'])
    config_row, config_path = resolve(f'{model}_{model}.model3.json')
    config = json.loads(config_path.read_bytes())
    if config.get('drawableSettings'):
        raise ValueError('Game-specific drawableSettings require separate rendering validation')
    refs = config['FileReferences']
    repeated_slots = [i for i, ref in enumerate(refs['Textures']) if ref in refs['Textures'][:i]]
    if repeated_slots and not base_only:
        raise ValueError('Repeated texture slots may be game accessory placeholders. Inspect slot usage, then use --base-only to explicitly omit unresolved accessory slots.')
    dependencies = [refs['Moc'], *refs['Textures']]
    for key in ['Physics', 'Pose', 'DisplayInfo', 'UserData']:
        if refs.get(key):
            dependencies.append(refs[key])
    dependencies += [x['File'] for x in refs.get('Expressions', [])]
    dependencies += [x['File'] for group in refs.get('Motions', {}).values() for x in group]
    dependencies += [x['Sound'] for group in refs.get('Motions', {}).values() for x in group if x.get('Sound')]
    resolved, missing = {}, []
    for ref in dict.fromkeys(dependencies):
        try:
            resolved[ref] = resolve(model + '_' + ref.replace('/', '_'))
        except ValueError as error:
            missing.append(str(error))
    if missing:
        raise ValueError('Incomplete runtime:\n' + '\n'.join(missing))
    if output.exists():
        raise ValueError(f'Output already exists; choose a fresh directory: {output}')
    output.mkdir(parents=True)
    provenance = []
    motions, expressions = {}, {}
    for ref, (row, path) in resolved.items():
        data = path.read_bytes()
        if ref.endswith('.moc3') and (len(data) < 5 or data[:4] != b'MOC3'):
            raise ValueError(f'Invalid MOC3 payload: {ref}')
        dest = safe_file(output, ref)
        dest.parent.mkdir(parents=True, exist_ok=True)
        operation = 'copy'
        if ref.lower().endswith('.png') and not data.startswith(b'\x89PNG'):
            decode_texture(data).save(dest)
            operation = 'LZ4 + ETC2 RGBA8 -> PNG'
        else:
            dest.write_bytes(data)
        if ref.endswith('.motion3.json'):
            motion = json.loads(data)
            motions[ref] = sorted({x['Id'] for x in motion.get('Curves', []) if x.get('Target') == 'Parameter'})
        if ref.endswith('.exp3.json'):
            expressions[ref] = [x['Id'] for x in json.loads(data).get('Parameters', [])]
        provenance.append(dict(file=ref, source=row['source'], pack=row['pack'], offset=row['offset'],
                               operation=operation, sourceSha256=hashlib.sha256(data).hexdigest(),
                               outputSha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
    available_expr = {x['Name'].removesuffix('.exp3.json'): x['Name'] for x in refs.get('Expressions', [])}
    # Explicit, reviewable candidates inferred from original names, not a global alias table.
    aliases = {'neutral': 'idle', 'happy': 'weixiao', 'sad': 'shiwang', 'thinking': 'yihuo',
               'angry': 'bugaoxing', 'surprised': 'jingya'}
    actions = {}
    for semantic, stem in [('nod', 'diantou'), ('shake', 'yaotou'), ('lean_in', 'qianqing'), ('lean_back', 'houyang')]:
        enter, loop, exit_ = [f'motions/{stem}{s}.motion3.json' for s in ['_on', '_loop', '_off']]
        single = f'motions/{stem}.motion3.json'
        if all(x in motions for x in [enter, loop, exit_]):
            actions[semantic] = dict(enter=enter, loop=loop, exit=exit_)
        elif single in motions and '_loop' not in single:
            actions[semantic] = dict(enter=single)
    if 'motions/talk01.motion3.json' in motions:
        actions['speaking'] = dict(loop='motions/talk01.motion3.json')
    profile = dict(version=1, preserveNativeParameters=True,
                   expressions={k: available_expr[v] for k, v in aliases.items() if v in available_expr},
                   actions=actions, hitAreas={}, motionParameters=motions,
                   expressionParameters={x['Name']: expressions.get(x['File'], []) for x in refs.get('Expressions', [])})
    # Original exports put even their authored idle into the unnamed group.
    if 'Idle' not in refs['Motions'] and 'motions/idle_loop.motion3.json' in motions:
        refs['Motions']['Idle'] = [{'File': 'motions/idle_loop.motion3.json'}]
    omitted_slots = []
    if base_only:
        from PIL import Image
        for index in repeated_slots:
            original = refs['Textures'][index]
            ref = f'_omitted/transparent_slot_{index:02d}.png'
            dest = safe_file(output, ref)
            dest.parent.mkdir(exist_ok=True)
            Image.new('RGBA', (4, 4), (0, 0, 0, 0)).save(dest)
            refs['Textures'][index] = ref
            omitted_slots.append(dict(slot=index, original=original, replacement=ref,
                                      outputSha256=hashlib.sha256(dest.read_bytes()).hexdigest(),
                                      reason='Unresolved game accessory texture slot; explicitly omitted, not reconstructed'))
    config['EmeraldProfile'] = profile
    # Ensure each standalone action can be explicitly addressed, including the empty group.
    # Preserve original groups and file contents unchanged.
    (output / f'{model}.model3.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    (output / 'source-manifest.json').write_text(json.dumps(dict(model=model,
        originalConfigSha256=hashlib.sha256(config_path.read_bytes()).hexdigest(),
        runtimeConfigSha256=hashlib.sha256((output / f'{model}.model3.json').read_bytes()).hexdigest(),
        variant='base character only' if omitted_slots else 'full references', omittedTextureSlots=omitted_slots,
        profileMapping='Provisional semantics inferred from source names; preview before use',
        assets=provenance), ensure_ascii=False, indent=2), encoding='utf-8')
    return dict(model=model, dependencies=len(resolved), mocVersion=(output / refs['Moc']).read_bytes()[4],
                expressions=len(refs.get('Expressions', [])), motions=len(motions), actions=list(actions))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Extracted folder containing 资源索引.json')
    parser.add_argument('--output', type=Path, required=True, help='Fresh runtime folder')
    parser.add_argument('--model', default='yexuan_mingyun')
    parser.add_argument('--base-only', action='store_true', help='Explicitly omit verified duplicate accessory slots with transparent placeholders; recorded in source-manifest.json')
    parser.add_argument('--install-dir', type=Path, help='Optional fresh directory under public/live2d/models')
    args = parser.parse_args()
    output = args.output.resolve()
    if args.install_dir:
        install = args.install_dir.resolve()
        if install.is_relative_to(output) or output.is_relative_to(install):
            raise ValueError('Output and install directories must not contain one another')
    if output.exists() or (args.install_dir and args.install_dir.exists()):
        raise ValueError('Output/install destination already exists; refusing to replace it')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hlr-live2d-', dir=output.parent) as temporary:
        staging = Path(temporary) / 'runtime'
        result = convert(args.source.resolve(), staging, args.model, args.base_only)
        staging.rename(output)
    if args.install_dir:
        install = args.install_dir.resolve()
        install.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.hlr-import-', dir=install.parent) as temporary:
            staging = Path(temporary) / 'runtime'
            shutil.copytree(output, staging)
            staging.rename(install)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
