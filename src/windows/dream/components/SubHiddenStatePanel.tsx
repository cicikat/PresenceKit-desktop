/* SubHiddenStatePanel — read-only Dream subconscious state panel (Phase 4.5) */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { loadHiddenStateDebug } from '../../../shared/api/backend';
import type {
  HiddenStateDebugResponse,
  HiddenStateBodyMemoryEntry,
} from '../../../shared/api/types';
import { chatThemeFontSize } from '../../../shared/chatAppearance';

const SOURCE_HUE: Record<string, number> = {
  dream_impression: 280,
  dream_afterglow: 260,
  dream_body_event: 240,
  reality_behavior: 145,
  time_decay: 72,
  consolidation: 200,
  init: 0,
};

const BUCKET_LABELS: Record<string, string> = {
  low: '低',
  mid: '中',
  high: '高',
  guarded: '防备',
  neutral: '平稳',
  easy: '放松',
};

const BUCKET_HUE: Record<string, number> = {
  low: 232,
  mid: 72,
  high: 8,
  guarded: 232,
  neutral: 72,
  easy: 145,
};

// Sources that indicate no real-conversation writes have happened
const PASSIVE_SOURCES = new Set([
  'time_decay',
  'init',
  'consolidation',
  'dream_afterglow',
  'dream_impression',
  'dream_body_event',
]);

function clampPercent(value: number, max = 100): number {
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function deltaArrow(delta: number, threshold = 0.05): '↑' | '↓' | '→' {
  if (delta > threshold) return '↑';
  if (delta < -threshold) return '↓';
  return '→';
}

function formatDelta(delta: number, threshold = 0.05): string {
  const arrow = deltaArrow(delta, threshold);
  const sign = delta >= 0 ? '+' : '';
  return `${arrow} ${sign}${delta.toFixed(1)}`;
}

function SourceBadge({ source }: { source: string }) {
  const hue = SOURCE_HUE[source] ?? 168;
  return (
    <span
      className="mono"
      title={`source: ${source}`}
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        fontSize: chatThemeFontSize(8.5),
        letterSpacing: 0.9,
        fontWeight: 700,
        background: hue > 0 ? `oklch(0.32 0.08 ${hue})` : 'oklch(0.28 0.02 168)',
        color: hue > 0 ? `oklch(0.92 0.06 ${hue})` : 'var(--on-forest-2)',
        borderRadius: 3,
        whiteSpace: 'nowrap',
      }}
    >
      {source || 'unknown'}
    </span>
  );
}

