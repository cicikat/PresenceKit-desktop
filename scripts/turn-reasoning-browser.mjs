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
await page.addInitScript(()=>{
 localStorage.setItem('emerald.chat.lastDesktopWakeAt',String(Date.now()));
 window.calls=[];let cb=0; window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++cb,unregisterCallback:()=>{},convertFileSrc:p=>p,invoke:async(cmd,args)=>{
 window.calls.push({cmd,args});
 if(cmd==='get_token_status')return {configured:true,prefix:'fixture'};
 if(cmd==='load_ui_prefs')return JSON.stringify({...JSON.parse(localStorage.getItem('fixture.nativePrefs')||'{}'),'character.active':{id:'fixture-character',name:'霁明',avatarRevision:0}});
 if(cmd==='save_ui_prefs'){localStorage.setItem('fixture.nativePrefs',args.contents);return;}
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
   return {reply:'First paragraph\nSecond paragraph',msg_id:id,turn_id:'canonical-'+args.message};
 }
 if(cmd==='load_turn_reasoning') {
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
});
const check = (condition, message) => { if (!condition) throw Error(message); };
try {
 for (const delivery of ['fallback', 'ws', 'stream', 'http-first']) {
  chatLogs.length=0;
  await page.goto('http://127.0.0.1:1420');
  await page.getByText('My previous message',{exact:true}).waitFor();
  check(await page.locator('.turn-reasoning').count()===0,'Old message invented an association');
  await page.evaluate(mode=>window.delivery=mode,delivery);
  await page.locator('textarea').fill(delivery);
  await page.locator('textarea').press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.turn-reasoning').length===1);
  await page.getByText('Second paragraph',{exact:true}).waitFor();
  check(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning').length)===0,'Loaded before expansion');
  const panels=page.locator('.turn-reasoning');
  await panels.first().getByRole('button').click();
  await panels.first().getByText('霁明的内心活动：',{exact:true}).waitFor();
  check(await panels.count()===1,'One control per bubble instead of per reply');
  check(!/fixture-model|reasoning_content|协议|调用|中断/.test(await panels.first().innerText()),'Exposed technical metadata');
  check(await panels.first().locator('pre').textContent()==='<img src=x onerror=alert(1)> literal reasoning 1\n\n<img src=x onerror=alert(1)> literal reasoning 2','Lost or changed reasoning text');
  check(await panels.first().locator('img,script').count()===0,'Interpreted reasoning as HTML');
  await panels.first().getByRole('button',{name:'收起思考',exact:true}).click();
  await panels.first().getByRole('button',{name:'展开思考',exact:true}).click();
  await panels.first().locator('pre').waitFor();
  const requests=await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning'));
  check(requests.length===1 && requests[0].args.turnId==='canonical-'+delivery,'Wrong ID or cache miss');
  check(await page.getByText('First paragraph',{exact:true}).count()===1,'Duplicated first paragraph');
  check(await page.getByText('Second paragraph',{exact:true}).count()===1,'Duplicated second paragraph');
  if(delivery!=='fallback') {
   check(await page.evaluate(id=>window.calls.some(c=>c.cmd==='native_ws_send' && JSON.parse(c.args.message).type==='ack' && JSON.parse(c.args.message).msg_id===id),'transport-'+delivery),'WS scenario silently fell back to HTTP');
  }
  if(delivery==='stream')check(chatLogs.some(line=>line.includes('stream-replace-split')),'Stream was not reconciled');
  console.log('PASS delivery:',delivery);
 }
 const panel=page.locator('.turn-reasoning').last();
 let nextAttempt=0;
 // Completed records have no reread button. Exercise each failure on a new turn.
 const retry=()=>({click:async()=>{
   const before=await page.locator('.turn-reasoning').count();
   await page.locator('textarea').fill('retry-'+nextAttempt++);
   await page.locator('textarea').press('Enter');
   await page.waitForFunction(n=>document.querySelectorAll('.turn-reasoning').length===n+1,before);
   await panel.getByRole('button').click();
 }});
 for(const [status,label] of [[403,'查看权限'],[404,'当前版本暂不支持'],[503,'稍后重试'],[500,'读取失败']]) {
  await page.evaluate(s=>window.reasoningStatus=s,status);
  await retry().click();
  await panel.getByRole('alert').filter({hasText:label}).waitFor();
 }
 await page.evaluate(()=>{window.reasoningStatus=0;window.reasoningEmpty=true;});
 await retry().click();
 await panel.getByText('本回合没有可用的模型思考记录',{exact:true}).waitFor({timeout:70000});
 await page.evaluate(()=>{window.reasoningEmpty=false;window.prettyThoughts=true;});
 await retry().click();
 await panel.locator('pre').waitFor();
 await page.getByTitle('收起',{exact:true}).click();
 await page.setViewportSize({width:480,height:800});
 await panel.scrollIntoViewIfNeeded();
 await page.screenshot({path:'.tmp/turn-reasoning-narrow.png',fullPage:true});
 check(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Narrow panel overflow');
 await page.setViewportSize({width:1280,height:900});
 await panel.scrollIntoViewIfNeeded();
 await page.screenshot({path:'.tmp/turn-reasoning-wide.png',fullPage:true});
 // A real active-character notification remounts ChatPanel while the read is pending.
 await page.evaluate(()=>window.reasoningDelay=true);
 await retry().click();
 await page.waitForFunction(()=>typeof window.resolveReasoning==='function');
 await page.evaluate(async()=>{
  const {setActiveCharacterInfo}=await import('/src/shared/activeCharacter.ts');
  setActiveCharacterInfo({id:'next-character',name:'Next',avatarRevision:0});
 });
 await page.waitForFunction(()=>document.querySelectorAll('.turn-reasoning').length===0);
 await page.evaluate(()=>window.resolveReasoning());
 await page.getByText('My previous message',{exact:true}).waitFor();
 check(await page.locator('.turn-reasoning').count()===0,'Late result crossed character boundary');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  wsClient._handleMessage(JSON.stringify({type:'channel_message',msg_id:'unassociated-ws',content:'Unassociated reply'}));
 });
 await page.getByText('Unassociated reply',{exact:true}).waitFor();
 check(await page.locator('.turn-reasoning').count()===0,'Guessed canonical ID from WS transport ID');
 console.log('PASS status, empty retry, text safety, narrow layout and character switch');
 // The frontend is ready for explicit historical IDs; the current backend omits them.
 await page.evaluate(()=>localStorage.setItem('fixture.historyWithTurns','true'));
 await page.reload();
 await page.getByText('Archived second paragraph',{exact:true}).waitFor();
 check(await page.locator('.turn-reasoning').count()===1,'Did not restore a single historical reply control');
 check(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning').length)===0,'Prefetched all history reasoning');
 await page.getByRole('button',{name:'展开思考',exact:true}).click();
 await page.locator('.turn-reasoning pre').waitFor();
 check(await page.evaluate(()=>window.calls.find(c=>c.cmd==='load_turn_reasoning').args.turnId)==='archived-canonical','History used a guessed ID');
 // Names update from the shared character identity; no model/source label is visible.
 await page.evaluate(async()=>{
  const {setActiveCharacterInfo}=await import('/src/shared/activeCharacter.ts');
  setActiveCharacterInfo({id:'fixture-character',name:'青禾',avatarRevision:0});
 });
 await page.getByText('青禾的内心活动：',{exact:true}).waitFor();
 // Exercise the actual preferences tab and native preference persistence bridge.
 await page.getByLabel('偏好',{exact:true}).click();
 await page.getByRole('button',{name:/角色与对话/}).click();
 const preference=page.getByRole('button',{name:'显示思考入口',exact:true});
 check(await preference.getAttribute('aria-pressed')==='true','Display should default on');
 await preference.click();
 await page.waitForFunction(()=>document.querySelectorAll('.turn-reasoning').length===0);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture.nativePrefs')||'{}')['chat.reasoningVisible']===false);
 await page.reload();
 await page.getByText('Archived second paragraph',{exact:true}).waitFor();
 check(await page.locator('.turn-reasoning').count()===0,'Preference did not survive restart');
 check(await page.evaluate(()=>window.calls.filter(c=>c.cmd==='load_turn_reasoning').length)===0,'Hidden display queried reasoning');
 await page.getByLabel('偏好',{exact:true}).click();
 await page.getByRole('button',{name:/角色与对话/}).click();
 check(await preference.getAttribute('aria-pressed')==='false','Settings lost the saved value');
 await preference.click();
 await page.waitForFunction(()=>document.querySelectorAll('.turn-reasoning').length===1);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('fixture.nativePrefs')||'{}')['chat.reasoningVisible']===true);
 await page.getByRole('button',{name:'×',exact:true}).last().click();
 await page.getByRole('button',{name:'展开思考',exact:true}).click();
 await page.locator('.turn-reasoning pre').waitFor();
 await page.screenshot({path:'.tmp/turn-reasoning-history.png',fullPage:true});
 check(await page.evaluate(()=>!window.calls.some(c=>/thinking|update.*settings|patch.*settings/.test(c.cmd))),'Display toggle changed backend policy');
 console.log('PASS historical canonical IDs, dynamic name, preferences placement and persistence');
 await page.evaluate(()=>localStorage.removeItem('fixture.historyWithTurns'));
 await page.reload();
 await page.getByText('My previous message',{exact:true}).waitFor();
 // 401 retains the existing global reconnect gate; verify it independently last.
 await page.evaluate(()=>{window.reasoningDelay=false;window.reasoningStatus=401;window.delivery='ws';});
 await page.locator('textarea').fill('auth');await page.locator('textarea').press('Enter');
 await page.locator('.turn-reasoning').first().getByRole('button').click();
 await page.waitForFunction(async()=> (await import('/src/shared/api/authGate.ts')).getAuthInvalid());
 console.log('PASS 401 global connection gate');
 check(errors.length===0,errors.join('\n'));
} catch(error) {
 console.error(chatLogs.slice(-15).join('\n'));
 console.error((await page.locator('body').innerText()).slice(-2500));
 throw error;
} finally {await browser.close();}
