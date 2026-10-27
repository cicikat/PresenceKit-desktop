// Production PetWindow/GLB with mocked native placement; no backend or real messages.
// Start the repository Vite server first. Does not contact a backend or send a real message.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const pkg = process.env.PLAYWRIGHT_PACKAGE_JSON ?? fs.readdirSync(cache).map(x => path.join(cache, x, 'node_modules', 'playwright', 'package.json')).find(x => fs.existsSync(x));
if (!pkg) throw new Error('Install Playwright or set PLAYWRIGHT_PACKAGE_JSON');
const { chromium } = createRequire(pkg)('playwright');
const assetDir = 'public/room/character', file = 'TV_Character_Rigged_v03.glb';
const config = JSON.parse(fs.readFileSync(path.join(assetDir, file.replace('.glb', '.screen.json')), 'utf8'));
const png = Object.fromEntries(Object.values(config.clips).filter(c => c.type === 'image').map(c => [c.uri, `data:image/png;base64,${fs.readFileSync(path.join(assetDir, c.uri)).toString('base64')}`]));
const data = { model: `data:model/gltf-binary;base64,${fs.readFileSync(path.join(assetDir, file)).toString('base64')}`, config: JSON.stringify(config), png, file };
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initUIPrefs } from '../src/shared/uiPreferences';
import { PetWindow } from '../src/windows/pet/PetWindow';
import { CharacterBehaviorState } from '../src/shared/character/behaviorState';
import { emitPetTurn } from '../src/shared/pet/bridge';
await initUIPrefs();
window.audit = { activity: 'idle' };
const frame = CharacterBehaviorState.prototype.frame;
CharacterBehaviorState.prototype.frame = function(...args) {
 const result = frame.apply(this,args); window.audit.activity=result.activity; return result;
};
window.reply = (id,content) => emitPetTurn({kind:'channel_message',msg_id:id,content,char_id:'fixture',domain:'reality'});
createRoot(document.getElementById('root')).render(<React.StrictMode><PetWindow/></React.StrictMode>);
`;
fs.mkdirSync('.tmp', {recursive:true});
fs.writeFileSync('.tmp/pet-speech-fixture.tsx',fixture.replaceAll('\n','\r\n'));
fs.writeFileSync('.tmp/pet-speech-fixture.html', '<html><head><style>body{margin:0;background:#cbd0d9}main{width:var(--native-width,340px)!important;height:var(--native-height,400px)!important}</style></head><body><div id="root"></div><script type="module" src="./pet-speech-fixture.tsx"></script></body></html>');
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:800,height:500}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(data => {
  window.native = {x:20,y:100,width:340,height:400};
  let next = 1; const callbacks = new Map(), listeners = new Map();
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'pet' }, currentWebview: { label: 'pet' } },
    transformCallback: fn => { const id = next++; callbacks.set(id, fn); return id; },
    unregisterCallback: id => callbacks.delete(id), convertFileSrc: p => p,
    invoke: async (cmd, args = {}) => {
      if (cmd === 'plugin:event|listen') { const id = next++; listeners.set(id, { event: args.event, handler: args.handler }); return id; }
      if (cmd === 'plugin:event|unlisten') { listeners.delete(args.eventId); return; }
      if (cmd === 'plugin:event|emit' || cmd === 'plugin:event|emit_to') {
        for (const [id, item] of listeners) if (item.event === args.event) callbacks.get(item.handler)?.({ id, event: args.event, payload: args.payload });
        return;
      }
      if (cmd === 'load_ui_prefs') return JSON.stringify({ 'room.settings': { characterFile: data.file, sceneFile: 'room.glb', renderMode: 'model3d' }, 'character.active': { id: 'fixture', name: 'fixture' }, 'pet.model3d.zoom': 0.6, 'pet.visual-style':'model3d' });
      if (cmd === 'get_desktop_tts') return {enabled:false};
      if (cmd === 'get_tts_auto_play') return {desktop_pet:false};
      if (cmd === 'start_voice_hotkey_listener' || cmd === 'stop_voice_hotkey_listener') return;
      if (cmd === 'plugin:window|outer_position') return {x:window.native.x,y:window.native.y};
      if (cmd === 'plugin:window|outer_size') return {width:window.native.width,height:window.native.height};
      if (cmd === 'plugin:window|available_monitors') return [{name:'fixture',position:{x:0,y:0},size:{width:1920,height:1080},workArea:{position:{x:0,y:0},size:{width:1920,height:1040}},scaleFactor:1}];
      if (cmd === 'plugin:window|set_size') {
        const size=args.value.size;
        window.native.width=size.width;window.native.height=size.height;
        document.documentElement.style.setProperty('--native-width',size.width+'px');
        document.documentElement.style.setProperty('--native-height',size.height+'px');return;
      }
      if (cmd === 'plugin:window|set_position') {Object.assign(window.native,args.value.position);return;}
      if (cmd === 'read_room_asset') return data.model;
      if (cmd === 'read_room_screen_config') return data.config;
      if (cmd === 'read_room_screen_map') return data.png[args.mapName];
      if (['read_room_material_config', 'read_room_expression_config', 'read_room_motion_config'].includes(cmd)) return null;
      if (cmd === 'send_chat') return new Promise(resolve => { window.releaseReply = resolve; });
      if (cmd === 'save_ui_prefs') return;
      throw new Error('Unexpected fixture IPC: ' + cmd);
    },
  };
}, data);
try {
 await page.goto('http://localhost:1420/.tmp/pet-speech-fixture.html');
 await page.waitForSelector('canvas');
 await page.waitForTimeout(1000);
 await page.evaluate(()=>window.reply('multi','第一段：气泡在立绘旁边。\n第二段：现在这一段也会张嘴。\n第三段：每一段独立驱动口型。'));
 const bubble=page.locator('[data-pet-bubble]');
 await bubble.waitFor();
 await page.waitForFunction(()=>window.native.width===640 && window.audit.activity==='speaking');
 const geometry=async()=>page.evaluate(()=>{
   const s=document.querySelector('[data-pet-stage]').getBoundingClientRect();
   const b=document.querySelector('[data-pet-bubble]')?.getBoundingClientRect();
   return {anchor:window.native.x+s.left,stageWidth:s.width,overlap:b?Math.max(0,Math.min(s.right,b.right)-Math.max(s.left,b.left)):0};
 });
 assert.deepEqual(await geometry(),{anchor:20,stageWidth:340,overlap:0});
 await page.screenshot({path:'.tmp/pet-bubble-right.png',clip:{x:0,y:0,width:640,height:400}});
 await page.evaluate(()=>{window.native.x=1300;});
 await page.waitForFunction(()=>document.querySelector('[data-pet-bubble]')?.dataset.petBubble==='left');
 assert.deepEqual(await geometry(),{anchor:1300,stageWidth:340,overlap:0});
 await page.screenshot({path:'.tmp/pet-bubble-left.png',clip:{x:0,y:0,width:640,height:400}});
 await page.waitForFunction(()=>document.querySelector('[data-pet-bubble]')?.textContent.includes('第二段'),null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.audit.activity),'speaking');
 await page.evaluate(async()=>{const m=await import('/src/shared/activeCharacter.ts');m.setActiveCharacterInfo({id:'fixture',name:'updated avatar',avatarRevision:1});});
 await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>window.audit.activity),'speaking');
 assert.match(await bubble.textContent(),/第二段/);
 await page.waitForFunction(()=>document.querySelector('[data-pet-bubble]')?.textContent.includes('第三段'),null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.audit.activity),'speaking');
 await page.waitForFunction(()=>!document.querySelector('[data-pet-bubble]') && window.native.width===340 && window.audit.activity==='idle',null,{timeout:10000});
 assert.equal((await geometry()).anchor,1300);
 assert.deepEqual(errors,[]);
 fs.writeFileSync('.tmp/pet-speech-report.json',JSON.stringify({geometry:await geometry(),segments:3,errors},null,2));
 console.log('PASS: production PetWindow/GLB, left/right non-overlap and stable anchor, three text segments speaking, final idle and collapse. Native geometry mocked.');
} finally {
 await browser.close();
 for(const name of ['pet-speech-fixture.tsx','pet-speech-fixture.html']) fs.unlinkSync(path.join('.tmp',name));
}
