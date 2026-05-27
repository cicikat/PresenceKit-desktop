import type { BodyState, DreamState, DreamMessage } from '../../../shared/api/dream-types';

const STATUS_LABEL: Record<string, string> = {
  DREAM_ACTIVE: '梦境进行中',
  DREAM_EXIT_REQUESTED: '醒来的边缘',
  DREAM_CLOSING: '梦在消散',
  REALITY_AFTERGLOW: '余温未散',
  DREAM_ENTRANCE_AVAILABLE: '可进入梦境',
  DREAM_LOCKED: '梦境锁定',
  REALITY_CHAT: '现实',
};

interface DreamSidebarProps {
  dreamState: DreamState | null;
  messages: DreamMessage[];
  onClose: () => void;
}

function BodyAxisBar({ label, value, cap, color }: {
  label: string;
  value: number;
  cap: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(cap, 1)) * 100));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--dt-ink-3)', letterSpacing: 1 }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--dt-ink-4)', letterSpacing: 0.8 }}>
          {Math.round(value)}/{Math.round(cap)}
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

function HerBodyPanel({ body }: { body: BodyState }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      background: 'var(--dt-surface-deep)',
      border: '1px solid var(--dt-border-soft)',
    }}>
      <div className="mono" style={{
        fontSize: 9.5, letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 10,
      }}>
        HER · 赛博感知
      </div>
      <BodyAxisBar
        label="温度 HEAT"
        value={body.heat}
        cap={body.heat_cap}
        color="linear-gradient(90deg, var(--dt-flower-bluebell), #e96c6c)"
      />
      <BodyAxisBar
        label="感知 SENS"
        value={body.sensitivity}
        cap={body.sensitivity_cap}
        color="linear-gradient(90deg, var(--dt-flower-dandelion), #b97fe8)"
      />
      <BodyAxisBar
        label="张力 TENS"
        value={body.tension}
        cap={body.tension_cap}
        color="linear-gradient(90deg, var(--dt-surface-2), #7fbfe8)"
      />
    </div>
  );
}

export function DreamSidebar({ dreamState, messages, onClose }: DreamSidebarProps) {
  const status = dreamState?.status;
  const tension = dreamState?.emotional_tension;
  const scene = dreamState?.scene_state;
  const anchors = dreamState?.symbolic_anchors ?? [];
  const bodyState = dreamState?.body_state;
  const recentHer = messages.filter(m => m.role === 'her').slice(-3);
  const entryCount = messages.filter(m => m.role !== 'system').length;

  return (
    <aside
      className="dream-theme__sidebar"
      aria-label="梦境状态"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          className="dream-theme__avatar"
          style={{ width: 38, height: 38, flexShrink: 0, animation: 'none' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.8, color: 'var(--dt-ink)' }}>动向</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: 'var(--dt-ink-3)' }}>DREAM FLOW</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭梦境"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--dt-ink-3)', cursor: 'pointer',
              fontSize: 18, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
          <span className="mono" style={{ fontSize: 9, color: 'var(--dt-ink-4)', letterSpacing: 1.2 }}>
            {entryCount} ENTRIES
          </span>
        </div>
      </div>

      {/* Status card */}
      <div style={{
        padding: '14px 16px', borderRadius: 16,
        background: 'var(--dt-surface-deep)',
        border: '1px solid var(--dt-border-soft)',
      }}>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 6 }}>NOW · 状态</div>
        <div
          className="serif"
          style={{ fontStyle: 'italic', fontSize: 14, color: 'var(--dt-ink)', lineHeight: 1.5, marginBottom: 10 }}
        >
          {status ? (STATUS_LABEL[status] ?? status) : '—'}
        </div>
        {status && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 10,
              background: 'var(--dt-flower-dandelion)', color: 'var(--dt-ink)',
              fontFamily: 'var(--font-mono)', letterSpacing: 1,
            }}>
              {status.replace(/_/g, ' ')}
            </span>
            {dreamState?.dream_id && (
              <span style={{
                padding: '3px 8px', borderRadius: 6, fontSize: 10,
                background: 'var(--dt-surface-2)', color: 'var(--dt-ink-3)',
                fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
              }}>
                ACTIVE
              </span>
            )}
          </div>
        )}
      </div>

      {/* Emotional tension (叶瑄 tension) */}
      {tension !== undefined && (
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 8 }}>
            叶瑄·情绪张力
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--dt-surface-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.round(tension * 100)}%`,
              background: 'linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))',
              transition: 'width 0.8s ease',
            }} />
          </div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--dt-ink-4)', marginTop: 4, letterSpacing: 0.8 }}>
            {Math.round(tension * 100)}%
          </div>
        </div>
      )}

      {/* Her cyber body panel — user_sees_own_numbers always true */}
      {bodyState && (bodyState.heat > 0 || bodyState.sensitivity > 0 || bodyState.tension > 0) && (
        <HerBodyPanel body={bodyState} />
      )}

      {/* Scene state */}
      {scene && (
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 6 }}>场景</div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--dt-ink-2)', lineHeight: 1.5 }}>
            {scene}
          </div>
        </div>
      )}

      {/* Symbolic anchors */}
      {anchors.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 6 }}>象征锚</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {anchors.map(a => (
              <span key={a} style={{
                padding: '3px 10px', borderRadius: 999,
                background: 'var(--dt-surface-2)',
                border: '1px solid var(--dt-border-soft)',
                fontSize: 11, color: 'var(--dt-ink-2)',
                fontFamily: 'var(--font-serif)', fontStyle: 'italic',
              }}>
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent messages from her */}
      {recentHer.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 8 }}>近期动向</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentHer.map(m => (
              <div key={m.id} className="dream-theme__garden-item" style={{
                fontSize: 12, lineHeight: 1.5, fontStyle: 'italic',
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {m.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
