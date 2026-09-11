// Browser regression with mocked Tauri IPC. Never connects to the real backend.
// Start npm run dev first. Requires an installed Playwright package (or npm cache).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache','_npx');
const pkg=process.env.PLAYWRIGHT_PACKAGE_JSON || fs.readdirSync(cache).map(x=>path.join(cache,x,'node_modules','playwright','package.json')).find(x=>fs.existsSync(x));
if (!pkg) throw new Error('Install Playwright or set PLAYWRIGHT_PACKAGE_JSON');
fs.mkdirSync('.tmp', {recursive:true});
const {chromium}=createRequire(pkg)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const chatLogs=[];page.on('console',message=>{if(message.text().includes('[chat]'))chatLogs.push(message.text());});
await page.addInitScript((fixtureFiles)=>{
 localStorage.setItem('emerald.chat.lastDesktopWakeAt',String(Date.now()));
 window.calls=[];let cb=0; window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++cb,unregisterCallback:()=>{},convertFileSrc:p=>p,invoke:async(cmd,args)=>{
 window.calls.push({cmd,args});
 if(cmd==='get_token_status')return {configured:true,prefix:'fixture'};
 if(cmd==='load_ui_prefs')return JSON.stringify({...JSON.parse(localStorage.getItem('fixture.nativePrefs')||'{}'),'character.active':{id:'fixture-character',name:'霁明',avatarRevision:0}});
 if(cmd==='save_ui_prefs'){localStorage.setItem('fixture.nativePrefs',args.contents);return;}
 if(cmd==='list_design_mods')return [fixtureFiles.manifest];
 if(cmd==='read_design_mod_file')return fixtureFiles[args.file];
 if(cmd==='get_design_satellite_capabilities')return {platform:'windows',status:'supported',capabilities:[]};
 if(cmd==='group_list')return [];
 if(cmd==='get_character_avatar')return null;
 if(cmd==='read_avatars_json')return '{}';
 if(cmd==='get_prompt_assets')return {characters:[{id:'fixture-character',label:'霁明'}],active:{active_character:'fixture-character'},lorebooks:[],jailbreaks:[],dream_presets:[],world_cards:[]};
 if(cmd==='load_chat_log_dates')return {dates:[new Date().toISOString().slice(0,10)]};
 if(cmd==='load_chat_log_day')return {entries:[{user:'My previous message',assistant:'Character previous message',ts:Date.now()/1000},...(localStorage.getItem('fixture.historyWithTurns') ? [{user:'Archived question',assistant:'Archived first paragraph\nArchived second paragraph',ts:Date.now()/1000,turn_id:'archived-canonical'}] : [])],raw_fallback:false};
 if(cmd==='list_live2d_models')return [{dirName:'hiyori_free',label:'hiyori_free',modelJson:'hiyori_free_t08.model3.json',mocVersion:1},{dirName:'hiyori_pro',label:'hiyori_pro',modelJson:'hiyori_pro_t11.model3.json',mocVersion:3}];
 if(cmd==='send_chat') {
   const id='transport-'+args.message;
   const client=(await import('/src/shared/api/ws.ts')).wsClient;
   if(window.delivery==='slow') {
     client._handleMessage(JSON.stringify({type:'message_stream_start',msg_id:id}));
     await new Promise(resolve=>window.releaseSlow=resolve);
     client._handleMessage(JSON.stringify({type:'message_stream_delta',msg_id:id,delta:'First paragraph\nSecond paragraph'}));
     client._handleMessage(JSON.stringify({type:'message_stream_end',msg_id:id}));
     client._handleMessage(JSON.stringify({type:'channel_message',msg_id:id,content:'First paragraph\nSecond paragraph'}));
   }
   if(window.delivery==='stream') {
     client._handleMessage(JSON.stringify({type:'message_stream_start',msg_id:id}));
     client._handleMessage(JSON.stringify({type:'message_stream_delta',msg_id:id,delta:'First paragraph\nSecond paragraph'}));
     client._handleMessage(JSON.stringify({type:'message_stream_end',msg_id:id}));
   }
   if(window.delivery==='stream'||window.delivery==='ws')client._handleMessage(JSON.stringify({type:'channel_message',msg_id:id,content:'First paragraph\nSecond paragraph'}));
   if(window.delivery==='http-first')setTimeout(()=>client._handleMessage(JSON.stringify({type:'channel_message',msg_id:id,content:'First paragraph\nSecond paragraph'})),100);
   if(window.delayCanonical)await new Promise(resolve=>window.resolveCanonical=resolve);
   return {reply:'First paragraph\nSecond paragraph',msg_id:id,turn_id:'canonical-'+args.message};
 }
 if(cmd==='load_turn_reasoning') {
   if(window.emptyOnce){window.emptyOnce=false;return {turn_id:args.turnId,available:false,entries:[]};}
   if(window.reasoningDelay)await new Promise(resolve=>window.resolveReasoning=resolve);
   if(window.reasoningStatus)throw 'HTTP '+window.reasoningStatus;
   return {turn_id:args.turnId,available:!window.reasoningEmpty,entries:window.reasoningEmpty?[]:[1,2].map(seq=>({seq,call_id:'call-'+seq,model:'fixture-model-'+seq,status:seq===1?'interrupted':'completed',parts:[{source:'reasoning_content',text:window.prettyThoughts ? (seq===1 ? '先听她把话说完。那些没有说出口的心事，也许比问题本身更重要。' : '不必急着给出答案，就这样陪她坐一会儿，让这一刻慢下来。') : '<img src=x onerror=alert(1)> literal reasoning '+seq}]}))};
 }
 if(cmd==='native_ws_connect')return 1;
 if(cmd.startsWith('list_')||cmd.includes('get_all_'))return [];
 if(cmd==='load_mood_state')return {current:'平静'};
 if(cmd==='load_activity_state')return {activity:'idle'};
 if(cmd==='load_desktop_tts_settings')return {enabled:false};
 if(cmd==='plugin:event|listen')return ++cb;
 return {};
 }};
}, {manifest:JSON.parse(fs.readFileSync('public/design-mods/freeform-capability-fixture/mod.json','utf8')), 'entry.js':fs.readFileSync('public/design-mods/freeform-capability-fixture/entry.js','utf8'),'style.css':fs.readFileSync('public/design-mods/freeform-capability-fixture/style.css','utf8')});
const check = (condition, message) => { if (!condition) throw Error(message); };
try {
 await page.goto('http://127.0.0.1:1420');
 await page.getByText('My previous message',{exact:true}).waitFor();
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for(const [id,scope] of [['group',{round_id:'r',char_id:'fixture-character',domain:'reality'}],['dream',{domain:'dream'}],['other',{char_id:'other'}]]) {
   for(const event of [{type:'message_stream_start'}, {type:'message_stream_delta',delta:'LEAK-'+id}, {type:'message_stream_end'}, {type:'channel_message',content:'LEAK-'+id}, {type:'message_segments',content:'LEAK-'+id,segments:[]}]) wsClient._handleMessage(JSON.stringify({msg_id:id,...scope,...event}));
  }
 });
 check(!(await page.locator('body').innerText()).includes('LEAK-'),'Foreign transcript leaked');
 check(await page.locator('.shared-typing-dots').count()===0,'Foreign stream changed loading');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for (const type of ['message_stream_start','message_stream_end']) wsClient._handleMessage(JSON.stringify({type,msg_id:'empty-proactive'}));
 });
 check(await page.locator('.shared-typing-dots').count()===0,'Empty unsolicited stream left spinner');
 await page.evaluate(()=>window.delivery='slow');
 await page.locator('textarea').fill('slow');await page.locator('textarea').press('Enter');
 await page.locator('.shared-typing-dots').waitFor();
 await page.locator('.shared-typing-dots').evaluate(el=>window.originalDots=el);
 await page.waitForTimeout(1200);
 check(await page.locator('.shared-typing-dots').evaluate(el=>el===window.originalDots),'Loading indicator flickered during empty stream');
 await page.evaluate(()=>window.releaseSlow());
 await page.getByText('First paragraph',{exact:true}).waitFor();
 await page.locator('.shared-typing-dots').waitFor({state:'detached'});
 await page.locator('.turn-reasoning button').click();
 await page.locator('.turn-reasoning pre').waitFor();
 await page.setViewportSize({width:1920,height:1080});
 check(await page.locator('.turn-reasoning-content').evaluate(el=>el.clientWidth>640 && Math.abs(el.clientWidth-el.parentElement.clientWidth)<2),'Reasoning remains capped');
 await page.screenshot({path:'.tmp/client-reasoning-wide.png'});
 for(const width of [1280,700,420]) {
  await page.setViewportSize({width,height:900});
  await page.locator('textarea').fill('这是一段横向排列的输入文字，也支持多行内容。\n第二行继续输入。');
  await page.waitForTimeout(150);
  check(await page.locator('textarea').evaluate(el=>{const s=getComputedStyle(el);return el.clientWidth>150&&s.scrollbarWidth==='none'&&s.writingMode==='horizontal-tb';}),'Narrow composer crushed');
  check(await page.locator('.chat-composer-row').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Composer horizontal overflow');
 }
 await page.locator('[data-layout-slot="sidebar"] button[title="收起"]').click();
 await page.screenshot({path:'.tmp/client-composer-narrow.png'});
 await page.setViewportSize({width:1280,height:900});
 await page.getByLabel('偏好',{exact:true}).click();
 await page.getByRole('button',{name:/界面/}).click();
 await page.locator('#activity-appearance').scrollIntoViewIfNeeded();
 check(await page.locator('#activity-appearance').evaluate(el=>getComputedStyle(el).gap==='18px'),'Activity spacing');
 check(await page.locator('#activity-appearance select').first().evaluate(el=>el.getBoundingClientRect().width<=141),'Activity select width');
 await page.screenshot({path:'.tmp/client-preferences.png'});
 await page.getByRole('button',{name:/桌宠与互动/}).click();
 const modes=page.getByRole('group',{name:'模型类型'});
 await modes.scrollIntoViewIfNeeded();
 await modes.getByRole('button',{name:'Live2D 模型'}).click();
 await page.getByRole('combobox',{name:'Live2D 模型'}).selectOption('hiyori_pro');
 await modes.getByRole('button',{name:'3D 模型'}).click();
 check(await page.getByRole('combobox',{name:'Live2D 模型'}).count()===0,'3D classification contains Live2D');
 await modes.getByRole('button',{name:'Live2D 模型'}).click();
 check(await page.getByRole('combobox',{name:'Live2D 模型'}).inputValue()==='hiyori_pro','Model selection lost across mode change');
 await page.getByRole('button',{name:'×',exact:true}).last().click();
 await page.getByLabel('更多操作',{exact:true}).click();
 await page.getByRole('button',{name:/视频通话.*进入/}).click();
 await page.locator('.call-room canvas').waitFor();
 await page.waitForTimeout(3500);
 await page.screenshot({path:'.tmp/client-call-live2d.png'});
 await page.evaluate(async()=>{
  const settings=await import('/src/shared/live2d/live2dSettings.ts');
  settings.saveLive2DSettings({...settings.loadLive2DSettings(),modelDir:'hiyori_free'});
 });
 await page.waitForTimeout(2000);
 await page.screenshot({path:'.tmp/client-call-live2d-free.png'});
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  wsClient._handleMessage(JSON.stringify({type:'message_stream_start',msg_id:'call-group',round_id:'r',char_id:'fixture-character'}));
  wsClient._handleMessage(JSON.stringify({type:'message_stream_delta',msg_id:'call-group',delta:'CALL-LEAK'}));
  wsClient._handleMessage(JSON.stringify({type:'channel_message',msg_id:'call-group',round_id:'r',content:'CALL-LEAK'}));
 });
 check(!(await page.locator('.call-room').innerText()).includes('CALL-LEAK'),'Call group leak');
 check(await page.locator('.call-room input').isEnabled(),'Group stream disabled call input');
 await page.emulateMedia({reducedMotion:'reduce'});
 check(await page.locator('.call-room__ambience > i').first().evaluate(el=>getComputedStyle(el).animationName)==='none','Reduced motion ignored');
 check(errors.length===0,errors.join('\n'));
 console.log('PASS: group/dream/character isolation, delayed first token, full-width reasoning, responsive composer, compact preferences, model classification/persistence, local Live2D call and reduced motion');
} catch(error) {await page.screenshot({path:'.tmp/client-failure.png'});console.error(errors);console.error((await page.locator('body').innerText()).slice(-2500));throw error;} finally {await browser.close();}
