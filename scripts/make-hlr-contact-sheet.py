"""Make review sheets from actual validation screenshots; does not modify model assets."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--validation',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--phase',choices=['initial','preview','face'],default='initial')
parser.add_argument('--per-page',type=int,default=12)
parser.add_argument('--models',nargs='*',help='Optional exact IDs in presentation order')
args=parser.parse_args()
args.validation=args.validation.resolve()
args.output.mkdir(parents=True,exist_ok=True)
proof=json.loads((args.validation/'validation.json').read_text(encoding='utf-8'))
models=proof['models'];sheets=[]
if args.models:
    by_id={m['id']:m for m in models};models=[by_id[identity] for identity in args.models]
for start in range(0,len(models),args.per_page):
    batch=models[start:start+args.per_page];tile_h=285 if args.phase=='face' else 405
    sheet=Image.new('RGB',(1200,tile_h*((len(batch)+3)//4)),(205,210,217));draw=ImageDraw.Draw(sheet)
    for i,item in enumerate(batch):
        stem='initial' if args.phase=='face' else args.phase
        evidence=Path(item.get('evidenceDirectory',args.validation))
        if not evidence.is_absolute(): evidence=args.validation/evidence
        source=evidence/(item['id']+'-'+stem+'.png')
        if not source.exists():source=evidence/(item['id']+'-failed.png')
        if not source.exists():continue
        im=Image.open(source).convert('RGB')
        im=im.crop((370,65,800,425)) if args.phase=='face' else im.crop((0,0,int(im.width*.78),im.height))
        im.thumbnail((295,tile_h-30));x,y=(i%4)*300,(i//4)*tile_h
        sheet.paste(im,(x+(300-im.width)//2,y+25))
        draw.text((x+4,y+5),item['id'].replace('yexuan_','').replace('_20261027','')[:47],fill='black')
    path=args.output/(args.phase+'-'+str(start//args.per_page+1).zfill(2)+'.png');sheet.save(path);sheets.append(str(path))
print(json.dumps(sheets,ensure_ascii=False))
