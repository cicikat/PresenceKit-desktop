// Reuse the isolated main-window IPC fixture; exercise startup and reconnect only.
import fs from 'node:fs';
let script=fs.readFileSync('scripts/client-fixes-browser.mjs','utf8');
script=script.slice(0,script.indexOf('const check ='));
script=script.replace("if(cmd==='get_character_avatar')return null;", "if(cmd==='get_character_avatar'){if(!window.avatarReady)throw 'HTTP 503';return 'data:image/png;base64,'+window.avatarPng;}");
script+=`
try {
  for(let run=0;run<2;run++){
    await page.goto('http://localhost:1420');
    await page.getByText('My previous message',{exact:true}).waitFor();
    await page.evaluate(async()=>{
      window.avatarReady=true;
      window.avatarPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6v0kAAAAASUVORK5CYII=';
      const {wsClient}=await import('/src/shared/api/ws.ts');wsClient._setState('connected');
    });
    await page.waitForFunction(()=>[...document.images].some(i=>i.src.includes(window.avatarPng)));
  }
  console.log('PASS restart + delayed backend reconnect avatar refresh');
  await page.screenshot({path:'.tmp/avatar-restart.png'});
}finally{await browser.close();}
`;
const file='.tmp/avatar-restart-fixture.mjs';
fs.writeFileSync(file,script.replace(/\r?\n/g,'\r\n'));
await import('../'+file);
