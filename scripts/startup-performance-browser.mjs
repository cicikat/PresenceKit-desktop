// Production UI timing with isolated Tauri IPC; no real backend writes.
// Run npm.cmd run build, then npm.cmd run preview -- --host 127.0.0.1 --port 1422.
// Uses the same Playwright discovery and IPC fixtures as the chat regressions.
import fs from 'node:fs';
const base = fs.readFileSync('scripts/client-fixes-browser.mjs', 'utf8').replace(/\r\n/g, '\n');
const boundary = base.indexOf('try {\n await page.goto');
if (boundary < 0) throw new Error('Shared browser fixture boundary changed');
const setup = base.slice(0, boundary).replace('errors.push(String(e))', 'errors.push(e.stack || String(e))');
const checks = `
const url = process.env.PERF_URL || 'http://127.0.0.1:1422';
page.on('console', message => { if (message.text().includes('[bootstrap]')) console.error(message.text()); });
await page.addInitScript(() => {
  const original = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === 'reality_connection_key') return 'startup-fixture';
    if (command === 'open_reality_session') return {session_id: 'startup-session', char_id: args.charId, owner_id: 'fixture', domain: 'reality', connection_key: 'startup-fixture', expires_at: Date.now() / 1000 + 3600};
    if (command === 'get_visual_perception_settings') return {enabled: false, onDemandEnabled: false, sampleIntervalSeconds: 300, status: {lastAttemptAt: null, lastPushAt: null, lastResult: 'idle', failureCount: 0}};
    if (command === 'computer_use_status') return {state: 'closed'};
    if (command === 'device_file_status') return {state: 'disabled', online: false, unrestricted: false, unrestricted_write: false, grants: [], recent: [], action: null};
    return original(command, args);
  };
});
await page.route('https://fonts.googleapis.com/**', async route => {
  await new Promise(resolve => setTimeout(resolve, 1500));
  await route.fulfill({contentType: 'text/css', body: ''}).catch(() => {});
});
await page.addInitScript(() => {
  window.perfMarks = {};
  const watch = new MutationObserver(() => {
    if (document.querySelector('.main-titlebar') && !window.perfMarks.frame) window.perfMarks.frame = performance.now();
    if (document.querySelector('textarea') && !window.perfMarks.input) {
      window.perfMarks.input = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.perfMarks.inputFrame = performance.now(); }));
    }
  });
  watch.observe(document, {subtree: true, childList: true});
});
const clickTiming = async (locator, selector) => locator.evaluate(async (element, selector) => {
  const start = performance.now();
  element.click();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('UI did not appear: ' + selector)), 5000);
    const poll = () => {
      if (document.querySelector(selector)) requestAnimationFrame(() => {clearTimeout(timeout); resolve();});
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  return performance.now() - start;
}, selector);
try {
  const startup = [];
  const network = await page.context().newCDPSession(page);
  for (let i = 0; i < 10; i++) {
    if (i < 5) await network.send('Network.clearBrowserCache');
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.perfMarks.inputFrame);
    startup.push(await page.evaluate(() => ({
      ...window.perfMarks,
      paint: performance.getEntriesByType('paint').map(entry => ({name: entry.name, ms: entry.startTime})),
      jsBytes: performance.getEntriesByType('resource').filter(entry => entry.name.endsWith('.js')).reduce((sum, entry) => sum + entry.decodedBodySize, 0),
    })));
  }
  // Clearing HTTP cache preserves the browser process/V8/font caches.
  const cacheCleared = startup.slice(0, 5);
  const warmReloads = startup.slice(5);
  const budget = {targetMs: 200, firstPageMs: startup[0].inputFrame,
    firstPageWithinTarget: startup[0].inputFrame <= 200,
    warmWithinTarget: warmReloads.every(sample => sample.inputFrame <= 200)};
  const input = page.locator('textarea');
  await input.fill('preserved performance draft');
  const originalInput = await input.evaluateHandle(element => element);
  const interactions = {};
  interactions.preferencesCold = await clickTiming(page.getByRole('button', {name: '偏好', exact: true}).first(), '#activity-appearance');
  await page.getByRole('button', {name: /常规/}).hover();
  await page.waitForTimeout(100);
  interactions.generalPreloaded = await clickTiming(page.getByRole('button', {name: /常规/}), 'input[type="password"]');
  // The modal close button is the last literal multiplication sign in this fixture.
  await page.getByRole('button', {name: '×', exact: true}).last().click();
  await page.getByRole('button', {name: '偏好', exact: true}).first().click();
  await page.locator('input[type="password"]').waitFor();
  await page.getByRole('button', {name: '×', exact: true}).last().click();
  const activity = page.getByRole('button', {name: '一起做事', exact: true});
  await activity.hover();
  await page.waitForTimeout(100);
  interactions.activityPreloaded = await clickTiming(activity, '.activity-window');
  check(await input.evaluate((element, original) => element === original, originalInput), 'ChatPanel input remounted on navigation');
  await activity.click();
  check(await input.inputValue() === 'preserved performance draft', 'Navigation lost the draft');
  check(await page.getByText('My previous message', {exact: true}).count() === 1, 'History changed during navigation');
  await page.waitForTimeout(180);
  await page.screenshot({path: '.tmp/startup-performance.png'});

  // Slow native preferences must not hold the window frame hostage.
  await page.addInitScript(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'load_ui_prefs') await new Promise(resolve => setTimeout(resolve, 1000));
      return original(command, args);
    };
  });
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.locator('.main-titlebar').waitFor();
  check(await page.locator('textarea').count() === 0, 'Preference barrier bypassed');
  await page.waitForFunction(() => window.perfMarks.inputFrame);
  const slowPreferences = await page.evaluate(() => window.perfMarks);
  check(slowPreferences.frame < slowPreferences.input - 800, 'Frame still waits for native preferences');
  check(await page.evaluate(() => window.calls.findIndex(call => call.cmd === 'get_token_status') < window.calls.findIndex(call => call.cmd === 'load_ui_prefs')), 'Token configuration check still waits for preferences');

  // Preloading code must not mount the authenticated application before the gate.
  await page.addInitScript(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => command === 'get_token_status'
      ? {configured: false} : original(command, args);
  });
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.locator('input[type="password"]').waitFor();
  check(await page.locator('textarea').count() === 0, 'Auth gate bypassed');
  check(await page.evaluate(() => !window.calls.some(call => ['load_chat_log_day', 'native_ws_connect'].includes(call.cmd))), 'Preload mounted chat effects before authentication');
  check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
  // A failed local credential read remains recoverable and cannot mount chat.
  await page.addInitScript(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === 'get_token_status') {
        if (window.retryCredentials) return {configured: true};
        throw new Error('fixture credential read failed');
      }
      return original(command, args);
    };
  });
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.getByRole('button', {name: '重试', exact: true}).waitFor();
  check(await page.locator('textarea').count() === 0, 'Failed credential read bypassed gate');
  await page.evaluate(() => { window.retryCredentials = true; });
  await page.getByRole('button', {name: '重试', exact: true}).click();
  await page.locator('textarea').waitFor();
  check(errors.length === 0, 'Browser errors after retry: ' + errors.join('; '));
  const result = {cacheCleared, warmReloads, budget, interactions, slowPreferences, note: 'Browser production fixture; frame timestamps approximate rendering opportunities, not native process cold launch or backend latency.'};
  fs.writeFileSync('.tmp/startup-performance.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log('PASS startup feedback, delayed fonts/preferences, code preload/auth isolation and retry, retained preferences/navigation/history/draft');
} catch (error) {
  await page.screenshot({path: '.tmp/startup-performance-failure.png'});
  console.error('Fixture page errors:', errors);
  throw error;
} finally {await browser.close();}
`;
await import('data:text/javascript;base64,' + Buffer.from(setup + checks).toString('base64')).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
