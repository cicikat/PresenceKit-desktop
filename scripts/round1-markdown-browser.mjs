// Real ChatPanel with isolated IPC/history/WS fixtures; no real backend access.
import fs from 'node:fs';
const base=fs.readFileSync('scripts/client-fixes-browser.mjs','utf8');
const setup=base.slice(0,base.indexOf('try {\n await page.goto'));
const checks=`
const markdown='# Markdown Title\\n\\n**bold** *italic* ~~old~~ <hl>accent</hl>\\n\\n> quote\\n\\n1. first\\n2. second\\n\\n'+String.fromCharCode(96).repeat(3)+'text\\n<hl>literal code</hl>\\n'+String.fromCharCode(96).repeat(3)+'\\n\\n| A | B |\\n|---|---|\\n| one | two |\\n\\n<script>window.markdownExecuted=true</script>\\n\\n![private](https://private.invalid/image)\\n\\n[unsafe](javascript:alert(1)) [safe](https://example.invalid)';
let remoteImages=0;
page.on('request',request=>{if(request.url().startsWith('https://private.invalid'))remoteImages++;});
await page.addInitScript(markdown=>{
 const original=window.__TAURI_INTERNALS__.invoke;
 window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{
  if(cmd==='send_chat')return {reply:markdown,turn_id:'markdown-canonical',msg_id:'markdown-canonical'};
  if(cmd==='load_chat_log_day')return {entries:[{user:'fixture question',assistant:markdown,turn_id:'markdown-history',ts:Date.now()/1000}],raw_fallback:false};
  return original(cmd,args);
 };
},markdown);
try {
 await page.goto('http://127.0.0.1:1420');
 await page.locator('.chat-markdown h1').getByText('Markdown Title',{exact:true}).waitFor();
 check(await page.locator('.chat-markdown table').count()===1,'history split the Markdown table');
 check(await page.locator('.chat-markdown code').getByText('<hl>literal code</hl>',{exact:true}).count()===1,'code treated as display markup');
 check(await page.locator('.chat-markdown script,.chat-markdown img').count()===0,'HTML or remote image mounted');
 check(await page.locator('.chat-markdown a[href^="javascript:"]').count()===0,'unsafe URL exposed');
 check(await page.evaluate(()=>window.markdownExecuted)!==true,'HTML executed');
 check(remoteImages===0,'remote image fetched');
 await page.locator('textarea').fill('Markdown question');await page.locator('textarea').press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('.chat-markdown table').length===2);
 check(await page.locator('.chat-markdown h1').count()===2,'live reply fragmented');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for(const event of [{type:'message_stream_start'},{type:'message_stream_delta',delta:'# Streaming title\\n\\n'+String.fromCharCode(96).repeat(3)+'text\\npartial'}]) wsClient._handleMessage(JSON.stringify({msg_id:'markdown-stream',...event}));
 });
 check(await page.locator('.chat-markdown h1').getByText('Streaming title',{exact:true}).count()===0,'partial stream parsed as final Markdown');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  const text='# Streaming title\\n\\n'+String.fromCharCode(96).repeat(3)+'text\\npartial\\n'+String.fromCharCode(96).repeat(3);
  for(const event of [{type:'message_stream_delta',delta:'\\n'+String.fromCharCode(96).repeat(3)},{type:'message_stream_end'},{type:'channel_message',content:text}])wsClient._handleMessage(JSON.stringify({msg_id:'markdown-stream',...event}));
 });
 await page.locator('.chat-markdown h1').getByText('Streaming title',{exact:true}).waitFor();
 check(await page.locator('.chat-markdown h1').getByText('Streaming title',{exact:true}).count()===1,'final stream duplicated');
 await page.screenshot({path:'.tmp/round1-markdown-desktop.png'});
 await page.setViewportSize({width:800,height:900});
 await page.locator('.chat-markdown').evaluateAll(nodes=>nodes.forEach(node=>node.style.fontSize='24px'));
 await page.screenshot({path:'.tmp/round1-markdown-desktop-large.png'});
 check(remoteImages===0,'remote image fetched after rerender');
 check(errors.length===0,'Browser errors: '+errors.join('; '));
 console.log('PASS: real ChatPanel Markdown history/live/stream finalization, code literal, no HTML/image execution, URL filtering and large text.');
} finally {await browser.close();}
`;
await import('data:text/javascript;base64,'+Buffer.from(setup+checks).toString('base64'));
