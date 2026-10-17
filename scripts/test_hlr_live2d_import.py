"""Validation regressions. These do not substitute for real model rendering."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportValidation(unittest.TestCase):
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
