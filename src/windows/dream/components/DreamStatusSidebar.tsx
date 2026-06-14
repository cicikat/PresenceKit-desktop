import { useEffect, useRef, useState, type ReactNode } from 'react';
import { dreamGetSettings } from '../../../shared/api/dream';
import type { DreamSettings, DreamState } from '../../../shared/api/dream-types';
import { DreamGlowPanel } from './DreamGlowPanel';

interface DreamStatusSidebarProps {
  dreamState: DreamState | null;
  onClose: () => void;
}

interface HudMetricProps {
  label: string;
  value: unknown;
  color: string;
}

type HudLabelTone = 'emotion' | 'boundary' | 'intimacy' | 'obsession' | 'scene';

const EMOTION_TONE_LABELS: Partial<Record<HudLabelTone, ReadonlySet<string>>> = {
  boundary: new Set(['警觉', '不安', '被迫靠近']),
  intimacy: new Set(['疏离', '想靠近', '强烈依恋', '黏人的依赖', '本能趋近']),
  obsession: new Set(['挂念', '放不下', '戒不掉的执念', '血色执念', '被花包裹的执念']),
};

function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function formatText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '—';
}

function getEmotionTone(value: unknown): HudLabelTone {
  const label = formatText(value);
  for (const tone of ['boundary', 'intimacy', 'obsession'] as const) {
    if (EMOTION_TONE_LABELS[tone]?.has(label)) return tone;
  }
  return 'emotion';
}

function isDreamActive(state: DreamState | null): boolean {
  return state?.status === 'DREAM_ACTIVE' || state?.status === 'DREAM_EXIT_REQUESTED';
}

function HudMetric({ label, value, color }: HudMetricProps) {
  const percent = clampPercent(value);

  return (
    <div className="dream-hud__metric">
      <div className="dream-hud__metric-head">
        <span>{label}</span>
        <span>{percent === null ? '—' : `${percent}%`}</span>
      </div>
      <div className="dream-hud__meter">
        <div
          className="dream-hud__meter-fill"
          style={{ width: `${percent ?? 0}%`, background: color }}
        />
        {[25, 50, 75].map(tick => (
          <span key={tick} className="dream-hud__meter-tick" style={{ left: `${tick}%` }} />
        ))}
      </div>
    </div>
  );
}

function HudLabel({ label, value, tone = 'emotion' }: {
  label: string;
  value: unknown;
  tone?: HudLabelTone;
}) {
  return (
    <div className="dream-hud__label-row">
      <span className="dream-hud__label-title">{label}</span>
      <span className={`dream-hud__pill dream-hud__pill--${tone}`}>{formatText(value)}</span>
    </div>
  );
}

function HudGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DreamGlowPanel title={title} topSheen={false} className="dream-hud__group">
      {children}
    </DreamGlowPanel>
  );
}

// ── Streaming summary bar ─────────────────────────────────────────────────────

function trendArrow(curr: number | undefined, prev: number | undefined, threshold = 3): '↑' | '↓' | '→' {
  if (curr === undefined || prev === undefined) return '→';
  const delta = curr - prev;
  if (delta > threshold) return '↑';
  if (delta < -threshold) return '↓';
  return '→';
}

function stabilityColor(stability: number | undefined): string {
  if (stability === undefined) return 'var(--dt-flower-dandelion)';
  if (stability >= 65) return 'var(--dt-flower-bluebell)';
  if (stability <= 35) return 'var(--dt-accent-rose)';
  return 'var(--dt-flower-dandelion)';
}

function DreamSummaryBar({ current, prev }: { current: DreamState; prev: DreamState | null }) {
  const scene = typeof current.scene_label === 'string' && current.scene_label.trim()
    ? current.scene_label.trim()
    : '—';
  const emotion = typeof current.emotion_label === 'string' && current.emotion_label.trim()
    ? current.emotion_label.trim()
    : '—';

  const etArrow = trendArrow(current.emotion_tension, prev?.emotion_tension ?? undefined);
  const biArrow = trendArrow(current.boundary_intrusion, prev?.boundary_intrusion ?? undefined);
  const ddArrow = trendArrow(current.dream_depth, prev?.dream_depth ?? undefined);

  const accentColor = stabilityColor(current.dream_stability);

  return (
    <div
      style={{
        padding: '9px 14px 8px',
        borderBottom: '1px solid var(--dt-border-soft)',
        background: 'var(--dt-surface-2)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: `calc(13px * var(--dream-theme-font-scale, 1))`,
          color: 'var(--dt-ink)',
          letterSpacing: 0.4,
          lineHeight: 1.45,
          marginBottom: 5,
        }}
      >
        「{scene} · {emotion}」
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          fontFamily: 'var(--font-mono)',
          fontSize: `calc(10px * var(--dream-theme-font-scale, 1))`,
          color: 'var(--dt-ink-3)',
          letterSpacing: 1,
        }}
      >
        <span style={{ color: etArrow !== '→' ? accentColor : 'var(--dt-ink-3)' }}>
          情绪{etArrow}
        </span>
        <span style={{ color: biArrow !== '→' ? accentColor : 'var(--dt-ink-3)' }}>
          边界{biArrow}
        </span>
        <span style={{ color: ddArrow !== '→' ? accentColor : 'var(--dt-ink-3)' }}>
          深度{ddArrow}
        </span>
      </div>
    </div>
  );
}

