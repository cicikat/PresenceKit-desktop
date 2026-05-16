/* ============================================================
 * Panes — 浮动/拖拽/可关闭 多窗格系统
 * 迁移自: Emerald-desktopUI/panes.jsx
 * ============================================================ */

import { useState, useEffect, useRef } from 'react';
import { Icon } from './UIKit';

/* 模块级单例 pane 状态 */
const _listeners = new Set<(p: any[]) => void>();
let _zCounter = 100;
let _panes: any[] = [];

function _emit() { for (const fn of _listeners) fn([..._panes]); }

export const panesApi = {
  openPane({ id, title, render, w = 440, h = 520, x, y, hue, replace = false }: any) {
    const existing = _panes.find(p => p.id === id);
    if (existing) {
      if (replace) { existing.render = render; existing.title = title; existing.hue = hue; }
      existing.z = ++_zCounter;
      existing.minimized = false;
      _emit();
      return id;
    }
    const px = x !== undefined ? x : Math.max(80, window.innerWidth - w - 60 - _panes.length * 30);
    const py = y !== undefined ? y : Math.max(80, 120 + _panes.length * 30);
    _panes = [..._panes, { id, title, render, x: px, y: py, w, h, z: ++_zCounter, docked: false, minimized: false, hue }];
    _emit();
    return id;
  },
  closePane(id: string) { _panes = _panes.filter(p => p.id !== id); _emit(); },
  bringToFront(id: string) {
    const p = _panes.find(p => p.id === id);
    if (p) { p.z = ++_zCounter; _emit(); }
  },
  updatePane(id: string, patch: any) {
    _panes = _panes.map(p => p.id === id ? { ...p, ...patch } : p);
    _emit();
  },
  getPanes() { return _panes; },
  subscribe(fn: (p: any[]) => void) { _listeners.add(fn); fn([..._panes]); return () => _listeners.delete(fn); },
};

const paneBtnStyle: any = {
  width: 26, height: 26, borderRadius: 4,
  background: 'transparent', border: 'none',
  color: 'var(--ink-2)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 16, fontFamily: 'inherit',
};

function PaneWindow({ pane }: { pane: any }) {
  const dockedRight = pane.docked;
  const x = dockedRight ? window.innerWidth - 460 - 20 : pane.x;
  const y = dockedRight ? 76 : pane.y;
  const w = dockedRight ? 460 : pane.w;
  const h = dockedRight ? window.innerHeight - 96 : pane.h;
  const hue = pane.hue ?? 70;

  const dragRef   = useRef({ active: false, dx: 0, dy: 0 });
  const resizeRef = useRef({ active: false, sw: 0, sh: 0, sx: 0, sy: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current.active) {
        panesApi.updatePane(pane.id, {
          x: Math.max(56, Math.min(window.innerWidth - 200, e.clientX - dragRef.current.dx)),
          y: Math.max(60, Math.min(window.innerHeight - 80, e.clientY - dragRef.current.dy)),
        });
      } else if (resizeRef.current.active) {
        const r = resizeRef.current;
        panesApi.updatePane(pane.id, {
          w: Math.max(280, r.sw + (e.clientX - r.sx)),
          h: Math.max(220, r.sh + (e.clientY - r.sy)),
        });
      }
    };
    const onUp = () => {
      dragRef.current.active = false;
      resizeRef.current.active = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pane.id]);

  const onDragStart = (e: React.MouseEvent) => {
    if (dockedRight) return;
    dragRef.current = { active: true, dx: e.clientX - pane.x, dy: e.clientY - pane.y };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    panesApi.bringToFront(pane.id);
  };

  const onResizeStart = (e: React.MouseEvent) => {
    if (dockedRight) return;
    e.stopPropagation();
    resizeRef.current = { active: true, sw: pane.w, sh: pane.h, sx: e.clientX, sy: e.clientY };
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      onMouseDown={() => panesApi.bringToFront(pane.id)}
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h,
        background: 'var(--paper)', border: '1px solid var(--paper-edge)',
        borderRadius: 8, boxShadow: '0 20px 60px var(--shadow-rgb-mix)',
        pointerEvents: 'auto', zIndex: pane.z,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        transition: dockedRight ? 'left 0.25s, top 0.25s, width 0.25s, height 0.25s' : 'none',
      }}>
      {/* title bar */}
      <div onMouseDown={onDragStart} style={{
        height: 38, flexShrink: 0, padding: '0 8px 0 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--paper-2)', borderBottom: '1px solid var(--paper-edge)',
        cursor: dockedRight ? 'default' : 'grab',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: `oklch(0.62 0.13 ${hue})`, flexShrink: 0 }} />
        <div className="serif" style={{
          fontSize: 13.5, fontWeight: 600, color: 'var(--ink)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
        }}>{pane.title}</div>
        <button onClick={() => panesApi.updatePane(pane.id, { docked: !pane.docked })}
          title={pane.docked ? '取消停靠' : '停靠右侧'} style={paneBtnStyle}>
          <Icon name={pane.docked ? 'wind' : 'pulse'} size={13} />
        </button>
        <button onClick={() => panesApi.closePane(pane.id)} title="关闭" style={paneBtnStyle}>×</button>
      </div>
      {/* content */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--paper)' }}>
        {typeof pane.render === 'function' ? pane.render() : pane.render}
      </div>
      {/* resize handle */}
      {!dockedRight && (
        <div onMouseDown={onResizeStart} style={{
          position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize',
          background: `linear-gradient(135deg, transparent 50%, var(--paper-edge) 50%, var(--paper-edge) 60%, transparent 60%, transparent 70%, var(--paper-edge) 70%, var(--paper-edge) 80%, transparent 80%)`,
        }} />
      )}
    </div>
  );
}

export function PaneHost() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    const unsub = panesApi.subscribe(setList);
    return () => { unsub(); };
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
      {list.map(p => <PaneWindow key={p.id} pane={p} />)}
    </div>
  );
}
