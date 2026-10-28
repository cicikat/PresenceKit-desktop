"""Apply explicitly reviewed eye bindings to front-end copies; original archives stay immutable."""
import argparse,copy,hashlib,json,os,shutil
from pathlib import Path
from PIL import Image
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def normalized(p):
 s=str(p.resolve());return Path(s[4:] if s.startswith('\\\\?\\') else s)
def safe(parent,relative):
 p=Path(relative)
 if p.is_absolute() or '..' in p.parts or ':' in relative:raise ValueError('Unsafe model-relative path')
 result=normalized(parent/p)
 if not result.is_relative_to(normalized(parent)):raise ValueError('Path escapes model')
 return result
def hashes(p):return {f.relative_to(p).as_posix():sha(f) for f in p.rglob('*') if f.is_file()}
def atomic_json(p,value):
 tmp=p.with_name(p.name+'.eye-review.tmp');tmp.write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').replace('\n','\r\n').encode('utf-8'));os.replace(tmp,p)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--review',type=Path,required=True);p.add_argument('--reviewed-models',nargs='+',required=True);p.add_argument('--backup',type=Path,required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
 repo=Path(__file__).resolve().parent.parent;models=normalized(repo/'public/live2d/models');review=read(a.review/'review.json');by_id={r['id']:r for r in review};plan_meta=read(a.review/'plan.json');target_info=plan_meta['targetAtlas'];atlas=safe(a.archive,target_info['file'])
 if target_info['name']!='yexuan_eyemask00' or sha(atlas)!=target_info['sha256']:raise ValueError('Reviewed original atlas changed')
 expected_pixels=Image.open(atlas).convert('RGBA').tobytes();template=None
 for folder in models.iterdir():
  if not folder.is_dir():continue
  for entry in read(folder/'source-manifest.json')['assets']:
   if entry.get('resourceName')=='yexuan_eyemask00' and Image.open(safe(folder,entry['file'])).convert('RGBA').tobytes()==expected_pixels:template=entry;break
  if template:break
 if not template:raise ValueError('No matching original decoded atlas provenance')
 plans=[]
 for identity in dict.fromkeys(a.reviewed_models):
  if not identity.startswith('hlr_yexuan_') or Path(identity).name!=identity:raise ValueError('Not a reviewed Yexuan ID')
  proof=by_id[identity];folder=safe(models,identity);config=folder/proof['config'];data=read(config);manifest=read(folder/'source-manifest.json')
  if proof['status']!='pass' or not proof.get('reload') or not proof.get('expressionCaptures'):raise ValueError('Missing full candidate review')
  if sha(config)!=proof['configSha256'] or sha(safe(folder,data['FileReferences']['Moc']))!=proof['mocSha256']:raise ValueError('Installed model changed since candidate review')
  for binding in proof['bindings']:
   if data['FileReferences']['Textures'][binding['slot']]!=binding['file'] or sha(safe(folder,binding['file']))!=binding['source']['outputSha256']:raise ValueError('Eye binding no longer matches review')
   if binding['source'].get('resourceName')!='yexuan_eyemask06':raise ValueError('Unexpected source eye atlas')
  if not proof['bindings']:raise ValueError('No reviewed replacement')
  plans.append(dict(id=identity,folder=folder,config=config,data=data,manifest=manifest,proof=proof,hashes=hashes(folder)))
 print('PLAN',len(plans),'explicitly reviewed original atlas replacements',flush=True)
 if not a.apply:return
 backup=normalized(a.backup)
 if backup.is_relative_to(models) or backup.exists():raise ValueError('Backup must be fresh and outside installed models')
 backup.mkdir(parents=True);receipt=[]
 for plan in plans:
  target=backup/plan['id'];shutil.copytree(plan['folder'],target)
  if hashes(target)!=plan['hashes']:raise ValueError('Backup differs from installed original')
 for plan in plans:
  folder,data,manifest,proof=plan['folder'],plan['data'],plan['manifest'],plan['proof'];changes=[]
  if hashes(folder)!=plan['hashes']:raise ValueError('Installed model changed during backup')
  for binding in proof['bindings']:
   slot=binding['slot'];relative='_restored/slot_'+str(slot).zfill(2)+'_eye_review_20261028.png';target=safe(folder,relative)
   if target.exists():raise ValueError('Refuse overwriting an existing repair')
   target.parent.mkdir(exist_ok=True);shutil.copy2(atlas,target);assert sha(target)==target_info['sha256'];data['FileReferences']['Textures'][slot]=relative
   for entry in manifest['assets']:
    if entry['file']==binding['file']:entry.update(active=False,supersededBy=relative)
   entry=copy.deepcopy(template);entry.update(file=relative,slot=slot,outputSha256=target_info['sha256'],active=True,resourceName='yexuan_eyemask00',decodedOriginalFile=target_info['file'],decodedOriginalSha256=target_info['sha256'],operation='Reviewed native eye UV and open/half/closed/expression comparison; copy original decoded atlas, no synthesized pixels')
   geometry=read(a.review/(plan['id']+'-geometry.json'));entry['drawableIds']=[d['id'] for d in geometry['drawables'] if d['slot']==slot];manifest['assets'].append(entry);changes.append(dict(slot=slot,old=binding['file'],new=relative,oldSha256=binding['source']['outputSha256'],newSha256=target_info['sha256']))
  atomic_json(plan['config'],data);manifest.update(runtimeConfigSha256=sha(plan['config']),eyeBindingReview=dict(revision='20261028',changes=changes,sourceMocSha256=proof['mocSha256'],reason='Original eyemask06 introduced duplicate eyelid bands; compatible original eyemask00 verified per MOC and native expression'))
  atomic_json(folder/'source-manifest.json',manifest)
  after=hashes(folder);allowed={plan['config'].name,'source-manifest.json',*[c['new'] for c in changes]}
  if any(after.get(f)!=h for f,h in plan['hashes'].items() if f not in allowed):raise ValueError('Unexpected asset modification')
  assert sha(safe(folder,data['FileReferences']['Moc']))==proof['mocSha256']
  receipt.append(dict(id=plan['id'],changes=changes,beforeHashes=plan['hashes'],afterHashes=after,mocUnchanged=True));atomic_json(backup/'repair-receipt.json',dict(status='applied; installed browser verification pending',models=receipt));print('REPAIRED',plan['id'],flush=True)
if __name__=='__main__':main()
