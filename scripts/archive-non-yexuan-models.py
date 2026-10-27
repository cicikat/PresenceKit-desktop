"""Archive non-Yexuan front-end models by character after verifying every copied byte."""
import argparse,hashlib,json,os,shutil
from pathlib import Path
from hlr_characters import classify_model,NAMES
def normalized(p):
 value=str(p.resolve())
 if value.startswith('\\\\?\\'):value=value[4:]
 return Path(value)
def hashes(p):
 result={}
 for f in p.rglob('*'):
  if f.is_symlink():raise ValueError('Symbolic link in model')
  if f.is_file():result[f.relative_to(p).as_posix()]=hashlib.sha256(f.read_bytes()).hexdigest()
 return result
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive-root',type=Path,required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
 repo=Path(__file__).resolve().parent.parent;archive=normalized(a.archive_root);models=normalized(repo/'public/live2d/models');plan=[]
 for folder in sorted(models.iterdir()):
  if not folder.is_dir():continue
  configs=list(folder.glob('*.model3.json'))
  if len(configs)!=1:raise ValueError('Ambiguous model folder '+folder.name)
  original=configs[0].name.removesuffix('.model3.json');identity=classify_model(original)
  if identity['characterIds']==['yexuan']:continue
  if 'yexuan' in identity['characterIds']:raise ValueError('Mixed-character model requires explicit review')
  owner=NAMES.get(identity['primaryCharacter'])
  if not owner:
   if folder.name not in ['hiyori_free','hiyori_pro','ren']:raise ValueError('Unknown actor '+folder.name)
   owner='示例角色-'+('hiyori' if folder.name.startswith('hiyori_') else 'ren')
  dest=archive/owner/'Live2D'/folder.name
  assert normalized(folder).parent==models and normalized(dest).is_relative_to(archive)
  plan.append(dict(folder=folder,owner=owner,dest=dest,classification=identity,hashes=hashes(folder)))
 if not a.apply:
  print(json.dumps([dict(id=x['folder'].name,character=x['owner'],files=len(x['hashes'])) for x in plan],ensure_ascii=False,indent=2));return
 archive.mkdir(parents=True,exist_ok=True);receipt=archive/'前端移出验收-20261027.json';done=[]
 for row in plan:
  folder,dest=row['folder'],row['dest'];expected=row['hashes']
  if not dest.exists():shutil.copytree(folder,dest,copy_function=shutil.copy2)
  if hashes(dest)!=expected or hashes(folder)!=expected:raise ValueError('Archive/source content changed')
  assert normalized(folder).parent==models and folder.is_dir() and not folder.is_symlink()
  # The authorized removal is confined to one verified installed model; the E archive is complete.
  shutil.rmtree(folder)
  dist=normalized(repo/'dist/live2d/models')/folder.name;dist_status='absent'
  if dist.exists():
   dist_hashes=hashes(dist)
   if dist_hashes!=expected:
    alternate=archive/row['owner']/'Live2D-旧构建'/folder.name
    if not alternate.exists():shutil.copytree(dist,alternate)
    if hashes(alternate)!=dist_hashes:raise ValueError('Old build archive differs')
   assert normalized(dist).parent==normalized(repo/'dist/live2d/models') and not dist.is_symlink()
   shutil.rmtree(dist);dist_status='verified archive then removed'
  done.append(dict(id=folder.name,character=row['owner'],destination=dest.relative_to(archive).as_posix(),files=expected,classification=row['classification'],source='public/live2d/models/'+folder.name,sourceRemoved=True,dist=dist_status))
  receipt.write_text(json.dumps(dict(status='pass',models=done),ensure_ascii=False,indent=2),encoding='utf-8');print('ARCHIVED',folder.name,row['owner'],len(expected),flush=True)
 remaining=[f.name for f in models.iterdir() if f.is_dir()]
 if any(not f.startswith('hlr_yexuan_') for f in remaining):raise ValueError('Non-Yexuan folder remains')
 print('YEXUAN_ONLY',len(remaining),flush=True)
if __name__=='__main__':main()
