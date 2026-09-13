// Real React/WS dispatcher, isolated Tauri fixture; no backend or device writes.
// Start npm run dev first. Reuse the established browser fixture setup.
import fs from 'node:fs';
const base = fs.readFileSync('scripts/client-fixes-browser.mjs', 'utf8');
const setup = base.slice(0, base.indexOf('try {\n await page.goto'));
const checks = `
try {
 await page.goto('http://127.0.0.1:1420');
 await page.getByText('My previous message',{exact:true}).waitFor();
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for(const [id,scope] of [
   ['phone-dream',{source:'reality',char_id:'fixture-character'}],
   ['dream',{source:'reality',domain:'dream',char_id:'fixture-character'}],
   ['group',{domain:'reality',char_id:'fixture-character',round_id:'r'}]
  ]) {
   wsClient._handleMessage(JSON.stringify({type:'message_stream_start',msg_id:id,...scope}));
   wsClient._handleMessage(JSON.stringify({type:'message_stream_delta',msg_id:id,delta:'LEAK-'+id}));
   wsClient._handleMessage(JSON.stringify({type:'message_stream_end',msg_id:id}));
  }
 });
 await page.waitForTimeout(200);
 check(!(await page.locator('body').innerText()).includes('LEAK-'),'Dream leaked into reality');
 check(await page.locator('.shared-typing-dots').count()===0,'Dream changed reality loading');
 check(!chatLogs.some(x=>x.includes('stream-start')),'Foreign stream was admitted');
 await page.evaluate(async()=>{
  const {wsClient}=await import('/src/shared/api/ws.ts');
  for(const event of [
   {type:'message_stream_start',source:'reality'},
   {type:'message_stream_delta',delta:'Reality still works'},
   {type:'message_stream_end'},
   {type:'channel_message',source:'reality',content:'Reality still works'}
  ]) wsClient._handleMessage(JSON.stringify({msg_id:'owner',...event}));
 });
 await page.getByText('Reality still works',{exact:true}).waitFor();
 check(await page.getByText('Reality still works',{exact:true}).count()===1,'Reality duplicate');
 console.log('PASS: legacy phone Dream, explicit Dream and group streams isolated; reality reconciles once');
 if(process.env.CHECK_YOU_LAYOUT) {
  await page.evaluate(async()=>{const {avatarStore}=await import('/src/shared/avatars/store.ts');await avatarStore.setYouVisible(true);});
  for(const width of [1280,800]) {
   await page.setViewportSize({width,height:900});
   const transcript=page.locator('[data-chat-region="transcript"]');
   await page.waitForTimeout(100);
   const geometry=await transcript.evaluate(el=>{
    const row=[...el.querySelectorAll('div')].find(x=>x.textContent.includes('My previous message')&&x.style.justifyContent==='flex-end');
    const avatar=row.lastElementChild;
    const r=row.getBoundingClientRect(),a=avatar.getBoundingClientRect(),s=getComputedStyle(el);
    return {left:s.paddingLeft,right:s.paddingRight,avatarWidth:a.width,gap:r.right-a.right,overflow:el.scrollWidth>el.clientWidth};
   });
   check(geometry.left===geometry.right&&geometry.avatarWidth===36&&Math.abs(geometry.gap)<1&&!geometry.overflow,'YOU geometry: '+JSON.stringify(geometry));
  }
  await page.screenshot({path:'.tmp/dream-isolation-you.png'});
  console.log('PASS: YOU avatar right-aligned with symmetric padding at 1280/800px');
 }
 check(errors.length===0,'Browser errors: '+errors.join('; '));
} finally { await browser.close(); }
`;
// Evaluate as a module so the existing setup can retain its imports.
await import(`data:text/javascript;base64,${Buffer.from(setup + checks).toString('base64')}`);
