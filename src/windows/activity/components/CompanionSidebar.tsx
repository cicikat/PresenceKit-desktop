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
      minHeight: 0,
      // Viewport-constrained + sticky (cc-tasks/33 §C): ChessPage/GomokuPage's own root
      // is the scroll container (overflowY: auto over header+controls+board+companion),
      // so without a height cap the panel just grows with its message list and drags the
      // whole page into one long scroll. Sticking it near the top of that scroll viewport
      // with a viewport-relative maxHeight gives the message list room to become its own
      // scroll region (see ActivityCompanionPanel) instead.
      position: 'sticky',
      top: 20,
      maxHeight: 'calc(100vh - 40px)',
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
