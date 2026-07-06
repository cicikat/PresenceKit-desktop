import type { DreamFlowEntry, DreamState } from '../../../shared/api/dream-types';
import { getActiveCharacterName } from '../../../shared/activeCharacter';
import { DreamGlowPanel, type DreamGlowTag } from './DreamGlowPanel';

const FLOW_ENTRY_MIN_LENGTH = 20;
const FLOW_ENTRY_MAX_LENGTH = 32;
const FLOW_ENTRY_DISPLAY_COUNT = 5;

const STATUS_LABEL: Record<string, string> = {
  DREAM_ACTIVE: '梦境进行中',
  DREAM_EXIT_REQUESTED: '醒来的边缘',
  DREAM_CLOSING: '梦在消散',
  REALITY_AFTERGLOW: '余温未散',
  DREAM_ENTRANCE_AVAILABLE: '可进入梦境',
  DREAM_LOCKED: '梦境锁定',
  REALITY_CHAT: '现实',
};

const WORLD_LABEL: Record<string, string> = {
  reality_derived: '现实映射',
  abo: '既定',
  vampire: '既定',
  cat: '既定',
  flower_bud: '花苞',
  custom: '自定义',
};

interface DreamSidebarProps {
  dreamState: DreamState | null;
  herDataUrl: string | null;
  onClose: () => void;
}

