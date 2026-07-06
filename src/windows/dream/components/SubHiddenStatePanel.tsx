/* SubHiddenStatePanel — read-only Dream subconscious state panel (Phase 4.5) */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { loadHiddenStateDebug } from '../../../shared/api/backend';
import type {
  HiddenStateDebugResponse,
  HiddenStateBodyMemoryEntry,
} from '../../../shared/api/types';
import type { DreamState } from '../../../shared/api/dream-types';
import { isDreamActive } from './DreamStatusSidebar';
import { HudMeter } from './hud/HudMeter';
import { HudPill, type HudPillTone } from './hud/HudPill';
import { HudGroup } from './hud/HudGroup';

// ── Constants ────────────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<string, string> = {
  low: '低',
  mid: '中',
  high: '高',
  guarded: '防备',
  neutral: '平稳',
  easy: '放松',
};

const BUCKET_TONE: Record<string, HudPillTone> = {
  low: 'boundary',
  mid: 'scene',
  high: 'obsession',
  guarded: 'boundary',
  neutral: 'neutral',
  easy: 'intimacy',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fs(px: number): string {
  return `calc(${px}px * var(--dream-theme-font-scale, 1))`;
}

// ── Structural sub-components ────────────────────────────────────────────────

function PanelCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--dt-surface-deep)',
        border: '1px solid var(--dt-border-soft)',
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ label, tag }: { label: string; tag?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span className="serif" style={{ fontSize: fs(12), fontWeight: 600, color: 'var(--dt-ink)' }}>
        {label}
      </span>
      {tag && (
        <span className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 1.1 }}>
          {tag}
        </span>
      )}
    </div>
  );
}

// ── Body memory table ────────────────────────────────────────────────────────

