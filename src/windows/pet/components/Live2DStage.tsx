import { useEffect, useRef, useState } from 'react';
import type { PetRendererProps } from '../../../shared/pet/petRenderer';
import { useLive2DStage } from '../../../shared/live2d/useLive2DStage';
import { getUIPref } from '../../../shared/uiPreferences';
import { listenPetPrefs } from '../../../shared/pet/bridge';
import { loadLive2DSettings, patchLive2DSettings } from '../../../shared/live2d/live2dSettings';
import type { Mood } from '../../../shared/state/store';
import { useCharacterBehavior } from '../../../shared/character/useCharacterBehavior';
import { usePlaybackLevel } from '../../../shared/voice/usePlaybackLevel';

const PET_LIVE2D_ZOOM_KEY = 'pet.live2d.zoom';

export function Live2DStage({ snapshot, reaction }: PetRendererProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(() => getUIPref<number>(PET_LIVE2D_ZOOM_KEY, 1));

  const panRef = useRef<{ id: number; x: number; y: number; offset: [number, number] } | null>(null);

  const moodRef = useRef<Mood>(snapshot.mood);
  useEffect(() => { moodRef.current = snapshot.mood; }, [snapshot.mood]);

  const behavior = useCharacterBehavior('pet');
  const getPlaybackLevel = usePlaybackLevel();

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetPrefs(patch => {
      if (typeof patch.live2dZoom === 'number') setZoom(Math.max(0.3, Math.min(8, patch.live2dZoom)));
    }).then(fn => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(error => console.warn('[pet] prefs 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const { error, pulse } = useLive2DStage(mountRef, {
    getMood: () => moodRef.current,
    getTalking: () => behavior.frame(Date.now(), moodRef.current).activity === 'speaking',
    getVolume: getPlaybackLevel,
    transparent: true, // pet window is transparent/always-on-top — ignores Live2DSettings.bgKind
    zoom,
  });

  const lastReactionIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!reaction || reaction.id === lastReactionIdRef.current) return;
    lastReactionIdRef.current = reaction.id;
    pulse(reaction.kind);
  }, [reaction, pulse]);

  return (
    <div
      ref={mountRef}
      onPointerDownCapture={event => {
        if (!event.shiftKey || event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        panRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: loadLive2DSettings().offset };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMoveCapture={event => {
        const pan = panRef.current;
        if (!pan || pan.id !== event.pointerId) return;
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        patchLive2DSettings({ offset: [pan.offset[0] + (event.clientX - pan.x) / bounds.width,
          pan.offset[1] + (event.clientY - pan.y) / bounds.height] });
      }}
      onPointerUpCapture={event => {
        if (!panRef.current || panRef.current.id !== event.pointerId) return;
        event.stopPropagation();
        panRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { panRef.current = null; }}
      onDoubleClick={event => {
        if (event.shiftKey) { event.stopPropagation(); patchLive2DSettings({ offset: [0, 0] }); }
      }}
      style={{ width: '100%', height: '100%', overflow: 'hidden', background: 'transparent', position: 'relative' }}
    >
      {error && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.55)', fontSize: 12,
            fontFamily: '"Microsoft YaHei", sans-serif',
            textAlign: 'center', padding: 20, pointerEvents: 'none',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
