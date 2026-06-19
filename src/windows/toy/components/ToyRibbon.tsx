/* ============================================================
 * ToyRibbon — 玩耍模式左侧固定功能条（仿 ActivityRibbon）
 * ============================================================ */

import { useState } from 'react';
import { Icon } from '../../chat/components/UIKit';

function RBtn({ icon, label, active, onClick, customIcon }: {
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
        transition: 'background 0.15s, color 0.15s',
      }}>
        {customIcon ?? <Icon name={icon!} size={18} strokeWidth={1.6} />}
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

// 心形图标 — 玩耍模式标识
function HeartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7-4.6-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.4 12 20 12 20z" />
    </svg>
  );
}

interface ToyRibbonProps {
  onClose: () => void;
  theme: string;
  onThemeToggle: () => void;
}

export function ToyRibbon({ onClose, theme, onThemeToggle }: ToyRibbonProps) {
  return (
    <div className="toy-ribbon" style={{
      width: 52, flexShrink: 0, height: '100%',
      background: 'var(--forest)',
      borderRight: '1px solid var(--forest-1)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '12px 0', gap: 4,
      zIndex: 10, position: 'relative',
    }}>
      <RBtn icon="chat" label="返回对话" active={false} onClick={onClose} />
      <div style={{ width: 24, height: 1, background: 'var(--forest-line, oklch(0.45 0.06 160))', margin: '6px 0' }} />
      <RBtn label="玩耍模式" active customIcon={<HeartIcon />} onClick={() => {}} />
      <div style={{ flex: 1 }} />
      <RBtn
        icon={theme === 'dark' ? 'sparkle' : 'mood'}
        label={theme === 'dark' ? '日间' : '夜间'}
        active={false}
        onClick={onThemeToggle}
      />
    </div>
  );
}
