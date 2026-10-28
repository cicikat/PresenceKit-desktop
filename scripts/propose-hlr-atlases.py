"""Propose original atlas bindings from source names and exact MOC UV occupancy. Requires visual review."""
import argparse
from collections import defaultdict
import importlib.util
import json
from pathlib import Path
import re
from PIL import Image, ImageChops, ImageDraw, ImageStat

spec = importlib.util.spec_from_file_location('hlr_import', Path(__file__).with_name('import-hlr-live2d.py'))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def common_atlases(meshes):
    """Recognize complete accessory drawable families, independent of texture slot number."""
    families = [(r'touguan.*', ['yexuan_head04','yexuan_head02']),
                (r'glass[0-9]+', ['yexuan_glass01']),
                (r'xiaoqieyanzhao', ['yexuan_eyemask03']),
                (r'xueren.*', ['yexuan_head03']),
                (r'[lr]horn.*', ['yexuan_head02']),
                (r'[lr]foxear.*', ['yexuan_head01']),
                (r'doll.*', ['yexuan_doll01','yexuan_doll02'])]
    for pattern, names in families:
        if meshes and all(re.fullmatch(pattern, d['id'], re.I) for d in meshes): return names
    return None


def eye_family(meshes):
    return bool(meshes) and all(re.fullmatch(r'[lr](?:light|ball|white|lash|brow|smileeye|closeeye)[0-9]*', d['id'], re.I) for d in meshes)


def requires_native_eye_review(meshes):
    # Occupied alpha can score perfectly while sampling another eyelid through the same UVs.
    # Includes shifted imperial eye slots; slot number alone cannot identify an eye binding.
    return any(re.fullmatch(r'[lr](?:ball|white|lash|smileeye|closeeye)[0-9]*', d['id'], re.I) for d in meshes)


def accept_binding_proposal(meshes, scored):
    if requires_native_eye_review(meshes):
        return False
    if [d['id'] for d in meshes] == ['yexuan_suxieben'] and scored:
        return True
    return bool(scored and scored[0]['score'] >= .95 and
                (len(scored) == 1 or scored[0]['score'] - scored[1]['score'] >= .025))


