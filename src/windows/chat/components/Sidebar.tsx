/* ============================================================
 * Sidebar — 左副栏内容区
 * ============================================================ */

import { useEffect, useRef } from 'react';
import { SubGarden } from './SubGarden';
import { SubDiary } from './SubDiary';
import { SubStatus } from './SubStatus';
import { SubFlow } from './SubFlow';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { ErrorBoundary } from '../../../shared/ui/ErrorBoundary';
import { useDesignMounts } from '../../../shared/design-mod/mounts';
import type { SidebarPresenters } from '../../../shared/design-mod/presenters';

const SIDEBAR_HEADER: Record<string, { title: string; subtitle: string }> = {
  flow:   { title: '动向',     subtitle: 'LIVE FEED · 他现在在做什么' },
  diary:  { title: '他的日记', subtitle: 'DIARY · 来自他自己的笔' },
  status: { title: '状态',     subtitle: 'TELEMETRY · 持续状态信号' },
  garden: { title: '陪伴花园', subtitle: 'GARDEN · 他在你不看的时候也在生长' },
};

export function SidebarPanel({ engine, toolStatus, presenters, sidebarRectRef, tab, onClose, paused = false }: any) {
  const { active } = useDesignMounts();
  if (active) return null;
  return <SidebarCapability presenters={presenters} sidebarRectRef={sidebarRectRef} tab={tab} onClose={onClose} shell />;
}

export function SidebarCapability({ presenters, sidebarRectRef, tab, onClose, shell = false }: { presenters: SidebarPresenters; sidebarRectRef: any; tab: 'flow' | 'garden' | 'diary' | 'status'; onClose?: () => void; shell?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (rootRef.current && sidebarRectRef) sidebarRectRef.current = rootRef.current.getBoundingClientRect();
    };
    update();
    window.addEventListener('resize', update);
    const h = setInterval(update, 1000);
    return () => { window.removeEventListener('resize', update); clearInterval(h); };
  }, []);

  const meta = SIDEBAR_HEADER[tab] || SIDEBAR_HEADER.flow;

  const content = (
    <ErrorBoundary fallbackLabel={meta.title}>
      {tab === 'flow' ? (
        <SubFlow presenter={presenters.flow} />
      ) : tab === 'garden' ? (
        <SubGarden presenter={presenters.garden} />
      ) : tab === 'diary' ? (
        <SubDiary presenter={presenters.diary} />
      ) : (
        <SubStatus presenter={presenters.status} />
      )}
    </ErrorBoundary>
  );

  return (
    <div ref={rootRef} style={{
      height: '100%', background: 'var(--forest)', color: 'var(--on-forest)',
      display: 'flex', flexDirection: 'column',
      borderRight: shell ? '1px solid var(--forest-1)' : undefined,
    }}>
      {shell && <div style={{
        padding: '14px 16px 10px', borderBottom: '1px solid var(--forest-line)',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: chatThemeFontSize(19), fontWeight: 600, color: 'var(--on-forest)', letterSpacing: -0.3 }}>
            {meta.title}
          </div>
          <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.3, marginTop: 2 }}>
            {meta.subtitle}
          </div>
        </div>
        <button onClick={onClose} title="收起" style={{
          width: 26, height: 26, borderRadius: 4,
          background: 'transparent', border: '1px solid var(--forest-line)',
          color: 'var(--on-forest-2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: chatThemeFontSize(14), lineHeight: 1, fontFamily: 'inherit',
        }}>×</button>
      </div>}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {content}
      </div>
    </div>
  );
}
