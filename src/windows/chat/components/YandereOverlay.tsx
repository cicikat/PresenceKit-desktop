import { useEffect, useRef, useState, type CSSProperties } from 'react';

const GLITCH_CHARS = ['◈', '◉', '▣', '◌', '○', '●', '◎', '✦', '✧', '⬡'];

interface YandereWindow {
  id: number;
  x: number;
  y: number;
}

let nextId = 1;

function randomGlitch() {
  const len = 4 + Math.floor(Math.random() * 7);
  return Array.from({ length: len }, () =>
    GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)],
  ).join('');
}

function randomPos() {
  return {
    x: 5 + Math.random() * 75,
    y: 5 + Math.random() * 75,
  };
}

function FloatingWindow({
  win,
  onClose,
}: {
  win: YandereWindow;
  onClose: (id: number) => void;
}) {
  const [glitch] = useState(randomGlitch);
  return (
    <div
      style={{
        position: 'fixed',
        left: `${win.x}%`,
        top: `${win.y}%`,
        zIndex: 116,
        background: 'rgba(40, 0, 20, 0.93)',
        border: '1px solid rgba(180, 40, 80, 0.55)',
        borderRadius: 8,
        padding: '10px 14px',
        color: 'rgba(255, 155, 180, 0.92)',
        fontSize: 13,
        letterSpacing: 2.2,
        boxShadow: '0 4px 24px rgba(80, 0, 40, 0.55)',
        userSelect: 'none',
        minWidth: 100,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      } as CSSProperties}
    >
      <span>{glitch}</span>
      <button
        onClick={() => onClose(win.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255, 120, 150, 0.72)',
          cursor: 'pointer',
          fontSize: 15,
          padding: '0 2px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

export function YandereOverlay({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'countdown' | 'active'>('countdown');
  const [countdown, setCountdown] = useState(5);
  const [windows, setWindows] = useState<YandereWindow[]>([]);
  const [vignetteOpacity, setVignetteOpacity] = useState(0);
  const spawnTimerRef = useRef(0);
  const fadeTimerRef = useRef(0);

  // Tick the countdown
  useEffect(() => {
    if (countdown <= 0) {
      setPhase('active');
      return;
    }
    const t = window.setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  // When phase turns active: spawn initial windows, fade vignette, schedule more spawns
  useEffect(() => {
    if (phase !== 'active') return;

    setWindows(
      Array.from({ length: 3 }, () => ({ id: nextId++, ...randomPos() })),
    );

    let opacity = 0;
    const fadeStep = () => {
      opacity = Math.min(1, opacity + 0.04);
      setVignetteOpacity(opacity);
      if (opacity < 1) fadeTimerRef.current = window.setTimeout(fadeStep, 30);
    };
    fadeTimerRef.current = window.setTimeout(fadeStep, 30);

    const spawnLoop = () => {
      setWindows(ws => {
        if (ws.length >= 22) return ws;
        return [...ws, { id: nextId++, ...randomPos() }];
      });
      spawnTimerRef.current = window.setTimeout(spawnLoop, 700 + Math.random() * 600);
    };
    spawnTimerRef.current = window.setTimeout(spawnLoop, 1000);

    return () => {
      window.clearTimeout(fadeTimerRef.current);
      window.clearTimeout(spawnTimerRef.current);
    };
  }, [phase]);

  // ESC to exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Closing one window spawns 2-3 more
  const handleWindowClose = (id: number) => {
    setWindows(ws => {
      const rest = ws.filter(w => w.id !== id);
      const spawned = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => ({
        id: nextId++,
        ...randomPos(),
      }));
      return [...rest, ...spawned].slice(0, 28);
    });
  };

  const vignette = `radial-gradient(ellipse at center, transparent 18%, rgba(80,0,40,${(0.72 * vignetteOpacity).toFixed(3)}) 100%)`;

  return (
    <>
      {/* Dark red radial vignette */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 115,
          background: vignette,
          pointerEvents: 'none',
        } as CSSProperties}
      />

      {/* Countdown */}
      {phase === 'countdown' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 117,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          } as CSSProperties}
        >
          <span
            style={{
              fontSize: 100,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: `rgba(220,60,100,${0.5 + (5 - countdown) * 0.1})`,
              textShadow: '0 0 48px rgba(180,0,60,0.6)',
            }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* Floating "uncloseable" windows */}
      {windows.map(win => (
        <FloatingWindow key={win.id} win={win} onClose={handleWindowClose} />
      ))}
    </>
  );
}
