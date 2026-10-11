import fs from 'node:fs';
import crypto from 'node:crypto';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const glb=file=>{const bytes=fs.readFileSync(file);return {sha256:hash(bytes),bytes:bytes.length,json:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)))};};
const sources=[['UAL1','.tmp/ual/ual1/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb','universal_animation_librarystandard.zip'],['UAL2','.tmp/ual/ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb','universal_animation_library_2standard.zip']].map(([id,file,zip])=>{
const source=glb(file);return {id,file,url:'https://opengameart.org/sites/default/files/'+zip,license:'CC0-1.0',author:'Quaternius',sha256:source.sha256,zipSha256:hash(fs.readFileSync('.tmp/ual/'+id.toLowerCase()+'.zip')),clips:source.json.animations.map(a=>a.name)};});
const derived=glb('public/room/character/motions/quaternius-tv-v1.glb');
const config=JSON.parse(fs.readFileSync('public/room/character/motions/library.json'));
const report={schemaVersion:1,importedAt:'2026-10-11',sources,target:{file:'TV_Character_Rigged_v03.glb',sha256:glb('public/room/character/TV_Character_Rigged_v03.glb').sha256},derived:{file:'quaternius-tv-v1.glb',sha256:derived.sha256,bytes:derived.bytes,method:'30FPS authored world-rotation delta, bind-segment direction and averaged foot-forward alignment',clips:derived.json.animations.map(a=>({name:a.name,tracks:a.channels.length}))},mapping:config.motions.filter(m=>m.id!=='idle').map(m=>({...m,source:m.id==='talking'?'UAL1':'UAL2'})),referenceOnly:{thinking:'UAL2 Idle_TalkingPhone_Loop is NOT chin-rest',camera_reach:['UAL1 Interact','UAL1 PickUp_Table']},acceptance:{browser:'passed',productionPetStage:'passed',tauri:'not-run',contactAndTransition:'partial'}};
fs.writeFileSync('docs/motion-assets/provenance.json',JSON.stringify(report,null,2).replace(/\r?\n/g,'\r\n')+'\r\n');
fs.copyFileSync('docs/motion-assets/provenance.json','public/room/character/motions/provenance.json');
