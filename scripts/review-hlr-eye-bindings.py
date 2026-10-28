"""Compare original eye atlases through the production stage; candidates never modify installed assets."""
import argparse,hashlib,json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--models',nargs='*');p.add_argument('--phase',choices=['before','candidate','installed'],default='candidate');p.add_argument('--expressions',action='store_true');p.add_argument('--reveal-part',nargs='*',default=[],help='Forensic fixture only: hide a verified non-eye ancestor accessory to inspect occluded native eyes');a=p.parse_args()
 repo=Path(__file__).resolve().parent.parent;out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
 images=read(a.archive/'图片索引.json');image=next(r for r in images if r['name']=='yexuan_eyemask00');atlas=a.archive/image['file'];assert sha(atlas)==image['sha256']
 fixture=repo/'.tmp/hlr-eye-binding-review-v3';fixture.mkdir(exist_ok=True)
 text=(repo/'scripts/fixtures/live2d-import.tsx').read_text(encoding='utf-8').replace("'../src/","'../../src/")
 # A forensic fixture needs deterministic endpoint frames, not an unbounded software-GPU render loop.
 # Cap rendering without changing production stage code or native parameter update ownership.
 throttle="""import * as AuditPIXI from 'pixi.js';
const auditRender=AuditPIXI.Application.prototype.render;
const auditRenderTimes=new WeakMap();
AuditPIXI.Application.prototype.render=function(){const t=performance.now();if(t-(auditRenderTimes.get(this)||0)<90)return;auditRenderTimes.set(this,t);return auditRender.call(this)};
AuditPIXI.Ticker.shared.maxFPS=20;
"""
 text=throttle+text
 for file,content in [('stage.tsx',text),('index.html','<div id="root"></div><script type="module" src="./stage.tsx"></script>')]:
  target=fixture/file
  if not target.exists() or target.read_text(encoding='utf-8')!=content:target.write_text(content,encoding='utf-8')
 plan=[]
 for folder in sorted((repo/'public/live2d/models').iterdir()):
  if not folder.is_dir() or not folder.name.startswith('hlr_yexuan_') or (a.models and folder.name not in a.models):continue
  config=next(folder.glob('*.model3.json'));data=read(config);manifest=read(folder/'source-manifest.json');assets={x['file']:x for x in manifest['assets']}
  selected=[dict(slot=i,file=f,source=assets.get(f,{})) for i,f in enumerate(data['FileReferences']['Textures']) if assets.get(f,{}).get('resourceName')=='yexuan_eyemask06']
  if not selected and not a.models:continue
  plan.append(dict(id=folder.name,config=config.name,configSha256=sha(config),mocSha256=sha(folder/data['FileReferences']['Moc']),bindings=selected))
 write=lambda p,d:p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
 if not plan:raise ValueError('No models selected; installed verification requires explicit --models')
 write(out/'plan.json',dict(phase=a.phase,targetAtlas=image,models=plan));results=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  for item in plan:
   folder=repo/'public/live2d/models'/item['id'];page=browser.new_page(viewport={'width':1000,'height':900},device_scale_factor=1);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));result=dict(item,status='failed',phase=a.phase,fixtureOnlyHiddenParts=a.reveal_part)
   if a.phase=='candidate':
    for binding in item['bindings']:page.route('**/live2d/models/'+item['id']+'/'+binding['file'],lambda route:route.fulfill(path=str(atlas)))
   page.add_init_script('window.fixtureModelDir='+json.dumps(item['id'])+';window.__TAURI_INTERNALS__={invoke:async cmd=>cmd==="list_live2d_models"?[{dirName:window.fixtureModelDir,modelJson:'+json.dumps(item['config'])+'}]:cmd==="load_ui_prefs"?"{}":null,transformCallback:()=>0,metadata:{currentWindow:{label:"fixture"}}};')
   try:
    page.goto('http://localhost:1420/.tmp/hlr-eye-binding-review-v3/index.html');page.wait_for_function('window.controls?.()&&window.audit.frames>15',timeout=45000)
    # The runtime restores saved parameters immediately after Core.update(). Observe the actual
    # submitted values at that boundary, rather than mistaking restored idle values for draw values.
    page.evaluate('''()=>{const c=window.auditModel.internalModel.coreModel,update=c.update;c.update=function(){window.eyeAtCoreUpdate={pose:window.forcedEyes,actual:['ParamEyeLOpen','ParamEyeROpen'].map(n=>c.getParameterValueById(n))};return update.call(this)}}''')
    if a.reveal_part:
     page.evaluate(r'''names=>{const i=window.auditModel.internalModel,m=i.coreModel.getModel(),p=m.parts,d=m.drawables;const hidden=names.map(n=>{const k=Array.from(p.ids).indexOf(n);if(k<0)throw Error('Unknown fixture part '+n);return k});for(let k=0;k<d.count;k++){if(!/^[LR](ball|white|lash|smileeye|closeeye)/i.test(d.ids[k]))continue;let parent=d.parentPartIndices[k];const seen=new Set();while(parent>=0&&!seen.has(parent)){if(hidden.includes(parent))throw Error('Accessory is a native eye ancestor');seen.add(parent);parent=p.parentIndices[parent]}}i.on('beforeModelUpdate',()=>{for(const k of hidden)p.opacities[k]=0})}''',a.reveal_part)
    page.evaluate(r'''()=>{const m=window.auditModel,i=m.internalModel,d=i.coreModel.getModel().drawables;const kk=Array.from(d.ids).map((id,k)=>({id,k})).filter(x=>/^[LR](ball\d*|white\d*)$/i.test(x.id)&&d.opacities[x.k]>.01);const pp=[];for(const {k} of kk){const b=i.getDrawableBounds(k);pp.push(i.localTransform.apply({x:b.x,y:b.y}),i.localTransform.apply({x:b.x+b.width,y:b.y+b.height}))}const anchor=pp.length?{x:(Math.min(...pp.map(p=>p.x))+Math.max(...pp.map(p=>p.x)))/2,y:(Math.min(...pp.map(p=>p.y))+Math.max(...pp.map(p=>p.y)))/2}:{x:m.pivot.x,y:m.pivot.y-i.height*.3};const scale={x:m.scale.x*3,y:m.scale.y*3};window.forcedEyes=1;i.on('beforeModelUpdate',()=>{m.scale.set(scale.x,scale.y);m.position.set(390-(anchor.x-m.pivot.x)*scale.x,230-(anchor.y-m.pivot.y)*scale.y);if(window.forcedEyes===null)return;for(const id of ['ParamEyeLOpen','ParamEyeROpen'])i.coreModel.setParameterValueById(id,window.forcedEyes)})}''');page.wait_for_timeout(120)
    clip=page.evaluate(r'''()=>{const m=window.auditModel,i=m.internalModel,d=i.coreModel.getModel().drawables;let ids=Array.from(d.ids).map((id,k)=>({id,k})).filter(x=>/^[LR](ball\d*|white\d*)$/i.test(x.id)&&d.opacities[x.k]>.01);if(!ids.length)ids=Array.from(d.ids).map((id,k)=>({id,k})).filter(x=>/^[LR]lash1$/i.test(x.id));const pp=[];for(const {k} of ids){const b=i.getDrawableBounds(k);for(const p of [{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}])pp.push(m.toGlobal(i.localTransform.apply(p)))}if(!pp.length)return {x:280,y:50,width:350,height:300};let x=Math.min(...pp.map(p=>p.x)),y=Math.min(...pp.map(p=>p.y)),w=Math.max(...pp.map(p=>p.x))-x,h=Math.max(...pp.map(p=>p.y))-y;w=Math.max(w,35);const pad=w*.35;x=Math.max(0,x-pad);y=Math.max(0,y-pad);return {x,y,width:Math.min(w+pad*2,780-x),height:Math.min(h+pad*2,900-y)}}''')
    geometry=page.evaluate('''()=>{const c=window.auditModel.internalModel.coreModel,m=c.getModel(),d=m.drawables;return {parameters:Array.from(m.parameters.ids,(id,i)=>({id,value:m.parameters.values[i],min:m.parameters.minimumValues[i],max:m.parameters.maximumValues[i]})),drawables:Array.from(d.ids,(id,i)=>({id,slot:d.textureIndices[i],uv:Array.from(d.vertexUvs[i]),triangles:Array.from(d.indices[i]),masks:Array.from(d.masks[i]||[])}))}}''')
    write(out/(item['id']+'-geometry.json'),geometry)
    eye_endpoints=[]
    for label,value in [('open',1),('threequarter',.75),('half',.5),('quarter',.25),('closed',0)]:
     page.evaluate('v=>window.forcedEyes=v',value);page.wait_for_timeout(150);page.screenshot(path=str(out/(item['id']+'-'+label+'.png')),clip=clip)
     page.wait_for_function('v=>window.eyeAtCoreUpdate?.pose===v',arg=value)
     actual=page.evaluate('window.eyeAtCoreUpdate.actual')
     assert all(abs(v-value)<.0001 for v in actual),(label,actual)
     eye_endpoints.append(dict(pose=label,expected=value,actual=actual))
    page.evaluate('window.forcedEyes=null');expressions=page.evaluate('window.controls().expressions');motions=page.evaluate('window.controls().motions');captures=[]
    if a.expressions:
     for n,name in enumerate(expressions):
      if name.startswith('装配_'):continue
      page.evaluate('n=>window.controls().playExpression(n)',name);page.wait_for_timeout(1100)
      file=item['id']+'-expression-'+str(n).zfill(2)+'.png';page.screenshot(path=str(out/file),clip=clip);captures.append(dict(name=name,file=file))
    for name in expressions:
     assert page.evaluate('''async name=>{const m=window.auditModel.internalModel.motionManager.expressionManager;return !!await m.loadExpression(m.definitions.findIndex(x=>x.Name===name))}''',name)
    for file in motions:
     count=page.evaluate('window.audit.starts.length');page.evaluate('f=>window.controls().playMotion(f)',file)
     page.wait_for_function('x=>window.audit.starts.slice(x.count).some(m=>m.file===x.file)',arg=dict(count=count,file=file),timeout=5000)
     page.wait_for_timeout(100)
    page.evaluate('window.controls().stop()');page.evaluate('window.remount()');page.wait_for_function('window.controls()===null');page.evaluate('window.remount()');page.wait_for_function('window.controls?.()&&window.audit.frames>20',timeout=45000)
    assert not errors,errors
    result.update(status='pass',clip=clip,expressions=expressions,motions=motions,expressionCaptures=captures,eyeEndpoints=eye_endpoints,reload=True,errors=errors)
   except Exception as e:result.update(error=str(e),errors=errors)
   finally:page.close()
   results.append(result);write(out/'review.json',results);print(a.phase,item['id'],result['status'],result.get('error',''),flush=True)
  browser.close()
 passed=[r for r in results if r['status']=='pass']
 for start in range(0,len(passed),12):
  batch=passed[start:start+12];sheet=Image.new('RGB',(1500,180*len(batch)),'#cbd0d7');draw=ImageDraw.Draw(sheet)
  for i,r in enumerate(batch):
   for j,pose in enumerate(['open','half','closed']):
    im=Image.open(out/(r['id']+'-'+pose+'.png'));im.thumbnail((490,145));sheet.paste(im,(j*500,i*180+30));draw.text((j*500+4,i*180+3),r['id'].removeprefix('hlr_yexuan_')+' '+pose,fill='black')
  sheet.save(out/('review-'+str(start//12+1).zfill(2)+'.png'))
 print('TOTAL',len(results),'PASS',len(passed),flush=True)
 if len(results)!=len(passed):raise SystemExit(1)
if __name__=='__main__':main()
