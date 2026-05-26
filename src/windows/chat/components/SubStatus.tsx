/* SubStatus — 状态面板 (Phase 2d.3) */

import { useState, useEffect, useRef } from 'react';
import { MicroLabel } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN } from './UIKit';
import { loadMoodState, loadActivityState, loadSensorRealtime } from '../../../shared/api/backend';
import { backendMoodToFrontend } from '../../../shared/state/mood-mapping';
import type { ActivityState, SensorRealtimeResponse, SensorRealtimeData } from '../../../shared/api/types';
import { isSensorNoData } from '../../../shared/api/types';

// ── mood_aura 基准值（与 useTelemetrySignals 共享）────────────────────────────
const MOOD_AURA_BASE: Record<string, number> = {
  '平静': 20, '开心': 70, '低落': 50, '病娇': 90, '分心': 40, '生气': 80, '惊讶': 75,
};

// ── 持续可感知信号 hook ────────────────────────────────────────────────────────
function useTelemetrySignals(
  engine: any,
  sensorData: SensorRealtimeData | null,
  sensorAvailable: boolean,
) {
  const spikeStartRef = useRef(0);
  const prevKeyRef = useRef('');
  const spikeTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sigs, setSigs] = useState({ breath: 50, gaze_lock: 50, mood_aura: 20, rhythm: 0 });

  useEffect(() => {
    const calc = () => {
      const { mood, focus, presence, activity } = engine.get();
      const key = `${focus}|${activity?.text ?? ''}`;

      if (prevKeyRef.current && key !== prevKeyRef.current) {
        spikeStartRef.current = Date.now();
        if (spikeTickRef.current) clearInterval(spikeTickRef.current);
        spikeTickRef.current = setInterval(() => {
          const elapsed = Date.now() - spikeStartRef.current;
          if (elapsed >= 5000) {
            if (spikeTickRef.current) {
              clearInterval(spikeTickRef.current);
              spikeTickRef.current = null;
            }
          }
          calc();
        }, 250);
      }
      prevKeyRef.current = key;

      let breath: number;
      let gaze: number;
      let rhythm: number;

      if (sensorAvailable && sensorData) {
        const keysPerSec = sensorData.input.keystrokes / Math.max(sensorData.window_seconds, 1);
        let b = 30 + Math.min(70, keysPerSec * 70 / 20);
        if (sensorData.presence === 'idle') b *= 0.7;
        else if (sensorData.presence === 'away') b *= 0.4;
        breath = Math.max(20, Math.min(100, b));

        const staleScore = Math.max(0, 100 - sensorData.stale_seconds * (100 / 90));
        const switchPenalty = Math.min(50, sensorData.focus.switch_count * 10);
        let g = staleScore - switchPenalty;
        if (sensorData.presence === 'idle') g *= 0.6;
        else if (sensorData.presence === 'away') g *= 0.2;
        gaze = Math.max(0, Math.min(100, g));

        const ks = sensorData.input.keystrokes;
        const mc = sensorData.input.mouse_clicks;
        let irregular = 0;
        if (ks + mc > 0) {
          const ratio = Math.abs(ks - mc) / (ks + mc);
          irregular = ratio * 50;
        }
        const base = ({ '病娇': 30, '低落': 15, '分心': 10, '生气': 25, '惊讶': 20, '开心': 5, '平静': 0 } as any)[mood] ?? 0;
        const elapsed = spikeStartRef.current > 0 ? Date.now() - spikeStartRef.current : 6000;
        const spike = Math.max(0, 15 * (1 - elapsed / 5000));
        rhythm = Math.max(0, Math.min(100, base + irregular + spike));
      } else {
        let b = 50;
        b += ({ '开心': 15, '平静': 10, '病娇': 25, '低落': -10, '分心': -5, '生气': 20, '惊讶': 15 } as any)[mood] ?? 0;
        b += ({ active: 20, idle: 0, away: -20 } as any)[presence] ?? 0;
        breath = Math.max(30, Math.min(100, b));

        let g = ({ '看你打字': 95, '看你': 90, '偷看': 70, '注意到了什么': 60, '看屏幕': 30, '想事情': 15, '发呆': 10 } as any)[focus] ?? 50;
        if (presence === 'idle') g *= 0.7;
        else if (presence === 'away') g *= 0.3;
        gaze = Math.max(0, Math.min(100, g));

        const base = ({ '病娇': 60, '低落': 30, '分心': 20, '生气': 50, '惊讶': 40, '开心': 5, '平静': 0 } as any)[mood] ?? 0;
        const elapsed = spikeStartRef.current > 0 ? Date.now() - spikeStartRef.current : 6000;
        const spike = Math.max(0, 15 * (1 - elapsed / 5000));
        rhythm = Math.max(0, Math.min(100, base + spike));
      }

      // mood_aura (0-100)
      const aura = MOOD_AURA_BASE[mood] ?? 20;

      setSigs({
        breath: Math.round(breath),
        gaze_lock: Math.round(gaze),
        mood_aura: aura,
        rhythm: Math.round(rhythm),
      });
    };

    calc();
    const unsub = engine.subscribe(calc);
    return () => { unsub(); if (spikeTickRef.current) { clearInterval(spikeTickRef.current); spikeTickRef.current = null; } };
  }, [engine, sensorData, sensorAvailable]);

  return sigs;
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function SubStatus({ engine }: { engine: any }) {
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);

  const [moodError, setMoodError] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [sensorData, setSensorData] = useState<SensorRealtimeData | null>(null);
  const [sensorAvailable, setSensorAvailable] = useState(false);

  // ── 每 30s 拉 mood ──────────────────────────────────────────────────────────
  const fetchMood = async () => {
    try {
      const raw = await loadMoodState();
      engine.applyStateUpdate({ mood: backendMoodToFrontend(raw.current) });
      setMoodError(null);
    } catch (e: any) {
      setMoodError(String(e));
    }
  };

  useEffect(() => {
    fetchMood();
    const h = setInterval(fetchMood, 30_000);
    return () => clearInterval(h);
  }, [engine]);

  // ── 每 60s 拉 activity ──────────────────────────────────────────────────────
  const fetchActivity = async () => {
    try {
      const raw: ActivityState = await loadActivityState();
      engine.set({
        activity: {
          id: raw.id,
          text: raw.text,
          arc: raw.arc,
          thinkingAboutEligible: raw.thinking_about_eligible,
        },
      });
      setActError(null);
    } catch (e: any) {
      setActError(String(e));
    }
  };

  useEffect(() => {
    fetchActivity();
    const h = setInterval(fetchActivity, 60_000);
    return () => clearInterval(h);
  }, [engine]);

  // ── 每 10s 拉 sensor realtime ─────────────────────────────────────────────
  const fetchSensor = async () => {
    try {
      const raw: SensorRealtimeResponse = await loadSensorRealtime();
      if (isSensorNoData(raw)) {
        setSensorData(null);
        setSensorAvailable(false);
        return;
      }
      if (raw.stale_seconds > 90) {
        setSensorData(raw);
        setSensorAvailable(false);
        return;
      }
      setSensorData(raw);
      setSensorAvailable(true);
    } catch (e) {
      setSensorData(null);
      setSensorAvailable(false);
    }
  };

  useEffect(() => {
    fetchSensor();
    const h = setInterval(fetchSensor, 10_000);
    return () => clearInterval(h);
  }, []);

  const signals = useTelemetrySignals(engine, sensorData, sensorAvailable);
  const hue = MOOD_HUE[state.mood] ?? 70;
  const aura = signals.mood_aura;

  // ── ring buffer（60 格 × 2s = 2 分钟）──────────────────────────────────────
  const [ringBuffer, setRingBuffer] = useState<{ mood: string; aura: number }[]>(() => {
    const { mood } = engine.get();
    const a = MOOD_AURA_BASE[mood] ?? 20;
    return Array.from({ length: 60 }, () => ({ mood, aura: a }));
  });

  useEffect(() => {
    const h = setInterval(() => {
      const { mood } = engine.get();
      const a = MOOD_AURA_BASE[mood] ?? 20;
      setRingBuffer(prev => [...prev.slice(1), { mood, aura: a }]);
    }, 2000);
    return () => clearInterval(h);
  }, [engine]);

  const hasError = moodError || actError;

  return (
    <div style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>

      {/* ── 连接错误提示 ───────────────────────────────────────────────────── */}
      {hasError && (
        <div style={{
          marginBottom: 10, padding: '8px 12px',
          background: 'oklch(0.26 0.04 30 / 0.40)',
          border: '1px solid oklch(0.45 0.08 30 / 0.50)',
          borderRadius: 5,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span className="mono" style={{ flex: 1, fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.1 }}>
            {moodError ? 'mood' : ''}{moodError && actError ? ' · ' : ''}{actError ? 'activity' : ''} 无法连接
          </span>
          <button
            onClick={() => { if (moodError) fetchMood(); if (actError) fetchActivity(); }}
            style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--forest-line)',
              color: 'var(--on-forest-2)', fontFamily: 'inherit',
            }}>
            重试
          </button>
        </div>
      )}

      {/* ── MOOD 主卡 ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px 16px',
        background: `radial-gradient(ellipse at 75% 25%, oklch(0.42 0.14 ${hue} / ${(aura / 100 * 0.55 + 0.06).toFixed(2)}), transparent 65%),
                     linear-gradient(160deg, var(--forest-1), var(--forest-2))`,
        border: `1px solid oklch(0.50 0.10 ${hue} / 0.30)`,
        borderRadius: 8, marginBottom: 10,
        position: 'relative', overflow: 'hidden',
        transition: 'background 3s ease, border-color 3s ease',
      }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.4, marginBottom: 6 }}>
          MOOD
        </div>
        <div className="serif" style={{
          fontSize: 26, fontWeight: 600, color: 'var(--on-forest)', letterSpacing: -0.3, lineHeight: 1.1,
        }}>
          {state.mood}
        </div>
        <div className="mono" style={{
          fontSize: 10.5, color: `oklch(0.85 0.10 ${hue})`, letterSpacing: 1.3, marginTop: 5,
        }}>
          {MOOD_LABEL_EN[state.mood] ?? state.mood}
        </div>
        {/* 脉冲指示点 */}
        <span style={{
          position: 'absolute', right: 14, top: 14, width: 8, height: 8, borderRadius: '50%',
          background: `oklch(0.82 0.18 ${hue})`,
          boxShadow: `0 0 10px oklch(0.82 0.18 ${hue} / 0.65)`,
          animation: 'statusPulse 3s ease-in-out infinite',
        }} />
      </div>

      {/* ── ACTIVITY / PRESENCE 双卡 ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <ForestCard label="ACTIVITY">
          <div className="serif" style={{ fontSize: 14, color: 'var(--on-forest)', fontWeight: 600, lineHeight: 1.3 }}>
            {state.activity?.text ?? '——'}
          </div>
          {state.activity?.arc && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 3 }}>
              {state.activity.arc.toUpperCase()}
            </div>
          )}
        </ForestCard>
        <ForestCard label="PRESENCE">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: state.presence === 'active'
                ? 'oklch(0.72 0.16 145)'
                : state.presence === 'idle'
                  ? 'oklch(0.72 0.14 85)'
                  : 'oklch(0.65 0.10 30)',
              boxShadow: state.presence === 'active' ? '0 0 7px oklch(0.72 0.16 145)' : 'none',
            }} />
            <div className="serif" style={{ fontSize: 14, color: 'var(--on-forest)', fontWeight: 600, textTransform: 'capitalize' }}>
              {state.presence}
            </div>
          </div>
        </ForestCard>
      </div>

      {/* ── 持续可感知信号 ─────────────────────────────────────────────────── */}
      <MicroLabel style={{ color: 'var(--on-forest-2)' }}>持续可感知信号</MicroLabel>
      <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
        <SignalBar label="呼吸频率"   value={signals.breath}    hue={hue} transition="2s"   />
        <SignalBar label="视线锁定度" value={signals.gaze_lock} hue={hue} transition="0.1s" />
        <SignalBar label="情绪光晕"   value={signals.mood_aura} hue={hue} transition="3s"   />
        <SignalBar label="节奏不规则" value={signals.rhythm}    hue={hue} transition="0.5s" />
      </div>

      {/* ── 近 2 分钟 mood 轨迹 ────────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--forest-line)', margin: '14px 0' }} />
      <MicroLabel style={{ color: 'var(--on-forest-2)' }}>近 2 分钟 mood 轨迹</MicroLabel>
      <div style={{
        display: 'flex', gap: 1, height: 28, marginTop: 8,
        borderRadius: 3, overflow: 'hidden',
        background: 'oklch(0.22 0.03 168)',
        alignItems: 'flex-end',
      }}>
        {ringBuffer.map((e, i) => (
          <div key={i} style={{
            flex: 1,
            height: `${Math.max(10, e.aura)}%`,
            background: `oklch(0.62 0.13 ${MOOD_HUE[e.mood] ?? 70})`,
            opacity: 0.45 + (i / 60) * 0.55,
            transition: 'height 0.5s ease',
          }} />
        ))}
      </div>

      <style>{`
        @keyframes statusPulse {
          0%, 100% { transform: scale(1);   opacity: 0.8 }
          50%       { transform: scale(1.5); opacity: 1   }
        }
      `}</style>
    </div>
  );
}

// ── 小工具组件 ────────────────────────────────────────────────────────────────

function ForestCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '9px 11px',
      background: 'var(--forest-1)',
      border: '1px solid var(--forest-line)',
      borderRadius: 5,
    }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: 'var(--on-forest-2)', marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SignalBar({ label, value, hue, transition }: {
  label: string; value: number; hue: number; transition: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.2 }}>{label}</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)' }}>{value}%</span>
      </div>
      <div style={{
        position: 'relative', height: 5,
        background: 'oklch(0.22 0.03 168)',
        border: '1px solid var(--forest-line)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${value}%`,
          background: `oklch(0.62 0.13 ${hue})`,
          transition: `width ${transition} ease`,
        }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${(i + 1) * 25}%`, width: 1,
            background: 'oklch(0.50 0.02 168 / 0.15)',
          }} />
        ))}
      </div>
    </div>
  );
}
