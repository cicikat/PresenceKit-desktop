import { useEffect, useMemo, useState } from 'react';
import { listenPetSnapshots } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from '../../shared/pet/types';
import type { Mood, Presence } from '../../shared/state/store';
import { ParticleCanvas } from './components/ParticleCanvas';
import { usePetMouse } from './usePetMouse';

const MOOD_ATMOSPHERES: Record<Mood, string[]> = {
  '平静': ['呼吸平稳', '微光缓缓', '安静相伴'],
  '开心': ['光点轻跃', '暖意浮动', '气息轻快'],
  '低落': ['蓝光低垂', '缓慢呼吸', '静静停留'],
  '病娇': ['紫光缠绕', '目光停驻', '气息贴近'],
  '分心': ['光点游移', '思绪飘远', '偶尔走神'],
  '生气': ['光晕微烫', '呼吸短促', '余波未平'],
  '惊讶': ['光点骤亮', '气息微顿', '余光闪动'],
};

const PRESENCE_ATMOSPHERES: Record<Exclude<Presence, 'active'>, string[]> = {
  idle: ['安静待着', '慢慢呼吸', '守着一隅'],
  away: ['光影收拢', '暂时离开', '留下一点微光'],
};

function pickAtmosphere(options: string[], current?: string) {
  const candidates = options.filter(option => option !== current);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? options[0] ?? '安静相伴';
}

export function PetWindow() {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(DEFAULT_PET_SNAPSHOT);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const { pinned, reaction, startDrag } = usePetMouse({ shy: snapshot.mood === '惊讶' });
  const atmosphereOptions = useMemo(
    () => snapshot.thinking
      ? ['思绪聚拢', '光点轻颤', '正在凝神']
      : snapshot.presence === 'active'
        ? MOOD_ATMOSPHERES[snapshot.mood] ?? MOOD_ATMOSPHERES['平静']
        : PRESENCE_ATMOSPHERES[snapshot.presence],
    [snapshot.mood, snapshot.presence, snapshot.thinking],
  );
  const [atmosphere, setAtmosphere] = useState(() => pickAtmosphere(MOOD_ATMOSPHERES['平静']));

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

  useEffect(() => {
    setAtmosphere(current => pickAtmosphere(atmosphereOptions, current));
    let timer = 0;
    const rotate = () => {
      setAtmosphere(current => pickAtmosphere(atmosphereOptions, current));
      timer = window.setTimeout(rotate, 7000 + Math.random() * 7000);
    };
    timer = window.setTimeout(rotate, 7000 + Math.random() * 7000);
    return () => window.clearTimeout(timer);
  }, [atmosphereOptions]);

  const activity = snapshot.activityText ?? atmosphere;

  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body::before { display: none !important; }
      `}</style>
      <main
        onPointerDown={event => { void startDrag(event); }}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
          cursor: pinned ? 'grabbing' : 'grab',
          fontFamily: '"Microsoft YaHei", "Noto Sans SC", sans-serif',
        }}
      >
        <ParticleCanvas snapshot={snapshot} reaction={reaction} />

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
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {pinned && <span className="mono" style={{ opacity: 0.72 }}>PINNED</span>}
            <span key={activity} style={{ display: 'inline-block', animation: 'petActivityIn 900ms ease-out' }}>
              {activity}
            </span>
          </span>
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
      <style>{`
        @keyframes petActivityIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
