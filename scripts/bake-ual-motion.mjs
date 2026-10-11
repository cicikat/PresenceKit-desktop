import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const cache=path.join(process.env.LOCALAPPDATA,'npm-cache','_npx');
const pkg=process.env.PLAYWRIGHT_PACKAGE_JSON??fs.readdirSync(cache).map(x=>path.join(cache,x,'node_modules/playwright/package.json')).find(fs.existsSync);
const {chromium}=createRequire(pkg)('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
let clips;
try{await page.goto('http://localhost:1420');clips=await page.evaluate(async()=>{
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {bakeUAL}=await import('/scripts/bake-ual-motion.ts');
  const loader=new GLTFLoader();const target=await loader.loadAsync('/room/character/motions/tv-idle-v1.glb');
  const result=[];
  for(const [file,names] of [['quaternius-ual2-v1.glb',['Idle_FoldArms_Loop','Yes','Idle_No_Loop','Idle_Rail_Loop']],['quaternius-ual1-v1.glb',['Idle_Talking_Loop']]]){
    const source=await loader.loadAsync('/room/character/motions/'+file);
    result.push(...bakeUAL(source.scene,target.scene,source.animations.filter(c=>names.includes(c.name))));
  }return result;
});}finally{await browser.close();}
const bytes=fs.readFileSync('public/room/character/motions/tv-idle-v1.glb');
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
delete json.animations;json.accessors=[];json.bufferViews=[];
const chunks=[];let offset=0;
function data(values,width){const buffer=Buffer.from(new Float32Array(values).buffer);chunks.push(buffer);
const view=json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length})-1;offset+=buffer.length;
return json.accessors.push({bufferView:view,componentType:5126,count:values.length/width,type:width===1?'SCALAR':'VEC4',...(width===1?{min:[values[0]],max:[values.at(-1)]}:{})})-1;}
json.animations=clips.map(c=>({name:c.name,samplers:c.tracks.map(t=>({input:data(t.times,1),output:data(t.values,4),interpolation:'LINEAR'})),channels:c.tracks.map((t,i)=>({sampler:i,target:{node:json.nodes.findIndex(n=>n.name.replace(/[.\[\]:]/g,'')===t.name),path:'rotation'}}))}));
if(json.animations.some(a=>a.channels.some(c=>c.target.node<0)))throw new Error('Unmatched target bone');
json.buffers=[{byteLength:offset}];json.asset.generator='PresenceKit offline UAL bind-direction and forward-axis bake';
json.asset.extras={targetSourceSha256:json.asset.extras.sourceSha256,license:'CC0-1.0 (animation)',author:'Quaternius',
  motionSources:['quaternius-ual1-v1.glb','quaternius-ual2-v1.glb'].map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync('public/room/character/motions/'+file)).digest('hex')}))};
let js=Buffer.from(JSON.stringify(json));js=Buffer.concat([js,Buffer.alloc((4-js.length%4)%4,32)]);
const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+js.length+offset,8);header.writeUInt32LE(js.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(offset);bh.writeUInt32LE(0x004e4942,4);
const output='public/room/character/motions/quaternius-tv-v1.glb';
if(fs.existsSync(output))fs.copyFileSync(output,output+'.backup-'+Date.now());
fs.writeFileSync(output,Buffer.concat([header,js,bh,...chunks]));
console.log(clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})));
