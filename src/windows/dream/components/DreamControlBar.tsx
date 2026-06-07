import type { DreamState } from '../../../shared/api/dream-types';

interface DreamControlBarProps {
  dreamState: DreamState | null;
  phase: string;
  herDataUrl: string | null;
  onWake: () => void;
}

export function DreamControlBar({ dreamState, phase, herDataUrl, onWake }: DreamControlBarProps) {
  const scene = dreamState?.scene_state;
  const tension = dreamState?.yexuan_tension;

  const statusText = (() => {
    if (scene) return scene;
    if (phase === 'active') return '进行中';
    if (phase === 'ended') return '已结束';
    return '…';
  })();

  // Tension dot hue: bluebell (230°) at 0 → warm dandelion-violet (295°) at 1
  const tensionHue = tension !== undefined ? Math.round(tension * 65 + 230) : null;

  return (
    <header className="dream-theme__head">
      {herDataUrl ? (
        <img src={herDataUrl} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div className="dream-theme__avatar" style={{ flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div className="dream-theme__title">梦</div>
          <span className="mono" style={{ fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.3, color: 'var(--dt-ink-3)' }}>
            DREAM · {phase.toUpperCase()}
          </span>
        </div>
        <div className="dream-theme__status">
          <span
            className="dream-theme__status-dot"
            style={tensionHue !== null ? {
              background: `oklch(0.78 0.10 ${tensionHue})`,
              boxShadow: `0 0 8px oklch(0.78 0.10 ${tensionHue} / 0.55)`,
            } : undefined}
          />
          {statusText}
        </div>
      </div>

      {tension !== undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginRight: 12 }}>
          <span className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', letterSpacing: 1 }}>张力</span>
          <div style={{ width: 52, height: 3, borderRadius: 2, background: 'var(--dt-surface-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              borderRadius: 2,
              width: `${Math.round(tension * 100)}%`,
              background: `linear-gradient(90deg, var(--dt-flower-bluebell), var(--dt-flower-dandelion))`,
              transition: 'width 0.8s ease',
            }} />
          </div>
        </div>
      )}

      <button type="button" className="dream-theme__wake" onClick={onWake}>
        WAKE
      </button>
    </header>
  );
}