function BodyMemoryTable({ entries }: { entries: HiddenStateBodyMemoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <span className="serif" style={{ fontSize: fs(12.5), color: 'var(--dt-ink-3)', lineHeight: 1.6 }}>
        暂无身体记忆线索
      </span>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fs(9.5) }}>
        <thead>
          <tr>
            {['线索', '反应', '权重'].map(col => (
              <th
                key={col}
                className="mono"
                style={{
                  textAlign: 'left',
                  padding: '3px 6px 5px 0',
                  color: 'var(--dt-ink-3)',
                  letterSpacing: 1,
                  fontWeight: 700,
                  borderBottom: '1px solid var(--dt-border-soft)',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={entry.cue + i}>
              <td className="mono" style={{ padding: '5px 8px 5px 0', color: 'var(--dt-ink)', letterSpacing: 0.3 }}>
                {entry.cue || '—'}
              </td>
              <td className="mono" style={{ padding: '5px 8px 5px 0', color: 'var(--dt-ink-3)' }}>
                {entry.response_tag || '—'}
              </td>
              <td style={{ padding: '5px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 42 }}>
                    <HudMeter
                      value={entry.weight}
                      max={1}
                      background="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))"
                      ticks={[]}
                    />
                  </div>
                  <span className="mono" style={{ color: 'var(--dt-ink-3)', minWidth: 32, fontSize: fs(8.5) }}>
                    {entry.weight.toFixed(3)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SubHiddenStatePanel({ dreamState }: { dreamState: DreamState | null }) {
  const active = isDreamActive(dreamState);

  const [data, setData] = useState<HiddenStateDebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Track the data from the previous fetch for delta computations (no longer displayed, kept for HudMeter's delta arrow)
  const prevDataRef = useRef<HiddenStateDebugResponse | null>(null);
  const currentDataRef = useRef<HiddenStateDebugResponse | null>(null);

  const fetchPanel = async () => {
    setLoading(true);
    setError(null);
    try {
      const newData = await loadHiddenStateDebug();
      prevDataRef.current = currentDataRef.current;
      currentDataRef.current = newData;
      setData(newData);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void fetchPanel();
  }, [active]);

  if (!active) {
    return (
      <div className="dream-hud__empty">
        还未进入梦境
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ padding: '20px 14px' }}>
        <span className="mono" style={{ fontSize: fs(10), color: 'var(--dt-ink-3)', letterSpacing: 1.1 }}>
          正在读取潜意识状态…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: fs(9.5), color: 'oklch(0.72 0.14 8)', marginBottom: 10 }}>
          {error ?? '读取失败'}
        </div>
        <button
          type="button"
          onClick={() => void fetchPanel()}
          style={{
            padding: '4px 12px',
            borderRadius: 3,
            fontSize: fs(10),
            background: 'transparent',
            border: '1px solid var(--dt-border-soft)',
            color: 'var(--dt-ink-3)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          重试
        </button>
      </div>
    );
  }

  const snap = data.dream_snapshot;
  const showDeveloperFields = data.display?.physiological_arousal === true;
  const prev = prevDataRef.current;

  const sensDelta = prev ? data.sensitivity.current - prev.sensitivity.current : null;
  const touchDelta = prev ? data.touch_need.deficit - prev.touch_need.deficit : null;
  const easeDelta = prev ? data.embodied_ease.value - prev.embodied_ease.value : null;
  const easeFromCenter = data.embodied_ease.value - 50;
  const sensFromBaseline = data.sensitivity.current - data.sensitivity.baseline;

  return (
    <div style={{ padding: '10px 14px 20px', overflowY: 'auto', height: '100%' }}>

      {/* Top bar: refresh only, right-aligned */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => void fetchPanel()}
          title="刷新"
          style={{
            width: 22,
            height: 22,
            borderRadius: 3,
            background: 'transparent',
            border: '1px solid var(--dt-border-soft)',
            color: 'var(--dt-ink-3)',
            cursor: 'pointer',
            fontSize: fs(12),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
            lineHeight: 1,
          }}
        >
          ↺
        </button>
      </div>

      {/* Card 1: dream_snapshot — 唯一注入梦境 prompt 的真投影，首屏优先 */}
      <HudGroup title="梦境读取到的状态 · DREAM SNAPSHOT">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
          <div>
            <div className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 1, marginBottom: 5 }}>
              敏感度
            </div>
            <HudPill value={snap.sensitivity} tone={BUCKET_TONE[snap.sensitivity] ?? 'neutral'} labelMap={BUCKET_LABELS} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 1, marginBottom: 5 }}>
              触碰趋向
            </div>
            <HudPill value={snap.touch_appetite} tone={BUCKET_TONE[snap.touch_appetite] ?? 'neutral'} labelMap={BUCKET_LABELS} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 1, marginBottom: 5 }}>
              身体松弛
            </div>
            <HudPill value={snap.embodied_ease} tone={BUCKET_TONE[snap.embodied_ease] ?? 'neutral'} labelMap={BUCKET_LABELS} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 1, marginBottom: 5 }}>
              记忆线索
            </div>
            <span className="mono" style={{ fontSize: fs(9.5), color: 'var(--dt-ink)' }}>
              {snap.memory_cues.length > 0 ? snap.memory_cues.join(', ') : '—'}
            </span>
          </div>
        </div>
      </HudGroup>

      {/* Card 2: embodied_ease — afterglow 会写，半活字段 */}
      <PanelCard>
        <SectionHeader label="身体放松度" tag="EMBODIED EASE" />
        <HudMeter
          label="当前读数"
          value={data.embodied_ease.value}
          displayValue={data.embodied_ease.value.toFixed(1)}
          background="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))"
          delta={easeDelta}
        />
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 0.7 }}>
            偏离中心（50）
          </span>
          <span
            className="mono"
            style={{
              fontSize: fs(9.5),
              color: easeFromCenter >= 0 ? 'oklch(0.72 0.10 145)' : 'oklch(0.70 0.10 20)',
              fontWeight: 600,
            }}
          >
            {easeFromCenter >= 0 ? '+' : ''}{easeFromCenter.toFixed(1)}
          </span>
        </div>
      </PanelCard>

      {/* Card 3: body_memory */}
      <PanelCard>
        <SectionHeader label="身体记忆线索" tag={`${data.body_memory.length} 条`} />
        <BodyMemoryTable entries={data.body_memory} />
      </PanelCard>

      {/* Dev fields: sensitivity / touch_need */}
      {showDeveloperFields && (
        <>
          <PanelCard>
            <SectionHeader label="即时敏感" tag="DEVELOPER" />
            <HudMeter
              label="敏感基线"
              value={data.sensitivity.baseline}
              displayValue={data.sensitivity.baseline.toFixed(1)}
              background="linear-gradient(90deg, var(--dt-surface-2), var(--dt-flower-bluebell))"
            />
            <HudMeter
              label="即时敏感"
              value={data.sensitivity.current}
              displayValue={data.sensitivity.current.toFixed(1)}
              background="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))"
              delta={sensDelta}
            />
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ fontSize: fs(8.5), color: 'var(--dt-ink-3)', letterSpacing: 0.7 }}>
                偏离基线
              </span>
              <span
                className="mono"
                style={{
                  fontSize: fs(9.5),
                  color: sensFromBaseline >= 0 ? 'oklch(0.70 0.10 20)' : 'oklch(0.72 0.10 232)',
                  fontWeight: 600,
                }}
              >
                {sensFromBaseline >= 0 ? '+' : ''}{sensFromBaseline.toFixed(1)}
              </span>
            </div>
          </PanelCard>

          <PanelCard>
            <SectionHeader label="触碰亏缺" tag="DEVELOPER" />
            <HudMeter
              label="触碰需求基线"
              value={data.touch_need.baseline}
              displayValue={data.touch_need.baseline.toFixed(1)}
              background="linear-gradient(90deg, var(--dt-surface-2), var(--dt-flower-bluebell))"
            />
            <HudMeter
              label="触碰亏缺（Δ from 0）"
              value={data.touch_need.deficit}
              displayValue={data.touch_need.deficit.toFixed(1)}
              background="linear-gradient(90deg, var(--dt-flower-dandelion), var(--dt-accent-rose))"
              delta={touchDelta}
            />
          </PanelCard>
        </>
      )}
    </div>
  );
}
