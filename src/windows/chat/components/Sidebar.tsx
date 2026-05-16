/* ============================================================
 * Sidebar — 左副栏内容区（占位版）
 * Phase 2d.0: 4 个 tab 均替换为占位卡片，等待真实数据接入
 * ============================================================ */

import { useEffect, useRef } from 'react';
import { SubGarden } from './SubGarden';

const SIDEBAR_HEADER: Record<string, { title: string; subtitle: string }> = {
  flow:   { title: '动向',     subtitle: 'LIVE FEED · 她现在在做什么' },
  diary:  { title: '她的日记', subtitle: 'DIARY · 来自她自己的笔' },
  status: { title: '状态',     subtitle: 'TELEMETRY · 持续状态信号' },
  garden: { title: '陪伴花园', subtitle: 'GARDEN · 它在你不看的时候也在生长' },
};

const PLACEHOLDER_DESC: Record<string, string> = {
  flow:   '这里会显示叶瑄此刻的状态和近期动向。等待接入。',
  diary:  '这里会展示叶瑄自己写的日记。等待接入。',
  status: '这里会显示叶瑄的心情、性格、活动等内部状态。等待接入。',
  garden: '这里是叶瑄的花园。等待接入。',
};

export function SidebarPanel({ sidebarRectRef, tab, onClose }: any) {
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
  const desc = PLACEHOLDER_DESC[tab] || '';

  return (
    <div ref={rootRef} style={{
      height: '100%', background: 'var(--forest)', color: 'var(--on-forest)',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--forest-1)',
    }}>
      <div style={{
        padding: '14px 16px 10px', borderBottom: '1px solid var(--forest-line)',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 19, fontWeight: 600, color: 'var(--on-forest)', letterSpacing: -0.3 }}>
            {meta.title}
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.3, marginTop: 2 }}>
            {meta.subtitle}
          </div>
        </div>
        <button onClick={onClose} title="收起" style={{
          width: 26, height: 26, borderRadius: 4,
          background: 'transparent', border: '1px solid var(--forest-line)',
          color: 'var(--on-forest-2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1, fontFamily: 'inherit',
        }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'garden' ? (
          <SubGarden />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', padding: '24px 20px',
          }}>
            <div style={{
              padding: '22px 24px',
              background: 'oklch(0.27 0.04 168)',
              border: '1px solid var(--forest-line)',
              borderRadius: 8, textAlign: 'center', maxWidth: 260,
            }}>
              <div className="mono" style={{
                fontSize: 9.5, letterSpacing: 1.4,
                color: 'var(--on-forest-2)', marginBottom: 12,
              }}>
                此面板等待接入
              </div>
              <div className="serif" style={{
                fontSize: 14, color: 'var(--on-forest-2)',
                lineHeight: 1.75, fontStyle: 'italic',
              }}>
                {desc}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
