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
  let backend = { enabled: true, device_online: true, model_route: '', vision_ready: false };
  let session = { status: 'unavailable' };
  window.setFixtureBackend = value => { backend = { ...backend, ...value }; };
  window.setFixtureStatus = value => { status = { ...status, ...value }; };
  window.setFixtureSession = value => { session = value; };
  window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
    window.calls.push({ command, args });
    if (command === 'computer_use_status') return status;
    if (command === 'computer_use_backend_status') return backend;
    if (command === 'computer_use_agent_status') return session;
    if (command === 'computer_use_windows') return [{ id: { handle: 20, pid: 30, thread: 40, created: [1, 2] }, title: 'Test Notepad' }];
    if (command === 'computer_use_open') {
      status = { ...status, state: 'ready', scope: args.scope, cloud_vision: args.cloudVision ?? null,
        remaining_ms: args.durationSeconds * 1000, reason: null };
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
  const grant = page.getByRole('button', { name: 'Allow computer use' });
  await grant.waitFor();
  assert.equal(await grant.isDisabled(), false);
  assert.equal(await page.getByRole('combobox', { name: 'Select a window' }).isVisible(), false);
  await grant.click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => {
    window.setFixtureStatus({ state: 'running', task_id: 'abc12345', steps: 3 });
    window.setFixtureSession({ status: 'acting', updated_at: Date.now() / 1000 });
  });
  await page.locator('#pet').getByText('Operating', { exact: true }).waitFor();
  await page.locator('#pet').getByRole('button', { name: 'Stop' }).click();
  await page.locator('#pet').getByRole('button', { name: 'Stop' }).waitFor({ state: 'hidden' });
  await page.evaluate(() => window.setFixtureSession({ status: 'outcome_unknown', updated_at: Date.now() / 1000 }));
  await page.locator('#pet').getByText('Result needs verification').waitFor();
  await page.getByText('Advanced access options').click();
  await page.getByRole('combobox', { name: 'Select a window' }).selectOption({ label: 'Test Notepad' });
  await page.getByRole('combobox', { name: 'Access duration' }).selectOption('5');
  await grant.click();
  const stop = page.locator('#root').getByRole('button', { name: 'Stop' });
  await stop.click();
  await page.getByRole('combobox', { name: 'Access scope' }).selectOption('desktop');
  await page.getByRole('button', { name: 'Allow entire desktop' }).click();
  const grants = await page.evaluate(() => window.calls.filter(item => item.command === 'computer_use_open'));
  assert.equal(grants.length, 3);
  assert.deepEqual(grants[0].args, {
    scope: null, durationSeconds: 600, charId: 'fixture',
    overlayLabel: 'Fixture is operating · Esc to cancel',
  });
  assert.deepEqual(grants[1].args.scope,
    { kind: 'window', window: { handle: 20, pid: 30, thread: 40, created: [1, 2] } });
  assert.equal(grants[1].args.durationSeconds, 300);
  assert.deepEqual(grants[2].args.scope, { kind: 'desktop' });

  await stop.click();
  await page.getByText('Advanced access options').click();
  await page.evaluate(() => window.setFixtureBackend({ transport_mode: 'cloud_proxy', vision_ready: true }));
  const consent = page.getByRole('checkbox', { name: /Allow this session to send necessary screenshots/ });
  await consent.waitFor({ timeout: 10000 });
  assert.equal(await consent.isChecked(), false);
  await grant.click();
  await page.getByText('Cloud screenshots unavailable for this session.').waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(item => item.command === 'computer_use_open').at(-1).args.cloudVision), false);
  await stop.click();
  await consent.check();
  await grant.click();
  await page.getByText('Cloud screenshots allowed for this session.').waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(item => item.command === 'computer_use_open').at(-1).args.cloudVision), true);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByText('Cloud screenshots paused.').waitFor();
  await stop.click();
  assert.equal(await consent.isChecked(), false);
  assert.deepEqual(errors, []);
  console.log('Computer Use browser passed: foreground and advanced grants, cloud consent, pause/resume and Agent status.');
} finally {
  await browser.close();
}
