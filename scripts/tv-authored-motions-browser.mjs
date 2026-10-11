// Real GLB + production retarget/player/performer. No backend and no fake clip.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache','_npx');
const pkg=process.env.PLAYWRIGHT_PACKAGE_JSON ?? fs.readdirSync(cache).map(x=>path.join(cache,x,'node_modules/playwright/package.json')).find(x=>fs.existsSync(x));
const {chromium}=createRequire(pkg)('playwright');
fs.mkdirSync('.tmp',{recursive:true});
const fixture=`
import * as THREE from 'three';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CharacterPerformer} from '../src/shared/character/performer';
import {MotionLibrary,setActiveMotionLibrary} from '../src/shared/character/motionLibrary';
import {MotionPreview} from '../src/windows/room/MotionPreview';
import {startIdleClip} from '../src/windows/room/clipPlayer';
const gltf=await new GLTFLoader().loadAsync('/room/character/TV_Character_Rigged_v03.glb');
const model=gltf.scene, performer=new CharacterPerformer(model,{hasIdleClip:true});
const lib=new MotionLibrary(model,performer,gltf.animations);
const config=await (await fetch('/room/character/motions/library.json')).json();
await lib.load(config,f=>Promise.resolve('/room/character/motions/'+f));
setActiveMotionLibrary(lib);
const idle=startIdleClip(model,gltf.animations.find(c=>c.name==='idle'),performer.ownedBones);
const scene=new THREE.Scene(); scene.background=new THREE.Color('#d7dbe2'); scene.add(model);
const box=new THREE.Box3().setFromObject(model),height=box.max.y-box.min.y;
const center=box.getCenter(new THREE.Vector3());
const camera=new THREE.PerspectiveCamera(35,800/900,.01,100);
camera.position.set(center.x,height*.57,height*2.3); camera.lookAt(center.x,height*.52,center.z);
scene.add(new THREE.HemisphereLight(0xffffff,0x777777,2));
const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,4,3);scene.add(light);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(800,900);document.body.append(renderer.domElement);
const feet=[performer.bones.resolved.footL,performer.bones.resolved.footR];
const clock=new THREE.Clock();let frozen=false;
window.audit={status:lib.status,frames:0,footDelta:0,minScale:10,maxScale:0};
window.fixture={lib,performer,model,camera,height,view:side=>{camera.position.set(side?height*2.1:0,height*.57,side?height*1.2:height*2.3);camera.lookAt(0,height*.52,0);},pose:()=>Object.fromEntries(['upperArmL','lowerArmL','handL','upperArmR','lowerArmR','handR','head','chest'].map(r=>[r,performer.bones.resolved[r]?.getWorldPosition(new THREE.Vector3()).toArray()])),freeze:v=>frozen=v};
createRoot(document.getElementById('controls')).render(React.createElement(MotionPreview));
function animate(){requestAnimationFrame(animate);const dt=Math.min(.05,clock.getDelta());if(!frozen){
performer.prepareFrame();lib.prepareFrame();idle.mixer.update(dt);
model.updateMatrixWorld(true);const before=feet.map(b=>b.getWorldPosition(new THREE.Vector3()));
lib.update(dt);performer.update({t:clock.elapsedTime,now:performance.now(),mood:'平静',directive:null,talking:false,activity:'idle',animatedBoneNames:idle.animatedBoneNames,charGroup:null,hairDrivenByPhysics:false});
model.updateMatrixWorld(true);feet.forEach((b,i)=>window.audit.footDelta=Math.max(window.audit.footDelta,b.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])));
const chest=performer.bones.resolved.chest;window.audit.minScale=Math.min(window.audit.minScale,chest.scale.x);window.audit.maxScale=Math.max(window.audit.maxScale,chest.scale.x);window.audit.frames++;
}renderer.render(scene,camera);}animate();
`;
fs.writeFileSync('.tmp/tv-authored-fixture.tsx',fixture.replace(/\r?\n/g,'\r\n'));
fs.writeFileSync('.tmp/tv-authored-fixture.html','<html><body style="margin:0"><div id="controls" style="position:absolute;background:white;z-index:1;right:0;padding:12px"></div><script type="module" src="./tv-authored-fixture.tsx"></script></body></html>');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:800,height:900},recordVideo:{dir:'.tmp/tv-motion-video',size:{width:800,height:900}}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
await page.goto('http://localhost:1420/.tmp/tv-authored-fixture.html');
await page.waitForFunction(()=>window.audit?.frames>10,{timeout:60000});
const status=await page.evaluate(()=>window.audit.status);console.log(JSON.stringify(status));
assert(status.find(s=>s.id==='arms_crossed')?.ready);
const poses={};
for(const id of ['arms_crossed','talking','nod','head_shake','relaxed_lean']){
if(!status.find(s=>s.id===id)?.ready)continue;
await page.selectOption('select',id);await page.getByRole('button',{name:'播放',exact:true}).click();
if(id==='arms_crossed'){await page.waitForTimeout(450);await page.screenshot({path:'.tmp/tv-motion-enter.png'});}
await page.waitForTimeout(id==='nod'?500:1800);poses[id]=await page.evaluate(()=>window.fixture.pose());
await page.screenshot({path:'.tmp/tv-motion-'+id+'.png'});
if(id==='arms_crossed'){
await page.getByRole('button',{name:'暂停',exact:true}).click();
await page.evaluate(()=>window.fixture.view(true));await page.screenshot({path:'.tmp/tv-motion-arms-crossed-side.png'});
await page.evaluate(()=>window.fixture.view(false));await page.getByRole('button',{name:'继续',exact:true}).click();
}
await page.getByRole('button',{name:'恢复待机',exact:true}).click();
if(id==='arms_crossed'){await page.waitForTimeout(450);await page.screenshot({path:'.tmp/tv-motion-exit.png'});}
await page.waitForTimeout(1200);await page.screenshot({path:'.tmp/tv-motion-restored-idle.png'});
}
const report=await page.evaluate(()=>window.audit);assert.deepEqual(errors,[]);assert(report.footDelta<1e-6);
fs.writeFileSync('.tmp/tv-authored-motion-report.json',JSON.stringify({...report,poses,errors},null,2));
console.log(JSON.stringify({...report,poses,errors}));
}finally{await page.close();await browser.close();}
