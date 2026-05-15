/* ============================================================
 * Ribbon — 左侧固定功能图标条
 * 迁移自: Emerald-desktopUI/ribbon.jsx
 * ============================================================ */

import { useState } from 'react';
import { Icon } from './UIKit';

function Sep() {
  return <div style={{ width: 24, height: 1, background: 'var(--forest-line)', margin: '6px 0' }} />;
}

function RibBtn({ icon, label, active, onClick }: any) {
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
        <Icon name={icon} size={18} strokeWidth={1.6} />
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

export function Ribbon({
  sidebarOpen, sidebarTab, onSidebarTab, onCloseSidebar,
  chatHeaderVisible, onChatHeaderToggle,
  petVisible, onPetToggle,
  theme, onThemeToggle,
  onOpenSpec, onOpenDebug, onOpenPrefs,
}: any) {
  return (
    <div style={{
      width: 52, flexShrink: 0, height: '100%',
      background: 'var(--forest)',
      borderRight: '1px solid var(--forest-1)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '12px 0', gap: 4,
      zIndex: 10, position: 'relative',
    }}>
      {/* logo */}
      <div style={{
        width: 32, height: 32, borderRadius: 6,
        background: 'var(--on-forest)', color: 'var(--forest)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 6,
      }}>
        <Icon name="logo" size={18} strokeWidth={1.8} />
      </div>
      <Sep />
      <RibBtn icon="pulse"  label="动向"
        active={sidebarOpen && sidebarTab === 'flow'}
        onClick={() => { if (sidebarOpen && sidebarTab === 'flow') onCloseSidebar(); else onSidebarTab('flow'); }} />
      <RibBtn icon="diary"  label="日记"
        active={sidebarOpen && sidebarTab === 'diary'}
        onClick={() => { if (sidebarOpen && sidebarTab === 'diary') onCloseSidebar(); else onSidebarTab('diary'); }} />
      <RibBtn icon="mood"   label="状态"
        active={sidebarOpen && sidebarTab === 'status'}
        onClick={() => { if (sidebarOpen && sidebarTab === 'status') onCloseSidebar(); else onSidebarTab('status'); }} />
      <RibBtn icon="flower" label="花园"
        active={sidebarOpen && sidebarTab === 'garden'}
        onClick={() => { if (sidebarOpen && sidebarTab === 'garden') onCloseSidebar(); else onSidebarTab('garden'); }} />
      <Sep />
      <RibBtn icon="book" label="对话信息" active={chatHeaderVisible} onClick={onChatHeaderToggle} />
      <RibBtn icon="pet"  label="桌宠"     active={petVisible}         onClick={onPetToggle} />
      <div style={{ flex: 1 }} />
      <RibBtn icon="settings" label="偏好"   onClick={onOpenPrefs} />
      <RibBtn icon="spec"     label="规范"   onClick={onOpenSpec} />
      <RibBtn icon="sparkle"  label="控制台" onClick={onOpenDebug} />
      <Sep />
      <RibBtn
        icon={theme === 'dark' ? 'sparkle' : 'mood'}
        label={theme === 'dark' ? '日间' : '夜间'}
        onClick={onThemeToggle} />
    </div>
  );
}
