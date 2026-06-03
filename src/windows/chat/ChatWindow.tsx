/* ============================================================
 * ChatWindow — 主应用布局
 * Phase 2d.0: 删除 DebugPanel、清理 Ribbon/SidebarPanel props
 * ============================================================ */

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { Icon, MicroLabel } from './components/UIKit';
import { StateEngine } from '../../shared/state/store';
import { avatarStore } from '../../shared/avatars/store';
import { getPromptAssets, patchPromptAssets } from '../../shared/api/backend';
import type { PromptAssetsPatch, PromptAssetsResponse } from '../../shared/api/types';
import { getUIPref, setUIPref } from '../../shared/uiPreferences';
import {
  publishPetSnapshot,
  setPetWindowVisible,
  startPetSnapshotResponder,
} from '../../shared/pet/bridge';
import {
  chatFontFamily,
  chatFontUrl,
  listChatFonts,
  loadChatAppearance,
  saveChatAppearance,
  type ChatAppearance,
  type ChatFontOption,
} from '../../shared/chatAppearance';
import { AvatarCropper } from './components/AvatarCropper';
import { Ribbon } from './components/Ribbon';
import { SidebarPanel } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { PaneHost } from './components/Panes';
import { SpecPanel } from './components/SpecPanel';
import { DreamAfterglowBanner } from '../dream/components/DreamAfterglowBanner';
import { DreamWindow } from '../dream/DreamWindow';

const SIDEBAR_MIN     = 250;
const SIDEBAR_MAX     = 540;
const SIDEBAR_DEFAULT = 340;

