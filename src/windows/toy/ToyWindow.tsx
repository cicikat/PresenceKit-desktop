/* ============================================================
 * ToyWindow — 玩耍模式独立空间（与 ActivityWindow 同级）
 * 全屏覆盖，position: fixed，z-index 110
 *
 * 架构说明：
 *   ToyWindow 由 main.tsx 中的 AppRoot 组件通过 activeWindow 状态切换挂载，
 *   与 ChatWindow / ActivityWindow 为 sibling 关系，不在 ChatWindow 组件树内。
 *   不读写 Chat messages / Chat state / Chat session。
 *   聊天经 sendChat() 走 /desktop/chat；设备状态经 /hardware/devices 只读轮询。
 *   只共享全局 CSS variables（--paper / --ink / --forest 等）。
 * ============================================================ */

import { useEffect, useState, type CSSProperties } from 'react';
import { ToyRibbon } from './components/ToyRibbon';
import { ToySidebar } from './components/ToySidebar';
import { ToyChatPanel } from './components/ToyChatPanel';
import { getUIPref } from '../../shared/uiPreferences';
import { listThemes, setTheme as applyRegisteredTheme, subscribe as subscribeTheme } from '../../shared/theme/registry';

interface ToyWindowProps {
  onClose: () => void;
}

const SIDEBAR_WIDTH = 280;

export function ToyWindow({ onClose }: ToyWindowProps) {
  const [theme, setTheme] = useState(() => getUIPref('chat.theme', 'paper'));

  useEffect(() => subscribeTheme(() => setTheme(getUIPref('chat.theme', 'paper'))), []);

  const handleThemeToggle = async () => {
    const themes = await listThemes();
    const index = themes.findIndex(record => record.manifest.id === theme);
    const next = themes[(index + 1) % themes.length]?.manifest.id ?? 'paper';
    await applyRegisteredTheme(next);
    setTheme(next);
  };

  return (
    <div
      className="toy-window"
      role="dialog"
      aria-modal="true"
      aria-label="玩耍模式"
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'var(--paper)',
        display: 'flex',
      } as CSSProperties}
    >
      <ToyRibbon onClose={onClose} theme={theme} onThemeToggle={handleThemeToggle} />

      <div style={{ width: SIDEBAR_WIDTH, flexShrink: 0, borderRight: '1px solid var(--paper-edge)', minHeight: 0 }}>
        <ToySidebar />
      </div>

      <ToyChatPanel />
    </div>
  );
}
