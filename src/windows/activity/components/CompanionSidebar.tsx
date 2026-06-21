import { useState } from 'react';
import { getUIPref, setUIPref } from '../../../shared/uiPreferences';
import { ActivityCompanionPanel } from './ActivityCompanionPanel';

type ActivityId = 'gomoku' | 'chess' | 'reading';

interface Props {
  activityId: ActivityId;
  sessionId: string | null;
  sessionActive: boolean;
  sessionFinished: boolean;
}

export function CompanionSidebar({ activityId, sessionId, sessionActive, sessionFinished }: Props) {
  const [collapsed, setCollapsed] = useState(() => getUIPref('activity.companion.collapsed', false));

  const expand = () => { setCollapsed(false); setUIPref('activity.companion.collapsed', false); };
  const collapse = () => { setCollapsed(true); setUIPref('activity.companion.collapsed', true); };

  if (collapsed) {
    return (
      <button
        onClick={expand}
        title="展开对话"
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          width: 30, height: 30, borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--paper-edge)', background: 'var(--paper-2)',
          color: 'var(--ink-3)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, lineHeight: 1,
        }}
      >‹</button>
    );
  }

  return (
    <div style={{
      width: 'clamp(260px, 30%, 340px)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <ActivityCompanionPanel
        activityId={activityId}
        sessionId={sessionId}
        sessionActive={sessionActive}
        sessionFinished={sessionFinished}
        onCollapse={collapse}
      />
    </div>
  );
}
