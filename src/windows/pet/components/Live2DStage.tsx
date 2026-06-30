/**
 * Live2D renderer placeholder.
 *
 * Integration points (implement when model is ready):
 *
 * 1. MODEL LOADING
 *    Recommended library: pixi-live2d-display + Cubism Core runtime
 *    Install: npm i pixi-live2d-display pixi.js
 *    Place model files under: public/live2d/<name>/ (model.json + textures)
 *    Load via: loadModel('live2d/<name>/model.json')
 *
 * 2. MOOD → EXPRESSION / MOTION
 *    Map snapshot.mood to Live2D expressions/motions:
 *    const MOOD_TO_EXPRESSION: Record<Mood, string> = {
 *      '平静': 'idle', '开心': 'happy', '低落': 'sad',
 *      '病娇': 'yandere', '分心': 'distracted',
 *      '生气': 'angry', '惊讶': 'surprised',
 *    };
 *    Call model.expression(MOOD_TO_EXPRESSION[snapshot.mood]) on mood change.
 *
 * 3. GAZE / LIP-SYNC
 *    reaction (PetMouseReaction) → head/eye tracking parameters:
 *      ParamAngleX, ParamAngleY, ParamEyeBallX, ParamEyeBallY
 *    volume (0-1) → mouth open:
 *      ParamMouthOpenY = volume
 */

import type { PetRendererProps } from '../../../shared/pet/petRenderer';

export function Live2DStage({ snapshot, reaction, volume }: PetRendererProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontFamily: '"Microsoft YaHei", sans-serif',
        textAlign: 'center',
        padding: 20,
      }}
      data-mood={snapshot.mood}
      data-presence={snapshot.presence}
      data-thinking={String(snapshot.thinking)}
      data-volume={volume?.toFixed(2) ?? '0'}
      data-reaction={reaction?.kind ?? 'none'}
    >
      Live2D 待接入<br />
      <span style={{ fontSize: 10, opacity: 0.6, marginTop: 6, display: 'block' }}>
        mood: {snapshot.mood} · vol: {(volume ?? 0).toFixed(2)}
      </span>
    </div>
  );
}
