/* ============================================================
 * ChatWindow — 主应用布局
 * 迁移自: Emerald-desktopUI/app.jsx  (App 组件)
 *
 * Phase-1 变更:
 *   - 删除 engine.startBehaviorLoop() / stopBehaviorLoop()
 *   - <Pet> 组件未迁移，已注释掉 (TODO: Phase-2)
 *   - PreferencesPanel / DebugPanel 保留在本文件
 * ============================================================ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon, Btn, Tag, MicroLabel } from './components/UIKit';
import { MOOD_HUE, MOOD_LABEL_EN } from './components/UIKit';
import { MOODS, ACTIVITIES, PRESENCES, StateEngine } from '../../shared/state/store';
import { Ribbon } from './components/Ribbon';
import { SidebarPanel, DiaryDetailView } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { PaneHost, panesApi } from './components/Panes';
import { SpecPanel } from './components/SpecPanel';

const SIDEBAR_MIN     = 260;
const SIDEBAR_MAX     = 540;
const SIDEBAR_DEFAULT = 340;

/* ── 偏好面板 ── */
function PreferencesPanel({ open, onClose, theme, onThemeChange, sidebarWidth, onSidebarWidthChange, chatHeaderVisible, onChatHeaderToggle }: any) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'oklch(0.20 0.04 60 / 0.45)',
      backdropFilter: 'blur(6px)', zIndex: 110, display: 'flex',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        margin: 'auto', width: 'min(540px, 92vw)',
        background: 'var(--paper)', border: '1px solid var(--paper-edge)',
        borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 30px 80px var(--shadow-rgb-mix)',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--paper-edge)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-2)',
        }}>
          <Icon name="settings" size={16} />
          <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>偏好</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.4 }}>PREFERENCES</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
          <PrefRow label="外观主题" hint="paper · 复古信纸 / dark · 深色护眼">
            <div style={{ display: 'flex', gap: 6 }}>
              <PrefSeg active={theme === 'paper'} onClick={() => onThemeChange('paper')}>信纸</PrefSeg>
              <PrefSeg active={theme === 'dark'}  onClick={() => onThemeChange('dark')}>夜间</PrefSeg>
            </div>
          </PrefRow>
          <PrefRow label="对话信息栏" hint="顶部状态条 (mood / activity / 时段)">
            <PrefSwitch active={chatHeaderVisible} onClick={onChatHeaderToggle} />
          </PrefRow>
          <PrefRow label="侧栏默认宽度" hint={`${sidebarWidth}px`}>
            <input type="range" min={SIDEBAR_MIN} max={SIDEBAR_MAX} value={sidebarWidth}
              onChange={e => onSidebarWidthChange(+e.target.value)} style={{ width: 180 }} />
          </PrefRow>
          <div style={{ height: 1, background: 'var(--paper-edge)' }} />
          <div>
            <MicroLabel>未来主题接入接口</MicroLabel>
            <div className="serif" style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 6, fontStyle: 'italic' }}>
              所有颜色都用 CSS 变量管理。要加新主题，复制{' '}
              <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--paper-3)', padding: '1px 5px', borderRadius: 3 }}>:root[data-theme="paper"]</code>{' '}
              这块改值即可。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrefRow({ label, hint, children }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>{hint}</div>
      </div>
      {children}
    </div>
  );
}

function PrefSeg({ active, onClick, children }: any) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 4, fontSize: 12,
      background: active ? 'var(--ink)' : 'var(--paper-2)',
      color: active ? 'var(--paper)' : 'var(--ink-2)',
      border: '1px solid var(--paper-edge)',
      cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 500,
    }}>{children}</button>
  );
}

