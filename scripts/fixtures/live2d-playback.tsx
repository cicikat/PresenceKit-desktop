// Real production Pet/Room stages and HTMLAudio/WebAudio. Only Tauri and synthesized bytes are mocked.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initUIPrefs } from '../src/shared/uiPreferences';
import { saveLive2DSettings, DEFAULT_LIVE2D_SETTINGS } from '../src/shared/live2d/live2dSettings';
import { ensureCubismCore } from '../src/shared/live2d/cubismCore';
import { Live2DStage } from '../src/windows/pet/components/Live2DStage';
import { Live2DCallStage } from '../src/windows/room/Live2DCallStage';
import { VoiceMessageBar } from '../src/windows/chat/components/VoiceMessageBar';
import { DEFAULT_PET_SNAPSHOT } from '../src/shared/pet/types';
import { getStageControls } from '../src/shared/live2d/stageControls';

await initUIPrefs();
saveLive2DSettings({ ...DEFAULT_LIVE2D_SETTINGS, modelDir: 'hlr_yexuan_mingyun_base' });
await ensureCubismCore();
const { Live2DModel } = await import('pixi-live2d-display-lipsyncpatch/cubism4');
const from = Live2DModel.from;
window.playbackAudit = { mouths: [], motions: [], levels: [] };
Live2DModel.from = async function (...args) {
  const model = await from.apply(this, args);
  window.playbackModel = model;
  const internal = model.internalModel;
  internal.motionManager.on('motionStart', (group, index) => window.playbackAudit.motions.push(internal.motionManager.definitions[group][index].File));
  // Schedule after the stage attaches its final parameter driver.
  setTimeout(() => internal.on('beforeModelUpdate', () => {
    window.playbackAudit.mouths.push(internal.coreModel.getParameterValueById('ParamMouthOpenY'));
  }), 0);
  return model;
};
window.addEventListener('voice-volume', event => window.playbackAudit.levels.push(event.detail));
window.controls = getStageControls;
function App() {
  const [talking, setTalking] = useState(false);
  const [show, setShow] = useState(true);
  const [mic, setMic] = useState(0);
  window.setMic = setMic;
  window.setPlaybackVisible = setShow;
  return <React.StrictMode>
    <div style={{ width: 780, height: 900, position: 'relative' }}>
      {window.fixtureSurface === 'room' ? <Live2DCallStage mood={DEFAULT_PET_SNAPSHOT.mood} talking={talking} />
        : <Live2DStage snapshot={DEFAULT_PET_SNAPSHOT} volume={mic} />}
    </div>
    {show && <VoiceMessageBar text="Fixture audio" scene={window.fixtureSurface === 'room' ? 'video_call' : 'desktop_pet'}
      onPlaybackStart={() => setTalking(true)} onPlaybackEnd={() => setTalking(false)} />}
  </React.StrictMode>;
}
createRoot(document.getElementById('root')).render(<App />);
