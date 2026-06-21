import { useState } from 'react';
// Icon is a pure SVG utility; UIKit.tsx lives under chat/ for historical reasons
// but contains no chat-specific state or behavior. TODO: move to shared/ui/UIKit.
import { Icon } from '../../chat/components/UIKit';

export type ActivityTab = 'home' | 'reading' | 'gomoku' | 'chess' | 'dream_seed';

function Sep() {
  return <div style={{ width: 24, height: 1, background: 'var(--forest-line, oklch(0.45 0.06 160))', margin: '6px 0' }} />;
}

function ABtn({ icon, label, active, onClick, customIcon }: {
  icon?: string;
  label: string;
  active: boolean;
  onClick: () => void;
  customIcon?: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <button onClick={onClick} style={{
        width: 38, height: 38, borderRadius: 6,
        background: active ? 'var(--on-forest)' : 'transparent',
        color: active ? 'var(--forest)' : 'var(--on-forest-2)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        transition: 'background 0.15s, color 0.15s',
      }}>
        {customIcon ?? <Icon name={icon!} size={18} strokeWidth={1.6} />}
        {active && (
          <span style={{
            position: 'absolute', left: -10, top: 9, bottom: 9,
            width: 3, borderRadius: '0 2px 2px 0',
            background: 'var(--on-forest)',
          }} />
        )}
      </button>
      {hover && (
        <div className="mono" style={{
          position: 'absolute', left: 46, top: '50%', transform: 'translateY(-50%)',
          padding: '3px 8px',
          background: 'var(--ink)', color: 'var(--paper)',
          borderRadius: 4,
          fontSize: 10, letterSpacing: 1.2, fontWeight: 600,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          zIndex: 200,
          boxShadow: '0 4px 12px var(--shadow-rgb-mix)',
        }}>{label}</div>
      )}
    </div>
  );
}

// Gomoku board icon — 3×3 dot grid
function GomokuIcon({ size = 18 }: { size?: number }) {
  const s = size;
  const r = s * 0.08;
  const pts = [0.25, 0.5, 0.75];
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      {pts.map(y => pts.map(x => (
        <circle key={`${x}-${y}`} cx={x * 24} cy={y * 24} r={r * 24} fill="currentColor" stroke="none" />
      )))}
      <line x1="6" y1="6" x2="18" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="6" y1="18" x2="18" y2="18" />
      <line x1="6" y1="6" x2="6" y2="18" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <line x1="18" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// Chess knight icon
function ChessIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 20h8M12 20v-4"/>
      <path d="M7 16c0-4 2-7 5-9l1 2c2-1 3-1 4 1-1 0-2 1-2 2l2 1-4 3H7z"/>
      <path d="M9 10l1 1"/>
    </svg>
  );
}

interface ActivityRibbonProps {
  activeTab: ActivityTab;
  onTab: (tab: ActivityTab) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  theme: string;
  onThemeToggle: () => void;
}

export function ActivityRibbon({ activeTab, onTab, onClose, onOpenSettings, theme, onThemeToggle }: ActivityRibbonProps) {
  return (
    <div className="activity-ribbon" style={{
      width: 52, flexShrink: 0, height: '100%',
      background: 'var(--forest)',
      borderRight: '1px solid var(--forest-1)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '12px 0', gap: 4,
      zIndex: 10, position: 'relative',
    }}>
      {/* back to chat */}
      <ABtn icon="chat" label="返回对话" active={false} onClick={onClose} />
      <Sep />
      {/* activity tabs */}
      <ABtn icon="book"   label="看书"  active={activeTab === 'reading'} onClick={() => onTab('reading')} />
      <ABtn label="五子棋" active={activeTab === 'gomoku'}  onClick={() => onTab('gomoku')}
        customIcon={<GomokuIcon />} />
      <ABtn label="国际象棋" active={activeTab === 'chess'} onClick={() => onTab('chess')}
        customIcon={<ChessIcon />} />
      <ABtn icon="sparkle" label="梦境预构" active={activeTab === 'dream_seed'} onClick={() => onTab('dream_seed')} />
      <div style={{ flex: 1 }} />
      <ABtn icon="settings" label="活动偏好" active={false} onClick={onOpenSettings} />
      <Sep />
      <ABtn
        icon={theme === 'night' ? 'sparkle' : 'mood'}
        label={theme === 'night' ? '日间' : '夜间'}
        active={false}
        onClick={onThemeToggle}
      />
    </div>
  );
}
