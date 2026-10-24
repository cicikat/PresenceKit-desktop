from pathlib import Path
from playwright.sync_api import sync_playwright
import json,time
import argparse,shutil
parser=argparse.ArgumentParser(description='Real Core/Pixi/React Live2D acceptance with mocked Tauri transport only')
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--base-url',default='http://localhost:1420')
parser.add_argument('--model-dir',default='hlr_yexuan_mingyun_base')
parser.add_argument('--dpr',type=float,default=1,help='Screen pixel density for high-DPI regression')
args=parser.parse_args()
repo=Path(__file__).resolve().parent.parent
fixture=repo/'.tmp'
fixture.mkdir(exist_ok=True)
shutil.copyfile(repo/'scripts/fixtures/live2d-import.tsx',fixture/'hlr-live2d-fixture.tsx')
(fixture/'hlr-live2d-fixture.html').write_text('<html><body style="margin:0;background:#242936;color:white"><div id="root"></div><script type="module" src="./hlr-live2d-fixture.tsx"></script></body></html>',encoding='utf8')
out=args.output.resolve();out.mkdir(parents=True,exist_ok=True);logs=[];errors=[];failed=[]

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1000,'height':900},device_scale_factor=args.dpr)
 page.on('console',lambda m:logs.append({'type':m.type,'text':m.text}))
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('requestfailed',lambda r:failed.append({'url':r.url,'failure':r.failure}))
 page.add_init_script('window.fixtureModelDir='+json.dumps(args.model_dir)+';')
 page.add_init_script('''window.__TAURI_INTERNALS__={invoke:async(cmd,args)=>{
 if(cmd==='list_live2d_models')return [{dirName:window.fixtureModelDir,modelJson:'yexuan_mingyun.model3.json',label:'hlr_yexuan_mingyun',mocVersion:1}];
 if(cmd==='load_ui_prefs')return '{}';
 if(cmd==='save_ui_prefs')return null;
 throw new Error('Unmocked Tauri: '+cmd);
 },transformCallback:()=>0,metadata:{currentWindow:{label:'fixture'}}};''')
 try:
  page.goto(args.base_url+'/.tmp/hlr-live2d-fixture.html',wait_until='networkidle',timeout=60000)
  page.wait_for_function('window.controls?.() && window.audit.frames>20',timeout=45000)
  page.wait_for_timeout(700)
  page.evaluate('window.attachCompare()')
  page.screenshot(path=str(out/'01-模型初始.png'))
  report={}
  report['density']=page.evaluate('''() => {const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {dpr:devicePixelRatio,width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height};}''')
  assert abs(report['density']['width']-report['density']['cssWidth']*args.dpr)<=1
  assert abs(report['density']['height']-report['density']['cssHeight']*args.dpr)<=1
  report['capabilities']=page.evaluate('({expressions:window.controls().expressions.length,motions:window.controls().motions.length,actions:window.controls().actions})')
  assert report['capabilities']['expressions']==11
  assert report['capabilities']['motions']==26
  # Exercise the actual editing UI; no backend messages are sent.
  page.get_by_label('表情',exact=True).select_option('weixiao.exp3.json')
  page.wait_for_timeout(650)
  page.screenshot(path=str(out/'02-微笑表情.png'))
  page.get_by_role('button',name='点头',exact=True).click()
  page.wait_for_timeout(1000)
  page.screenshot(path=str(out/'03-点头动作.png'))
  assert page.evaluate("window.audit.starts.some(x=>x.file==='motions/diantou.motion3.json')")
  page.wait_for_timeout(3200)
  report['nodReturnedToIdle']=page.evaluate("window.audit.starts.at(-1).group==='Idle'")
  assert report['nodReturnedToIdle']
  page.get_by_role('button',name='停止预览',exact=True).click()
  # Existing perform directive routes into a native enter/hold/exit sequence.
  page.evaluate("window.issue({posture:'lean_in'},6500)")
  page.wait_for_timeout(4200)
  assert page.evaluate("window.audit.starts.at(-1).file==='motions/qianqing_loop.motion3.json'")
  page.screenshot(path=str(out/'04-前倾保持.png'))
  page.evaluate('window.audit.protectedMaxDelta=0;window.audit.measureProtected=true')
  page.wait_for_timeout(450)
  page.evaluate('window.audit.measureProtected=false')
  assert page.evaluate('window.audit.protectedMaxDelta')<0.00001
  page.evaluate('window.directive=null')
  page.wait_for_timeout(500)
  assert page.evaluate("window.audit.starts.at(-1).file==='motions/qianqing_off.motion3.json'")
  page.wait_for_timeout(2900)
  assert page.evaluate("window.audit.starts.at(-1).group==='Idle'")
  report['enterLoopExit']=True
  # A short TTL interrupts enter and explicitly exits, without getting stuck in a loop.
  page.evaluate("window.issue({posture:'lean_back'},600)")
  page.wait_for_timeout(1100)
  assert page.evaluate("window.audit.starts.at(-1).file==='motions/houyang_off.motion3.json'")
  page.wait_for_timeout(2900)
  assert page.evaluate("window.audit.starts.at(-1).group==='Idle'")
  report['ttlRelease']=True
  # Mouth volume is an explicit override while speaking; silent native parameters stay owned.
  page.evaluate('window.talking=true;window.volume=0.8')
  page.wait_for_timeout(300)
  report['speakingMouth']=page.evaluate("window.lastDrawMouth")
  assert report['speakingMouth']>0.4
  assert page.evaluate("window.audit.starts.at(-1).file==='motions/talk01.motion3.json'")
  page.evaluate('window.talking=false;window.volume=0')
  # Audition every expression and every motion long enough to catch load/draw failures.
  for name in page.evaluate('window.controls().expressions'):
   page.evaluate('(name)=>window.controls().playExpression(name)',name)
   page.wait_for_timeout(90)
  page.evaluate('window.controls().playExpression(null)')
  for file in page.evaluate('window.controls().motions'):
   page.evaluate('(file)=>window.controls().playMotion(file)',file)
   page.wait_for_timeout(130)
  page.evaluate('window.controls().stop()')
  page.wait_for_timeout(400)
  report['audit']=page.evaluate('window.audit')
  assert report['audit']['protectedMaxDelta']<0.00001
  # Unmount cancels pending preview/requests and clears the window-local controller.
  page.evaluate("window.controls().playMotion('motions/biyan.motion3.json');window.remount()")
  page.wait_for_timeout(300)
  assert page.evaluate('window.controls()===null')
  page.evaluate('window.remount()')
  page.wait_for_function('window.controls()&&window.audit.frames>100')
  page.wait_for_timeout(600)
  page.screenshot(path=str(out/'05-重载恢复.png'))
  report['unmountReload']=True
  # Simulate moving to a differently scaled monitor without remounting the stage.
  cdp=page.context.new_cdp_session(page)
  cdp.send('Emulation.setDeviceMetricsOverride',dict(width=1100,height=750,deviceScaleFactor=1.5,mobile=False))
  page.wait_for_function('''() => {const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return devicePixelRatio===1.5 && Math.abs(c.width-r.width*1.5)<=1 && Math.abs(c.height-r.height*1.5)<=1;}''')
  report['densityChangedWithoutRemount']=True
  assert not errors,errors
  assert not failed,failed
  (out/'browser-performance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
  print('PASS',json.dumps({k:v for k,v in report.items() if k!='audit'},ensure_ascii=False),flush=True)

 except Exception as e:
  import traceback
  errors.append(traceback.format_exc())
  print('FAILED',traceback.format_exc(),flush=True)
  print('AUDIT',page.evaluate('window.audit'),flush=True)
  page.screenshot(path=str(out/'load-failure.png'))
 finally:
  (out/'browser-performance-log.json').write_text(json.dumps(dict(errors=errors,logs=logs,failed=failed),ensure_ascii=False,indent=2),encoding='utf8');browser.close()
print('errors',errors);print('tail',logs[-10:])


if errors or failed:
 raise SystemExit(1)
