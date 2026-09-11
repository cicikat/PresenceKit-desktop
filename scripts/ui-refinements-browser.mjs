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
 if(cmd==='send_chat') {
   const id='transport-'+args.message;
   const client=(await import('/src/shared/api/ws.ts')).wsClient;
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
 await page.locator('textarea').fill('kept draft');
 await page.getByLabel('一起做事',{exact:true}).click();
 await page.locator('.activity-window').waitFor();
 const activityBack=await page.locator('.workspace-back').evaluate(el=>{const box=el.getBoundingClientRect(),s=getComputedStyle(el);return {width:box.width,height:box.height,border:s.border,borderRadius:s.borderRadius,color:s.color,padding:s.padding};});
 await page.screenshot({path:'.tmp/usability-activity-navigation.png'});
 check(await page.getByLabel('一起做事',{exact:true}).getAttribute('aria-pressed')==='true','Activity selection');
 check(await page.locator('.activity-ribbon').count()===0,'Activity ribbon remains');
 check(await page.locator('.activity-page button').count()===4,'Four activity cards');
 await page.getByLabel('一起做事',{exact:true}).click();
 check(await page.locator('textarea').inputValue()==='kept draft','Lost chat draft');
 await page.getByLabel('群聊',{exact:true}).click();
 check(await page.getByLabel('群聊',{exact:true}).getAttribute('aria-pressed')==='true','Group selection');
 const groupBack=await page.locator('.workspace-back').evaluate(el=>{const box=el.getBoundingClientRect(),s=getComputedStyle(el);return {width:box.width,height:box.height,border:s.border,borderRadius:s.borderRadius,color:s.color,padding:s.padding};});
 check(JSON.stringify(activityBack)===JSON.stringify(groupBack),'Back buttons differ');
 await page.screenshot({path:'.tmp/usability-group-navigation.png'});
 await page.getByLabel('群聊',{exact:true}).click();
 check(await page.locator('textarea').inputValue()==='kept draft','Lost chat after group');
 await page.getByLabel('一起做事',{exact:true}).click();
 await page.getByRole('button',{name:'返回主聊天',exact:true}).click();
 check(await page.locator('textarea').inputValue()==='kept draft','Activity back');
 await page.setViewportSize({width:1280,height:420});
 const scroll=page.locator('.chat-ribbon__scroll');
 check(await scroll.evaluate(el=>getComputedStyle(el).scrollbarWidth)==='none','Scrollbar visible');
 check(await scroll.evaluate(el=>el.offsetWidth===el.clientWidth),'Scrollbar consumes width');
 await scroll.evaluate(el=>el.scrollTop=1000);
 check(await scroll.evaluate(el=>el.scrollTop)>0,'Ribbon not scrollable');
 await page.setViewportSize({width:1280,height:900});
 await page.evaluate(()=>{window.delivery='stream';window.delayCanonical=true;window.emptyOnce=true;});
 await page.locator('textarea').fill('delayed');await page.locator('textarea').press('Enter');
 const panel=page.locator('.turn-reasoning');
 await panel.waitFor();
 await panel.getByRole('button').click();
 await panel.getByRole('status').waitFor();
 check(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning').length)===0,'Queried transport ID');
 await panel.evaluate(el=>window.originalReasoning=el);
 await page.evaluate(()=>window.resolveCanonical());
 await panel.locator('pre').waitFor();
 check(await panel.evaluate(el=>el===window.originalReasoning),'Reasoning remounted');
 check(await panel.getByRole('button').count()===1,'Reread button remains');
 check(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning').every(c=>c.args.turnId==='canonical-delayed')),'Wrong canonical ID');
 check(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning').length)===2,'Did not automatically refresh empty result');
 await page.getByLabel('偏好',{exact:true}).click();
 await page.getByRole('button',{name:/测试/}).waitFor();
 await page.getByRole('button',{name:/界面/}).click();
 const range=page.getByLabel('对话气泡不透明度',{exact:true});
 await range.fill('0.4');
 check(await page.locator('[data-chat-region="composer"]').evaluate(el=>getComputedStyle(el).filter)==='none','Composer faded');
 check(await page.locator('[data-chat-region="transcript"]').evaluate(el=>getComputedStyle(el).filter)==='none','Transcript faded');
 await page.getByRole('button',{name:'新建',exact:true}).click();
 const preview=page.getByRole('figure',{name:'实时配色预览'});
 await preview.waitFor();
 const picker=page.locator('input[type=color][title="--paper"]');
 await picker.fill('#123456');
 check(await preview.evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(18, 52, 86)','Chat preview not reactive');
 await page.screenshot({path:'.tmp/usability-preview.png'});
 console.log('PASS navigation, draft retention, scroll, delayed canonical reasoning, automatic refresh, opacity and chat preview');
 await page.reload();
 await page.getByText('My previous message',{exact:true}).waitFor();
 await page.evaluate(async()=>{const m=await import('/src/shared/design-mod/runtime.ts');m.setSelectedDesignModId('freeform-capability-fixture');});
 await page.locator('.fixture-composer textarea').waitFor();
 await page.locator('.fixture-composer textarea').fill('Mod draft');
 for(const label of ['一起做事','群聊']) {
   await page.getByLabel(label,{exact:true}).click();
   check(await page.locator('[data-design-mod-default-shell-visible="true"]').count()===1,'Native page hidden by Mod');
   if(label==='一起做事')await page.locator('.activity-page button').first().waitFor();
   await page.getByLabel(label,{exact:true}).click();
   await page.locator('.fixture-composer textarea').waitFor();
   check(await page.locator('.fixture-composer textarea').inputValue()==='Mod draft','Mod draft lost on return');
 }
 console.log('PASS activity/group navigation with active Design Mod');
 await page.evaluate(async()=>{const m=await import('/src/shared/design-mod/runtime.ts');m.setSelectedDesignModId('builtin-default');});
 await page.evaluate(async()=>{
   const {default:React}=await import('/node_modules/.vite/deps/react.js');
   const {default:{createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {DreamPrefsPane}=await import('/src/windows/dream/components/DreamPrefsPane.tsx');
   const {loadDreamAppearance}=await import('/src/shared/dreamAppearance.ts');
   function Fixture(){const [appearance,setAppearance]=React.useState(loadDreamAppearance);return React.createElement(DreamPrefsPane,{open:true,dreamState:null,entryMode:'sandbox',scenarioScriptId:'',appearance,onAppearanceChange:patch=>setAppearance(value=>({...value,...patch})),onEntryModeChange:()=>{},onScenarioScriptIdChange:()=>{},onClose:()=>{}});}
   const el=document.createElement('div');el.className='dream-window';document.body.append(el);createRoot(el).render(React.createElement(Fixture));
 });
 await page.getByRole('button',{name:'5 · 色彩',exact:true}).click();
 const dreamPreview=page.getByRole('figure',{name:'实时配色预览'});
 await dreamPreview.waitFor();
 const dreamColor=page.locator('.dream-prefs__groups input[type=color]').first();
 await dreamColor.fill('#abcdef');
 check(await dreamPreview.evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(171, 205, 239)','Dream preview not reactive');
 await page.getByRole('button',{name:'☾ 夜间',exact:true}).click();
 check(await dreamPreview.evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(11, 16, 32)','Dream slots mixed');
 await page.getByText('共用主题 UI',{exact:true}).waitFor();
 check(await page.locator('.dream-prefs__groups select').count()===1,'No shared theme picker');
 await dreamPreview.scrollIntoViewIfNeeded();
 await page.screenshot({path:'.tmp/usability-dream-preview.png'});
 console.log('PASS Dream day/night preview and shared theme picker');
 check(errors.length===0,errors.join('\n'));
} catch(error) { console.error(errors); console.error((await page.locator('body').innerText()).slice(-1500)); throw error; } finally { await browser.close(); }
