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
await page.addInitScript((fixtureFiles)=>{
 localStorage.setItem('emerald.chat.lastDesktopWakeAt',String(Date.now()));
 window.calls=[];let cb=0; window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
 window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback:()=>++cb,unregisterCallback:()=>{},convertFileSrc:p=>p,invoke:async(cmd,args)=>{
 window.calls.push({cmd,args});
 if(cmd==='get_token_status')return {configured:true,prefix:'fixture'};
 if(cmd==='load_ui_prefs')return JSON.stringify({'character.active':{id:'a',name:'Alice',avatarRevision:0}});
 if(cmd==='read_avatars_json')return '{}';
 if(cmd==='get_prompt_assets')return {characters:[{id:'a',label:'Alice',effective_profile:'default',resolved_chat_model:'example-model'},{id:'b',label:'Bob'}],active:{active_character:window.activeChar || 'a',enabled_lorebooks:[],enabled_jailbreaks:[]},lorebooks:[],jailbreaks:[],dream_presets:[],world_cards:[]};
 if(cmd==='load_chat_log_dates')return {dates:[new Date().toISOString().slice(0,10)]};
 if(cmd==='load_chat_log_day')return {entries:[{user:'My previous message',assistant:'Character previous message',ts:Date.now()/1000}],raw_fallback:false};
 if(cmd==='upload_document' && window.failUpload)throw 'HTTP 500: fixture';
 if(cmd==='send_chat'||cmd==='upload_document')return {reply:'Fixture reply',msg_id:'fixture-'+Date.now()};
 if(cmd==='patch_prompt_assets'){window.activeChar=args.activeCharacter;return {active:{active_character:window.activeChar,enabled_lorebooks:[],enabled_jailbreaks:[]}};}
 if(cmd==='get_character_avatar')return null;
 if(cmd==='upload_character_avatar'){if(window.failAvatar)throw 'fixture failure';return {};}
 if(cmd==='list_design_mods')return [fixtureFiles.manifest];
 if(cmd==='read_design_mod_file')return fixtureFiles[args.file];
 if(cmd==='get_design_satellite_capabilities')return {platform:'windows',status:'supported',capabilities:[]};
 if(cmd.startsWith('list_')||cmd.includes('get_all_'))return [];
 if(cmd==='load_mood_state')return {current:'平静'};
 if(cmd==='load_activity_state')return {activity:'idle'};
 if(cmd==='load_desktop_tts_settings')return {enabled:false};
 if(cmd==='plugin:event|listen')return ++cb;
 if(cmd==='plugin:dialog|open')return ['fixture.png'];
 if(cmd==='preview_chat_attachment')return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1cAAAAASUVORK5CYII=';
 return {};
 }};
}, {manifest:JSON.parse(fs.readFileSync('public/design-mods/freeform-capability-fixture/mod.json','utf8')), 'entry.js':fs.readFileSync('public/design-mods/freeform-capability-fixture/entry.js','utf8'),'style.css':fs.readFileSync('public/design-mods/freeform-capability-fixture/style.css','utf8')});
try {
 await page.goto('http://127.0.0.1:1420');
 await page.getByText('My previous message',{exact:true}).waitFor();
 await page.getByRole('button',{name:'偏好',exact:true}).first().click();
 await page.getByRole('button',{name:/角色与对话/}).click();
 await page.getByText('当前角色头像',{exact:true}).waitFor();
 if(await page.getByRole('button',{name:'刷新状态',exact:true}).count()!==1)throw Error('Duplicate refresh control');
 await page.locator('.settings-section select').selectOption('b');
 await page.waitForFunction(()=>window.activeChar==='b');
 await page.locator('.settings-section select').selectOption('a');
 await page.waitForFunction(()=>window.activeChar==='a');
 const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1cAAAAASUVORK5CYII=','base64');
 await page.locator('.settings-avatar input').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:image});
 await page.locator('.avatar-cropper').waitFor();
 await page.evaluate(()=>{window.failAvatar=true;});
 await page.locator('.avatar-cropper__actions button').last().click();
 await page.getByText('头像读取或保存失败，请重试并检查图片格式、大小与连接。',{exact:true}).waitFor();
 await page.evaluate(()=>{window.failAvatar=false;});
 await page.locator('.avatar-cropper__actions button').last().click();
 await page.locator('.avatar-cropper').waitFor({state:'detached'});
 const uploads=await page.evaluate(()=>window.calls.filter(x=>x.cmd==='upload_character_avatar'));
 if(uploads.length!==2 || uploads.some(x=>x.args.charId!=='a'||x.args.contentType!=='image/png'))throw Error('Avatar target/retry failed');
 await page.locator('.settings-avatar input').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:image});
 await page.locator('.avatar-cropper').waitFor();
 await page.evaluate(async()=>{const m=await import('/src/shared/activeCharacter.ts');m.setActiveCharacterInfo({id:'b',name:'Bob',avatarRevision:0});});
 await page.locator('.avatar-cropper').waitFor({state:'detached'});
 if(await page.evaluate(()=>window.calls.filter(x=>x.cmd==='upload_character_avatar').length)!==2)throw Error('Character switch uploaded cancelled crop');
 await page.evaluate(async()=>{const m=await import('/src/shared/activeCharacter.ts');m.setActiveCharacterInfo({id:'a',name:'Alice',avatarRevision:0});});
 await page.screenshot({path:'.tmp/ui-character.png'});
 await page.getByRole('button',{name:/界面/}).click();
 await page.locator('#activity-appearance').scrollIntoViewIfNeeded();
 for(const width of [1280,520]) {
   await page.setViewportSize({width,height:900});
   const valid=await page.locator('#activity-appearance select').evaluateAll(items=>items.every(el=>{const label=el.previousElementSibling.getBoundingClientRect(),box=el.getBoundingClientRect();return label.width>100&&box.width>100&&label.right<=box.left&&Math.abs(label.top-box.top)<25;}));
   if(!valid)throw Error(`Settings alignment failed: ${width}`);
 }
 await page.screenshot({path:'.tmp/ui-activity-narrow.png'});
 await page.setViewportSize({width:1280,height:900});
 await page.locator('select').filter({has:page.locator('option[value="freeform-capability-fixture"]')}).selectOption('freeform-capability-fixture');
 await page.locator('.fixture-stage').waitFor();
 await page.getByRole('button',{name:'×',exact:true}).click();
 await page.locator('.fixture-transcript').getByText('My previous message',{exact:true}).waitFor();
 await page.locator('.fixture-composer textarea').fill('Testing the new stage');
 await page.locator('.fixture-composer textarea').press('Enter');
 await page.locator('.fixture-transcript').getByText('Fixture reply',{exact:true}).waitFor();
 await page.locator('.fixture-now').hover();
 if(!await page.locator('.fixture-connections .is-active').count())throw Error('Hover connector failed');
 await page.screenshot({path:'.tmp/ui-stage-wide.png'});
 for(const width of [900,600]) {
   await page.setViewportSize({width,height:800});
   await page.locator('.fixture-composer textarea').scrollIntoViewIfNeeded();
   const box=await page.locator('.fixture-composer textarea').boundingBox();
   if(box.x<0 || box.x+box.width>width || box.height<20)throw Error(`Composer clipped: ${width}`);
   await page.screenshot({path:`.tmp/ui-stage-${width}.png`});
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 if(await page.locator('.fixture-node').first().evaluate(el=>getComputedStyle(el).transitionDuration)!=='0s')throw Error('Reduced motion ignored');
 await page.setViewportSize({width:1280,height:900});
 // Repeated activation must not duplicate portals or leave native surfaces behind.
 for(let i=0;i<20;i++) {
   await page.evaluate(async()=>{const m=await import('/src/shared/design-mod/runtime.ts');m.setSelectedDesignModId('builtin-default');});
   await page.locator('.fixture-stage').waitFor({state:'detached'});
   await page.evaluate(async()=>{const m=await import('/src/shared/design-mod/runtime.ts');m.setSelectedDesignModId('freeform-capability-fixture');});
   await page.locator('.fixture-stage').waitFor();
   if(await page.locator('.fixture-composer textarea').count()!==1)throw Error('Duplicate composer');
 }
 if(await page.evaluate(()=>window.calls.some(x=>x.cmd==='ensure_design_satellites'&&x.args?.surfaces?.length)))throw Error('Unexpected native surfaces');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: settings geometry, avatar retry/target, chat, hover, responsive stage, reduced motion, twenty activation cycles');
} finally { await browser.close(); }

