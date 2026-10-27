"""Assemble inspected atlases and explicit accessory pose presets without changing original MOCs or motions."""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
from hlr_characters import character_catalog

spec = importlib.util.spec_from_file_location('reviewed', Path(__file__).with_name('recover-hlr-reviewed-slots.py'))
reviewed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewed)
importer = reviewed.importer


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def accessory_pose(proof, bound_slots):
    labels = {'hztouguan':'冠饰','hzglass':'眼罩眼镜','hzxueren':'雪人','hzemojiao':'角饰','hzfoxear':'狐耳','hzdoll':'娃娃',
              'glass':'眼罩眼镜','xueren':'雪人','emojiao':'角饰'}
    hidden = [p['id'] for p in proof['parts'] if p['id'].lower() in labels]
    # Never hide an ancestor of native eyes merely because its name resembles an accessory.
    eyes = [d for d in proof['drawables'] if d['texture']==4 and re.search(r'(?i)(ball|lash|white|brow|eye)', d['id']) and not re.match(r'(?i)(mengyanbaibu|yandai)', d['id'])]
    hidden = [part for part in hidden if not any(part in d['partChain'] for d in eyes)]
    if not hidden: return None
    marker_parts = []
    for part in proof['parts']:
        meshes = [d for d in proof['drawables'] if part['id'] in d['partChain']]
        if meshes and all(re.match(r'(?i)(texture\d+|HitArea)', d['id']) for d in meshes):
            marker_parts.append(part['id'])
    anchor = next((p for p in marker_parts if p not in hidden), None)
    presets = []
    if anchor:
        ids = [anchor, *hidden]
        presets.append(dict(name='装配_无配饰', values={part:1 if part==anchor else 0 for part in ids}))
        for part in hidden:
            meshes = [d for d in proof['drawables'] if part in d['partChain']]
            if not any(d['texture'] in bound_slots for d in meshes): continue
            names = ['装配_眼镜','装配_眼罩'] if part.lower() in ('hzglass','glass') else ['装配_'+labels[part.lower()]]
            for name in names:
                presets.append(dict(name=name, values={p:1 if p==part else 0 for p in ids}))
    else:
        # A native body anchor may establish defaults but must never be switched off by a preset.
        anchor = next((p['id'] for p in proof['parts'] if p['id'] not in hidden and p['opacity'] > .99), None)
    if not anchor: return None
    pose = dict(Type='Live2D Pose', Version=3, FadeInTime=.15, Groups=[[dict(Id=anchor), *[dict(Id=p) for p in hidden]]])
    return dict(pose=pose, presets=presets, anchor=anchor, hidden=hidden,
                evidence='Original optional part IDs and ancestry; marker-only anchor enables mutually exclusive static accessory previews. No authored motion curves changed.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--snapshot',type=Path,required=True)
    parser.add_argument('--slots',type=Path,required=True)
    parser.add_argument('--bindings',type=Path,required=True)
    parser.add_argument('--candidates',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--suffix',default='_20261027')
    parser.add_argument('--models',nargs='*')
    args=parser.parse_args()
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
    state={key:hashlib.sha256(path.read_bytes()).hexdigest() for key,path in [('snapshot',args.snapshot/'models.json'),('slots',args.slots),('bindings',args.bindings)]}
    state['suffix']=args.suffix
    state_path=output/'assembly-state.json'
    if state_path.exists() and json.loads(state_path.read_text(encoding='utf-8'))!=state:
        raise ValueError('Assembly inputs changed; use a fresh output snapshot')
    write(state_path,state)
    audit=json.loads((args.snapshot/'models.json').read_text(encoding='utf-8'))
    slots={m['id']:m for m in json.loads(args.slots.read_text(encoding='utf-8'))['models']}
    plans=json.loads(args.bindings.read_text(encoding='utf-8'))['models']
    rows,_=importer.load_source_rows(args.source)
    existing=json.loads((output/'models.json').read_text(encoding='utf-8'))['models'] if (output/'models.json').exists() else []
    done={m['sourceModelId']:m for m in existing}
    for original in audit['models']:
        identity=original['id']
        if identity in done or identity not in plans or (args.models and identity not in args.models): continue
        source_runtime=importer.safe_file(args.candidates,'runtime/'+identity+args.suffix)
        manifest_file=source_runtime/'source-manifest.json'
        if not manifest_file.is_file(): continue
        try: manifest=json.loads(manifest_file.read_text(encoding='utf-8'))
        except json.JSONDecodeError: continue  # A producer may still be finishing this candidate.
        if 'slotReview' not in manifest: continue
        proof=slots[identity];plan=plans[identity]
        if proof['fingerprint']!=original['fingerprint'] or plan['fingerprint']!=original['fingerprint']:
            raise ValueError('Stale MOC or binding proposal')
        item=copy.deepcopy(original);item.update(sourceModelId=identity,sourceFingerprint=original['fingerprint'],id=identity+args.suffix,runtime='runtime/'+identity+args.suffix)
        runtime=importer.safe_file(output,item['runtime'])
        if runtime.exists(): raise ValueError('Unfinished assembled candidate preserved: '+str(runtime))
        runtime.mkdir(parents=True)
        for origin in source_runtime.rglob('*'):
            if not origin.is_file(): continue
            relative=origin.relative_to(source_runtime).as_posix();target=importer.safe_file(runtime,relative);target.parent.mkdir(parents=True,exist_ok=True)
            if relative=='source-manifest.json' or relative.endswith('.model3.json') or relative.startswith('_restored/'):
                shutil.copy2(origin,target)
            else: os.link(origin,target)
        config_path=runtime/(item['model']+'.model3.json')
        config=json.loads(config_path.read_text(encoding='utf-8'))
        original_expression_count=len(config['FileReferences'].get('Expressions',[]))
        reviewed.bind_slots(runtime,manifest,config,item,proof,plan['slots'],rows,args.source)
        bound={entry['slot'] for entry in manifest['assets'] if 'slot' in entry}
        pose=accessory_pose(proof,bound)
        if pose and not config['FileReferences'].get('Pose'):
            relative='_assembled/accessory.pose3.json';write(runtime/relative,pose['pose']);config['FileReferences']['Pose']=relative
            generated=[relative]
            for number,preset in enumerate(pose['presets']):
                ref=f'_assembled/accessory_{number:02d}.exp3.json'
                expression=dict(Type='Live2D Expression',FadeInTime=0,FadeOutTime=0,Parameters=[dict(Id=key,Value=value,Blend='Overwrite') for key,value in preset['values'].items()])
                write(runtime/ref,expression)
                name=preset['name']+'.exp3.json';config['FileReferences'].setdefault('Expressions',[]).append(dict(Name=name,File=ref))
                config['EmeraldProfile']['expressionParameters'][name]=list(preset['values'])
                generated.append(ref)
            glasses=[d['id'] for d in proof['drawables'] if re.fullmatch(r'(?i)glass[0-9]+',d['id'])]
            mask=[d['id'] for d in proof['drawables'] if d['id']=='xiaoqieyanzhao']
            unsupported_mask=[d['id'] for d in proof['drawables'] if re.fullmatch(r'(?i)(mengyanbaibu|yandai[0-9]+)',d['id'])]
            default_hidden=glasses+mask+unsupported_mask
            expression_masks={preset['name']+'.exp3.json':default_hidden for preset in pose['presets']}
            expression_masks.update({'装配_眼镜.exp3.json':mask+unsupported_mask,'装配_眼罩.exp3.json':glasses+unsupported_mask})
            config['EmeraldProfile']['drawableVisibility']=dict(defaultHidden=default_hidden,byExpression=expression_masks)
            manifest['accessoryAssembly']=pose
            for ref in generated:
                manifest['assets'].append(dict(file=ref,source='reviewed original MOC part hierarchy',sourceSha256=proof['mocSha256'],
                    outputSha256=hashlib.sha256((runtime/ref).read_bytes()).hexdigest(),operation='Explicit local accessory visibility preset; not an original game motion',resourceName='assembled accessory visibility'))
        write(config_path,config)
        manifest['runtimeConfigSha256']=hashlib.sha256(config_path.read_bytes()).hexdigest()
        manifest['variant']='assembled original atlases; unresolved slots listed explicitly'
        manifest['assemblyBindingsSha256']=state['bindings']
        write(runtime/'source-manifest.json',manifest)
        item['fingerprint']=hashlib.sha256(json.dumps([original['fingerprint'],manifest['runtimeConfigSha256'],
            sorted((a['file'],a['outputSha256']) for a in manifest['assets'])],sort_keys=True).encode()).hexdigest()
        item.update(status='candidate_runtime',variant=manifest['variant'],restoredSlots=sorted(bound),
                    unresolvedSlots=[o['slot'] for o in manifest['omittedTextureSlots']],originalExpressions=original_expression_count)
        done[identity]=item
        write(output/'models.json',dict(schema=audit['schema'],models=list(done.values()),boundary='Real source geometry/atlas assembly. Browser and visual review still required. Local accessory presets are separate from original expressions.'))
        print('ASSEMBLED',item['id'],'atlases',len(bound),'presets',len(pose['presets']) if pose else 0,flush=True)
    write(output/'character-catalog.json',character_catalog(list(done.values())))
    print('ASSEMBLY_TOTAL',len(done),flush=True)


if __name__=='__main__': main()
