import { WorkspaceBackButton } from '../../shared/ui/WorkspaceBackButton';
/** Activity workspace inside the main chat slot; ChatPanel remains mounted. */

import { useState, type CSSProperties } from 'react';
import type { ActivityTab } from './components/ActivityRibbon';
import { ActivityHomePage } from './components/ActivityHomePage';
import { ReadingPage } from './components/ReadingPage';
import { GomokuPage } from './components/GomokuPage';
import { ChessPage } from './components/ChessPage';
import { DreamSeedPanel } from './components/DreamSeedPanel';

import { useI18n } from '../../shared/i18n';

interface ActivityWindowProps {
  onClose: () => void;
}

export function ActivityWindow({ onClose }: ActivityWindowProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActivityTab>('home');

  return (
    <div
      className="activity-window"
      role="region"
      aria-label={t('activity.window.label')}
      style={{
        position: 'relative', height: '100%', minHeight: 0, flexDirection: 'column',
        background: 'var(--paper)',
        display: 'flex',
      } as CSSProperties}
    >
      <div className="workspace-toolbar">
        <WorkspaceBackButton onClick={activeTab === 'home' ? onClose : () => setActiveTab('home')} label={t(activeTab === 'home' ? 'navigation.backChat' : 'navigation.backActivities')} />
        <div className="serif" style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{t('activity.window.label')}</div>
        <button type="button" className="workspace-action" onClick={() => window.dispatchEvent(new Event('open-activity-preferences'))}>{t('navigation.preferences')}</button>
      </div>
      {/* main content */}
      <div className="activity-main" style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
        <div className="activity-page" style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
          {activeTab === 'home'    && <ActivityHomePage onSelect={setActiveTab} />}
          {activeTab === 'reading' && <ReadingPage />}
          {activeTab === 'gomoku'  && <GomokuPage />}
          {activeTab === 'chess'   && <ChessPage />}
          {activeTab === 'dream-seed' && <DreamSeedPanel />}
        </div>
      </div>

    </div>
  );
}
