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
 check(!(await page.locator('body').innerText()).includes('SHIFT+ENTER'),'Shortcut caption remains');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  const base={type:'tool_activity',chain_id:'chain-test',char_id:'fixture-character',source:'reality',origin:'autonomy',ts:Date.now()/1000};
  for(const event of [{event_id:'a',tool_name:'get_time',status:'running'},{event_id:'a',tool_name:'get_time',status:'success'},{event_id:'b',tool_name:'weather',status:'error'}])wsClient._handleMessage(JSON.stringify({...base,...event}));
  wsClient._handleMessage(JSON.stringify({...base,event_id:'foreign',tool_name:'FOREIGN',char_id:'other',status:'success'}));
 });
 await page.getByText('get_time',{exact:true}).waitFor();
 check(await page.getByText('get_time',{exact:true}).count()===1,'Duplicated tool');
 check(await page.getByRole('img',{name:'成功',exact:true}).count()===1,'Missing success');
 check(await page.getByRole('img',{name:'失败',exact:true}).count()===1,'Missing error');
 check(await page.getByText('FOREIGN',{exact:true}).count()===0,'Character isolation failed');
 await page.screenshot({path:'.tmp/tool-activity.png'});
 await page.evaluate(async()=>{(await import('/src/shared/toolActivityDisplay.ts')).setToolActivityVisible(false)});
 await page.getByText('get_time',{exact:true}).waitFor({state:'hidden'});
 await page.evaluate(async()=>{(await import('/src/shared/toolActivityDisplay.ts')).setToolActivityVisible(true)});
 await page.getByText('get_time',{exact:true}).waitFor();
 check(errors.length===0,errors.join('\n'));
 console.log('PASS tool chain, status dots, dedup, scope isolation, display toggle, shortcut removal');
} finally {await browser.close()}