function PrefSwitch({ active, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      width: 42, height: 22, borderRadius: 11,
      background: active ? 'var(--accent-3)' : 'var(--paper-3)',
      border: '1px solid var(--paper-edge)',
      cursor: 'pointer', position: 'relative', padding: 0, transition: 'background 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 1, left: active ? 21 : 1,
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--paper)', boxShadow: '0 1px 3px var(--shadow-rgb-mix)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

/* ── 状态控制台 ── */
function DebugPanel({ engine, open, onClose, logs }: any) {
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);
  if (!open) return null;
  const apply = (patch: any) => engine.applyStateUpdate(patch);
  return (
    <div style={{
      position: 'fixed', right: 18, bottom: 18, width: 360,
      background: 'var(--paper)', border: '1px solid var(--paper-edge)',
      borderRadius: 8, boxShadow: '0 24px 60px var(--shadow-rgb-mix)',
      zIndex: 90, overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--paper-edge)',
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-2)',
      }}>
        <Icon name="sparkle" size={15} />
        <div className="serif" style={{ fontWeight: 600, fontSize: 14 }}>状态控制台</div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: 1.4 }}>INJECT</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: '14px 16px', display: 'grid', gap: 14, maxHeight: 480, overflowY: 'auto' }}>
        <Group title="MOOD"><Chips items={MOODS} active={state.mood} onPick={(v: any) => apply({ mood: v })} colorByMood /></Group>
        <Group title="ACTIVITY"><Chips items={ACTIVITIES} active={state.activity} onPick={(v: any) => apply({ activity: v })} /></Group>
        <Group title="PRESENCE"><Chips items={PRESENCES} active={state.presence} onPick={(v: any) => apply({ presence: v })} /></Group>
        <Group title="SIGNAL">
          <button style={chipStyle(state.wantToSpeak, undefined, true)} onClick={() => apply({ wantToSpeak: !state.wantToSpeak })}>
            {state.wantToSpeak ? '✓ 想说但没说' : '想说但没说'}
          </button>
        </Group>
        <Group title="BEHAVIOR LOG · LAST 8">
          <div className="mono" style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--ink-2)', maxHeight: 140, overflowY: 'auto' }}>
            {logs.slice(-8).reverse().map((l: any, i: number) => (
              <div key={i}><span style={{ color: 'var(--ink-4)' }}>{l.t}</span> · {l.msg}</div>
            ))}
            {logs.length === 0 && <div style={{ color: 'var(--ink-4)' }}>—</div>}
          </div>
        </Group>
      </div>
    </div>
  );
}

function Group({ title, children }: any) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.5, marginBottom: 6, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

function Chips({ items, active, onPick, colorByMood }: any) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((it: string) => {
        const hue = colorByMood ? MOOD_HUE[it] : undefined;
        return <button key={it} onClick={() => onPick(it)} style={chipStyle(active === it, hue, false)}>{it}</button>;
      })}
    </div>
  );
}

function chipStyle(active: boolean, hue?: number, plain?: boolean): any {
  if (active && hue !== undefined) {
    return {
      padding: '5px 10px', borderRadius: 4, fontSize: 11.5,
      background: `oklch(0.42 0.13 ${hue})`,
      color: `oklch(0.98 0.04 ${hue})`,
      border: `1px solid oklch(0.55 0.14 ${hue})`,
      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
    };
  }
  return {
    padding: '5px 10px', borderRadius: 4, fontSize: 11.5,
    background: active ? 'var(--ink)' : 'var(--paper-2)',
    color: active ? 'var(--paper)' : 'var(--ink-2)',
    border: '1px solid var(--paper-edge)',
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 500,
  };
}

/* ── 分隔条 ── */
function Divider({ onDrag }: any) {
  const draggingRef = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (draggingRef.current) onDrag(e.clientX); };
    const onUp   = () => { draggingRef.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDrag]);
  return (
    <div
      onMouseDown={() => { draggingRef.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
      style={{ width: 5, flexShrink: 0, cursor: 'col-resize', position: 'relative', zIndex: 2 }}>
      <div style={{ position: 'absolute', left: 2, top: 0, bottom: 0, width: 1, background: 'var(--paper-edge)' }} />
      <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 5, height: 36, borderRadius: 3, background: 'var(--paper-edge)', opacity: 0.5 }} />
    </div>
  );
}

