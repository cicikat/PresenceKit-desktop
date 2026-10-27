"""Capture real production-stage face/eye evidence for installed models, without changing assets."""
import argparse,json,shutil,re
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--models',nargs='*');p.add_argument('--base-url',default='http://localhost:1420');p.add_argument('--closeup',action='store_true');p.add_argument('--poses',action='store_true',help='Capture explicit native open/closed eyes at parameter endpoints');a=p.parse_args()
repo=Path(__file__).resolve().parent.parent;out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
fixture=repo/'.tmp/hlr-eye-review';fixture.mkdir(exist_ok=True)
text=(repo/'scripts/fixtures/live2d-import.tsx').read_text(encoding='utf-8').replace("'../src/","'../../src/")
(fixture/'stage.tsx').write_text(text,encoding='utf-8');(fixture/'index.html').write_text('<div id="root"></div><script type="module" src="./stage.tsx"></script>',encoding='utf-8')
models=[d for d in sorted((repo/'public/live2d/models').iterdir()) if d.is_dir() and (d.name in a.models if a.models else d.name.startswith('hlr_yexuan'))];results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for folder in models:
  config=next(folder.glob('*.model3.json'));page=browser.new_page(viewport={'width':1000,'height':900},device_scale_factor=3 if a.closeup else 1);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('window.fixtureModelDir='+json.dumps(folder.name)+';window.fixtureJson='+json.dumps(config.name)+''';window.__TAURI_INTERNALS__={invoke:async cmd=>cmd==='list_live2d_models'?[{dirName:window.fixtureModelDir,modelJson:window.fixtureJson}]:cmd==='load_ui_prefs'?'{}':null,transformCallback:()=>0,metadata:{currentWindow:{label:'fixture'}}};''')
  row=dict(id=folder.name,config=config.name)
  try:
   page.goto(a.base_url+'/.tmp/hlr-eye-review/index.html');page.wait_for_function('window.controls?.()&&window.audit.frames>15',timeout=45000)
   page.evaluate('''async()=>{const s=await import('/src/shared/live2d/live2dSettings.ts');s.patchLive2DSettings({bgKind:'color',bgColor:'#cbd0d7'});}''');page.wait_for_timeout(180)
   page.screenshot(path=str(out/(folder.name+'.png')))
   if a.closeup:
    clip=page.evaluate('''()=>{const m=window.auditModel,i=m.internalModel,d=i.coreModel.getModel().drawables;let ids=Array.from(d.ids).map((id,k)=>({id,k})).filter(x=>/^[LR](ball|white)$/.test(x.id));if(!ids.length)ids=Array.from(d.ids).map((id,k)=>({id,k})).filter(x=>/^[LR]lash1$/.test(x.id));if(!ids.length)return null;const points=[];for(const {k} of ids){const b=i.getDrawableBounds(k);for(const p of [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}])points.push(m.toGlobal(i.localTransform.apply(p)))}let x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),w=Math.max(...points.map(p=>p.x))-x,h=Math.max(...points.map(p=>p.y))-y;const pad=w*.35;x=Math.max(0,x-pad);y=Math.max(0,y-pad);return {x,y,width:Math.min(w+pad*2,780-x),height:Math.min(h+pad*2,900-y)}}''')
    if clip and clip['width']>0 and clip['height']>0:
     page.screenshot(path=str(out/(folder.name+'-face.png')),clip=clip)
     if a.poses:
      page.evaluate('''()=>{window.forceEyeOpen=1;window.auditModel.internalModel.on('beforeModelUpdate',()=>{const c=window.auditModel.internalModel.coreModel;for(const id of ['ParamEyeLOpen','ParamEyeROpen'])c.setParameterValueById(id,window.forceEyeOpen)})}''')
      for label,value in [('open',1),('closed',0),('half',.5)]:
       page.evaluate('v=>window.forceEyeOpen=v',value);page.wait_for_timeout(150);page.screenshot(path=str(out/(folder.name+'-'+label+'.png')),clip=clip)
   data=page.evaluate('''()=>{const c=window.auditModel.internalModel.coreModel,m=c.getModel(),d=m.drawables;return {parameters:Array.from(m.parameters.ids,(id,i)=>({id,value:m.parameters.values[i],default:m.parameters.defaultValues[i],min:m.parameters.minimumValues[i],max:m.parameters.maximumValues[i]})),parts:Array.from(m.parts.ids,(id,i)=>({id,opacity:m.parts.opacities[i]})),eyes:Array.from(d.ids,(id,i)=>({id,texture:d.textureIndices[i],opacity:d.opacities[i],renderOpacity:c.getDrawableOpacity(i),masks:Array.from(d.masks[i]||[]),part:d.parentPartIndices?.[i],uv:Array.from(d.vertexUvs[i])})).filter(x=>/eye|yan|mei/i.test(x.id))}}''')
   row.update(status='rendered',**data,errors=errors)
  except Exception as e:row.update(status='failed',error=str(e),errors=errors)
  finally:page.close()
  results.append(row);(out/'audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(row['id'],row['status'],flush=True)
 browser.close()
passed=[r for r in results if r['status']=='rendered']
for start in range(0,len(passed),16):
 batch=passed[start:start+16];sheet=Image.new('RGB',(1400,270*((len(batch)+3)//4)),'#cbd0d7');draw=ImageDraw.Draw(sheet)
 for i,r in enumerate(batch):
  face=out/(r['id']+'-face.png');im=Image.open(face) if face.exists() else Image.open(out/(r['id']+'.png')).crop((310,20,780,420));im.thumbnail((345,240));x,y=i%4*350,i//4*270;sheet.paste(im,(x,y+28));draw.text((x+2,y+5),r['id'].replace('hlr_yexuan_','')[:43],fill='black')
 sheet.save(out/('faces-'+str(start//16+1).zfill(2)+'.png'))
print('AUDIT_COMPLETE',len(results),len(passed),flush=True)
