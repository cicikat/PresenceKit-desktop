// Isolated Tauri IPC fixture. Start this repository's Vite server on port 1420.
import fs from 'node:fs';
const source = fs.readFileSync('scripts/turn-reasoning-browser.mjs', 'utf8');
const boundary = source.indexOf('try {\n for (const delivery');
if (boundary < 0) throw Error('Reasoning browser fixture setup changed');
const setup = source.slice(0, boundary);
const checks = `
await page.addInitScript(() => {
 localStorage.setItem('fixture.historyWithTurns', 'true');
 const original = window.__TAURI_INTERNALS__.invoke;
 window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
  if (cmd !== 'send_chat') return original(cmd, args);
  const cases = {
   'same-text': { reply: 'Archived first paragraph', msg_id: 'new-wire', turn_id: 'new-turn' },
   'id-collision': { reply: 'Different new reply', msg_id: 'archived-canonical', turn_id: 'different-turn' },
   'history-alias': { reply: 'Archived first paragraph\\nArchived second paragraph', msg_id: 'historical-wire', turn_id: 'archived-canonical' },
   'stream-history': { reply: 'Archived first paragraph\\nArchived second paragraph', msg_id: 'stream-wire', turn_id: 'archived-canonical' },
   'ws-first-same': { reply: 'Archived first paragraph', msg_id: 'ws-first-wire', turn_id: 'ws-first-turn' },
   'stream-fallback': { reply: 'Final after lost stream', msg_id: 'stream-fallback-wire', turn_id: 'stream-fallback-turn' },
   'fallback-late': { reply: 'Final after late canonical', msg_id: 'late-wire', turn_id: 'late-turn' },
  };
  const result = cases[args.message];
  const { wsClient } = await import('/src/shared/api/ws.ts');
  if (args.message === 'stream-history' || args.message === 'stream-fallback') {
   wsClient._handleMessage(JSON.stringify({type:'message_stream_start',msg_id:result.msg_id}));
   wsClient._handleMessage(JSON.stringify({type:'message_stream_delta',msg_id:result.msg_id,delta:'Temporary provisional'}));
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  const canonical=()=>wsClient._handleMessage(JSON.stringify({type:'channel_message',msg_id:result.msg_id,content:result.reply}));
  if(args.message==='ws-first-same')canonical();
  else if(args.message==='fallback-late') {setTimeout(canonical,3200);setTimeout(canonical,3300);}
  else if(args.message!=='stream-fallback')setTimeout(canonical,100);
  return result;
 };
});
try {
 for (const scenario of ['same-text','id-collision','history-alias','stream-history','ws-first-same','stream-fallback','fallback-late']) {
  await page.goto('http://127.0.0.1:1420');
  await page.getByText('Archived second paragraph',{exact:true}).waitFor();
  await page.locator('textarea').fill(scenario);
  await page.locator('textarea').press('Enter');
  await page.waitForTimeout(3500);
  const historyCount=await page.getByText('Archived first paragraph',{exact:true}).count();
  const panelCount=await page.locator('.turn-reasoning').count();
  check(historyCount === (scenario==='same-text'||scenario==='ws-first-same'?2:1),'History identity mismatch: '+scenario);
  check(panelCount === (scenario==='history-alias'||scenario==='stream-history'?1:2),'Canonical grouping mismatch: '+scenario);
  if(scenario==='id-collision')check(await page.getByText('Different new reply',{exact:true}).count()===1,'Transport ID collided with history turn ID');
  if(scenario==='stream-fallback')check(await page.getByText('Final after lost stream',{exact:true}).count()===1,'HTTP did not replace partial stream');
  if(scenario==='fallback-late')check(await page.getByText('Final after late canonical',{exact:true}).count()===1,'Late/reconnected canonical duplicated fallback');
  check(await page.getByText('Temporary provisional',{exact:true}).count()===0,'Retired stream survived HTTP history alias');
  console.log('PASS history reconciliation:',scenario);
 }
 check(errors.length===0,'Browser errors: '+errors.join('; '));
} finally { await browser.close(); }
`;
await import('data:text/javascript;base64,'+Buffer.from(setup+checks).toString('base64'));