def uv_score(drawables, alpha):
    mask = Image.new('L', alpha.size)
    supported = 0
    w, h = alpha.size
    for drawable in drawables:
        a, b, c, d = drawable['uv']
        box = (max(0, int(a*w)), max(0, int((1-d)*h)), min(w, int(c*w+1)), min(h, int((1-b)*h+1)))
        if box[2] <= box[0] or box[3] <= box[1]: continue
        if 'uvVertices' in drawable and 'indices' in drawable:
            mesh = Image.new('L', alpha.size)
            mesh_pen = ImageDraw.Draw(mesh)
            uv, indices = drawable['uvVertices'], drawable['indices']
            for start in range(0, len(indices), 3):
                points = [(uv[index*2]*w, (1-uv[index*2+1])*h) for index in indices[start:start+3]]
                if len(points) == 3: mesh_pen.polygon(points, fill=255)
            mask = ImageChops.lighter(mask, mesh)
            if ImageChops.multiply(alpha, mesh).getbbox(): supported += 1
        else:
            ImageDraw.Draw(mask).rectangle(box, fill=255)
            if alpha.crop(box).getbbox(): supported += 1
    total = ImageStat.Stat(alpha).sum[0]
    coverage = ImageStat.Stat(ImageChops.multiply(alpha, mask)).sum[0] / total if total else 0
    support = supported / len(drawables) if drawables else 0
    return dict(score=round(.75*coverage+.25*support, 5), coverage=round(coverage, 5), support=round(support, 5))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--slots', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists(): raise ValueError('Fresh proposal directory required')
    args.output.mkdir(parents=True)
    models = json.loads((args.snapshot / 'models.json').read_text(encoding='utf-8'))['models']
    proofs = {m['id']: m for m in json.loads(args.slots.read_text(encoding='utf-8'))['models']}
    rows, _ = importer.load_source_rows(args.source)
    textures = defaultdict(list)
    for row in rows:
        if row.get('category') == '引擎纹理': textures[row['original_name']].append(row)
    cache = {}
    resolution = 512 if any('uvVertices' in d for p in proofs.values() for d in p['drawables']) else 128
    def alpha(name):
        if name not in cache:
            row = textures[name][0]
            im = importer.decode_texture(importer.safe_file(args.source, row['file']).read_bytes())
            cache[name] = im.getchannel('A').resize((resolution,resolution), Image.Resampling.NEAREST).point(lambda value: 255 if value > 24 else 0)
        return cache[name]
    plans, rankings = {}, []
    for item in models:
        if item['status'] != 'blocked_accessory_slots' or item['id'] not in proofs: continue
        proof = proofs[item['id']]
        grouped = defaultdict(list)
        for drawable in proof['drawables']: grouped[drawable['texture']].append(drawable)
        bindings = []
        for slot in item['repeatedTextureSlots']:
            all_mesh = grouped[slot]
            meshes = [d for d in all_mesh if not re.match(r'(?i)(texture|HitArea|mengyanbaibu|yandai)', d['id'])]
            if not meshes: continue
            ids = [d['id'] for d in all_mesh]
            candidates = []
            reason = 'Model-specific source atlas, original UV occupancy and exact drawable set; per-image visual validation required'
            if ids == ['yexuan_suxieben']:
                candidates = ['yexuan_suxieben']
            elif eye_family(meshes) or (slot == 4 and any(re.search(r'(?i)(ball|lash|white|brow)', d['id']) for d in meshes)):
                candidates = [n for n in textures if n.startswith('yexuan_eyemask') and n != 'yexuan_eyemask03'] + [n for n in textures
                    if n.startswith(item['model'] + '_') and '_'+item['model'] not in n and '_mip' not in n]
            elif common_atlases(meshes):
                candidates = common_atlases(meshes)
            else:
                prefix = item['model']
                candidates = [n for n in textures if n.startswith(prefix) and (n[len(prefix):].startswith('_') or n[len(prefix):].isdigit()) and '_'+prefix not in n]
                candidates = [n for n in candidates if not any(t in n for t in ['_mip', '_ui'])]
            scored = []
            for name in candidates:
                if len(textures[name]) != 1: continue
                try: scored.append(dict(resource=name, **uv_score(meshes, alpha(name))))
                except ValueError: continue
            scored.sort(key=lambda r: r['score'], reverse=True)
            # Low-resolution _s aliases can score slightly higher after mask downsampling;
            # retain the original 512px eye atlas when its native layout is equally supported.
            regular = next((r for r in scored if r['resource'] == 'yexuan_eyemask00'), None)
            if slot == 4 and regular and regular['support'] >= .9 and scored[0]['score'] - regular['score'] < .03:
                scored.remove(regular); scored.insert(0, regular)
            accepted = accept_binding_proposal(meshes, scored)
            rankings.append(dict(id=item['id'], slot=slot, drawables=ids, proposed=accepted, candidates=scored[:5],
                                 requiresNativeEyeReview=requires_native_eye_review(meshes)))
            if accepted:
                bindings.append(dict(slot=slot, resource=scored[0]['resource'], drawables=ids,
                    evidence=reason + '; scores=' + json.dumps(scored[:2])))
        plans[item['id']] = dict(fingerprint=item['fingerprint'], slots=bindings)
        print(item['id'], 'proposed', [(b['slot'],b['resource']) for b in bindings], flush=True)
    (args.output/'atlas-bindings.json').write_text(json.dumps(dict(schema='hlr-slot-bindings-v1',models=plans),ensure_ascii=False,indent=2),encoding='utf-8')
    (args.output/'rankings.json').write_text(json.dumps(rankings,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__': main()
