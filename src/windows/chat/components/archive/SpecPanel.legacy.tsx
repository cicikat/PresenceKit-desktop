/* ============================================================
 * archive/SpecPanel.legacy — 原设计规范面板骨架（Phase 2d.0 存档）
 *
 * Phase 2d.0 将此入口改造为"帮助 / 公告"。
 * 此文件保留原有 tab 结构，供将来恢复 / 扩展时参考。
 * ============================================================ */

import { useState } from 'react';

export function SpecPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('map');
  if (!open) return null;

  const tabs = [
    ['map',       '1 · 状态 → UI 映射'],
    ['behavior',  '2 · 行为机制'],
    ['loop',      '3 · 无消息循环'],
    ['mode',      '4 · 双模式差异'],
    ['principle', '5 · 活人感原则'],
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'oklch(0.20 0.04 60 / 0.55)',
        backdropFilter: 'blur(10px)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(900px, 92vw)', maxHeight: '88vh',
        background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 14,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 30px 80px oklch(0.20 0.04 60 / 0.30)',
      }}>
        {/* header */}
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid var(--paper-edge)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--paper-2)',
        }}>
          <div className="serif" style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }}>设计规范</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1 }}>STATE-DRIVEN · 5 SECTIONS</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--ink-3)',
            cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
        {/* tabs */}
        <div style={{ padding: '10px 22px 0', display: 'flex', gap: 4, borderBottom: '1px solid var(--paper-edge)' }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
              background: tab === k ? 'var(--paper)' : 'transparent',
              color: tab === k ? 'var(--ink)' : 'var(--ink-3)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: tab === k ? 600 : 500,
              cursor: 'pointer', borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent',
            }}>{l}</button>
          ))}
        </div>
        {/* content placeholder */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 36px' }}>
          <div className="serif" style={{ fontSize: 15, color: 'var(--ink-2)', fontStyle: 'italic', lineHeight: 1.8 }}>
            TODO: 此面板内容待从 Emerald-desktopUI/spec.jsx 完整迁移。<br />
            当前 tab: <strong style={{ color: 'var(--ink)' }}>{tab}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
