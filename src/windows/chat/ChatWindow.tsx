/* ============================================================
 * ChatWindow — 主应用布局
 * Phase 2d.0: 删除 DebugPanel、清理 Ribbon/SidebarPanel props
 * ============================================================ */

import { useState, useEffect, useRef } from 'react';
import { Icon, MicroLabel } from './components/UIKit';
import { StateEngine } from '../../shared/state/store';
import { avatarStore } from '../../shared/avatars/store';
import { AvatarCropper } from './components/AvatarCropper';
import { Ribbon } from './components/Ribbon';
import { SidebarPanel } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { PaneHost } from './components/Panes';
import { SpecPanel } from './components/SpecPanel';

const SIDEBAR_MIN     = 260;
const SIDEBAR_MAX     = 540;
const SIDEBAR_DEFAULT = 340;

/* ── 偏好面板 ── */
function PreferencesPanel({ open, onClose, theme, onThemeChange, sidebarWidth, onSidebarWidthChange, chatHeaderVisible, onChatHeaderToggle }: any) {
  const [avatars, setAvatars] = useState(avatarStore.get());
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropRole, setCropRole] = useState<'her' | 'you' | null>(null);
  const herFileRef = useRef<HTMLInputElement>(null);
  const youFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => avatarStore.subscribe(setAvatars), []);

  if (!open) return null;

  const handleFileChange = (role: 'her' | 'you', file: File) => {
    setCropSrc(URL.createObjectURL(file));
    setCropRole(role);
  };

  const handleCropConfirm = async (blob: Blob) => {
    await avatarStore.setAvatar(cropRole!, blob);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setCropRole(null);
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setCropRole(null);
  };

  return (
    <>
      {cropSrc && (
        <AvatarCropper imageSrc={cropSrc} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
      )}
      <input ref={herFileRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange('her', f); e.target.value = ''; }} />
      <input ref={youFileRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange('you', f); e.target.value = ''; }} />
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
            {/* 头像分区 */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>头像</div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 14 }}>管理对话里的 HER / YOU 头像</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {/* HER 行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '1px solid var(--paper-edge)', overflow: 'hidden',
                    flexShrink: 0, background: 'var(--paper-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {avatars.her.dataUrl ? (
                      <img src={avatars.her.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg viewBox="0 0 40 40" width={40} height={40}>
                        <defs>
                          <radialGradient id="pref-av-her" cx="42%" cy="38%">
                            <stop offset="0%" stopColor="oklch(0.95 0.04 72)" />
                            <stop offset="100%" stopColor="oklch(0.75 0.07 72)" />
                          </radialGradient>
                        </defs>
                        <circle cx="20" cy="20" r="18" fill="url(#pref-av-her)" stroke="oklch(0.50 0.06 72 / 0.3)" strokeWidth="0.8" />
                        <circle cx="14.5" cy="19" r="2.2" fill="oklch(0.22 0.05 72)" />
                        <circle cx="25.5" cy="19" r="2.2" fill="oklch(0.22 0.05 72)" />
                        <path d="M 15 26 q 5 3 10 0" stroke="oklch(0.30 0.05 72)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-3)', flex: 1 }}>HER</span>
                  <button onClick={() => herFileRef.current?.click()} style={{
                    padding: '6px 14px', borderRadius: 4, fontSize: 12,
                    background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
                    color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
                  }}>更换</button>
                </div>
                {/* YOU 行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '1px solid var(--paper-edge)', overflow: 'hidden',
                    flexShrink: 0, background: 'var(--paper-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {avatars.you.dataUrl ? (
                      <img src={avatars.you.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--font-serif)' }}>Y</span>
                    )}
                  </div>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--ink-3)', flex: 1 }}>YOU</span>
                  <button onClick={() => youFileRef.current?.click()} style={{
                    padding: '6px 14px', borderRadius: 4, fontSize: 12,
                    background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
                    color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
                  }}>更换</button>
                </div>
                {/* 显示 YOU 头像 toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>显示 YOU 头像</div>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>对话气泡右侧显示</div>
                  </div>
                  <PrefSwitch
                    active={avatars.you.visible}
                    onClick={() => avatarStore.setYouVisible(!avatars.you.visible)}
                  />
                </div>
              </div>
            </div>
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
    </>
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

  const [theme, setTheme]                         = useState('paper');
  const [petVisible, setPetVisible]               = useState(false);
  const [sidebarOpen, setSidebarOpen]             = useState(true);
  const [sidebarTab, setSidebarTab]               = useState('flow');
  const [sidebarWidth, setSidebarWidth]           = useState(SIDEBAR_DEFAULT);
  const [chatHeaderVisible, setChatHeaderVisible] = useState(true);
  const [specOpen, setSpecOpen]                   = useState(false);
  const [prefsOpen, setPrefsOpen]                 = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const mouseRef       = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const chatRectRef    = useRef<DOMRect | null>(null);
  const sidebarRectRef = useRef<DOMRect | null>(null);
  const bodyRef        = useRef<HTMLDivElement>(null);

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

  return (
    <div style={{ height: '100vh', display: 'flex', position: 'relative', background: 'var(--paper)' }}>
      <Ribbon
        sidebarOpen={sidebarOpen}
        sidebarTab={sidebarTab}
        onSidebarTab={onSidebarTab}
        onCloseSidebar={onCloseSidebar}
        petVisible={petVisible}
        onPetToggle={onPetToggle}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'paper' : 'dark')}
        onOpenSpec={() => setSpecOpen(true)}
        onOpenPrefs={() => setPrefsOpen(true)}
      />
      <div ref={bodyRef} style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
        {sidebarOpen && (
          <>
            <div style={{ width: sidebarWidth, flexShrink: 0 }}>
              <SidebarPanel
                engine={engine}
                sidebarRectRef={sidebarRectRef}
                tab={sidebarTab}
                onClose={() => setSidebarOpen(false)} />
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
    </div>
  );
}