/* ── 偏好面板 ── */
function PreferencesPanel({ open, onClose, theme, onThemeChange, chatHeaderVisible, onChatHeaderToggle, appearance, onAppearanceChange }: any) {
  const [avatars, setAvatars] = useState(avatarStore.get());
  const [tab, setTab] = useState<'appearance' | 'world' | 'other'>('appearance');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropRole, setCropRole] = useState<'her' | 'you' | null>(null);
  const [fonts, setFonts] = useState<ChatFontOption[]>([]);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const herFileRef = useRef<HTMLInputElement>(null);
  const youFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => avatarStore.subscribe(setAvatars), []);
  useEffect(() => {
    if (!open) return;
    listChatFonts()
      .then(result => {
        setFonts(result);
        setFontLoadError(null);
      })
      .catch(error => setFontLoadError(String(error)));
  }, [open]);

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
          <div style={{ padding: '10px 20px 0', display: 'flex', gap: 4, borderBottom: '1px solid var(--paper-edge)' }}>
            {([
              ['appearance', '1 · 外观'],
              ['world', '2 · 世界'],
              ['other', '3 · 其他'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
                background: tab === key ? 'var(--paper)' : 'transparent',
                color: tab === key ? 'var(--ink)' : 'var(--ink-3)',
                fontFamily: 'inherit', fontSize: 12, fontWeight: tab === key ? 600 : 500,
                cursor: 'pointer', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
            {tab === 'appearance' ? (
              <>
                <PrefRow label="外观主题" hint="paper · 复古信纸 / dark · 深色护眼">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <PrefSeg active={theme === 'paper'} onClick={() => onThemeChange('paper')}>信纸</PrefSeg>
                    <PrefSeg active={theme === 'dark'}  onClick={() => onThemeChange('dark')}>夜间</PrefSeg>
                  </div>
                </PrefRow>
                <PrefRow label="对话信息栏" hint="顶部状态条 (mood / activity / 时段)">
                  <PrefSwitch active={chatHeaderVisible} onClick={onChatHeaderToggle} />
                </PrefRow>
                <PrefRow label="聊天字体大小" hint="控制聊天气泡与输入框文字">
                  <PrefRange
                    min={11}
                    max={24}
                    value={appearance.chatFontSize}
                    onChange={(value: number) => onAppearanceChange({ chatFontSize: value })}
                  />
                </PrefRow>
                <PrefRow label="主题字体大小" hint="控制聊天区域以外的 Chat 界面文字">
                  <PrefRange
                    min={11}
                    max={22}
                    value={appearance.themeFontSize}
                    onChange={(value: number) => onAppearanceChange({ themeFontSize: value })}
                  />
                </PrefRow>
                <PrefRow label="字体包" hint="动态读取 public/fonts/ 下的字体文件">
                  <div style={{ display: 'grid', gap: 5, width: 210 }}>
                    <select
                      value={appearance.fontFile ?? ''}
                      onChange={event => onAppearanceChange({ fontFile: event.target.value || null })}
                      style={{
                        width: '100%', padding: '6px 9px',
                        border: '1px solid var(--paper-edge)', borderRadius: 4,
                        background: 'var(--paper-2)', color: 'var(--ink-2)',
                        fontFamily: 'inherit', fontSize: 11,
                      }}
                    >
                      <option value="">默认字体</option>
                      {fonts.map(font => (
                        <option key={font.fileName} value={font.fileName}>{font.label}</option>
                      ))}
                    </select>
                    {fontLoadError && (
                      <div className="mono" style={{ color: 'var(--danger)', fontSize: 9.5, letterSpacing: 0.8 }}>
                        字体目录读取失败：{fontLoadError}
                      </div>
                    )}
                  </div>
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
              </>
            ) : tab === 'world' ? (
              <PromptAssetsSettings />
            ) : (
              <div className="serif" style={{
                padding: '20px 16px', border: '1px dashed var(--paper-edge)', borderRadius: 6,
                color: 'var(--ink-3)', fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.7,
              }}>
                其他聊天偏好待导入。
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function PromptAssetsSettings() {
  const [assets, setAssets] = useState<PromptAssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await getPromptAssets());
    } catch (loadError) {
      setError(`读取失败：${String(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (patch: PromptAssetsPatch) => {
    if (!assets || saving) return;

    if (
      patch.active_character !== undefined
      && !assets.characters.some(character => character.id === patch.active_character)
    ) return;
    if (
      patch.enabled_lorebooks?.some(stem => !assets.lorebooks.includes(stem))
      || patch.enabled_jailbreaks?.some(stem => !assets.jailbreaks.includes(stem))
    ) return;

    setSaving(true);
    setError(null);
    try {
      const response = await patchPromptAssets(patch);
      setAssets(current => current ? { ...current, active: response.active } : current);
    } catch (saveError) {
      setError(`保存失败：${String(saveError)}`);
    } finally {
      setSaving(false);
    }
  }, [assets, saving]);

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>正在读取 Reality 世界设置…</div>;
  }

  if (!assets) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="serif" style={{ color: 'var(--danger)', fontSize: 13.5 }}>{error ?? 'Reality 世界设置读取失败。'}</div>
        <button onClick={() => void load()} style={prefActionButtonStyle}>重试</button>
      </div>
    );
  }

  const toggle = (items: string[], stem: string) => (
    items.includes(stem) ? items.filter(item => item !== stem) : [...items, stem]
  );
  const activeCharacterAvailable = assets.characters.some(character => character.id === assets.active.active_character);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>角色卡</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 9 }}>单选 · 当前 Reality 对话使用的角色卡</div>
        <select
          value={activeCharacterAvailable ? assets.active.active_character : ''}
          disabled={saving || assets.characters.length === 0}
          onChange={event => void save({ active_character: event.target.value })}
          style={prefSelectStyle}
        >
          {!activeCharacterAvailable && <option value="">请选择可用角色卡</option>}
          {assets.characters.map(character => (
            <option key={character.id} value={character.id}>{character.label}</option>
          ))}
        </select>
      </div>
      <PromptAssetChecks
        title="Reality 世界书"
        hint="多选 · 仅显示可用世界书 stem"
        options={assets.lorebooks}
        selected={assets.active.enabled_lorebooks}
        disabled={saving}
        onToggle={stem => void save({ enabled_lorebooks: toggle(assets.active.enabled_lorebooks, stem) })}
      />
      <PromptAssetChecks
        title="Reality 破限"
        hint="多选 · 仅显示可用破限 stem"
        options={assets.jailbreaks}
        selected={assets.active.enabled_jailbreaks}
        disabled={saving}
        onToggle={stem => void save({ enabled_jailbreaks: toggle(assets.active.enabled_jailbreaks, stem) })}
      />
      {(saving || error) && (
        <div className="mono" style={{ color: error ? 'var(--danger)' : 'var(--ink-3)', fontSize: 9.5, letterSpacing: 0.8 }}>
          {saving ? '正在保存…' : error}
        </div>
      )}
    </div>
  );
}

function PromptAssetChecks({ title, hint, options, selected, disabled, onToggle }: {
  title: string;
  hint: string;
  options: string[];
  selected: string[];
  disabled: boolean;
  onToggle: (stem: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{title}</div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 9 }}>{hint}</div>
      {options.length === 0 ? (
        <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>暂无可用选项。</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {options.map(stem => (
            <label key={stem} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)', fontSize: 12.5 }}>
              <input
                type="checkbox"
                value={stem}
                checked={selected.includes(stem)}
                disabled={disabled}
                onChange={() => onToggle(stem)}
              />
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6 }}>{stem}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const prefSelectStyle: CSSProperties = {
  width: '100%',
  padding: '6px 9px',
  border: '1px solid var(--paper-edge)',
  borderRadius: 4,
  background: 'var(--paper-2)',
  color: 'var(--ink-2)',
  fontFamily: 'inherit',
  fontSize: 11,
};

const prefActionButtonStyle: CSSProperties = {
  justifySelf: 'start',
  padding: '6px 14px',
  borderRadius: 4,
  fontSize: 12,
  background: 'var(--paper-2)',
  border: '1px solid var(--paper-edge)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

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

function PrefRange({ min, max, value, onChange }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 250 }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span className="mono" style={{ width: 34, color: 'var(--ink-3)', fontSize: 10, letterSpacing: 0.8 }}>
        {value}px
      </span>
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

  const [theme, setTheme]                         = useState(() => getUIPref('chat.theme', 'paper'));
  const [petVisible, setPetVisible]               = useState(false);
  const [sidebarOpen, setSidebarOpen]             = useState(true);
  const [sidebarTab, setSidebarTab]               = useState('flow');
  const [sidebarWidth, setSidebarWidth]           = useState(() => getUIPref('chat.sidebarWidth', SIDEBAR_DEFAULT));
  const [chatHeaderVisible, setChatHeaderVisible] = useState(() => getUIPref('chat.headerVisible', true));
  const [appearance, setAppearance]               = useState<ChatAppearance>(() => loadChatAppearance());
  const [loadedFontFamily, setLoadedFontFamily]   = useState<string | null>(null);
  const [specOpen, setSpecOpen]                   = useState(false);
  const [prefsOpen, setPrefsOpen]                 = useState(false);
  const [dreamWindowOpen, setDreamWindowOpen]     = useState(false);
  const [dreamAfterglow, setDreamAfterglow]       = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setUIPref('chat.theme', theme);
  }, [theme]);

  useEffect(() => {
    const publishEngineSnapshot = () => {
      const state = engine.get();
      publishPetSnapshot({
        mood: state.mood,
        presence: state.presence,
        activityText: state.activity?.text ?? null,
      });
    };
    publishEngineSnapshot();
    const unsubscribeEngine = engine.subscribe(publishEngineSnapshot);
    let unsubscribeResponder: (() => void) | undefined;
    startPetSnapshotResponder()
      .then(unsubscribe => { unsubscribeResponder = unsubscribe; })
      .catch(error => console.warn('[pet] ready 监听失败:', error));
    return () => {
      unsubscribeEngine();
      unsubscribeResponder?.();
    };
  }, [engine]);

  const updateAppearance = useCallback((patch: Partial<ChatAppearance>) => {
    setAppearance(current => {
      const next = { ...current, ...patch };
      saveChatAppearance(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!appearance.fontFile) {
      setLoadedFontFamily(null);
      return;
    }
    const family = chatFontFamily(appearance.fontFile)!;
    const font = new FontFace(family, `url("${chatFontUrl(appearance.fontFile)}")`);
    let disposed = false;
    font.load()
      .then(loaded => {
        if (disposed) return;
        document.fonts.add(loaded);
        setLoadedFontFamily(family);
      })
      .catch(() => {
        if (!disposed) setLoadedFontFamily(null);
      });
    return () => { disposed = true; };
  }, [appearance.fontFile]);

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

  const onPetToggle = async () => {
    const next = !petVisible;
    try {
      await setPetWindowVisible(next);
      setPetVisible(next);
      engine.setMode(next ? 'companion' : 'chat-only');
    } catch (error) {
      console.warn('[pet] window 显隐失败:', error);
    }
  };

  const closeDreamAfterglow = useCallback(() => {
    setDreamAfterglow(false);
  }, []);

  const toggleDreamWindow = useCallback(() => {
    if (dreamWindowOpen) {
      setDreamWindowOpen(false);
    } else {
      setDreamAfterglow(false);
      setDreamWindowOpen(true);
    }
  }, [dreamWindowOpen]);

  const onSidebarTab = (tab: string) => { setSidebarTab(tab); setSidebarOpen(true); };
  const onCloseSidebar = () => setSidebarOpen(false);

  const onDividerDrag = (clientX: number) => {
    if (!bodyRef.current) return;
    const left = bodyRef.current.getBoundingClientRect().left + 52;
    const w    = clientX - left;
    const max  = Math.min(SIDEBAR_MAX, bodyRef.current.clientWidth - 360 - 52);
    const next = Math.max(SIDEBAR_MIN, Math.min(max, w));
    setSidebarWidth(next);
    setUIPref('chat.sidebarWidth', next);
  };

  return (
    <div style={{ height: '100vh', position: 'relative', background: 'var(--paper)' }}>
      <div
        className="chat-ui"
        style={{
          height: '100%',
          display: 'flex',
          '--chat-theme-font-scale': appearance.themeFontSize / 14,
          ...(loadedFontFamily ? {
            '--font-serif': loadedFontFamily,
            '--font-sans': loadedFontFamily,
            '--font-mono': loadedFontFamily,
            fontFamily: loadedFontFamily,
          } : {}),
        } as CSSProperties}
      >
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
          dreamWindowOpen={dreamWindowOpen}
          onDreamToggle={toggleDreamWindow}
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
            {!dreamWindowOpen && (
              <ChatPanel engine={engine} chatRectRef={chatRectRef} headerVisible={chatHeaderVisible} chatFontSize={appearance.chatFontSize} dreamActive={dreamWindowOpen} />
            )}
          </div>
        </div>
      </div>

      {/* TODO: Phase-2 — 桌宠窗口 <PetWindow> */}

      {dreamWindowOpen && (
        <DreamWindow
          onClose={() => {
            setDreamWindowOpen(false);
            setDreamAfterglow(true);
          }}
        />
      )}
      <DreamAfterglowBanner
        visible={dreamAfterglow}
        onClose={closeDreamAfterglow}
      />
      <PaneHost />
      <SpecPanel open={specOpen} onClose={() => setSpecOpen(false)} />
      <PreferencesPanel
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        chatHeaderVisible={chatHeaderVisible}
        onChatHeaderToggle={() => setChatHeaderVisible(v => { const next = !v; setUIPref('chat.headerVisible', next); return next; })}
        appearance={appearance}
        onAppearanceChange={updateAppearance} />
    </div>
  );
}
