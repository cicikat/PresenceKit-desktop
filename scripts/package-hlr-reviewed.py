"""Package explicitly reviewed final candidates, with a browsable gallery and hash-bound evidence."""
import argparse
from collections import Counter
import copy
import hashlib
from html import escape
import json
import os
from pathlib import Path
import re
from urllib.parse import quote
from hlr_characters import character_catalog


def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path, value): path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def gallery_html(models):
    order={'人物模型':0,'Q版头部':1,'动态卡面/场景层':2,'局部附属件':3}
    labels={'yexuan_bingfeng':'冰峰','yexuan_xiaoshanhai':'小山海','yexuan_5thanv':'五周年',
        'yexuan_23birthday':'2023生日','yexuan_magic':'魔法师','yexuan_kongbu':'恐怖主题',
        'yexuan_baiqing24':'白情2024','yexuan_qixi24':'七夕2024','yexuan_mingyun':'命运',
        'yexuan_wenquan':'温泉','yexuan_wenquan2':'温泉2','yexuan_shenqi':'神祇','yexuan_younian':'幼年',
        'yexuan_nienie':'捏捏','yexuan_nienie2026':'捏捏2026'}
    tiles=[]
    for item in sorted(models,key=lambda m:(order.get(m['visualReview']['category'],9),m['id'])):
        review=item['visualReview'];key=item.get('sourceModelId',item['id']).split('--')[0]
        title=labels.get(key,item['id'].removeprefix('yexuan_').removesuffix('_20261027'))
        href=quote('evidence/'+item['id']+'-initial.png',safe='/')
        tiles.append('<article data-category="'+escape(review['category'],quote=True)+'"><a href="'+href+'"><img loading="lazy" src="'+href+'"></a><h3>叶瑄 · '+escape(title)+'</h3><small>'+escape(item['id'])+'</small><p>'+escape(review['category']+' · '+review['status'])+'</p><p>'+escape(review['reason'])+'</p></article>')
    counts=Counter(m['visualReview']['category'] for m in models)
    header='；'.join(k+' '+str(v) for k,v in counts.items())
    return '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>叶瑄 Live2D 恢复总览</title>
