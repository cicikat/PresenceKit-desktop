import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DiaryDetailPane } from '../chat/components/SubDiary';

const params = new URLSearchParams(window.location.search);
const DATE = params.get('date') ?? '';
const CHAR = params.get('char') ?? undefined;

export function DiaryDetailWindow() {
  const win = getCurrentWindow();

  useEffect(() => {
    if (DATE) {
      win.setTitle(DATE).catch(() => {});
    }
  }, [win]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      background: 'var(--paper)', color: 'var(--ink)',
      overflow: 'hidden',
    }}>
      {/* drag bar + close */}
      <div
        onMouseDown={e => {
          if ((e.target as HTMLElement).closest('button')) return;
          win.startDragging();
        }}
        style={{
          height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 8px',
          background: 'var(--paper-2)',
          borderBottom: '1px solid var(--paper-edge)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <button
          onClick={() => win.close()}
          title="关闭"
          style={{
            width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', borderRadius: '50%',
            background: 'var(--paper-edge)', color: 'var(--ink-3)',
            cursor: 'pointer', fontSize: 11, lineHeight: 1,
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.65 0.15 20)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-edge)')}
        >
          ×
        </button>
      </div>

      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {DATE ? (
          <DiaryDetailPane date={DATE} charId={CHAR} />
        ) : (
          <div style={{ padding: 32, color: 'var(--ink-3)', fontStyle: 'italic' }}>
            无效的日记日期。
          </div>
        )}
      </div>
    </div>
  );
}
