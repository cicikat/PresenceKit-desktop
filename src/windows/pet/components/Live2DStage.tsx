import { useEffect, useRef, useState } from 'react';
import type { PetRendererProps } from '../../../shared/pet/petRenderer';
import { useLive2DStage } from '../../../shared/live2d/useLive2DStage';
import { getUIPref } from '../../../shared/uiPreferences';
import { listenPetPrefs } from '../../../shared/pet/bridge';
import type { Mood } from '../../../shared/state/store';

const PET_LIVE2D_ZOOM_KEY = 'pet.live2d.zoom';

export function Live2DStage({ snapshot, reaction, volume }: PetRendererProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(() => getUIPref<number>(PET_LIVE2D_ZOOM_KEY, 1));

  const moodRef = useRef<Mood>(snapshot.mood);
  useEffect(() => { moodRef.current = snapshot.mood; }, [snapshot.mood]);

  const volumeRef = useRef(volume ?? 0);
  useEffect(() => { volumeRef.current = volume ?? 0; }, [volume]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetPrefs(patch => {
      if (typeof patch.live2dZoom === 'number') setZoom(patch.live2dZoom);
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
    getTalking: () => false, // pet drives the mouth from `volume` instead — see getVolume below
    getVolume: () => volumeRef.current,
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