<style>body{font:16px system-ui;background:#eef0f3;color:#18202b;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}article{background:white;padding:12px;border-radius:12px}img{width:100%;height:350px;object-fit:contain;background:#cbd0d7}h3{font-size:17px;margin-bottom:6px}small{font-size:11px;overflow-wrap:anywhere}p{line-height:1.5}input{font:inherit;padding:10px;width:70%;margin:16px 0}button{font:inherit;padding:8px 14px;margin:4px;cursor:pointer}</style>
<h1>叶瑄 Live2D 恢复总览</h1><p>'''+escape(header)+'''</p><p>默认显示人物模型与Q版。按配置统计，含更新版和原作截幅。可选游戏换装与卡面合成仍有 partial；点图查看实际 Core/Pixi 证据。展示名按源命名简写。</p>
<nav><button onclick="showGroup('人物')">人物</button><button onclick="showGroup('动态卡面/场景层')">卡面与场景层</button><button onclick="showGroup('局部附属件')">局部附属件</button><button onclick="showGroup('全部')">全部</button></nav>
<input id="search" placeholder="搜索名称、类别或状态" oninput="refresh()"><main>'''+''.join(tiles)+'''</main>
<script>let group='人物';function showGroup(value){group=value;refresh()}function refresh(){const q=document.querySelector('#search').value.toLowerCase();document.querySelectorAll('article').forEach(x=>{const c=x.dataset.category;const match=group==='全部'||(group==='人物'?(c==='人物模型'||c==='Q版头部'):c===group);x.hidden=!match||!x.textContent.toLowerCase().includes(q)})}refresh()</script></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', nargs=2, action='append', required=True, metavar=('SNAPSHOT', 'VALIDATION'))
    parser.add_argument('--review', type=Path, required=True, help='Explicit decisions keyed by exact final ID: fingerprint, category, status, reason')
    parser.add_argument('--parent-snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    out = args.output.resolve()
    if out.exists(): raise ValueError('Fresh delivery directory required')
    choices = {}
    for snapshot_arg, validation_arg in args.batch:
        snapshot, validation = Path(snapshot_arg).resolve(), Path(validation_arg).resolve()
        proofs = {m['id']:m for m in read(validation/'validation.json')['models']}
        for item in read(snapshot/'models.json')['models']:
            if item['id'] in proofs: choices[item['id']] = (snapshot, validation, item, proofs[item['id']])
    decisions = read(args.review)['models']
    plan = []
    for identity, (snapshot, evidence, item, proof) in choices.items():
        if Path(identity).name != identity or any(c in identity for c in '/\\:'):
            raise ValueError('Invalid model ID')
        decision = decisions[identity]
        if decision['fingerprint'] != item['fingerprint'] or proof['fingerprint'] != item['fingerprint']:
            raise ValueError('Review/candidate/evidence fingerprint mismatch: '+identity)
        if proof['status'] != 'browser_pass': raise ValueError('Unresolved browser failure: '+identity)
        runtime = (snapshot/item['runtime']).resolve()
        if not runtime.is_relative_to(snapshot): raise ValueError('Runtime escapes snapshot')
        manifest = read(runtime/'source-manifest.json')
        config = runtime/(item['model']+'.model3.json')
        if not config.resolve().is_relative_to(runtime): raise ValueError('Config escapes runtime')
        if hashlib.sha256(config.read_bytes()).hexdigest() != proof['runtimeConfigSha256']:
            raise ValueError('Config changed since browser validation: '+identity)
        for asset in manifest['assets']:
            path = (runtime/asset['file']).resolve()
            if not path.is_relative_to(runtime) or hashlib.sha256(path.read_bytes()).hexdigest() != asset['outputSha256']:
                raise ValueError('Asset changed since conversion: '+identity)
        if any(path.is_symlink() or not path.resolve().is_relative_to(runtime) for path in runtime.rglob('*')):
            raise ValueError('Runtime contains a link outside the immutable candidate tree')
        plan.append((runtime, evidence, item, proof, decision))
    out.mkdir(parents=True)
    (out/'evidence').mkdir()
    (out/'source-audit').mkdir()
    for name in ('models.json','model-diff.json','character-catalog.json'):
        source=args.parent_snapshot/name
        if source.exists(): (out/'source-audit'/name).write_bytes(source.read_bytes())
    models, proofs = [], []
    for runtime, evidence, original, proof, decision in plan:
        item = copy.deepcopy(original)
        target = out/'runtime'/item['id']; target.mkdir(parents=True)
        for path in runtime.rglob('*'):
            if path.is_file():
                destination=target/path.relative_to(runtime);destination.parent.mkdir(parents=True,exist_ok=True)
                if path.name=='source-manifest.json':
                    manifest=read(path)
                    config=read(runtime/(item['model']+'.model3.json'))
                    manifest['deliveryReview']=dict(parentManifestSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        decision=decision, unsupportedOverlayDrawables=[name for name in config.get('EmeraldProfile',{}).get('drawableVisibility',{}).get('defaultHidden',[])
                            if re.fullmatch(r'(?i)(mengyanbaibu|yandai[0-9]+)',name)],
                        boundary='Original MOC, curves, pixels and tested config unchanged. Optional overlays/wardrobe and full card composition remain partial where listed.')
                    for asset in manifest['assets']:
                        if asset.get('operation')=='LZ4 + ETC2 RGBA8 -> PNG':
                            asset['previousOperationLabel']=asset['operation']
                            asset['operation']='Validated Messiah texture -> original-size PNG'
                    write(destination,manifest)
                else: os.link(path,destination)
        item.update(runtime=target.relative_to(out).as_posix(), visualReview=decision,
                    status='candidate_runtime' if decision['status']=='visual_pass' else 'visual_failed')
        models.append(item)
        screenshots=[]
        image_names=[item['id']+'-initial.png',item['id']+'-preview.png']+[p['file'] for p in proof.get('accessoryPreviews',[])]
        for name in image_names:
            if Path(name).name!=name or any(c in name for c in '/\\:'): raise ValueError('Invalid evidence image name')
            source=evidence/name;destination=out/'evidence'/name
            os.link(source,destination)
            screenshots.append(dict(file='evidence/'+name,sha256=hashlib.sha256(destination.read_bytes()).hexdigest()))
        proofs.append(dict(proof,evidenceDirectory='evidence',sourceEvidenceDirectory=str(evidence),screenshots=screenshots,
            originalExpressions=decision.get('originalExpressions'),localAssemblyPresets=decision.get('localAssemblyPresets')))
    write(out/'models.json',dict(schema='hlr-recovery-v1',models=models,
        parentSnapshotSha256=hashlib.sha256((args.parent_snapshot/'models.json').read_bytes()).hexdigest()))
    write(out/'character-catalog.json',character_catalog(models))
    write(out/'validation.json',dict(schema='hlr-browser-v1',models=proofs,
        boundary='Individual original browser evidence directories retained. Native Tauri/GPU/TTS remains observe.'))
    write(out/'visual-review.json',dict(schema='hlr-visual-review-v1',models=decisions))
    parent=read(args.parent_snapshot/'models.json')
    source_ids={m.get('sourceModelId',m['id']) for m in models}
    write(out/'blocked-configs.json',dict(models=[m for m in parent['models'] if m['id'] not in source_ids]))
    counts=Counter(m['visualReview']['category'] for m in models)
    (out/'模型总览.html').write_text(gallery_html(models),encoding='utf-8')
    print(json.dumps(dict(models=len(models),categories=counts),ensure_ascii=True))


if __name__=='__main__': main()
