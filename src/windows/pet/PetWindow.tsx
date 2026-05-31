import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listenPetSnapshots } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from '../../shared/pet/types';
import { ParticleCanvas } from './components/ParticleCanvas';

export function PetWindow() {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(DEFAULT_PET_SNAPSHOT);
  const [bubbleVisible, setBubbleVisible] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetSnapshots(next => {
      if (!disposed) setSnapshot(next);
    }).then(fn => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(error => console.warn('[pet] snapshot 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshot.latestAssistantText) return;
    setBubbleVisible(true);
    const timer = window.setTimeout(() => setBubbleVisible(false), 9000);
    return () => window.clearTimeout(timer);
  }, [snapshot.latestAssistantText, snapshot.updatedAt]);

  const activity = snapshot.activityText
    ?? (snapshot.presence === 'away' ? '暂时离开' : snapshot.presence === 'idle' ? '安静待着' : '陪着你');

  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body::before { display: none !important; }
      `}</style>
      <main
        onPointerDown={event => {
          if (event.button === 0) void getCurrentWindow().startDragging();
        }}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
          cursor: 'grab',
          fontFamily: '"Microsoft YaHei", "Noto Sans SC", sans-serif',
        }}
      >
        <ParticleCanvas snapshot={snapshot} />

        <section style={{
          position: 'absolute',
          left: 14,
          right: 14,
          top: 12,
          display: 'flex',
          justifyContent: 'space-between',
          color: 'rgba(255, 255, 255, 0.76)',
          fontSize: 10,
          letterSpacing: 1.3,
          textShadow: '0 1px 8px rgba(20, 12, 35, 0.8)',
        }}>
          <span>{snapshot.thinking ? 'THINKING' : snapshot.mood}</span>
          <span>{activity}</span>
        </section>

        {bubbleVisible && snapshot.latestAssistantText && (
          <section
            onPointerDown={event => event.stopPropagation()}
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 18,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(18, 12, 32, 0.82)',
              border: '1px solid rgba(224, 210, 255, 0.22)',
              boxShadow: '0 10px 26px rgba(12, 8, 24, 0.28)',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: 12,
              lineHeight: 1.65,
              cursor: 'default',
            }}
          >
            {snapshot.latestAssistantText}
          </section>
        )}
      </main>
    </>
  );
}
