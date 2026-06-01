import { useEffect, useState, type ReactNode } from 'react';
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

export function DreamStatusSidebar({ dreamState, onClose }: DreamStatusSidebarProps) {
  const [settings, setSettings] = useState<DreamSettings | null>(null);

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
        <div className="dream-hud__groups">
          <HudGroup title="叶瑄 · YEXUAN">
            <HudLabel label="情绪" value={dreamState?.emotion_label} tone={getEmotionTone(dreamState?.emotion_label)} />
            <div className="dream-hud__metrics">
              <HudMetric label="情绪张力" value={dreamState?.emotion_tension} color="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))" />
              <HudMetric label="边界侵入" value={dreamState?.boundary_intrusion} color="linear-gradient(90deg, #7fbfe8, #e96c6c)" />
              <HudMetric label="亲密倾向" value={dreamState?.intimacy_tendency} color="linear-gradient(90deg, var(--dt-flower-dandelion), #e96c6c)" />
              <HudMetric label="执念" value={dreamState?.obsession} color="linear-gradient(90deg, #b97fe8, var(--dt-flower-dandelion))" />
            </div>
          </HudGroup>

          <HudGroup title="场景 · SCENE">
            <HudLabel label="当前" value={dreamState?.scene_label} tone="scene" />
            <div className="dream-hud__metrics">
              <HudMetric label="梦境稳定度" value={dreamState?.dream_stability} color="linear-gradient(90deg, var(--dt-surface-2), var(--dt-flower-bluebell))" />
              <HudMetric label="梦境深度" value={dreamState?.dream_depth} color="linear-gradient(90deg, var(--dt-flower-bluebell), #7fbfe8)" />
            </div>
          </HudGroup>

          {showPhysiologicalArousal && (
            <HudGroup title="隐藏状态 · HIDDEN">
              <div className="dream-hud__metrics">
                <HudMetric label="生理唤醒" value={dreamState?.physiological_arousal} color="linear-gradient(90deg, var(--dt-surface-2), #e96c6c)" />
              </div>
            </HudGroup>
          )}
        </div>
      )}
    </aside>
  );
}
