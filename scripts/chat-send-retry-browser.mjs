// Isolated IPC fixture: no real backend writes. Start the local Vite server first.
import fs from 'node:fs';
const base = fs.readFileSync('scripts/client-fixes-browser.mjs', 'utf8');
const setup = base.slice(0, base.indexOf('try {\n await page.goto'));
const checks = `
await page.addInitScript(()=>{
 const original=window.__TAURI_INTERNALS__.invoke;
 window.pending=[];window.sent=[];
 window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{
  if(cmd==='send_chat'||cmd==='upload_document') {
   window.sent.push({cmd,args});
   return new Promise((resolve,reject)=>window.pending.push({resolve,reject}));
  }
  return original(cmd,args);
 };
});
try {
 await page.goto('http://127.0.0.1:1420');
 await page.getByText('My previous message',{exact:true}).waitFor();
 const input=page.locator('textarea');
 await input.fill('first send');await input.press('Enter');
 await page.waitForFunction(()=>window.pending.length===1);
 check(await input.inputValue()==='', 'text not cleared');
 await page.evaluate(()=>window.pending.shift().reject('HTTP 500: fixture failure'));
 const retry=page.getByRole('button',{name:'重试',exact:true});
 await retry.waitFor();await input.fill('new draft');await retry.click();
 await page.waitForFunction(()=>window.pending.length===1);
 check(await page.getByText('first send',{exact:true}).count()===1,'duplicate user bubble');
 check(await input.inputValue()==='new draft','retry overwrote new draft');
 check(await page.evaluate(()=>window.sent[1].args.message==='first send'),'wrong retry payload');
 await page.evaluate(()=>window.pending.shift().resolve({reply:'text success',msg_id:'text-success'}));
 await page.getByText('text success',{exact:true}).waitFor();
 await input.fill('image note');
 await input.evaluate(el=>{
  const data=new DataTransfer();
  data.items.add(new File([new Uint8Array([137,80,78,71])],'sample.png',{type:'image/png'}));
  el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
 });
 await page.locator('.chat-attachment-card').waitFor();
 await input.press('Enter');await page.waitForFunction(()=>window.pending.length===1);
 check(await page.locator('.chat-attachment-card').count()===0,'attachment not cleared immediately');
 check(await input.inputValue()==='','attachment note not cleared');
 await page.evaluate(()=>window.pending.shift().reject('HTTP 500: fixture upload failure'));
 await retry.waitFor();await input.fill('next draft');await retry.click();
 await page.waitForFunction(()=>window.pending.length===1);
 check(await input.inputValue()==='next draft','upload retry overwrote new draft');
 check(await page.evaluate(()=>JSON.stringify(window.sent[2].args)===JSON.stringify(window.sent[3].args)),'upload retry lost payload');
 await page.evaluate(()=>window.pending.shift().resolve({reply:'upload success',msg_id:'upload-success'}));
 await page.getByText('upload success',{exact:true}).waitFor();
 check(await retry.count()===0,'successful retry still shown');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for(const event of [{type:'message_stream_start'},{type:'message_stream_delta',delta:'<big>Live style</bi'}])
   wsClient._handleMessage(JSON.stringify({msg_id:'style',...event}));
 });
 const live=page.getByText('Live style',{exact:true});await live.waitFor();
 check(await live.evaluate(el=>el.style.fontSize==='1.18em'),'style delayed until canonical');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for(const event of [{type:'message_stream_delta',delta:'g>'},{type:'message_stream_end'},{type:'channel_message',content:'<big>Live style</big>'}])
   wsClient._handleMessage(JSON.stringify({msg_id:'style',...event}));
 });
 check(await live.count()===1,'canonical duplicated stream');
 await page.screenshot({path:'.tmp/chat-send-retry.png'});
 check(errors.length===0,'Browser errors: '+errors.join('; '));
 console.log('PASS: immediate draft clearing, text/upload retry payloads, no duplicate bubbles, newer draft preserved, live styling and canonical dedup');
} finally {await browser.close();}
`;
await import('data:text/javascript;base64,'+Buffer.from(setup+checks).toString('base64'));
