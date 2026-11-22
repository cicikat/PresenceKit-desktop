// Real ChatPanel interactions with isolated Tauri/WS boundaries; no backend writes.
import fs from 'node:fs';
const base = fs.readFileSync('scripts/client-fixes-browser.mjs', 'utf8');
const setup = base.slice(0, base.indexOf('try {\n await page.goto'))
  .replace("channel:'msedge',headless:true", "channel:'msedge',headless:true,args:['--disable-gpu','--no-proxy-server']");
const checks = `
await page.addInitScript(() => {
  const original = window.__TAURI_INTERNALS__.invoke;
  window.receipts = {};
  window.sent = [];
  window.reads = [];
  window.pending = [];
  window.rejects = {};
  window.extraHistory = [];
  window.sendReceipts = {};
  window.historyOnReceipt = {};
  window.holdSends = [];
  window.fixtureBackend = 'http://fixture.invalid';
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === 'load_public_client_config') return { backendBase: window.fixtureBackend };
    if (cmd === 'send_chat') {
      window.sent.push(args);
      if (args.message === 'partial-stream') return new Promise((resolve, reject) => {window.rejects[args.requestId] = reject;});
      if (args.message === 'late-http' || window.holdSends.includes(args.message)) return new Promise(resolve => window.pending.push(resolve));
      if (window.sendReceipts[args.message]) {
        window.receipts[args.requestId] = window.sendReceipts[args.message];
      }
      throw 'CHAT_RESPONSE_TIMEOUT';
    }
    if (cmd === 'get_chat_request') {
      window.reads.push(args.requestId);
      if (window.receipts[args.requestId]?.turn_id === 'bodyless-turn') {
        window.extraHistory = window.historyOnReceipt[args.requestId] || window.extraHistory;
      }
      if (args.requestId === sessionStorage.getItem('fixture.pending')) {
        return { request_id: args.requestId, status: 'running' };
      }
      return { request_id: args.requestId, ...window.receipts[args.requestId] };
    }
    if (cmd === 'load_chat_log_day') {
      const history = await original(cmd, args);
      return { ...history, entries: [...history.entries.map(entry => entry.user === 'My previous message' ? {...entry, user: entry.user + '\\n> speaker:user turn_id:fixture-user'} : entry), ...window.extraHistory] };
    }
    return original(cmd, args);
  };
});
const start = async text => {
  await page.locator('textarea').fill(text);
  await page.locator('textarea').press('Enter');
  await page.waitForFunction(text => window.sent.some(item => item.message === text), text);
  return page.evaluate(text => window.sent.find(item => item.message === text).requestId, text);
};
const setReceipt = async (text, receipt) => page.evaluate(({text, receipt}) => {window.sendReceipts[text] = receipt;}, {text, receipt});
const row = text => page.locator('.msg-enter').filter({has:page.getByText(text, {exact:true})});
const waitForRead = id => page.waitForFunction(id => window.reads.includes(id), id);
const canonical = async (id, msg, content) => page.evaluate(async ({id, msg, content}) => {
  // Reuse Vite's loaded URL, including its HMR version, to reach ChatPanel's singleton.
  const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/shared/api/ws.ts')?.name;
  const {wsClient} = await import(moduleUrl || '/src/shared/api/ws.ts');
  wsClient._handleMessage(JSON.stringify({type:'channel_message', request_id:id, msg_id:msg, content}));
}, {id, msg, content});
try {
  await page.goto('http://127.0.0.1:1420', {waitUntil:'domcontentloaded', timeout:60000});
  await page.getByText('My previous message', {exact:true}).waitFor();
  const restored = await page.evaluate(() => {
    const id = 'dc-' + Date.now() + '-1234567890abcdef1234567890abcdef';
    sessionStorage.setItem('fixture.pending', id);
    localStorage.setItem('presencekit.desktop.chat.pending:http://fixture.invalid', JSON.stringify([id]));
    return id;
  });
  await page.reload();
  await page.getByText('My previous message', {exact:true}).waitFor();
  await page.getByText('Character previous message', {exact:true}).waitFor();
  await waitForRead(restored);
  check(await page.locator('.msg-enter').count() === 2, 'a journal ID created a fake message after reload');
  check(await page.evaluate(() => window.sent.length) === 0, 'reload replayed a send');
  const bodyless = await start('bodyless');
  await page.evaluate(id => {
    window.historyOnReceipt[id] = [{user:'bodyless', assistant:'Recovered from history', ts:Date.now()/1000, turn_id:'bodyless-turn'}];
    window.receipts[id] = {status:'completed', msg_id:'bodyless-wire', turn_id:'bodyless-turn'};
  }, bodyless);
  await page.getByText('Recovered from history', {exact:true}).waitFor();
  check(await row('bodyless').count() === 1, 'history duplicated the original user message');
  await canonical(bodyless, 'bodyless-wire', 'Recovered from history');
  check(await page.getByText('Recovered from history', {exact:true}).count() === 1, 'history/WS duplicated the recovered reply');

  await setReceipt('recoverable', {status:'completed', result:{reply:'Receipt recovered reply', emotion:'neutral', msg_id:'result-wire', turn_id:'result-turn'}});
  const recoverable = await start('recoverable');
  await page.getByText('Receipt recovered reply', {exact:true}).waitFor();
  await canonical(recoverable, 'result-wire', 'Receipt recovered reply');
  check(await page.getByText('Receipt recovered reply', {exact:true}).count() === 1, 'receipt/WS duplicated a reply');

  for (const [text, status, error_code] of [
    ['failed', 'failed'], ['interrupted_unknown', 'interrupted_unknown'], ['unknown', 'unknown'],
    ['quota', 'failed', 'upstream_quota_exhausted'],
  ]) {
    await setReceipt(text, {status, error_code});
    const id = await start(text);
    await waitForRead(id);
    const label = error_code ? '模型服务额度不足，点击重新发送'
      : status === 'failed' ? '发送失败，点击重新发送' : '未收到回复，点击重新发送';
    const retry = row(text).getByRole('button', {name: label, exact:true});
    await retry.waitFor();
    check(await retry.locator('span').innerText() === '❗', status + ' did not show a red exclamation');
    if (text === 'failed') {
      await retry.scrollIntoViewIfNeeded();
      await page.screenshot({path:'.tmp/chat-send-retry.png'});
    }
    const count = await page.evaluate(() => window.sent.length);
    await page.locator('textarea').fill('Keep my next draft');
    await page.evaluate(text => { delete window.sendReceipts[text]; window.holdSends.push(text); }, text);
    await retry.dblclick();
    await page.waitForFunction(count => window.sent.length === count + 1, count);
    const attempts = await page.evaluate(text => window.sent.filter(item => item.message === text), text);
    check(attempts.length === 2 && attempts[1].requestId !== id, status + ' retry did not send exactly once with a new ID');
    check(await row(text).count() === 1, text + ' retry duplicated the user bubble');
    check(await page.locator('textarea').inputValue() === 'Keep my next draft', 'retry replaced the next draft');
    await canonical(attempts[1].requestId, text + '-retry-wire', text + ' recovered');
    await page.getByText(text + ' recovered', {exact:true}).waitFor();
    await page.evaluate(text => window.pending.shift()({reply:text + ' recovered', emotion:'neutral', msg_id:text + '-retry-wire'}), text);
    check(await row(text).getByRole('button').count() === 0, 'successful retry kept the failure indicator');
  }
  await setReceipt('unsent', {status:'not_executed'});
  await start('unsent');
  await row('unsent').getByRole('button', {name:'发送失败，点击重新发送', exact:true}).waitFor();
  await setReceipt('unsafe-result', {status:'completed', result:{reply:'__TOOL_CALL__:[]', emotion:'neutral'}});
  const unsafe = await start('unsafe-result');
  await waitForRead(unsafe);
  check(!(await page.locator('body').innerText()).includes('__TOOL_CALL__'), 'control protocol leaked');

  const pending = await start('late-http');
  await canonical(pending, 'late-wire', 'Canonical wins');
  await page.getByText('Canonical wins', {exact:true}).waitFor();
  await page.evaluate(() => window.pending.shift()({reply:'Canonical wins', emotion:'neutral', msg_id:'late-wire', turn_id:'late-turn'}));
  check(await page.getByText('Canonical wins', {exact:true}).count() === 1, 'late HTTP duplicated canonical');

  const partialId = await start('partial-stream');
  await page.evaluate(async id => {
    const moduleUrl = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/shared/api/ws.ts')?.name;
    const {wsClient} = await import(moduleUrl || '/src/shared/api/ws.ts');
    wsClient._handleMessage(JSON.stringify({type:'message_stream_start', request_id:id, msg_id:'partial-wire'}));
    wsClient._handleMessage(JSON.stringify({type:'message_stream_delta', msg_id:'partial-wire', delta:'Reply received before disconnect'}));
  }, partialId);
  await page.getByText('Reply received before disconnect', {exact:true}).waitFor();
  await page.evaluate(id => {window.receipts[id] = {status:'failed'}; window.rejects[id]('CHAT_REQUEST_INTERRUPTED');}, partialId);
  await row('partial-stream').getByRole('button', {name:'发送失败，点击重新发送', exact:true}).waitFor();
  check(await page.getByText('Reply received before disconnect', {exact:true}).count() === 1, 'failed receipt deleted partial stream text');

  await page.getByText('Reply received before disconnect', {exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'.tmp/chat-recovery-partial.png'});
  await canonical(partialId, 'partial-wire', 'Late full reply replaces partial');
  await page.getByText('Late full reply replaces partial', {exact:true}).waitFor();
  check(await page.getByText('Reply received before disconnect', {exact:true}).count() === 0, 'late canonical duplicated preserved partial prose');
  check(await row('partial-stream').getByRole('button').count() === 0, 'late canonical kept failure indicator');
  check(!(await page.locator('[data-chat-region="transcript"]').innerText()).includes('speaker:user'), 'writer metadata leaked after reload');
  const before = await page.evaluate(() => window.sent.length);
  check(await page.evaluate(() => window.sent.length) === 14, 'automatic recovery replayed a send');
  const transcript = page.locator('[data-chat-region="transcript"]');
  for (const label of ['上次未对账的聊天请求', '处理中', '查看结果', '执行状态待确认', '已完成']) {
    check(await transcript.getByText(label, {exact:true}).count() === 0, 'technical copy leaked: ' + label);
  }
  const oldId = await start('old-backend');
  await page.evaluate(async () => {
    window.fixtureBackend = 'http://other-fixture.invalid';
    const {invalidateClientConfig} = await import('/src/shared/api/config.ts');
    invalidateClientConfig();
  });
  await page.getByText('old-backend', {exact:true}).waitFor({state:'detached'});
  const count = await page.evaluate(id => window.reads.filter(value => value === id).length, oldId);
  await page.waitForTimeout(2500);
  check(await page.evaluate(id => window.reads.filter(value => value === id).length, oldId) === count, 'old backend polling survived scope switch');
  check(await page.evaluate(() => window.sent.length) === before + 1, 'scope switch replayed a send');
  check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
  console.log('PASS: reload restores real chat, failure indicators and explicit resend, draft preservation, history/WS dedup, late HTTP and backend switch cancellation');
} catch (error) {
  console.error(error.message);
  console.error('Browser errors:', errors);
  console.error('Chat events:', chatLogs);
  await page.screenshot({path:'.tmp/chat-recovery-failure.png', timeout:5000}).catch(() => {});
  await page.locator('body').innerText({timeout:5000}).then(text => console.error(text.slice(-3500))).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
`;
await import('data:text/javascript;base64,' + Buffer.from(setup + checks).toString('base64'));
