"""Validation regressions. These do not substitute for real model rendering."""
import importlib.util
import json
from pathlib import Path
import tempfile
import struct
import unittest

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportValidation(unittest.TestCase):
    def test_multi_mip_texture_retains_highest_original_rgba_pixels(self):
        base = bytearray(40)
        base[:4] = bytes.fromhex('02020201')
        struct.pack_into('<I', base, 4, (2 << 16) | (3 << 8) | 1)
        struct.pack_into('<HH', base, 12, 2, 2)
        pixels = bytes([1, 2, 3, 255]) * 4
        for w, h, raw in [(1, 1, b'\x09\x08\x07\xff'), (2, 2, pixels)]:
            base.extend(struct.pack('<IHHII', 20 + len(raw), w, h, 0, len(raw)) + b'NNNN' + raw)
        self.assertEqual(module.decode_texture(bytes(base)).tobytes(), pixels)
        with self.assertRaisesRegex(ValueError, 'Unparsed'):
            module.decode_texture(bytes(base) + b'extra')
        damaged = base[:-1]
        with self.assertRaisesRegex(ValueError, 'boundary'):
            module.decode_texture(bytes(damaged))

    def test_downloaded_patch_without_apk_offset_preserves_true_origin(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            source.mkdir()
            config = dict(Version=3, FileReferences=dict(Moc='test.moc3', Textures=['test.png'], Motions={}))
            (source / 'config.json').write_text(json.dumps(config), encoding='utf-8')
            (source / 'moc').write_bytes(b'MOC3\x03payload')
            Image.new('RGBA', (1, 1)).save(source / 'image.png')
            rows = [dict(original_name=name, file=file, source='Package/' + file, origin='downloaded patch')
                    for name, file in [('test_test.model3.json', 'config.json'), ('test_test.moc3', 'moc'), ('test_test.png', 'image.png')]]
            module.convert(source, root / 'runtime', 'test', source_rows=rows)
            manifest = json.loads((root / 'runtime/source-manifest.json').read_text(encoding='utf-8'))
            self.assertTrue(all(a['pack'] is None and a['offset'] is None for a in manifest['assets']))
            self.assertTrue(all(a['origin'] == 'downloaded patch' for a in manifest['assets']))

    def test_rejects_paths_escaping_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path in ['../outside.png', '/outside.png', 'C:/outside.png', '..\\outside.png']:
                with self.assertRaises(ValueError):
                    module.safe_file(root, path)

    def test_unknown_texture_is_not_guessed(self):
        with self.assertRaises(ValueError):
            module.decode_texture(b'not a supported texture')

    def test_missing_dependencies_never_publish_a_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source'
            source.mkdir()
            config = dict(Version=3, FileReferences=dict(Moc='test.moc3', Textures=['texture.png'], Motions={}))
            (source / 'config.json').write_text(json.dumps(config), encoding='utf-8')
            index = [dict(original_name='test_test.model3.json', file='config.json')]
            (source / '资源索引.json').write_text(json.dumps(index), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Incomplete runtime'):
                module.convert(source, root / 'runtime', 'test')
            self.assertFalse((root / 'runtime').exists())

    def test_repeated_accessory_slots_require_explicit_base_variant(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'config.json').write_text(json.dumps(dict(Version=3,
                FileReferences=dict(Moc='test.moc3', Textures=['a.png', 'a.png'], Motions={}))), encoding='utf-8')
            (root / '资源索引.json').write_text(json.dumps([
                dict(original_name='test_test.model3.json', file='config.json')]), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Repeated texture slots'):
                module.convert(root, root / 'runtime', 'test')
            self.assertFalse((root / 'runtime').exists())


if __name__ == '__main__':
    unittest.main()