function ScalarBar({ value, max = 100, hue = 168 }: { value: number; max?: number; hue?: number }) {
  return (
    <div style={{ position: 'relative', height: 4, background: 'oklch(0.22 0.03 168)', borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${clampPercent(value, max)}%`,
          background: `oklch(0.60 0.12 ${hue})`,
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function PanelCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--forest-1)',
        border: '1px solid var(--forest-line)',
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
      <span className="serif" style={{ fontSize: chatThemeFontSize(12), fontWeight: 600, color: 'var(--on-forest)' }}>
        {label}
      </span>
      {tag && (
        <span className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 1.1 }}>
          {tag}
        </span>
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  bar,
  hue,
  diff,
}: {
  label: string;
  value: string | number;
  bar?: number;
  hue?: number;
  diff?: number | null;
}) {
  const hasDiff = diff !== null && diff !== undefined && Math.abs(diff) > 0.05;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 0.8 }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasDiff && (
            <span className="mono" style={{
              fontSize: chatThemeFontSize(8.5),
              color: diff! > 0 ? 'oklch(0.72 0.10 145)' : 'oklch(0.70 0.10 20)',
              letterSpacing: 0.5,
            }}>
              {formatDelta(diff!)}
            </span>
          )}
          <span className="mono" style={{ fontSize: chatThemeFontSize(10.5), color: 'var(--on-forest)', fontWeight: 600 }}>
            {typeof value === 'number' ? value.toFixed(1) : value}
          </span>
        </div>
      </div>
      {bar !== undefined && <ScalarBar value={bar} hue={hue ?? 168} />}
    </div>
  );
}

function BucketPill({ value }: { value: string }) {
  const hue = BUCKET_HUE[value] ?? 72;
  return (
    <span
      className="mono"
      title={value}
      style={{
        padding: '2px 8px',
        fontSize: chatThemeFontSize(9.5),
        letterSpacing: 1,
        fontWeight: 700,
        background: `oklch(0.32 0.10 ${hue})`,
        color: `oklch(0.90 0.08 ${hue})`,
        borderRadius: 3,
      }}
    >
      {BUCKET_LABELS[value] ?? value}
    </span>
  );
}

// ── Source overview ─────────────────────────────────────────────────────────

function SourceOverview({ data }: { data: HiddenStateDebugResponse }) {
  const sources = [
    { label: '敏感度', source: data.sensitivity.last_update_source },
    { label: '触碰需求', source: data.touch_need.last_update_source },
    { label: '放松度', source: data.embodied_ease.last_update_source },
  ];
  const allPassive = sources.every(s => PASSIVE_SOURCES.has(s.source));
  const hasRealityWrite = sources.some(s => s.source === 'reality_behavior');

  return (
    <PanelCard>
      <SectionHeader label="驱动源" tag="SOURCE OVERVIEW" />
      <div style={{ display: 'grid', gap: 6 }}>
        {sources.map(({ label, source }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 0.8 }}>
              {label}
            </span>
            <SourceBadge source={source} />
          </div>
        ))}
      </div>
      {allPassive && !hasRealityWrite && (
        <div style={{
          marginTop: 10,
          padding: '6px 8px',
          borderRadius: 4,
          background: `oklch(0.26 0.04 72 / 0.6)`,
          border: `1px solid oklch(0.42 0.08 72 / 0.5)`,
          fontSize: chatThemeFontSize(9),
          color: `oklch(0.82 0.08 72)`,
          lineHeight: 1.55,
          letterSpacing: 0.4,
        }}>
          当前仅由时间衰减驱动，现实对话从未写入此模块。
          <br />
          接线前的预期状态 — 见 known-issues.md §H1。
        </div>
      )}
      {hasRealityWrite && (
        <div style={{
          marginTop: 10,
          padding: '6px 8px',
          borderRadius: 4,
          background: `oklch(0.26 0.06 145 / 0.6)`,
          border: `1px solid oklch(0.42 0.10 145 / 0.5)`,
          fontSize: chatThemeFontSize(9),
          color: `oklch(0.82 0.10 145)`,
          letterSpacing: 0.4,
        }}>
          检测到现实行为写入 ✓
        </div>
      )}
    </PanelCard>
  );
}

// ── Prev-snapshot diff row ──────────────────────────────────────────────────

function DiffRow({ label, curr, prev }: { label: string; curr: number; prev: number | undefined }) {
  if (prev === undefined) return null;
  const delta = curr - prev;
  if (Math.abs(delta) < 0.05) {
    return (
      <div style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 0.5, marginTop: 4 }}>
        <span className="mono">{label}: </span>
        <span style={{ color: 'var(--on-forest-2)', opacity: 0.6 }}>自上次刷新无变化</span>
      </div>
    );
  }
  const color = delta > 0 ? 'oklch(0.72 0.10 145)' : 'oklch(0.70 0.10 20)';
  return (
    <div style={{ fontSize: chatThemeFontSize(8.5), letterSpacing: 0.5, marginTop: 4 }}>
      <span className="mono" style={{ color: 'var(--on-forest-2)' }}>{label}: </span>
      <span className="mono" style={{ color, fontWeight: 700 }}>{formatDelta(delta)}</span>
      <span style={{ color: 'var(--on-forest-2)', opacity: 0.6, marginLeft: 4 }}>自上次刷新</span>
    </div>
  );
}

// ── Body memory table ───────────────────────────────────────────────────────

function BodyMemoryTable({ entries }: { entries: HiddenStateBodyMemoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <span className="serif" style={{ fontSize: chatThemeFontSize(12.5), color: 'var(--on-forest-2)', lineHeight: 1.6 }}>
        暂无身体记忆线索
      </span>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: chatThemeFontSize(9.5) }}>
        <thead>
          <tr>
            {['线索', '反应', '权重'].map(col => (
              <th
                key={col}
                className="mono"
                style={{
                  textAlign: 'left',
                  padding: '3px 6px 5px 0',
                  color: 'var(--on-forest-2)',
                  letterSpacing: 1,
                  fontWeight: 700,
                  borderBottom: '1px solid var(--forest-line)',
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
              <td className="mono" style={{ padding: '5px 8px 5px 0', color: 'var(--on-forest)', letterSpacing: 0.3 }}>
                {entry.cue || '—'}
              </td>
              <td className="mono" style={{ padding: '5px 8px 5px 0', color: 'var(--on-forest-2)' }}>
                {entry.response_tag || '—'}
              </td>
              <td style={{ padding: '5px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 42, height: 3, background: 'oklch(0.22 0.03 168)', borderRadius: 2, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${clampPercent(entry.weight, 1)}%`,
                        background: 'oklch(0.60 0.12 145)',
                      }}
                    />
                  </div>
                  <span className="mono" style={{ color: 'var(--on-forest-2)', minWidth: 32 }}>
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

function DeveloperNotice() {
  return (
    <PanelCard>
      <div className="serif" style={{ fontSize: chatThemeFontSize(12.5), lineHeight: 1.55, color: 'var(--on-forest-2)' }}>
        更细的敏感度与触碰需求数值会跟随 Dream 系统设置里的开发者模式显示。
      </div>
    </PanelCard>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function SubHiddenStatePanel() {
  const [data, setData] = useState<HiddenStateDebugResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Track the data from the previous fetch for diff display
  const prevDataRef = useRef<HiddenStateDebugResponse | null>(null);
  // Always points to the current data so fetchPanel closure can read it
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
    void fetchPanel();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px 14px' }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--on-forest-2)', letterSpacing: 1.1 }}>
          正在读取潜意识状态…
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 14 }}>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'oklch(0.72 0.14 8)', marginBottom: 10 }}>
          {error ?? '读取失败'}
        </div>
        <button
          type="button"
          onClick={() => void fetchPanel()}
          style={{
            padding: '4px 12px',
            borderRadius: 3,
            fontSize: chatThemeFontSize(10),
            background: 'transparent',
            border: '1px solid var(--forest-line)',
            color: 'var(--on-forest-2)',
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

  // Deltas from previous fetch (null if this is the first load)
  const sensDelta = prev ? data.sensitivity.current - prev.sensitivity.current : null;
  const touchDelta = prev ? data.touch_need.deficit - prev.touch_need.deficit : null;
  const easeDelta = prev ? data.embodied_ease.value - prev.embodied_ease.value : null;

  // Delta from center (50) for ease
  const easeFromCenter = data.embodied_ease.value - 50;

  // Delta from baseline for sensitivity
  const sensFromBaseline = data.sensitivity.current - data.sensitivity.baseline;

  return (
    <div style={{ padding: '10px 14px 20px', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 1.1 }}>
          READ ONLY · Phase 4.5
        </span>
        <button
          type="button"
          onClick={() => void fetchPanel()}
          title="刷新"
          style={{
            width: 22,
            height: 22,
            borderRadius: 3,
            background: 'transparent',
            border: '1px solid var(--forest-line)',
            color: 'var(--on-forest-2)',
            cursor: 'pointer',
            fontSize: chatThemeFontSize(12),
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

      {/* Source overview — always visible, highlights "all time_decay" state */}
      <SourceOverview data={data} />

      <PanelCard>
        <SectionHeader label="身体放松度" tag="EMBODIED EASE" />
        <MetricRow
          label="当前读数"
          value={data.embodied_ease.value}
          bar={data.embodied_ease.value}
          hue={200}
          diff={easeDelta}
        />
        <MetricRow
          label="偏离中心（50）"
          value={`${easeFromCenter >= 0 ? '+' : ''}${easeFromCenter.toFixed(1)}`}
          hue={easeFromCenter >= 0 ? 145 : 20}
        />
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 0.9 }}>
            最近来源
          </span>
          <SourceBadge source={data.embodied_ease.last_update_source} />
        </div>
        {easeDelta !== null && (
          <DiffRow label="放松度" curr={data.embodied_ease.value} prev={prev?.embodied_ease.value} />
        )}
      </PanelCard>

      <PanelCard>
        <SectionHeader label="身体记忆线索" tag={`${data.body_memory.length} 条`} />
        <BodyMemoryTable entries={data.body_memory} />
      </PanelCard>

      <PanelCard>
        <SectionHeader label="梦境读取到的状态" tag="DREAM SNAPSHOT" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          <div>
            <div className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 1, marginBottom: 4 }}>敏感度</div>
            <BucketPill value={snap.sensitivity} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 1, marginBottom: 4 }}>触碰趋向</div>
            <BucketPill value={snap.touch_appetite} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 1, marginBottom: 4 }}>身体松弛</div>
            <BucketPill value={snap.embodied_ease} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest-2)', letterSpacing: 1, marginBottom: 4 }}>记忆线索</div>
            <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest)' }}>
              {snap.memory_cues.length > 0 ? snap.memory_cues.join(', ') : '—'}
            </span>
          </div>
        </div>
      </PanelCard>

      {showDeveloperFields ? (
        <>
          <PanelCard>
            <SectionHeader label="即时敏感" tag="DEVELOPER" />
            <MetricRow
              label="敏感基线"
              value={data.sensitivity.baseline}
              bar={data.sensitivity.baseline}
              hue={145}
            />
            <MetricRow
              label="即时敏感"
              value={data.sensitivity.current}
              bar={data.sensitivity.current}
              hue={72}
              diff={sensDelta}
            />
            <MetricRow
              label="偏离基线"
              value={`${sensFromBaseline >= 0 ? '+' : ''}${sensFromBaseline.toFixed(1)}`}
              hue={sensFromBaseline >= 0 ? 8 : 232}
            />
            <div style={{ marginTop: 7 }}>
              <SourceBadge source={data.sensitivity.last_update_source} />
            </div>
            {sensDelta !== null && (
              <DiffRow label="即时敏感" curr={data.sensitivity.current} prev={prev?.sensitivity.current} />
            )}
          </PanelCard>

          <PanelCard>
            <SectionHeader label="触碰亏缺" tag="DEVELOPER" />
            <MetricRow label="触碰需求基线" value={data.touch_need.baseline} bar={data.touch_need.baseline} hue={145} />
            <MetricRow
              label="触碰亏缺（Δ from 0）"
              value={data.touch_need.deficit}
              bar={data.touch_need.deficit}
              hue={8}
              diff={touchDelta}
            />
            <div style={{ marginTop: 7 }}>
              <SourceBadge source={data.touch_need.last_update_source} />
            </div>
            {touchDelta !== null && (
              <DiffRow label="触碰亏缺" curr={data.touch_need.deficit} prev={prev?.touch_need.deficit} />
            )}
          </PanelCard>

          <PanelCard>
            <SectionHeader label="开发者信息" tag={`SCHEMA v${data.schema_version}`} />
            <MetricRow label="last_decay_tick" value={data.last_decay_tick ? data.last_decay_tick.slice(0, 19) : '—'} />
            <MetricRow label="display.physiological_arousal" value="true" />
          </PanelCard>
        </>
      ) : (
        <DeveloperNotice />
      )}
    </div>
  );
}
