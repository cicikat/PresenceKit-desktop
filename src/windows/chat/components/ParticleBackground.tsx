import { useEffect, useState } from 'react';
import { ParticleCanvas } from '../../pet/components/ParticleCanvas';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from '../../../shared/pet/types';
import type { StateEngine } from '../../../shared/state/store';

interface ParticleBackgroundProps {
  engine: StateEngine;
  blur: number;
}

export function ParticleBackground({ engine, blur }: ParticleBackgroundProps) {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(() => {
    const s = engine.get();
    return { ...DEFAULT_PET_SNAPSHOT, mood: s.mood, presence: s.presence };
  });

  useEffect(() => {
    const unsub = engine.subscribe(s => {
      setSnapshot(prev => {
        if (prev.mood === s.mood && prev.presence === s.presence) return prev;
        return { ...prev, mood: s.mood, presence: s.presence, updatedAt: Date.now() };
      });
    });
    return () => { unsub(); };
  }, [engine]);

  // Pause on hidden tab for performance
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.22,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        overflow: 'hidden',
      }}
    >
      <ParticleCanvas snapshot={snapshot} reaction={null} volume={0} />
    </div>
  );
}
