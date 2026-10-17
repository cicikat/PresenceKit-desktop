// Browser-only acceptance fixture. Mock Tauri transport; render the real production stage.
import React, {useRef, useState} from 'react';
import { createRoot } from 'react-dom/client';
import { initUIPrefs } from '../src/shared/uiPreferences';
import { saveLive2DSettings, DEFAULT_LIVE2D_SETTINGS } from '../src/shared/live2d/live2dSettings';
import { useLive2DStage } from '../src/shared/live2d/useLive2DStage';
import { ensureCubismCore } from '../src/shared/live2d/cubismCore';
import { getStageControls } from '../src/shared/live2d/stageControls';
import { Live2DPerformancePanel } from '../src/windows/room/Live2DPerformancePanel';
import '../src/windows/room/EditorPanel.css';
await initUIPrefs();
saveLive2DSettings({...DEFAULT_LIVE2D_SETTINGS,modelDir:window.fixtureModelDir});
await ensureCubismCore();
const {Live2DModel}=await import('pixi-live2d-display-lipsyncpatch/cubism4');
const from=Live2DModel.from;
window.audit={starts:[],ends:0,frames:0,protectedMaxDelta:0};
Live2DModel.from=async function(...args) {
 const m=await from.apply(this,args);window.auditModel=m;
 m.internalModel.motionManager.on('motionStart',(group,index)=>window.audit.starts.push({time:performance.now(),group,index,file:m.internalModel.motionManager.definitions[group][index].File}));
 m.internalModel.motionManager.on('motionFinish',()=>window.audit.ends++);
 m.internalModel.on('beforeModelUpdate',()=>{
 window.audit.frames++;
 const c=m.internalModel.coreModel;const f=window.audit.starts.at(-1)?.file;const ids=m.internalModel.settings.json.EmeraldProfile?.motionParameters[f]??[];
 window.nativeBefore=Object.fromEntries(ids.map(id=>[id,c.getParameterValueById(id)]));
 });
 return m;
};
window.controls=getStageControls;
window.attachCompare=()=>window.auditModel.internalModel.on('beforeModelUpdate',()=>{
 const c=window.auditModel.internalModel.coreModel;
 window.lastDrawMouth=c.getParameterValueById('ParamMouthOpenY');
 for(const [id,v] of Object.entries(window.nativeBefore??{})){
 if(id==='ParamMouthOpenY'&&window.talking)continue;
 if(!window.audit.measureProtected)continue;
 const delta=Math.abs(c.getParameterValueById(id)-v);if(delta>0.00001)(window.audit.differences??=[]).push({id,delta,file:window.audit.starts.at(-1)?.file});
 window.audit.protectedMaxDelta=Math.max(window.audit.protectedMaxDelta,delta);
 }
});
window.directive=null;window.talking=false;window.volume=0;
window.issue=(patch,ttl=5000)=>window.directive={expression:null,intensity:0.85,gaze:null,gesture:null,posture:null,speaking:null,energy:0.5,origin:'local',receivedAt:performance.now(),ttl_ms:ttl,...patch};
function App(){const ref=useRef(null);const [show,setShow]=useState(true);window.remount=()=>setShow(v=>!v);return <>{show&&<Stage/>}<aside className="room-editor-panel"><Live2DPerformancePanel/></aside></>;}
function Stage(){const ref=useRef(null);const {error}=useLive2DStage(ref,{getMood:()=> '平静',getDirective:now=>window.directive&&now-window.directive.receivedAt<=window.directive.ttl_ms?window.directive:null,getTalking:()=>window.talking,getVolume:()=>window.volume,transparent:false});return <><div ref={ref} style={{width:'calc(100vw - 220px)',height:'100vh'}}/><div id="error">{error}</div></>;}
createRoot(document.getElementById('root')).render(<App/>);
