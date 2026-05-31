import { useState, useEffect } from 'react';
import type { DreamState, DreamMessage } from '../../../shared/api/dream-types';
import { avatarStore } from '../../../shared/avatars/store';
import { DreamGlowPanel, type DreamGlowTag } from './DreamGlowPanel';

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
        color="linear-gradient(90deg, var(--dt-flower-bluebell), #e96c6c)"
      />
      <BodyAxisBar
        label="感知 SENS"
        value={body.sensitivity}
        color="linear-gradient(90deg, var(--dt-flower-dandelion), #b97fe8)"
      />
      <BodyAxisBar
        label="张力 TENS"
        value={body.tension}
        color="linear-gradient(90deg, var(--dt-surface-2), #7fbfe8)"
      />
    </div>
  );
}

export function DreamSidebar({ dreamState, messages, onClose }: DreamSidebarProps) {
  const [herDataUrl, setHerDataUrl] = useState<string | null>(avatarStore.get().her.dataUrl);
  useEffect(() => avatarStore.subscribe(a => setHerDataUrl(a.her.dataUrl)), []);

  const status = dreamState?.status;
  const tension = dreamState?.yexuan_tension;
  const scene = dreamState?.scene_state;
  const anchors = dreamState?.symbolic_anchors ?? [];
  const body = dreamState?.body;
  const recentHer = messages.filter(m => m.role === 'her').slice(-3);
  const entryCount = messages.filter(m => m.role !== 'system').length;
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

      {/* Emotional tension (叶瑄 tension) */}
      {tension !== undefined && tension > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 8 }}>
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

      {/* Recent messages from her */}
      {recentHer.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.5, color: 'var(--dt-ink-3)', marginBottom: 8 }}>近期动向</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentHer.map(m => (
              <div key={m.id} className="dream-theme__garden-item" style={{
                fontSize: 'calc(12px * var(--dream-theme-font-scale, 1))', lineHeight: 1.5, fontStyle: 'italic',
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
