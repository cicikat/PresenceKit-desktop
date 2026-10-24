import { useEffect, useMemo, useRef, useState } from 'react';
import { getCallDirective } from './callDirectiveLayers';
import { useLive2DStage } from '../../shared/live2d/useLive2DStage';
import type { Mood } from '../../shared/state/store';
import type { GradeCfg } from '../../shared/room/gradeConfig';
import { loadLive2DSettings, patchLive2DSettings, subscribeLive2DSettings } from '../../shared/live2d/live2dSettings';
import { wheelScale } from '../../shared/live2d/layout';
import { usePlaybackLevel } from '../../shared/voice/usePlaybackLevel';

interface Live2DCallStageProps {
  mood: Mood;
  talking: boolean;
  grade?: GradeCfg;
  editable?: boolean;
}

export function Live2DCallStage({ mood, talking, grade, editable = false }: Live2DCallStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const talkingRef = useRef(talking);
  const getPlaybackLevel = usePlaybackLevel();
  const [placement, setPlacement] = useState(loadLive2DSettings);
  useEffect(() => subscribeLive2DSettings(setPlacement), []);
  const layout = useMemo(() => ({ scaleMul: placement.callScaleMul, offset: placement.callOffset }), [placement.callScaleMul, placement.callOffset]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      patchLive2DSettings({ callScaleMul: wheelScale(loadLive2DSettings().callScaleMul, event.deltaY, event.deltaMode, mount.clientHeight) });
    };
    let drag: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
    const down = (event: PointerEvent) => {
      if (!editable || event.button !== 0 || (event.target as HTMLElement).tagName !== 'CANVAS') return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
      mount.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId || !mount.clientWidth || !mount.clientHeight) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
      const { callOffset } = loadLive2DSettings();
      patchLive2DSettings({ callOffset: [callOffset[0] + (event.clientX - drag.x) / mount.clientWidth,
        callOffset[1] + (event.clientY - drag.y) / mount.clientHeight] });
      drag.x = event.clientX; drag.y = event.clientY;
    };
    const up = () => {
      if (drag && mount.hasPointerCapture(drag.id)) mount.releasePointerCapture(drag.id);
      drag = null;
    };
    mount.addEventListener('wheel', wheel, { passive: false });
    // Capture before Pixi's event system can consume a pointer on the model.
    mount.addEventListener('pointerdown', down, true);
    mount.addEventListener('pointermove', move, true);
    mount.addEventListener('pointerup', up, true);
    mount.addEventListener('pointercancel', up, true);
    return () => {
      up();
      mount.removeEventListener('wheel', wheel);
      mount.removeEventListener('pointerdown', down, true);
      mount.removeEventListener('pointermove', move, true);
      mount.removeEventListener('pointerup', up, true);
      mount.removeEventListener('pointercancel', up, true);
    };
  }, [editable]);

  useEffect(() => { moodRef.current = mood; }, [mood]);
  useEffect(() => { talkingRef.current = talking; }, [talking]);

  const { error } = useLive2DStage(mountRef, {
    getMood: () => moodRef.current,
    getDirective: getCallDirective,
    getTalking: () => talkingRef.current,
    getVolume: getPlaybackLevel,
    transparent: false,
    grade,
    layout,
  });

  return (
    <div ref={mountRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 28, textAlign: 'center',
          color: 'oklch(0.70 0.05 240)', fontSize: 12.5, lineHeight: 1.8,
          fontFamily: 'var(--font-mono, monospace)', pointerEvents: 'none',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