export function DreamStatusSidebar({ dreamState, onClose }: DreamStatusSidebarProps) {
  const [settings, setSettings] = useState<DreamSettings | null>(null);

  // Track previous poll snapshot for trend arrows in DreamSummaryBar.
  // Runs after every render, so prevStateRef.current holds the prior value during render.
  const prevStateRef = useRef<DreamState | null>(null);
  useEffect(() => {
    prevStateRef.current = dreamState;
  });

  useEffect(() => {
    let disposed = false;
    dreamGetSettings()
      .then(next => {
        if (!disposed) setSettings(next);
      })
      .catch(() => {
        if (!disposed) setSettings(null);
      });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const syncSettings = (event: Event) => {
      setSettings((event as CustomEvent<DreamSettings>).detail);
    };
    window.addEventListener('dream-settings-updated', syncSettings);
    return () => window.removeEventListener('dream-settings-updated', syncSettings);
  }, []);

  const active = isDreamActive(dreamState);
  const showPhysiologicalArousal = settings?.display?.physiological_arousal === true;

  return (
    <aside className="dream-theme__sidebar dream-hud" aria-label="梦境状态">
      <header className="dream-hud__head">
        <div>
          <div className="dream-hud__title">状态</div>
          <div className="dream-hud__kicker">DREAM HUD · V1.1</div>
        </div>
        <button type="button" className="dream-hud__close" onClick={onClose} aria-label="关闭侧栏">×</button>
      </header>

      {!active ? (
        <div className="dream-hud__empty">
          梦境尚未激活。进入梦境后，这里会显示当前状态。
        </div>
      ) : (
        <>
          {dreamState && (
            <DreamSummaryBar current={dreamState} prev={prevStateRef.current} />
          )}
        <div className="dream-hud__groups">
          <HudGroup title="叶瑄 · YEXUAN">
            <HudLabel label="情绪" value={dreamState?.emotion_label} tone={getEmotionTone(dreamState?.emotion_label)} />
            <div className="dream-hud__metrics">
              <HudMetric label="情绪张力" value={dreamState?.emotion_tension} color="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))" />
              <HudMetric label="边界侵入" value={dreamState?.boundary_intrusion} color="linear-gradient(90deg, var(--dt-accent-azure), var(--dt-accent-rose))" />
              <HudMetric label="亲密倾向" value={dreamState?.intimacy_tendency} color="linear-gradient(90deg, var(--dt-flower-dandelion), var(--dt-accent-rose))" />
              <HudMetric label="执念" value={dreamState?.obsession} color="linear-gradient(90deg, var(--dt-accent-violet), var(--dt-flower-dandelion))" />
            </div>
          </HudGroup>

          <HudGroup title="场景 · SCENE">
            <HudLabel label="当前" value={dreamState?.scene_label} tone="scene" />
            <div className="dream-hud__metrics">
              <HudMetric label="梦境稳定度" value={dreamState?.dream_stability} color="linear-gradient(90deg, var(--dt-surface-2), var(--dt-flower-bluebell))" />
              <HudMetric label="梦境深度" value={dreamState?.dream_depth} color="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-accent-azure))" />
            </div>
          </HudGroup>

          {showPhysiologicalArousal && (
            <HudGroup title="隐藏状态 · HIDDEN">
              <div className="dream-hud__metrics">
                <HudMetric label="生理唤醒" value={dreamState?.physiological_arousal} color="linear-gradient(90deg, var(--dt-surface-2), var(--dt-accent-rose))" />
              </div>
            </HudGroup>
          )}
        </div>
        </>
      )}
    </aside>
  );
}