/* ── ChatWindow (App) ── */
export function ChatWindow() {
  const engineRef = useRef<StateEngine | null>(null);
  if (!engineRef.current) engineRef.current = new StateEngine();
  const engine = engineRef.current;

  const [theme, setTheme]                     = useState('paper');
  const [petVisible, setPetVisible]           = useState(false); // Pet not rendered in Phase-1
  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const [sidebarTab, setSidebarTab]           = useState('flow');
  const [sidebarWidth, setSidebarWidth]       = useState(SIDEBAR_DEFAULT);
  const [chatHeaderVisible, setChatHeaderVisible] = useState(true);
  const [specOpen, setSpecOpen]               = useState(false);
  const [debugOpen, setDebugOpen]             = useState(false);
  const [prefsOpen, setPrefsOpen]             = useState(false);
  const [logs, setLogs]                       = useState<any[]>([]);

  /* 主题同步 */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const mouseRef      = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const chatRectRef   = useRef<DOMRect | null>(null);
  const sidebarRectRef = useRef<DOMRect | null>(null);
  const bodyRef       = useRef<HTMLDivElement>(null);

  const log = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString('en-GB');
    setLogs(prev => [...prev.slice(-30), { t, msg }]);
  }, []);

  /* 鼠标追踪 (供 Pet 用; Phase-1 保留以备 Phase-2) */
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      engine.markInteraction();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [engine]);

  const onPetToggle = () => {
    const next = !petVisible;
    setPetVisible(next);
    engine.setMode(next ? 'companion' : 'chat-only');
    log(`pet · ${next ? '出现' : '退出'}`);
  };

  const onSidebarTab = (tab: string) => { setSidebarTab(tab); setSidebarOpen(true); };
  const onCloseSidebar = () => setSidebarOpen(false);

  const onDividerDrag = (clientX: number) => {
    if (!bodyRef.current) return;
    const left = bodyRef.current.getBoundingClientRect().left + 52;
    const w    = clientX - left;
    const max  = Math.min(SIDEBAR_MAX, bodyRef.current.clientWidth - 360 - 52);
    setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(max, w)));
  };

  const onOpenDiaryDetail = (entry: any) => {
    panesApi.openPane({
      id: `diary-${entry.id}`,
      title: entry.title,
      hue: MOOD_HUE[entry.mood],
      w: 540, h: 600,
      replace: true,
      render: () => <DiaryDetailView entry={entry} />,
    });
    log(`diary · 打开「${entry.title}」`);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', position: 'relative', background: 'var(--paper)' }}>
      <Ribbon
        sidebarOpen={sidebarOpen}
        sidebarTab={sidebarTab}
        onSidebarTab={onSidebarTab}
        onCloseSidebar={onCloseSidebar}
        chatHeaderVisible={chatHeaderVisible}
        onChatHeaderToggle={() => setChatHeaderVisible(v => !v)}
        petVisible={petVisible}
        onPetToggle={onPetToggle}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'paper' : 'dark')}
        onOpenSpec={() => setSpecOpen(true)}
        onOpenDebug={() => setDebugOpen(true)}
        onOpenPrefs={() => setPrefsOpen(true)}
      />
      <div ref={bodyRef} style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth, flexShrink: 0 }}>
              <SidebarPanel
                engine={engine}
                sidebarRectRef={sidebarRectRef}
                tab={sidebarTab}
                onClose={() => setSidebarOpen(false)}
                onOpenDiaryDetail={onOpenDiaryDetail} />
            </div>
            <Divider onDrag={onDividerDrag} />
          </>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ChatPanel engine={engine} chatRectRef={chatRectRef} headerVisible={chatHeaderVisible} />
        </div>
      </div>

      {/* TODO: Phase-2 — 桌宠窗口 <PetWindow> */}

      <PaneHost />
      <SpecPanel open={specOpen} onClose={() => setSpecOpen(false)} />
      <PreferencesPanel
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
        chatHeaderVisible={chatHeaderVisible}
        onChatHeaderToggle={() => setChatHeaderVisible(v => !v)} />
      <DebugPanel engine={engine} open={debugOpen} onClose={() => setDebugOpen(false)} logs={logs} />
    </div>
  );
}
