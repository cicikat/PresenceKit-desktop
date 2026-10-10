// Real GLB/PNG and production React stage; mock only Tauri transport and TTS synthesis.
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
const wave = Buffer.alloc(44 + 16000 * 2 * 3);
wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
const data = { model: `data:model/gltf-binary;base64,${fs.readFileSync(path.join(assetDir, file)).toString('base64')}`, config: JSON.stringify(config), png, audio: wave.toString('base64'), file };
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initUIPrefs } from '../src/shared/uiPreferences';
import { Model3DStage } from '../src/windows/pet/components/Model3DStage';
import { VoiceMessageBar } from '../src/windows/chat/components/VoiceMessageBar';
import { CharacterPerformer } from '../src/shared/character/performer';
import { ScreenDriver } from '../src/windows/room/screenDriver';
import { sendChat } from '../src/shared/api/backend';
import { emitPetTurn } from '../src/shared/pet/bridge';
await initUIPrefs();
window.audit = { clip: '', frames: 0, maxScale: 0, minScale: 10, footDelta: 0, headPeak: 0, chestPeak: 0, transitions: [] };
const updateScreen = ScreenDriver.prototype.update;
ScreenDriver.prototype.update = function(...args) {
  updateScreen.apply(this, args);
  if(window.audit.clip !== this.status.clip) window.audit.transitions.push(this.status.clip);
  window.audit.clip = this.status.clip;
};
const updatePerformer = CharacterPerformer.prototype.update;
CharacterPerformer.prototype.update = function(ctx) {
  const feet = [this.bones.resolved.footL, this.bones.resolved.footR].filter(Boolean);
  ctx.charGroup.updateMatrixWorld(true);
  const before = feet.map(b => b.getWorldPosition(b.position.clone()));
  const chest = this.bones.resolved.chest;
  const q = chest?.quaternion.clone();
  updatePerformer.call(this,ctx);
  ctx.charGroup.updateMatrixWorld(true);
  feet.forEach((b,i) => window.audit.footDelta=Math.max(window.audit.footDelta,b.getWorldPosition(b.position.clone()).distanceTo(before[i])));
  if(chest) {
    window.audit.maxScale=Math.max(window.audit.maxScale,chest.scale.x);
    window.audit.minScale=Math.min(window.audit.minScale,chest.scale.x);
    window.audit.chestPeak=Math.max(window.audit.chestPeak,q.angleTo(chest.quaternion));
  }
  const head=this.bones.resolved.head;
  if(head) window.audit.headPeak=Math.max(window.audit.headPeak,Math.abs(head.rotation.x),Math.abs(head.rotation.y));
  window.audit.frames++;
};
function App() {
  const [mood,setMood]=useState('平静'),[voice,setVoice]=useState(null);
  window.fixture={setMood,reply:(id,text='hello')=>emitPetTurn({kind:'channel_message',msg_id:id,content:text,char_id:'fixture',domain:'reality'}),
    stream:(kind,id,delta)=>emitPetTurn({kind,msg_id:id,delta,char_id:'fixture',domain:'reality'}),
    segments:(id,expression)=>emitPetTurn({kind:'message_segments',msg_id:id,content:'hello',segments:[{type:'say',text:'hello',perform:{expression}}],char_id:'fixture',domain:'reality'}),
    send:()=>{window.pendingSend=sendChat('fixture user message');},
    release:()=>window.releaseReply({reply:'hello',emotion:'neutral',msg_id:'http-1'}),
    speak:(id)=>setVoice({id,text:'synthetic playback fixture'}),
    stop:()=>setVoice(null)};
  return <><Model3DStage snapshot={{mood,presence:'active',thinking:false,updatedAt:Date.now()}}/>
    {voice&&<VoiceMessageBar key={voice.id} text={voice.text} messageId={voice.id} autoPlay controlsVisible={false}/>}</>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
`;
fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/tv-behavior-fixture.tsx', fixture.replaceAll('\n', '\r\n'));
fs.writeFileSync('.tmp/tv-behavior-fixture.html', '<html><head><style>html,body,#root{width:100%;height:100%;margin:0;background:#d7dbe2}</style></head><body><div id="root"></div><script type="module" src="./tv-behavior-fixture.tsx"></script></body></html>');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
const errors = [], warnings = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
await page.addInitScript(data => {
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
      if (cmd === 'load_ui_prefs') return JSON.stringify({ 'room.settings': { characterFile: data.file, sceneFile: 'room.glb', renderMode: 'model3d' }, 'character.active': { id: 'fixture', name: 'fixture' }, 'pet.model3d.zoom': 0.6 });
      if (cmd === 'read_room_asset') return data.model;
      if (cmd === 'read_room_screen_config') return data.config;
      if (cmd === 'read_room_screen_map') return data.png[args.mapName];
      if (['read_room_material_config', 'read_room_expression_config', 'read_room_motion_config'].includes(cmd)) return null;
      if (cmd === 'send_chat') return new Promise(resolve => { window.releaseReply = resolve; });
      if (cmd === 'synthesize_desktop_voice') return { audio_b64: data.audio, mime: 'audio/wav' };
      if (cmd === 'save_ui_prefs') return;
      throw new Error('Unexpected fixture IPC: ' + cmd);
    },
  };
}, data);
try {
  await page.goto('http://localhost:1420/.tmp/tv-behavior-fixture.html');
  await page.waitForFunction(() => window.audit?.clip === 'normal', { timeout: 20000 });
  const clip = async value => page.waitForFunction(value => window.audit.clip === value, value, { timeout: 10000 });
  const screenshot = async label => page.screenshot({ path: `.tmp/tv-${label}.png` });
  await screenshot('normal');
  const index = process.argv.indexOf('--idle-ms');
  const idleMs = index >= 0 ? Number(process.argv[index + 1]) : 120000;
  console.log(`Real React/GLB Idle observation started: ${idleMs}ms`);
  await page.waitForTimeout(idleMs);
  const idle = await page.evaluate(() => ({ ...window.audit }));
  assert(idle.headPeak > 0.005 && idle.chestPeak > 0.002, 'Idle accents must be visible numerically');
  assert(idle.maxScale < 1.004 && idle.minScale > 0.996 && idle.footDelta < 1e-7);
  await page.evaluate(() => window.fixture.send()); await clip('thinking'); await page.waitForTimeout(1200); await screenshot('thinking');
  await page.evaluate(() => window.fixture.release()); await clip('speaking'); await screenshot('speaking'); await clip('normal');
  await page.evaluate(async () => { await window.fixture.reply('angry-1'); await window.fixture.segments('angry-1', 'angry'); });
  await clip('angry'); await screenshot('angry');
  await page.evaluate(() => window.fixture.speak('angry-1')); await clip('speaking'); await clip('angry');
  await page.evaluate(async () => { await window.fixture.reply('sad-1'); await window.fixture.segments('sad-1', 'sad'); });
  await clip('sad'); await screenshot('sad');
  await page.evaluate(() => window.fixture.stream('message_stream_start','stream-1')); await clip('thinking');
  await page.evaluate(() => window.fixture.stream('message_stream_delta','stream-1','reply')); await clip('speaking');
  await page.evaluate(() => window.fixture.stream('message_stream_end','stream-1')); await clip('sad');
  assert.deepEqual(errors, []);
  assert(!warnings.some(w => w.includes('original material retained') || w.includes('material preparation failed')));
  const report = { idleMs, idle, final: await page.evaluate(() => window.audit), errors, warnings };
  fs.writeFileSync('.tmp/tv-behavior-browser-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
