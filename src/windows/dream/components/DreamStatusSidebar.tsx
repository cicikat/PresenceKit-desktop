import { useEffect, useRef, useState } from 'react';
import { dreamGetSettings } from '../../../shared/api/dream';
import type { DreamSettings, DreamState } from '../../../shared/api/dream-types';
import { HudMeter } from './hud/HudMeter';
import { HudPill, type HudPillTone } from './hud/HudPill';
import { HudGroup } from './hud/HudGroup';

interface DreamStatusSidebarProps {
  dreamState: DreamState | null;
  onClose: () => void;
}

const EMOTION_TONE_LABELS: Partial<Record<HudPillTone, ReadonlySet<string>>> = {
  boundary: new Set(['警觉', '不安', '被迫靠近']),
  intimacy: new Set(['疏离', '想靠近', '强烈依恋', '黏人的依赖', '本能趋近']),
  obsession: new Set(['挂念', '放不下', '戒不掉的执念', '血色执念', '被花包裹的执念']),
};

function formatText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '—';
}

function getEmotionTone(value: unknown): HudPillTone {
  const label = formatText(value);
  for (const tone of ['boundary', 'intimacy', 'obsession'] as const) {
    if (EMOTION_TONE_LABELS[tone]?.has(label)) return tone;
  }
  return 'emotion';
}

function isDreamActive(state: DreamState | null): boolean {
  return state?.status === 'DREAM_ACTIVE' || state?.status === 'DREAM_EXIT_REQUESTED';
}

function HudLabel({ label, value, tone = 'emotion' }: {
  label: string;
  value: unknown;
  tone?: HudPillTone;
}) {
  return (
    <div className="dream-hud__label-row">
      <span className="dream-hud__label-title">{label}</span>
      <HudPill value={formatText(value)} tone={tone} />
    </div>
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
                <HudMeter label="情绪张力" value={dreamState?.emotion_tension ?? null} background="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))" />
                <HudMeter label="边界侵入" value={dreamState?.boundary_intrusion ?? null} background="linear-gradient(90deg, var(--dt-accent-azure), var(--dt-accent-rose))" />
                <HudMeter label="亲密倾向" value={dreamState?.intimacy_tendency ?? null} background="linear-gradient(90deg, var(--dt-flower-dandelion), var(--dt-accent-rose))" />
                <HudMeter label="执念" value={dreamState?.obsession ?? null} background="linear-gradient(90deg, var(--dt-accent-violet), var(--dt-flower-dandelion))" />
              </div>
            </HudGroup>

            <HudGroup title="场景 · SCENE">
              <HudLabel label="当前" value={dreamState?.scene_label} tone="scene" />
              <div className="dream-hud__metrics">
                <HudMeter label="梦境稳定度" value={dreamState?.dream_stability ?? null} background="linear-gradient(90deg, var(--dt-surface-2), var(--dt-flower-bluebell))" />
                <HudMeter label="梦境深度" value={dreamState?.dream_depth ?? null} background="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-accent-azure))" />
              </div>
            </HudGroup>

            {showPhysiologicalArousal && (
              <HudGroup title="隐藏状态 · HIDDEN">
                <div className="dream-hud__metrics">
                  <HudMeter label="生理唤醒" value={dreamState?.physiological_arousal ?? null} background="linear-gradient(90deg, var(--dt-surface-2), var(--dt-accent-rose))" />
                </div>
              </HudGroup>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