function normalizeFlowSummary(text: string): string | null {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact || /[#"'>“”‘’「」『』]/.test(compact)) return null;

  let summary = compact
    .replace(/^[\s\-*•\d.、]+/, '')
    .replace(/[<>`*_~]/g, '')
    .replace(/[。！？；，、\s]+$/, '');

  if (summary.length < FLOW_ENTRY_MIN_LENGTH) {
    summary += '，梦境仍在当前层次中缓慢延续';
  }
  if (summary.length < FLOW_ENTRY_MIN_LENGTH) return null;
  if (summary.length >= FLOW_ENTRY_MAX_LENGTH) {
    summary = summary.slice(0, FLOW_ENTRY_MAX_LENGTH - 1).replace(/[。！？；，、\s]+$/, '');
  }
  return `${summary}。`;
}

interface FlowEntryDisplay {
  summary: string;
  ts: string | null;
}

function formatAgo(iso: string): string {
  const dt = Math.max(0, Date.now() - new Date(iso).getTime());
  if (dt < 60_000)     return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 3_600_000)  return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return `${Math.floor(dt / 86_400_000)}d ago`;
}

function summarizeFlowEntry(entry: DreamFlowEntry): FlowEntryDisplay | null {
  const summary = normalizeFlowSummary(entry.summary ?? '');
  return summary ? { summary, ts: entry.ts } : null;
}

function getBackendFlowEntries(dreamState: DreamState | null): FlowEntryDisplay[] {
  const entries = dreamState?.flow_entries ?? [];
  return entries
    .map(summarizeFlowEntry)
    .filter((entry): entry is FlowEntryDisplay => Boolean(entry))
    .slice(-FLOW_ENTRY_DISPLAY_COUNT)
    .reverse(); // newest first
}

function buildFallbackFlowEntries(dreamState: DreamState | null): FlowEntryDisplay[] {
  const world = dreamState?.frozen_world ? (WORLD_LABEL[dreamState.frozen_world] ?? '当前') : '当前';
  const tension = dreamState?.char_tension ?? dreamState?.yexuan_tension ?? 0;
  const boundaryIsClosing = dreamState?.status === 'DREAM_EXIT_REQUESTED'
    || dreamState?.status === 'DREAM_CLOSING'
    || dreamState?.status === 'REALITY_AFTERGLOW';

  return [
    `场景稳定在${world}梦境层，空间轮廓仍在缓慢延展`,
    tension >= 0.65
      ? '他的注意力仍停留在你身上，情绪张力正在轻微上升'
      : '他的注意力停留在你身上，情绪张力维持平稳',
    boundaryIsClosing
      ? '梦境边界正在逐渐松动，现实感从远处缓慢回流'
      : '梦境边界保持清晰完整，暂未观察到明显断裂',
  ]
    .map(normalizeFlowSummary)
    .filter((summary): summary is string => Boolean(summary))
    .map(summary => ({ summary, ts: null }));
}

function BodyAxisBar({ label, value, color }: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-3)', letterSpacing: 1 }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', letterSpacing: 0.8 }}>
          {Math.round(value)}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--dt-surface-2)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${pct}%`,
          background: color,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

function HerBodyPanel({ body }: { body: { heat: number; sensitivity: number; tension: number } }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      background: 'var(--dt-surface-deep)',
      border: '1px solid var(--dt-border-soft)',
    }}>
      <div className="mono" style={{
        fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 10,
      }}>
        HER · 赛博感知
      </div>
      <BodyAxisBar
        label="温度 HEAT"
        value={body.heat}
        color="linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-accent-rose))"
      />
      <BodyAxisBar
        label="感知 SENS"
        value={body.sensitivity}
        color="linear-gradient(90deg, var(--dt-flower-dandelion), var(--dt-accent-violet))"
      />
      <BodyAxisBar
        label="张力 TENS"
        value={body.tension}
        color="linear-gradient(90deg, var(--dt-surface-2), var(--dt-accent-azure))"
      />
    </div>
  );
}

export function DreamSidebar({ dreamState, herDataUrl, onClose }: DreamSidebarProps) {
  const status = dreamState?.status;
  const tension = dreamState?.char_tension ?? dreamState?.yexuan_tension;
  const scene = dreamState?.scene_state;
  const anchors = dreamState?.symbolic_anchors ?? [];
  const body = dreamState?.body;
  const backendFlowEntries = getBackendFlowEntries(dreamState);
  const flowEntries = backendFlowEntries.length > 0 ? backendFlowEntries : buildFallbackFlowEntries(dreamState);
  const entryCount = flowEntries.length;
  const statusTags: DreamGlowTag[] = status ? [
    { content: status.replace(/_/g, ' '), tone: 'accent' },
    ...(dreamState?.dream_id ? [{ content: 'ACTIVE', tone: 'muted' as const }] : []),
    ...(dreamState?.frozen_world ? [{ content: dreamState.frozen_world.replace(/_/g, ' '), tone: 'muted' as const }] : []),
    ...(dreamState?.lucid_mode ? [{
      content: dreamState.lucid_mode === 'lucid_shared' ? 'LUCID' : 'NON LUCID',
      tone: dreamState.lucid_mode === 'lucid_shared' ? 'cool' as const : 'muted' as const,
    }] : []),
  ] : [];

  return (
    <aside
      className="dream-theme__sidebar dream-flow-sidebar"
      aria-label="梦境状态"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
    >
      <div className="dream-flow-sidebar__stardust" aria-hidden="true" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {herDataUrl ? (
          <img src={herDataUrl} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div className="dream-theme__avatar" style={{ width: 38, height: 38, flexShrink: 0, animation: 'none' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 'calc(12px * var(--dream-theme-font-scale, 1))', fontWeight: 700, letterSpacing: 1.8, color: 'var(--dt-ink)' }}>动向</div>
          <div className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)' }}>DREAM FLOW</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭梦境"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--dt-ink-3)', cursor: 'pointer',
              fontSize: 'calc(18px * var(--dream-theme-font-scale, 1))', lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
          <span className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', letterSpacing: 1.2 }}>
            {entryCount} ENTRIES
          </span>
        </div>
      </div>

      {/* Status card */}
      <DreamGlowPanel
        title="NOW · 状态"
        status={status ? (STATUS_LABEL[status] ?? status) : '—'}
        tags={statusTags}
      />

      {/* Emotional tension (character's dream-local tension) */}
      {tension !== undefined && tension > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 8 }}>
            {getActiveCharacterName()}·情绪张力
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--dt-surface-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.round(tension * 100)}%`,
              background: 'linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))',
              transition: 'width 0.8s ease',
            }} />
          </div>
          <div className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', marginTop: 4, letterSpacing: 0.8 }}>
            {Math.round(tension * 100)}%
          </div>
        </div>
      )}

      {/* Her cyber body panel — user_sees_own_numbers always true */}
      {body && (body.heat > 0 || body.sensitivity > 0 || body.tension > 0) && (
        <HerBodyPanel body={body} />
      )}

      {/* Scene state */}
      {scene && (
        <div>
          <div className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 6 }}>场景</div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 'calc(13px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-2)', lineHeight: 1.5 }}>
            {scene}
          </div>
        </div>
      )}

      {/* Symbolic anchors */}
      {anchors.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 6 }}>象征锚</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {anchors.map(a => (
              <span key={a} style={{
                padding: '3px 10px', borderRadius: 999,
                background: 'var(--dt-surface-2)',
                border: '1px solid var(--dt-border-soft)',
                fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-2)',
                fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              }}>
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dream flow summaries. Never render chat transcript here. */}
      {flowEntries.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 8 }}>梦境流动</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flowEntries.map((entry, index) => (
              <div key={`${entry.summary}-${index}`} className="dream-theme__garden-item" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{
                  fontSize: 'calc(12px * var(--dream-theme-font-scale, 1))', lineHeight: 1.5, fontStyle: 'italic',
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {entry.summary}
                </div>
                {entry.ts && (
                  <div className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', letterSpacing: 0.8 }}>
                    {formatAgo(entry.ts)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
