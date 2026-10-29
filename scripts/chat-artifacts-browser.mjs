// Isolated browser regression. No requests go to the real backend.
// Run with npm.cmd run dev serving this repository on port 1420.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const pkg = process.env.PLAYWRIGHT_PACKAGE_JSON || fs.readdirSync(cache)
  .map(name => path.join(cache, name, 'node_modules', 'playwright', 'package.json'))
  .find(name => fs.existsSync(name));
if (!pkg) throw new Error('Install Playwright or set PLAYWRIGHT_PACKAGE_JSON');
const { chromium } = createRequire(pkg)('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.addInitScript(() => {
  localStorage.setItem('emerald.chat.lastDesktopWakeAt', String(Date.now()));
  window.calls = [];
  let callback = 0;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: () => ++callback, unregisterCallback() {}, convertFileSrc: p => p,
    invoke: async (cmd, args) => {
      window.calls.push({ cmd, args });
      if (cmd === 'get_token_status') return { configured: true, prefix: 'fixture' };
      if (cmd === 'load_ui_prefs' || cmd === 'read_avatars_json') return '{}';
      if (cmd === 'get_prompt_assets') return { characters: [], active: {}, lorebooks: [], jailbreaks: [], dream_presets: [], world_cards: [] };
      if (cmd === 'load_chat_log_dates') return { dates: ['2026-10-29'] };
      if (cmd === 'load_chat_log_day') return {
        raw_fallback: false,
        entries: [
          { time: '12:00', user: 'fixture question', assistant: 'first segment\nsecond segment', turn_id: 'turn1', artifacts: [{ id: 'aa'.repeat(16), filename: 'report.html', mime: 'text/html', size: 12, previewable: true }] },
          { time: '12:01', user: '', assistant: '', turn_id: 'turn2', artifacts: [{ id: 'bb'.repeat(16), filename: 'file-only.txt', mime: 'text/plain', size: 4 }] },
          { time: '12:02', user: '', assistant: 'legacy reply' },
        ],
      };
      if (cmd === 'plugin:dialog|save') return window.cancelSave ? null : 'fixture-output.html';
      if (cmd === 'download_chat_artifact') {
        if (window.failDownload) throw 'HTTP 500';
        return;
      }
      if (cmd === 'preview_chat_artifact') return '<p>fixture preview</p>';
      if (cmd === 'load_desktop_tts_settings') return { enabled: false };
      if (cmd === 'plugin:event|listen') return ++callback;
      if (cmd.startsWith('list_') || cmd.includes('get_all_')) return [];
      return {};
    },
  };
});
try {
  await page.goto('http://localhost:1420');
  for (let round = 0; round < 2; round++) {
    if (round) await page.reload();
    await page.getByText('report.html', { exact: true }).waitFor();
    assert.equal(await page.getByText('report.html', { exact: true }).count(), 1);
    await page.getByText('file-only.txt', { exact: true }).waitFor();
    await page.getByText('second segment', { exact: true }).waitFor();
    await page.getByText('legacy reply', { exact: true }).waitFor();
  }
  await page.getByRole('button', { name: '下载', exact: true }).first().click();
  await page.waitForFunction(() => window.calls.some(c => c.cmd === 'download_chat_artifact'));
  assert.deepEqual(await page.evaluate(() => window.calls.find(c => c.cmd === 'download_chat_artifact').args), { artifactId: 'aa'.repeat(16), destPath: 'fixture-output.html' });
  await page.evaluate(() => { window.cancelSave = true; });
  await page.getByRole('button', { name: '下载', exact: true }).first().click();
  await page.waitForFunction(() => window.calls.filter(c => c.cmd === 'plugin:dialog|save').length === 2);
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.cmd === 'download_chat_artifact').length), 1);
  await page.evaluate(() => { window.cancelSave = false; window.failDownload = true; });
  await page.getByRole('button', { name: '下载', exact: true }).first().click();
  await page.getByText('文件下载失败，请检查连接后重试。', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: refresh, file-only history, first-segment card, legacy history, download IPC, cancel, failure notice');
} finally {
  await browser.close();
}
