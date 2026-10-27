"""Safety regressions for original-atlas recovery and optional-part presentation."""
import importlib.util
from pathlib import Path
import unittest
import hashlib
import json
import tempfile
from unittest.mock import patch
from PIL import Image


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


assembly = module('assembly', 'assemble-hlr-variants.py')
atlases = module('atlases', 'propose-hlr-atlases.py')
package = module('package_reviewed', 'package-hlr-reviewed.py')


class AssemblySafety(unittest.TestCase):
    def test_shifted_doll_slot_is_not_a_fox_ear_and_native_slot11_is_not_a_doll(self):
        self.assertEqual(atlases.common_atlases([dict(id='dollleg'),dict(id='dollface')]),
            ['yexuan_doll01','yexuan_doll02'])
        self.assertIsNone(atlases.common_atlases([dict(id='dollface'),dict(id='Lball'),dict(id='yifu2')]))
        self.assertIsNone(atlases.common_atlases([dict(id='youxiuzi6'),dict(id='toufa1')]))
        self.assertTrue(atlases.eye_family([dict(id='Rlash6'),dict(id='Lball2'),dict(id='Lcloseeye2')]))
        self.assertFalse(atlases.eye_family([dict(id='Rlash6'),dict(id='shenti')]))

    def test_delivery_refuses_stale_review_browser_or_config_before_creating_output(self):
        for stale in ('review', 'browser', 'config'):
            with self.subTest(stale=stale), tempfile.TemporaryDirectory() as temp:
                root=Path(temp);snapshot=root/'snapshot';evidence=root/'evidence';runtime=snapshot/'runtime/yexuan_test'
                runtime.mkdir(parents=True);evidence.mkdir()
                config=runtime/'yexuan_test.model3.json';config.write_bytes(b'{}')
                digest=hashlib.sha256(config.read_bytes()).hexdigest()
                (runtime/'source-manifest.json').write_text(json.dumps(dict(assets=[])),encoding='utf-8')
                (snapshot/'models.json').write_text(json.dumps(dict(models=[dict(id='yexuan_test',model='yexuan_test',runtime='runtime/yexuan_test',fingerprint='fresh')])),encoding='utf-8')
                (evidence/'validation.json').write_text(json.dumps(dict(models=[dict(id='yexuan_test',fingerprint='old' if stale=='browser' else 'fresh',status='browser_pass',runtimeConfigSha256=digest)])),encoding='utf-8')
                review=root/'review.json';review.write_text(json.dumps(dict(models={'yexuan_test':dict(fingerprint='old' if stale=='review' else 'fresh')})),encoding='utf-8')
                if stale=='config': config.write_bytes(b'{"changed":true}')
                output=root/'delivery'
                with patch('sys.argv',['package','--batch',str(snapshot),str(evidence),'--review',str(review),'--parent-snapshot',str(snapshot),'--output',str(output)]):
                    with self.assertRaisesRegex(ValueError,'fingerprint mismatch|Config changed'):
                        package.main()
                self.assertFalse(output.exists())

    def test_optional_part_that_owns_real_eyes_is_never_hidden(self):
        proof = dict(parts=[dict(id='markers', opacity=1), dict(id='HZglass', opacity=1), dict(id='HZFoxear', opacity=1)],
            drawables=[dict(id='texture01', texture=1, partChain=['markers']),
                       dict(id='Lball', texture=4, partChain=['HZglass']),
                       dict(id='Lfoxear', texture=10, partChain=['HZFoxear'])])
        result = assembly.accessory_pose(proof, {4, 10})
        self.assertEqual(result['hidden'], ['HZFoxear'])
        self.assertEqual(result['anchor'], 'markers')
        for preset in result['presets']:
            self.assertNotIn('HZglass', preset['values'])

    def test_body_anchor_cannot_be_switched_off_by_accessory_preset(self):
        proof = dict(parts=[dict(id='body', opacity=1), dict(id='HZFoxear', opacity=1)],
            drawables=[dict(id='chest', texture=0, partChain=['body']),
                       dict(id='Lfoxear', texture=10, partChain=['HZFoxear'])])
        result = assembly.accessory_pose(proof, {10})
        self.assertEqual(result['anchor'], 'body')
        self.assertEqual(result['presets'], [])
        self.assertEqual(result['hidden'], ['HZFoxear'])

    def test_uv_triangles_reject_alpha_inside_bbox_but_outside_real_mesh(self):
        alpha = Image.new('L', (64, 64))
        alpha.putpixel((60, 60), 255)
        drawable = dict(uv=[0, 0, 1, 1], uvVertices=[0, 1, 1, 1, 0, 0], indices=[0, 1, 2])
        self.assertEqual(atlases.uv_score([drawable], alpha)['coverage'], 0)
        self.assertEqual(atlases.uv_score([drawable], alpha)['support'], 0)
        alpha.putpixel((5, 5), 255)
        self.assertEqual(atlases.uv_score([drawable], alpha)['coverage'], .5)


if __name__ == '__main__': unittest.main()
