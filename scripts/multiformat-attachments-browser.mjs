// Reuse the isolated Tauri fixture; uploads never reach a live backend.
import fs from 'node:fs';
const base = fs.readFileSync('scripts/client-fixes-browser.mjs', 'utf8').replaceAll('\r\n', '\n');
const setup = base.slice(0, base.indexOf('try {\n await page.goto'))
  .replace("channel:'msedge',headless:true", "headless:true,timeout:30000")
  .replace('const browser=await', "console.log('Launching browser');const browser=await")
  .replace('const page=await', "console.log('Opening page');const page=await");
const checks = `
await page.addInitScript(() => {
 const invoke = window.__TAURI_INTERNALS__.invoke;
 window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
  if (cmd === 'plugin:dialog|open') { window.fileFilter = args; return 'fixture/ledger.CSV'; }
  if (cmd === 'upload_document') { window.uploaded = args; return {reply:'CSV received',msg_id:'csv-wire',turn_id:'csv-turn'}; }
  return invoke(cmd,args);
 };
});
try {
 console.log('Loading fixture');
 await page.goto(process.env.ATTACHMENT_UI_URL || 'http://127.0.0.1:1422');
 await page.getByText('My previous message',{exact:true}).waitFor();
 const input = page.locator('textarea');
 const paste = async name => input.evaluate((el,name) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File(['name,value\\nLunch,25'],name));
  el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
 },name);
 await paste('unsupported.exe');
 const alert = page.getByRole('alert');
 await alert.waitFor();
 check((await alert.innerText()).includes('CSV'),'supported format hint is stale');
 const close = page.getByRole('button',{name:'关闭提示',exact:true});
 const bounds = await close.boundingBox();const message = await alert.locator('span').boundingBox();
 check(bounds.x >= message.x + message.width,'close button is not on the right');
 await page.screenshot({path:'.tmp/331-attachment-hint.png'});
 await close.click();
 check(await alert.count() === 0,'hint remains after close');
 check(await page.locator('.chat-attachment-tray').count() === 0,'empty tray remains');
 await paste('ledger.CSV');
 await page.locator('.chat-attachment-card').waitFor();
 await paste('bad.exe');await alert.waitFor();await close.click();
 check(await page.locator('.chat-attachment-card').count() === 1,'dismissing error deleted attachment');
 await input.fill('Read this table');await input.press('Enter');
 await page.getByText('CSV received',{exact:true}).waitFor();
 const sent = await page.evaluate(()=>window.uploaded);
 check(sent.attachments[0].filename==='ledger.CSV' && sent.message==='Read this table','CSV payload or caption lost');
 check(await page.locator('.chat-attachment-card').count()===0,'sent attachment not cleared');
 // Exercise the actual desktop file-selection button and inspect its filters.
 await page.getByRole('button',{name:'更多操作',exact:true}).click();
 await page.getByRole('button',{name:/附加文件/}).click();
 await page.locator('.chat-attachment-card').waitFor();
 const extensions = await page.evaluate(()=>window.fileFilter.options.filters[0].extensions);
 check(['csv','xlsx','pdf','pptx','json'].every(ext=>extensions.includes(ext)),'native file picker filter incomplete');
 await page.screenshot({path:'.tmp/331-csv-draft.png'});
 check(errors.length===0,errors.join('\\n'));
 console.log('PASS: CSV paste/send, actual picker filters, right-side close, hint removal and attachment preservation');
} finally { await browser.close(); }
`;
await import('data:text/javascript;base64,' + Buffer.from(setup + checks).toString('base64'));
