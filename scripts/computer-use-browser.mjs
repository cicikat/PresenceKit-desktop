// Runs the actual settings and pet components with in-memory Tauri fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const pkg = process.env.PLAYWRIGHT_PACKAGE_JSON ||
  fs.readdirSync(cache).map(name => path.join(cache, name, 'node_modules', 'playwright', 'package.json'))
    .find(candidate => fs.existsSync(candidate));
const { chromium } = createRequire(pkg)('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 820 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

await page.addInitScript(() => {
  localStorage.setItem('presencekit.language', 'en-US');
  localStorage.setItem('presencekit.ui.character.active', JSON.stringify({ id: 'fixture' }));
  window.calls = [];
  let status = { supported: true, state: 'closed', scope: null, reason: null, remaining_ms: 0, task_id: null, steps: 0 };
  window.setFixtureStatus = value => { status = { ...status, ...value }; };
  window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
    window.calls.push({ command, args });
    if (command === 'computer_use_status') return status;
    if (command === 'computer_use_backend_status') return { enabled: true, device_online: true, model_route: '', vision_ready: false };
    if (command === 'computer_use_windows') return [{ id: { handle: 20, pid: 30, thread: 40, created: [1, 2] }, title: 'Test Notepad' }];
    if (command === 'computer_use_open') {
      status = { ...status, state: 'ready', scope: args.scope, remaining_ms: args.durationSeconds * 1000, reason: null };
      return status;
    }
    if (command === 'computer_use_control') {
      status = { ...status, state: { pause: 'paused', resume: 'ready', stop: 'closed' }[args.control] };
      return status;
    }
    return {};
  } };
});

try {
  await page.route('**/computer-use-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<div id="root"></div><div id="pet"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script>',
  }));
  await page.goto((process.env.DESKTOP_TEST_URL || 'http://127.0.0.1:1420') + '/computer-use-fixture');
  await page.evaluate(async () => {
    await import('/src/shared/theme/globals.css');
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { ComputerUseSettingsPage } = await import('/src/windows/chat/components/ComputerUseSettingsPage.tsx');
    const { PetComputerUse } = await import('/src/windows/pet/components/PetComputerUse.tsx');
    const { setActiveCharacterInfo } = await import('/src/shared/activeCharacter.ts');
    setActiveCharacterInfo({ id: 'fixture', name: 'Fixture', avatarRevision: 0 });
    createRoot(document.getElementById('root')).render(React.createElement(ComputerUseSettingsPage));
    createRoot(document.getElementById('pet')).render(React.createElement(PetComputerUse));
  });
  const grant = page.getByRole('button', { name: 'Allow selected window' });
  await grant.waitFor();
  assert.equal(await grant.isDisabled(), true);
  await page.getByRole('combobox', { name: 'Select a window' }).selectOption({ label: 'Test Notepad' });
  await grant.click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => window.setFixtureStatus({ state: 'running', task_id: 'abc12345', steps: 3 }));
  await page.locator('#pet').getByText(/Operating desktop.*Step 3/).waitFor();
  await page.locator('#pet').getByRole('button', { name: 'Stop' }).click();
  await page.locator('#pet').getByRole('button', { name: 'Stop' }).waitFor({ state: 'hidden' });
  await page.getByRole('combobox', { name: 'Access scope' }).selectOption('desktop');
  await page.getByRole('button', { name: 'Allow entire desktop' }).click();
  const grants = await page.evaluate(() => window.calls.filter(item => item.command === 'computer_use_open'));
  assert.equal(grants.length, 2);
  assert.deepEqual(grants[0].args, {
    scope: { kind: 'window', window: { handle: 20, pid: 30, thread: 40, created: [1, 2] } },
    durationSeconds: 180, charId: 'fixture',
  });
  assert.deepEqual(grants[1].args.scope, { kind: 'desktop' });
  assert.deepEqual(errors, []);
  console.log('Computer Use browser passed: scoped grant, pause/resume, pet status and stop.');
} finally {
  await browser.close();
}
