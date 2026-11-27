// Staged startup with isolated IPC: no real backend calls or native actions.
// Build and serve production preview on 1422, then node scripts/staged-startup-browser.mjs.
import fs from 'node:fs';
const base = fs.readFileSync('scripts/client-fixes-browser.mjs', 'utf8').replace(/\r\n/g, '\n');
const boundary = base.indexOf('try {\n await page.goto');
if (boundary < 0) throw Error('Shared fixture boundary changed');
const setup = base.slice(0, boundary).replace('errors.push(String(e))', 'errors.push(e.stack || String(e))');
const checks = String.raw`
page.on('console', m=>{if(m.text().includes('[bootstrap]')) console.error(m.text());});
const url = process.env.PERF_URL || 'http://127.0.0.1:1422';
const entry = fs.readFileSync('dist/index.html', 'utf8').match(/type="module"[^>]*src="([^"]+)"/)[1];
await page.addInitScript(() => {
  const scenario = JSON.parse(localStorage.getItem('fixture.startupScenario') || '{}');
  localStorage.setItem('presencekit.language', scenario.language || 'zh-CN');
  window.startupPending = [];
  window.remotePhase = scenario.remote || 'ready';
  const original = window.__TAURI_INTERNALS__.invoke;
  const callbacks = {};
  const events = {};
  let nextCallback = 1000;
  window.__TAURI_INTERNALS__.transformCallback = callback => { callbacks[++nextCallback] = callback; return nextCallback; };
  const result = async (command, args) => {
    if (command === 'get_visual_perception_settings') return {enabled:false,onDemandEnabled:false,sampleIntervalSeconds:300,status:{lastAttemptAt:null,lastPushAt:null,lastResult:'idle',failureCount:0}};
    if (command === 'load_activity_state') return {id:null,text:'',arc:'',started_at:null,next_switch_at:null,thinking_about_eligible:false};
    if (command === 'computer_use_status') return {state:'closed'};
    if (command === 'device_file_status') return {state:'disabled',online:false,unrestricted:false,unrestricted_write:false,grants:[],recent:[],action:null};
    if (command === 'open_reality_session') return {session_id:'staged-session',char_id:args.charId,owner_id:'fixture',domain:'reality',connection_key:'fixture',expires_at:Date.now()/1000+3600};
    return original(command, args);
  };
  const remote = new Set(['open_reality_session', 'native_ws_connect', 'get_prompt_assets', 'get_character_avatar', 'load_chat_log_dates', 'load_chat_log_day']);
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === 'plugin:event|listen') { events[args.event] = args.handler; return original(command, args); }
    if (command === 'load_ui_prefs' && scenario.slowPreferences) {
      await new Promise(resolve => { window.releasePreferences = resolve; });
    }
    if (command === 'get_token_status' && scenario.slowCredentials) {
      await new Promise(resolve => { window.releaseCredentials = resolve; });
    }
    if (command === 'get_token_status' && scenario.unconfigured) return {configured:false};
    if (command === 'reality_connection_key') return 'fixture';
    if (remote.has(command) && window.remotePhase !== 'ready') {
      window.calls.push({cmd:command,args,held:true});
      if (window.remotePhase === 'offline') throw 'NETWORK_ERROR';
      return new Promise((resolve, reject) => window.startupPending.push({command, resolve: async () => resolve(await result(command, args)), reject}));
    }
    return result(command, args);
  };
  window.releaseBackend = async () => {
    window.remotePhase = 'ready';
    await Promise.all(window.startupPending.splice(0).map(p => p.resolve()));
    await new Promise(resolve => setTimeout(resolve, 50));
    const handler = callbacks[events['client-ws-message']];
    if (handler) handler({event:'client-ws-message', id:1, payload:{connectionId:1, data:JSON.stringify({type:'hello_ack'})}});
  };
});
await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:''}));
const saveScenario = scenario => page.evaluate(scenario => localStorage.setItem('fixture.startupScenario', JSON.stringify(scenario)), scenario);
const readyWindow = async () => {
  await page.locator('textarea').waitFor();
  check(await page.locator('.startup-surface').count() === 0, 'Loading page outlived frontend readiness');
  await page.getByRole('button', {name:'偏好', exact:true}).first().click();
  await page.locator('#activity-appearance').waitFor();
  await page.getByRole('button', {name:/常规/}).click();
  await page.locator('input[type="password"]').waitFor();
  await page.getByRole('button', {name:'×', exact:true}).last().click();
};
try {
  let releaseCode;
  const codeReady = new Promise(resolve => {releaseCode=resolve;});
  await page.route('**' + entry, async route => {await codeReady; await route.continue();});
  await page.goto(url, {waitUntil:'commit'});
  await page.locator('.startup-placeholder').waitFor({state:'visible'});
  check((await page.locator('.startup-placeholder').innerText()).trim() === '正在打开…', 'Initial Chinese copy missing');
  check(await page.locator('.startup-shell').count() === 0, 'Old green strip shell remains');
  check(await page.locator('.chat-ribbon').count() === 0, 'Partial chat shown before code loads');
  await page.screenshot({path:'.tmp/staged-startup-html.png'});
  releaseCode();
  await page.unroute('**' + entry);
  await page.locator('textarea').waitFor();

  await saveScenario({slowPreferences:true, slowCredentials:true});
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.releasePreferences && window.releaseCredentials);
  await page.locator('.startup-surface').waitFor({state:'visible'});
  check(await page.locator('.chat-ribbon').count() === 0, 'Partial layout exposed while preferences load');
  await page.evaluate(() => window.releasePreferences());
  await page.locator('.main-titlebar').waitFor();
  check(await page.locator('.startup-surface').count() === 1, 'Credential check changed loading surface');
  check(await page.locator('textarea').count() === 0, 'Credential check bypassed');
  await page.screenshot({path:'.tmp/staged-startup-react.png'});
  await page.evaluate(() => window.releaseCredentials());
  await page.locator('textarea').waitFor();

  await saveScenario({remote:'pending'});
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await readyWindow();
  await page.waitForFunction(() => window.startupPending.some(p=>p.command==='native_ws_connect') && window.startupPending.some(p=>p.command==='open_reality_session'));
  const input = page.locator('textarea');
  await input.fill('Keep this draft while connecting');
  const originalInput = await input.evaluateHandle(el=>el);
  await page.screenshot({path:'.tmp/staged-startup-pending-backend.png'});
  await page.evaluate(() => window.releaseBackend());
  await page.getByText('My previous message', {exact:true}).waitFor();
  check(await input.inputValue() === 'Keep this draft while connecting', 'Late history replaced draft');
  check(await input.evaluate((el,original)=>el===original, originalInput), 'Backend readiness remounted chat');
  check(await page.getByText('My previous message', {exact:true}).count() === 1, 'Late data duplicated history');

  await saveScenario({remote:'offline'});
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await readyWindow();
  await page.locator('textarea').fill('Keep this draft after reconnect');
  await page.screenshot({path:'.tmp/staged-startup-offline.png'});
  await page.evaluate(() => window.releaseBackend());
  check(await page.locator('textarea').inputValue() === 'Keep this draft after reconnect', 'Transport recovery lost draft');
  // A rejected initial Session is sticky by contract; user explicitly saves the
  // connection to start a fresh binding, rather than silently replacing it.
  await page.getByRole('button', {name:'偏好', exact:true}).first().click();
  await page.locator('input[type="password"]').waitFor();
  await page.getByRole('button', {name:'保存', exact:true}).click();
  await page.getByRole('button', {name:'×', exact:true}).last().click();
  await page.evaluate(() => window.releaseBackend());
  await page.getByText('My previous message', {exact:true}).waitFor({timeout:15000});
  check(await page.getByText('My previous message', {exact:true}).count() === 1, 'Reconnect duplicated history');

  await saveScenario({unconfigured:true});
  await page.goto(url, {waitUntil:'domcontentloaded'});
  await page.locator('input[type="password"]').waitFor();
  check(await page.locator('textarea').count() === 0, 'Unconfigured gate bypassed');
  check(await page.evaluate(() => !window.calls.some(call=>['open_reality_session','native_ws_connect','load_chat_log_day'].includes(call.cmd))), 'Unconfigured startup made business requests');

  await saveScenario({language:'en-US',slowPreferences:true});
  let releaseEnglishCode;
  const englishCode = new Promise(resolve=>{releaseEnglishCode=resolve;});
  await page.route('**' + entry, async route=>{await englishCode;await route.continue();});
  await page.goto(url, {waitUntil:'commit'});
  await page.locator('.startup-placeholder').waitFor({state:'visible'});
  check((await page.locator('.startup-placeholder').innerText()).trim() === 'Opening…', 'Initial English loader missing');
  await page.emulateMedia({reducedMotion:'reduce'});
  check(await page.locator('.startup-surface__ring').evaluate(el=>getComputedStyle(el).animationName) === 'none', 'Reduced motion ignored');
  await page.screenshot({path:'.tmp/staged-startup-english.png'});
  releaseEnglishCode();
  await page.unroute('**' + entry);
  await page.waitForFunction(()=>window.releasePreferences);
  check((await page.locator('.startup-surface__label').innerText()).trim() === 'Opening…', 'React changed English loader copy');
  await page.evaluate(()=>window.releasePreferences());
  await page.locator('textarea').waitFor();

  let releaseAuxCode;
  const auxCode=new Promise(resolve=>{releaseAuxCode=resolve;});
  await page.route('**' + entry, async route=>{await auxCode;await route.continue();});
  for (const role of ['pet','presence-nag','diary-detail','design-satellite','video-call-invite']) {
    await page.goto(url+'/?window='+role,{waitUntil:'commit'});
    await page.waitForFunction(()=>document.documentElement.dataset.window === new URLSearchParams(location.search).get('window'));
    check(await page.locator('.startup-placeholder').isVisible() === false, role+' showed the main loader');
    check(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor) === 'rgba(0, 0, 0, 0)', role+' lost transparency');
  }
  releaseAuxCode();
  check(errors.length === 0, 'Page errors: '+errors.join('; '));
  console.log('PASS HTML/React loading continuity, zh/en, reduced motion, slow local readiness, pending/offline backend, settings, late history/draft, explicit connection recovery and auth/auxiliary isolation');
} catch(error) {
  await page.screenshot({path:'.tmp/staged-startup-failure.png'});
  console.error('Page errors:',errors);
  throw error;
} finally {await browser.close();}
`;
await import('data:text/javascript;base64,' + Buffer.from(setup + checks).toString('base64')).catch(error=>{console.error(error.message);process.exitCode=1;});
