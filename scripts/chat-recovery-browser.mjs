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
  window.extraHistory = [];
  window.fixtureBackend = 'http://fixture.invalid';
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    if (cmd === 'load_public_client_config') return { backendBase: window.fixtureBackend };
    if (cmd === 'send_chat') {
      window.sent.push(args);
      if (args.message === 'late-http') return new Promise(resolve => window.pending.push(resolve));
      throw 'CHAT_RESPONSE_TIMEOUT';
    }
    if (cmd === 'get_chat_request') {
      window.reads.push(args.requestId);
      return { request_id: args.requestId, ...window.receipts[args.requestId] };
    }
    if (cmd === 'load_chat_log_day') {
      const history = await original(cmd, args);
      return { ...history, entries: [...history.entries, ...window.extraHistory] };
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
const setReceipt = async (id, receipt) => page.evaluate(({id, receipt}) => {window.receipts[id] = receipt;}, {id, receipt});
const row = text => page.locator('.msg-enter').filter({has:page.getByText(text, {exact:true})});
const checkResult = async text => row(text).getByRole('button', {name:'查看结果', exact:true}).click();
const canonical = async (id, msg, content) => page.evaluate(async ({id, msg, content}) => {
  const {wsClient} = await import('/src/shared/api/ws.ts');
  wsClient._handleMessage(JSON.stringify({type:'channel_message', request_id:id, msg_id:msg, content}));
}, {id, msg, content});
try {
  await page.goto('http://127.0.0.1:1420', {waitUntil:'domcontentloaded', timeout:60000});
  await page.getByText('My previous message', {exact:true}).waitFor();
  const bodyless = await start('bodyless');
  await setReceipt(bodyless, {status:'completed', msg_id:'bodyless-wire', turn_id:'bodyless-turn'});
  await checkResult('bodyless');
  await row('bodyless').getByRole('status').filter({hasText:'请求已执行，但回复暂时无法恢复'}).waitFor();
  check(await row('bodyless').getByRole('button', {name:'重试', exact:true}).count() === 0, 'completed offered a send retry');
  check((await row('bodyless').getByRole('status').getAttribute('title')).includes('bodyless-turn'), 'lost canonical identity');
  await page.screenshot({path:'.tmp/chat-recovery-unavailable.png'});
  await page.evaluate(() => window.extraHistory.push({user:'Archived recovery question', assistant:'Recovered from history', ts:Date.now()/1000, turn_id:'bodyless-turn'}));
  await checkResult('bodyless');
  await page.getByText('Recovered from history', {exact:true}).waitFor();
  await row('bodyless').getByRole('status').filter({hasText:'已完成'}).waitFor();
  await canonical(bodyless, 'bodyless-wire', 'Recovered from history');
  check(await page.getByText('Recovered from history', {exact:true}).count() === 1, 'history/WS duplicated the recovered reply');

  const recoverable = await start('recoverable');
  await setReceipt(recoverable, {status:'completed', result:{reply:'Receipt recovered reply', emotion:'neutral', msg_id:'result-wire', turn_id:'result-turn'}});
  await checkResult('recoverable');
  await page.getByText('Receipt recovered reply', {exact:true}).waitFor();
  await canonical(recoverable, 'result-wire', 'Receipt recovered reply');
  check(await page.getByText('Receipt recovered reply', {exact:true}).count() === 1, 'receipt/WS duplicated a reply');

  for (const status of ['failed','interrupted_unknown','unknown']) {
    const id = await start(status);
    await setReceipt(id, {status});
    await checkResult(status);
    check(await row(status).getByRole('button', {name:'重试', exact:true}).count() === 0, status + ' offered a send retry');
  }
  const unsafe = await start('unsafe-result');
  await setReceipt(unsafe, {status:'completed', result:{reply:'__TOOL_CALL__:[]', emotion:'neutral'}});
  await checkResult('unsafe-result');
  await row('unsafe-result').getByRole('status').filter({hasText:'请求已执行，但回复暂时无法恢复'}).waitFor();
  check(!(await page.locator('body').innerText()).includes('__TOOL_CALL__'), 'control protocol leaked');

  const pending = await start('late-http');
  await canonical(pending, 'late-wire', 'Canonical wins');
  await page.getByText('Canonical wins', {exact:true}).waitFor();
  await page.evaluate(() => window.pending.shift()({reply:'Canonical wins', emotion:'neutral', msg_id:'late-wire', turn_id:'late-turn'}));
  await row('late-http').getByRole('status').filter({hasText:'已完成'}).waitFor();
  check(await page.getByText('Canonical wins', {exact:true}).count() === 1, 'late HTTP duplicated canonical');

  const before = await page.evaluate(() => window.sent.length);
  await checkResult('unknown');
  check(await page.evaluate(() => window.sent.length) === before, 'read-only check replayed a send');
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
  console.log('PASS: bodyless completion, canonical history/WS dedup, receipt recovery, unsafe-result refusal, terminal no-retry, late HTTP, read-only checks and backend switch cancellation');
} catch (error) {
  console.error(error.message);
  console.error('Browser errors:', errors);
  await page.screenshot({path:'.tmp/chat-recovery-failure.png', timeout:5000}).catch(() => {});
  await page.locator('body').innerText({timeout:5000}).then(text => console.error(text.slice(-3500))).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
`;
await import('data:text/javascript;base64,' + Buffer.from(setup + checks).toString('base64'));
