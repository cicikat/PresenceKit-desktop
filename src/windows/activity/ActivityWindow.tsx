/* ============================================================
 * ActivityWindow — 独立活动空间（看书 / 五子棋 / 国际象棋）
 * 全屏覆盖，position: fixed，z-index 110
 *
 * 架构说明：
 *   ActivityWindow 由 main.tsx 中的 AppRoot 组件通过 activeWindow 状态切换挂载，
 *   与 ChatWindow 为 sibling 关系，不在 ChatWindow 组件树内。
 *   不读写 Chat messages / Chat state / Chat session。
 *   只共享全局 CSS variables（--paper / --ink / --forest 等）。
 * ============================================================ */

import { useEffect, useState, type CSSProperties } from 'react';
import { ActivityRibbon, type ActivityTab } from './components/ActivityRibbon';
import { ActivityHomePage } from './components/ActivityHomePage';
import { ReadingPage } from './components/ReadingPage';
import { GomokuPage } from './components/GomokuPage';
import { ChessPage } from './components/ChessPage';
import { DreamSeedPanel } from './components/DreamSeedPanel';
import { ActivityPreferencesPanel } from './components/ActivitySettingsPage';
import { getUIPref } from '../../shared/uiPreferences';
import { listThemes, setTheme as applyRegisteredTheme, subscribe as subscribeTheme } from '../../shared/theme/registry';

interface ActivityWindowProps {
  onClose: () => void;
}

export function ActivityWindow({ onClose }: ActivityWindowProps) {
  const [activeTab, setActiveTab] = useState<ActivityTab>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(() => getUIPref('chat.theme', 'paper'));

  const handleTab = (tab: ActivityTab) => setActiveTab(tab);

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
      className="activity-window"
      role="dialog"
      aria-modal="true"
      aria-label="活动空间"
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        background: 'var(--paper)',
        display: 'flex',
      } as CSSProperties}
    >
      {/* left ribbon */}
      <ActivityRibbon
        activeTab={activeTab}
        onTab={handleTab}
        onClose={onClose}
        onOpenSettings={() => setSettingsOpen(true)}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

      {/* main content */}
      <div className="activity-main" style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
        <div className="activity-page" style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
          {activeTab === 'home'    && <ActivityHomePage onSelect={setActiveTab} />}
          {activeTab === 'reading' && <ReadingPage />}
          {activeTab === 'gomoku'  && <GomokuPage />}
          {activeTab === 'chess'   && <ChessPage />}
          {activeTab === 'dream_seed' && <DreamSeedPanel />}
        </div>
      </div>

      <ActivityPreferencesPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
