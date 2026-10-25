import importlib.util
import json
from pathlib import Path
import struct
import tempfile
from unittest.mock import patch
import unittest
import uuid
import zipfile
from hlr_characters import CHARACTERS, classify_model, character_catalog

spec = importlib.util.spec_from_file_location('hlr_recovery', Path(__file__).with_name('recover-hlr-models.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
extract_spec = importlib.util.spec_from_file_location('hlr_extract', Path(__file__).with_name('extract-hlr-resources.py'))
extractor = importlib.util.module_from_spec(extract_spec)
extract_spec.loader.exec_module(extractor)
organize_spec = importlib.util.spec_from_file_location('hlr_organize', Path(__file__).with_name('organize-hlr-models.py'))
organizer = importlib.util.module_from_spec(organize_spec)
organize_spec.loader.exec_module(organizer)
review_spec = importlib.util.spec_from_file_location('hlr_review', Path(__file__).with_name('recover-hlr-reviewed-slots.py'))
reviewed = importlib.util.module_from_spec(review_spec)
review_spec.loader.exec_module(reviewed)


def string(value):
    raw = value.encode('utf-8')
    return struct.pack('<H', len(raw)) + raw


def record(identity, name, deps=()):
    return bytes(5) + identity.bytes + string(name) + struct.pack('<HHH', 0, 0, len(deps)) + b''.join(x.bytes for x in deps)


class RecoveryValidation(unittest.TestCase):
    def test_reviewed_variant_refuses_source_config_changed_after_audit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, snapshot, output = root / 'source', root / 'snapshot', root / 'output'
            source.mkdir()
            snapshot.mkdir()
            (source / 'config.json').write_text('{}', encoding='utf-8')
            (source / '资源索引.json').write_text(json.dumps([dict(source='Package/config', file='config.json')]), encoding='utf-8')
            item = dict(id='yexuan_test', fingerprint='original', missingCount=0, configSource='Package/config',
                        configFile='config.json', configSha256='old-bytes')
            (snapshot / 'models.json').write_text(json.dumps(dict(models=[item])), encoding='utf-8')
            slots = root / 'slots.json'
            slots.write_text(json.dumps(dict(schema='hlr-slots-v1', models=[dict(id='yexuan_test', fingerprint='original')])), encoding='utf-8')
            with patch('sys.argv', ['review', '--source', str(source), '--snapshot', str(snapshot),
                       '--slots', str(slots), '--output', str(output), '--reviewed-models', 'yexuan_test']):
                with self.assertRaisesRegex(ValueError, 'Source config changed'):
                    reviewed.main()
            self.assertFalse((output / 'models.json').exists())
            self.assertEqual((source / 'config.json').read_text(), '{}')

    def test_reviewed_atlas_binding_keeps_source_bytes_and_records_only_resolved_slot(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, destination = root / 'source', root / 'runtime'
            source.mkdir()
            (destination / '_omitted').mkdir(parents=True)
            Image.new('RGBA', (2, 2), (1, 2, 3, 255)).save(source / 'eye.png')
            (destination / '_omitted/slot1.png').write_bytes(b'unresolved')
            before = (source / 'eye.png').read_bytes()
            manifest = dict(assets=[], omittedTextureSlots=[dict(slot=1), dict(slot=2)])
            config = dict(FileReferences=dict(Textures=['body.png', '_omitted/slot1.png', 'other.png']))
            binding = dict(slot=1, resource='native_eye_atlas', drawables=['eye'], evidence='exact native UV review')
            rows = [dict(original_name='native_eye_atlas', file='eye.png', source='Package/eye', pack=0, offset=0)]
            reviewed.bind_slots(destination, manifest, config, dict(repeatedTextureSlots=[1, 2]),
                dict(drawables=[dict(id='eye', texture=1)]), [binding], rows, source)
            self.assertEqual((destination / config['FileReferences']['Textures'][1]).read_bytes(), before)
            self.assertEqual((source / 'eye.png').read_bytes(), before)
            self.assertEqual(manifest['omittedTextureSlots'], [dict(slot=2)])
            self.assertEqual(manifest['assets'][0]['resourceName'], 'native_eye_atlas')
            self.assertFalse((destination / '_omitted/slot1.png').exists())

    def test_reviewed_atlas_binding_rejects_wrong_geometry_or_ambiguous_source(self):
        item = dict(repeatedTextureSlots=[1])
        proof = dict(drawables=[dict(id='actual_eye', texture=1)])
        binding = dict(slot=1, resource='eye', drawables=['different_eye'], evidence='review')
        with self.assertRaisesRegex(ValueError, 'drawable evidence'):
            reviewed.bind_slots(Path('.'), {}, {}, item, proof, [binding], [], Path('.'))
        binding['drawables'] = ['actual_eye']
        with self.assertRaisesRegex(ValueError, 'exactly once'):
            reviewed.bind_slots(Path('.'), {}, {}, item, proof, [binding], [dict(original_name='eye')] * 2, Path('.'))

    def test_five_character_names_and_aliases_preserve_user_order(self):
        self.assertEqual([name for _, name, _ in CHARACTERS], ['叶瑄', '司岚', '路辰', '艾因', '罗夏'])
        for source, expected in [('hlr_yexuan_mingyun_base', 'yexuan'), ('silan_xiaofu', 'silan'),
                                 ('card_dynamic_luchen02', 'luchen'), ('aiyin _feiyi', 'aiyin'),
                                 ('card_dynamic_cqsslx', 'luoxia'), ('card_dynamic_cqssay', 'aiyin'),
                                 ('card_dynamic_slsr24', 'silan'), ('card_dynamic_rmxluoxia_zoom', 'luoxia')]:
            self.assertEqual(classify_model(source)['characterIds'], [expected], source)
        for source in ['baiyintidu', 'xingzhitidu', 'BG', 'juqing_nzshou']:
            self.assertEqual(classify_model(source)['status'], 'needs_review', source)

    def test_multi_character_cards_are_indexed_under_both_people(self):
        self.assertEqual(classify_model('card_dynamic_lcsl')['characterIds'], ['luchen', 'silan'])
        self.assertEqual(classify_model('card_dynamic_25cjlclx')['characterIds'], ['luchen', 'luoxia'])
        catalog = character_catalog([dict(id='card_dynamic_lcsl')])
        self.assertEqual([g['count'] for g in catalog['characters']], [0, 1, 1, 0, 0])

    def test_character_directory_move_preserves_all_content_and_can_be_reverified(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = root / 'yexuan_mingyun_base'
            original.mkdir()
            (original / 'texture.png').write_bytes(b'preserve exact bytes')
            before = organizer.tree_hashes(original)
            result = organizer.organize(root, perform=True)
            target = root / '叶瑄/yexuan_mingyun_base'
            self.assertEqual(organizer.tree_hashes(target), before)
            self.assertFalse(original.exists())
            self.assertEqual(result[0]['path'], '叶瑄/yexuan_mingyun_base')
            self.assertEqual(len(organizer.organize(root, perform=True)), 1)

    def test_delta_keeps_content_unchanged_when_only_character_labels_are_added(self):
        item = dict(id='silan_xiaofu', model='silan_xiaofu', fingerprint='same', missingCount=0)
        before = dict(schema=recovery.SCHEMA, models=[item])
        after = dict(schema=recovery.SCHEMA, models=[{**item, 'classification': classify_model(item['id'])}])
        result = recovery.compare_models(before, after)
        self.assertEqual(result['changed'], [])
        self.assertEqual(result['byCharacter'][1]['unchanged'], ['silan_xiaofu'])
    def test_apk_cli_extracts_only_resource_entries_and_refuses_existing_output(self):
        data = b'MOC3' + bytes(16)
        info = struct.pack('<II', 1, 1) + string('Package/test') + struct.pack('<III', 0, len(data), 0) + bytes(16)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            apk, out = root / 'test.apk', root / 'extracted'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('assets/Resources.mpkinfo', info)
                archive.writestr('assets/Resources.mpk', data)
                archive.writestr('../escape', 'not a resource')
            with patch('sys.argv', ['extract', '--apk', str(apk), '--output', str(out)]):
                extractor.main()
                with self.assertRaisesRegex(ValueError, 'exists'):
                    extractor.main()
            self.assertFalse((root / 'escape').exists())
            self.assertEqual(json.loads((out / 'extraction.json').read_text())['resources'], 1)

    def test_config_asset_owner_does_not_follow_a_reused_internal_moc_filename(self):
        config = dict(FileReferences=dict(Moc='yexuan_baiqing.moc3'))
        row = dict(original_name='yexuan_baiqing24_yexuan_baiqing.model3.json')
        self.assertEqual(recovery.importer.model_id_from_config(row, config), 'yexuan_baiqing24')
    def test_mpk_extraction_preserves_bytes_and_refuses_out_of_bounds_and_traversal(self):
        data = b'MOC3' + bytes(16)
        info = struct.pack('<II', 1, 1) + string('Package/test') + struct.pack('<III', 0, len(data), 0)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            assets, out = root / 'assets', root / 'out'
            assets.mkdir()
            out.mkdir()
            (assets / 'Resources.mpkinfo').write_bytes(info)
            (assets / 'Resources.mpk').write_bytes(data)
            result = extractor.extract(assets, out)
            self.assertEqual(result['resources'], 1)
            rows = json.loads((out / '资源索引.json').read_text(encoding='utf-8'))
            self.assertEqual((out / rows[0]['file']).read_bytes(), data)
            (assets / 'Resources.mpk').write_bytes(data[:-1])
            with self.assertRaisesRegex(ValueError, 'boundary'):
                extractor.extract(assets, root / 'other')
        unsafe = struct.pack('<II', 1, 1) + string('../escape') + struct.pack('<III', 0, 1, 0)
        with self.assertRaises(ValueError):
            extractor.parse_index(unsafe)
        empty = struct.pack('<II', 1, 1) + string('Package/Char/card') + struct.pack('<III', 0, 0, 0)
        self.assertEqual(extractor.parse_index(empty)[0]['packed_size'], 0)

    def test_standalone_messiah_expression_keeps_exact_inner_json(self):
        import lz4.block
        payload = b'{"Type":"Live2D Expression","Parameters":[]}'
        wrapped = b'.MESSIAH' + struct.pack('<II', 1, len(payload)) + payload
        self.assertEqual(recovery.importer.unwrap_resource_data(wrapped), payload)
        with self.assertRaisesRegex(ValueError, 'layout'):
            recovery.importer.unwrap_resource_data(wrapped[:-1])
        compressed = lambda data: b'ZZZ4' + struct.pack('<I', len(data)) + lz4.block.compress(data, store_size=False)
        self.assertEqual(extractor.unpack(compressed(wrapped)), payload)
        with self.assertRaisesRegex(ValueError, 'layout'):
            extractor.unpack(compressed(wrapped[:-1]))

    def test_record_parser_ignores_uuid_occurrences_in_earlier_dependency_lists(self):
        first, texture = uuid.uuid4(), uuid.uuid4()
        binary = struct.pack('<II', 1, 2) + string('') + string('Data') + string('live2d')
        binary += record(first, 'model', [texture]) + record(texture, 'model_texture.png')
        records = recovery.importer.read_resource_repository(binary)
        self.assertEqual(records[str(texture)]['name'], 'model_texture.png')
        self.assertEqual(records[str(first)]['dependencies'], [str(texture)])

    def test_compressed_envelope_uses_exact_block_and_rejects_trailing_decoded_bytes(self):
        import lz4.block
        raw = struct.pack('<II', 1, 1) + string('') + string('Data') + string('live2d')
        raw += record(uuid.uuid4(), 'test')
        envelope = b'CCCCZZZ4' + struct.pack('<I', len(raw)) + lz4.block.compress(raw, store_size=False) + bytes(20)
        self.assertEqual(len(recovery.importer.read_resource_repository(envelope)), 1)
        with self.assertRaisesRegex(ValueError, 'Unparsed'):
            recovery.importer.read_resource_repository(raw + bytes(17))
        with self.assertRaisesRegex(ValueError, 'Truncated'):
            recovery.importer.read_resource_repository(raw[:-1])

    def test_content_comparison_ignores_new_pack_locations_but_detects_texture_bytes(self):
        a = dict(reference='a.png', status='resolved', sha256='same', source='old/uuid')
        b = {**a, 'source': 'new/uuid'}
        self.assertEqual(recovery.content_fingerprint('config', [a]), recovery.content_fingerprint('config', [b]))
        self.assertNotEqual(recovery.content_fingerprint('config', [a]), recovery.content_fingerprint('config', [{**b, 'sha256': 'changed'}]))

    def test_delta_reports_new_changed_removed_and_newly_resolvable(self):
        def model(identity, fingerprint, missing=0):
            return dict(id=identity, fingerprint=fingerprint, missingCount=missing)
        before = dict(schema=recovery.SCHEMA, models=[model('same', 'x'), model('fixed', 'm', 1), model('gone', 'z')])
        after = dict(schema=recovery.SCHEMA, models=[model('same', 'x'), model('fixed', 'n'), model('new', 'q')])
        result = recovery.compare_models(before, after)
        self.assertEqual(result['added'], ['new'])
        self.assertEqual(result['changed'], ['fixed'])
        self.assertEqual(result['removed'], ['gone'])
        self.assertEqual(result['newlyResolvable'], ['fixed'])
        self.assertEqual(result['unchanged'], ['same'])
        with self.assertRaisesRegex(ValueError, 'Incompatible'):
            recovery.compare_models({**before, 'schema': 'other'}, after)

    def test_reused_moc_variants_are_compared_by_stable_config_asset_name(self):
        before = dict(schema=recovery.SCHEMA, models=[dict(id='body--oldhash', configName='variant_body.model3.json', fingerprint='old', missingCount=0)])
        after = dict(schema=recovery.SCHEMA, models=[dict(id='body--newhash', configName='variant_body.model3.json', fingerprint='new', missingCount=0)])
        result = recovery.compare_models(before, after)
        self.assertEqual(result['added'], [])
        self.assertEqual(result['removed'], [])
        self.assertEqual(result['changed'], ['body--newhash'])


if __name__ == '__main__':
    unittest.main()
