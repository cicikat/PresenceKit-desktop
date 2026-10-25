"""Extract HLR Resources MPK assets into a fresh auditable snapshot; never executes game code."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import struct
import tempfile
import zipfile
import lz4.block

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def parse_index(data):
    if len(data) < 8 or struct.unpack_from('<I', data)[0] != 1:
        raise ValueError('Unsupported MPK index version')
    count = struct.unpack_from('<I', data, 4)[0]
    if count > 1000000:
        raise ValueError('MPK index exceeds supported bound')
    cursor, entries, seen = 8, [], set()
    for _ in range(count):
        length = struct.unpack_from('<H', data, cursor)[0]
        cursor += 2
        name = data[cursor:cursor + length].decode('utf-8')
        cursor += length
        offset, size, flag = struct.unpack_from('<III', data, cursor)
        cursor += 12
        importer.safe_file(Path.cwd(), name)
        if name in seen:
            raise ValueError('Duplicate MPK resource: ' + name)
        seen.add(name)
        entries.append(dict(source=name, offset=offset, packed_size=size, pack=flag // 2, flag=flag))
    # Current v1 real indexes append an opaque 16-byte trailer; synthetic fixtures may omit it.
    if len(data) - cursor not in (0, 16):
        raise ValueError('Unparsed MPK index bytes')
    return entries


def unpack(data):
    if data.startswith(b'ZZZ4'):
        expected = struct.unpack_from('<I', data, 4)[0]
        if expected > 256 * 1024 * 1024:
            raise ValueError('Compressed resource exceeds supported bound')
        data = lz4.block.decompress(data[8:], uncompressed_size=expected)
        if len(data) != expected:
            raise ValueError('Resource decompression size mismatch')
        if data.startswith(b'.MESSIAH'):
            data = importer.unwrap_resource_data(data)
    return data


def classify(data):
    if data.startswith(b'MOC3'):
        return 'Live2D模型', '.moc3'
    if data.startswith(bytes.fromhex('89504e470d0a1a0a')):
        return 'PNG图片', '.png'
    if data.startswith(bytes.fromhex('ffd8ff')):
        return 'JPEG图片', '.jpg'
    if data[4:8] == b'ftyp':
        return '视频', '.mp4'
    if data.startswith(bytes.fromhex('02020201')):
        return '引擎纹理', '.texture'
    if data.lstrip().startswith(b'{'):
        try:
            value = json.loads(data)
            for key, kind, extension in [('FileReferences', 'Live2D配置', '.model3.json'),
                                         ('PhysicsSettings', 'Live2D物理', '.physics3.json'),
                                         ('Curves', 'Live2D动作', '.motion3.json'),
                                         ('Parameters', '参数或表情', '.json')]:
                if key in value:
                    return kind, extension
            return 'JSON', '.json'
        except (ValueError, UnicodeDecodeError):
            pass
    return '其他', '.bin'


def extract(assets, destination):
    raw_index = (assets / 'Resources.mpkinfo').read_bytes()
    rows, files = parse_index(raw_index), {}
    try:
        for number, row in enumerate(rows):
            pack = row['pack']
            if pack not in files:
                path = assets / ('Resources' + (str(pack) if pack else '') + '.mpk')
                files[pack] = path.open('rb')
            stream = files[pack]
            stream.seek(0, 2)
            if row['offset'] + row['packed_size'] > stream.tell():
                raise ValueError('MPK resource exceeds archive boundary: ' + row['source'])
            stream.seek(row['offset'])
            packed = stream.read(row['packed_size'])
            data = unpack(packed)
            kind, extension = classify(data)
            relative = '资源文件/' + row['source']
            if not relative.lower().endswith(extension):
                relative += extension
            path = importer.safe_file(destination, relative)
            if path.exists():
                raise ValueError('Resource output collision: ' + relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            row.update(file=relative, type=kind, size=len(data), sha256=hashlib.sha256(data).hexdigest(),
                       packedSha256=hashlib.sha256(packed).hexdigest())
            if number % 10000 == 0:
                print('EXTRACT', number, '/', len(rows), flush=True)
    finally:
        for stream in files.values():
            stream.close()
    index = destination / '资源索引.json'
    index.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    recovered, records = importer.load_source_rows(destination)
    index.write_text(json.dumps(recovered, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = dict(schema='hlr-extraction-v1', sourceIndexSha256=hashlib.sha256(raw_index).hexdigest(),
                   resources=len(rows), resourceRecords=len(records), errors=[])
    (destination / 'extraction.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--assets', type=Path, help='Unpacked APK assets directory')
    source.add_argument('--apk', type=Path, help='APK/ZIP; reads only assets/Resources*.mpk and .mpkinfo')
    parser.add_argument('--output', type=Path, required=True, help='Fresh extraction directory')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        raise ValueError('Extraction destination exists; refusing overwrite')
    if args.assets and (output.is_relative_to(args.assets.resolve()) or args.assets.resolve().is_relative_to(output)):
        raise ValueError('Source and output directories must not contain one another')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.hlr-extract-', dir=output.parent) as temporary:
        staging = Path(temporary) / 'snapshot'
        staging.mkdir()
        if args.apk:
            assets = Path(temporary) / 'assets'
            assets.mkdir()
            with zipfile.ZipFile(args.apk) as archive:
                selected = [i for i in archive.infolist() if re.fullmatch(r'assets/Resources[0-9]*[.]mpk(info)?', i.filename)]
                if len({i.filename for i in selected}) != len(selected):
                    raise ValueError('Duplicate resource entry in APK')
                for info in selected:
                    with archive.open(info) as src, (assets / Path(info.filename).name).open('wb') as dest:
                        shutil.copyfileobj(src, dest)
        else:
            assets = args.assets.resolve()
        summary = extract(assets, staging)
        staging.rename(output)
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
