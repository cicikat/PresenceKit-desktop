// Production Pet stage/React frame order, real GLB/PNG/CC0 motion; IPC only is mocked.
import fs from 'node:fs';
let script=fs.readFileSync('scripts/tv-behavior-browser.mjs','utf8');
script=script.slice(0,script.indexOf('try {'));
script=script.replace('const fixture = `',`data.motionConfig=fs.readFileSync('public/room/character/motions/library.json','utf8');
data.motions=Object.fromEntries(['tv-idle-v1.glb','quaternius-tv-v1.glb'].map(f=>[f,'data:model/gltf-binary;base64,'+fs.readFileSync('public/room/character/motions/'+f).toString('base64')]));
const fixture = \``);
script=script.replace("import React, { useState } from 'react';", "import React, { useState } from 'react';\nimport { MotionPreview } from '../src/windows/room/MotionPreview';\nimport { getActiveMotionLibrary } from '../src/shared/character/motionLibrary';\nwindow.currentMotion = getActiveMotionLibrary;");
script=script.replace('return <><Model3DStage', 'return <><div style={{position:"absolute",zIndex:20,right:0,background:"white"}}><MotionPreview/></div><Model3DStage');
script=script.replace("if (cmd === 'read_room_asset')", "if (cmd === 'read_shared_motion_config') return data.motionConfig;\n      if (cmd === 'read_room_motion_file') return data.motions[args.motionName];\n      if (cmd === 'read_room_asset')");
script+=`
try {
  await page.goto('http://localhost:1420/.tmp/tv-behavior-fixture.html');
  await page.waitForFunction(()=>window.currentMotion()?.ids().includes('talking'),{timeout:60000});
  for(const id of ['arms_crossed','talking']){
    await page.selectOption('select',id);await page.getByRole('button',{name:'播放',exact:true}).click();
    await page.waitForTimeout(1800);await page.screenshot({path:'.tmp/tv-stage-'+id+'.png'});
    assert.equal(await page.evaluate(()=>window.currentMotion().player.playingId),id);
    await page.getByRole('button',{name:'暂停',exact:true}).click();await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.currentMotion().player.paused),true);
    await page.getByRole('button',{name:'继续',exact:true}).click();
    await page.getByRole('button',{name:'恢复待机',exact:true}).click();await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(()=>window.currentMotion().player.playingId),'idle');
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('.tmp/tv-authored-stage-report.json',JSON.stringify({audit:await page.evaluate(()=>window.audit),errors,warnings},null,2));
  console.log('PASS production Pet stage authored FoldArms/Talking, pause/resume and idle restoration');
}finally{await browser.close();}
`;
fs.writeFileSync('.tmp/tv-authored-stage-runner.mjs',script.replace(/\r?\n/g,'\r\n'));
await import('../.tmp/tv-authored-stage-runner.mjs');
