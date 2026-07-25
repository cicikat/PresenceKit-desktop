import { useEffect, useRef, useState } from 'react';
import { useLive2DStage } from '../../shared/live2d/useLive2DStage';
import type { Mood } from '../../shared/state/store';

interface Live2DCallStageProps {
  mood: Mood;
  talking: boolean;
}

export function Live2DCallStage({ mood, talking }: Live2DCallStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const moodRef = useRef(mood);
  const talkingRef = useRef(talking);
  const [audioVolume, setAudioVolume] = useState(0);

  useEffect(() => { moodRef.current = mood; }, [mood]);
  useEffect(() => { talkingRef.current = talking; }, [talking]);

  useEffect(() => {
    const handleVoiceVolume = (event: Event) => {
      const detail = (event as CustomEvent<{ volume: number }>).detail;
      setAudioVolume(detail.volume ?? 0);
    };
    window.addEventListener('voice-volume', handleVoiceVolume);
    return () => window.removeEventListener('voice-volume', handleVoiceVolume);
  }, []);

  const { error } = useLive2DStage(mountRef, {
    getMood: () => moodRef.current,
    getTalking: () => talkingRef.current,
    getVolume: audioVolume > 0 ? () => audioVolume : undefined,
    transparent: false,
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
