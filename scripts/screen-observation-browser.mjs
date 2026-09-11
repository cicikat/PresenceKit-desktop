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

await page.addInitScript(() => {
 window.calls=[];
 let settings={enabled:false,onDemandEnabled:false,sampleIntervalSeconds:300,status:{lastAttemptAt:null,lastPushAt:null,lastResult:'idle',failureCount:0}};
 window.__TAURI_INTERNALS__={invoke: async (cmd,args) => {
   window.calls.push({cmd,args});
   if(cmd==='update_visual_perception_settings')settings={...settings,...args};
   return settings;
 }};
});
try {
 await page.route('**/screen-fixture',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script>'}));
 await page.goto('http://127.0.0.1:1420/screen-fixture');
 await page.evaluate(async()=>{
   await import('/src/shared/theme/globals.css');
   const React=await import('/node_modules/.vite/deps/react.js');
   const {default: {createRoot}}=await import('/node_modules/.vite/deps/react-dom_client.js');
   const {VisualPerceptionSettingsPage}=await import('/src/windows/chat/components/VisualPerceptionSettingsPage.tsx');
   createRoot(document.getElementById('root')).render(React.default.createElement(VisualPerceptionSettingsPage));
 });
 const toggle=page.getByRole('checkbox');
 await toggle.check();
 await page.waitForFunction(()=>window.calls.some(c=>c.cmd==='update_visual_perception_settings'&&c.args.onDemandEnabled===true&&c.args.enabled===false));
 await toggle.uncheck();
 await page.waitForFunction(()=>window.calls.some(c=>c.cmd==='update_visual_perception_settings'&&c.args.onDemandEnabled===false));
 await page.screenshot({path:'.tmp/screen-observation.png'});
 if(errors.length)throw Error(errors.join('\n'));
 // Admin settings: evaluate the actual script against an isolated mock API.
 await page.setContent('<div id="feature-flags-grid"></div>');
 await page.evaluate(()=>{
 window.t=(key,fallback)=>fallback;
 window.escapeHtml=value=>String(value).replaceAll('<','&lt;');
 window.api=async(method,path)=>path==='/settings/feature-flags'?{flags:{screen_observation:{enabled:true,label:'Screen observation',effective_state:'ready',description:'Device consent required'}}}:{enabled:true,active_device:'mobile',receipts:[{status:'ok'}]};
 });
 await page.addScriptTag({content:fs.readFileSync('../Emerald-presence/admin/static/js/settings.js','utf8')});
 await page.evaluate(()=>loadFeatureFlags());
 await page.getByRole('button',{name:'Screen requests and devices'}).click();
 await page.waitForFunction(()=>document.getElementById('screen-observation-status').textContent.includes('mobile'));
 console.log('PASS desktop independent opt-in/revoke and admin device/receipt observation');
} finally { await browser.close(); }
