/* ============================================================
 * ChatWindow — 主应用布局
 * Phase 2d.0: 删除 DebugPanel、清理 Ribbon/SidebarPanel props
 * ============================================================ */

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { getChatSettings, setChatStyle, setChatMultiMessage } from '../../shared/api/chat-settings';
import type { ChatSettings } from '../../shared/api/types';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './components/UIKit';
import { StateEngine } from '../../shared/state/store';
import { avatarStore } from '../../shared/avatars/store';
import { getPromptAssets, patchPromptAssets, getCharacterAvatar, uploadCharacterAvatar, deleteCharacterAvatar } from '../../shared/api/backend';
import {
  getLoreEntries, addLoreEntry, updateLoreEntry, deleteLoreEntry,
  getJailbreakEntries, addJailbreakEntry, updateJailbreakEntry, deleteJailbreakEntry,
  type LoreEntry, type JailbreakEntry,
} from '../../shared/api/entries';
import { EntryManager, type EntryManagerSchema, type EntryManagerCallbacks, type ManagedEntry } from './components/EntryManager';
import { wsClient } from '../../shared/api/ws';
import type { PromptAssetsPatch, PromptAssetsResponse } from '../../shared/api/types';
import { getUIPref, setUIPref } from '../../shared/uiPreferences';
import { isPresenceNagEnabled, patchPresenceNagEnabled } from '../../shared/presenceNag';
import { isPlayModeEnabled, setPlayModeEnabled } from '../../shared/playMode';
import {
  publishPetSnapshot,
  setPetWindowVisible,
  startPetSnapshotResponder,
} from '../../shared/pet/bridge';
import {
  loadPetMouseSettings,
  savePetMouseSettings,
  subscribePetMouseSettings,
  type PetMouseSettings,
} from '../../shared/pet/mouseSettings';
import {
  loadPetVisualStyle,
  savePetVisualStyle,
  subscribePetVisualStyle,
  type PetVisualStyle,
} from '../../shared/pet/petVisualStyle';
import {
  loadPetRoamSettings,
  savePetRoamSettings,
  subscribePetRoamSettings,
} from '../../shared/pet/petRoamSettings';
import {
  loadPetRippleSettings,
  savePetRippleSettings,
  subscribePetRippleSettings,
} from '../../shared/pet/petRippleSettings';
import { YandereOverlay } from './components/YandereOverlay';
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
import { DreamBackgroundCropper } from '../dream/components/DreamBackgroundCropper';
import { Ribbon } from './components/Ribbon';
import { SidebarPanel } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { GroupChatPanel } from './components/GroupChatPanel';
import { GroupListPanel } from './components/GroupListPanel';
import { PaneHost } from './components/Panes';
import { SpecPanel } from './components/SpecPanel';
import { DreamAfterglowBanner } from '../dream/components/DreamAfterglowBanner';
import { DreamWindow } from '../dream/DreamWindow';
import { ThemePicker } from '../../shared/theme/ThemePicker';
import {
  getDayNight,
  setTheme as applyRegisteredTheme,
  setThemeMode,
  subscribe as subscribeTheme,
} from '../../shared/theme/registry';
import { ChatColorPage } from './components/ChatColorPage';

const SIDEBAR_MIN     = 250;
const SIDEBAR_MAX     = 540;
const SIDEBAR_DEFAULT = 340;

/* ── 偏好面板 ── */
function PreferencesPanel({ open, onClose, themeMode, onThemeModeChange, chatHeaderVisible, onChatHeaderToggle, appearance, onAppearanceChange, onCharacterAvatarChange, onCharacterSwitched, petMouseSettings, onPetMouseSettingsChange, petVisualStyle, onPetVisualStyleChange, presenceNagEnabled, onPresenceNagToggle, playModeEnabled, onPlayModeToggle, petRoamEnabled, onPetRoamToggle, petRippleEnabled, onPetRippleToggle, onYandereOpen }: any) {
  const [avatars, setAvatars] = useState(avatarStore.get());
  const [tab, setTab] = useState<'appearance' | 'color' | 'world' | 'pet' | 'chat' | 'other'>('appearance');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropRole, setCropRole] = useState<'her' | 'you' | null>(null);
  const [bgCropSrc, setBgCropSrc] = useState<string | null>(null);
  const [bgSaving, setBgSaving] = useState(false);
  const [fonts, setFonts] = useState<ChatFontOption[]>([]);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const herFileRef = useRef<HTMLInputElement>(null);
  const youFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
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

  const handleBgFileChange = (file: File) => {
    setBgCropSrc(URL.createObjectURL(file));
  };
  const handleBgCropConfirm = async (blob: Blob) => {
    setBgSaving(true);
    try { await avatarStore.setChatBackground(blob); } catch (e) { console.warn('[bg] 保存失败:', e); }
    if (bgCropSrc) URL.revokeObjectURL(bgCropSrc);
    setBgCropSrc(null);
    setBgSaving(false);
  };
  const handleBgCropCancel = () => {
    if (bgCropSrc) URL.revokeObjectURL(bgCropSrc);
    setBgCropSrc(null);
  };

  return (
    <>
      {cropSrc && (
        <AvatarCropper imageSrc={cropSrc} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
      )}
      {bgCropSrc && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
          <DreamBackgroundCropper imageSrc={bgCropSrc} onConfirm={handleBgCropConfirm} onCancel={handleBgCropCancel} />
        </div>
      )}
      <input ref={herFileRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange('her', f); e.target.value = ''; }} />
      <input ref={youFileRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange('you', f); e.target.value = ''; }} />
      <input ref={bgFileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleBgFileChange(f); e.target.value = ''; }} />
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'oklch(0.20 0.04 60 / 0.45)',
        backdropFilter: 'blur(6px)', zIndex: 110, display: 'flex',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          margin: 'auto', width: 'min(540px, 92vw)',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          background: 'var(--paper)', border: '1px solid var(--paper-edge)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
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
          <div style={{ padding: '10px 20px 0', display: 'flex', gap: 2, borderBottom: '1px solid var(--paper-edge)' }}>
            {([
              ['appearance', '1', '外观'],
              ['color', '2', '色彩自定义'],
              ['world', '3', '世界'],
              ['pet', '4', '桌宠'],
              ['chat', '5', '对话'],
              ['other', '6', '其他'],
            ] as const).map(([key, num, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                padding: '5px 10px', border: 'none', borderRadius: '6px 6px 0 0',
                background: tab === key ? 'var(--paper)' : 'transparent',
                color: tab === key ? 'var(--ink)' : 'var(--ink-3)',
                fontFamily: 'inherit', cursor: 'pointer',
                borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}>
                <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, letterSpacing: 0.5 }}>{num}</span>
                <span style={{ fontSize: 11, fontWeight: tab === key ? 600 : 500, lineHeight: 1.2 }}>{label}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: '18px 22px', display: 'grid', gap: 18, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {tab === 'appearance' ? (
              <>
                <PrefRow label="日间主题" hint="手动切换至日间或自动模式日间时段使用的主题">
                  <ThemePicker slot="day" />
                </PrefRow>
                <PrefRow label="夜间主题" hint="手动切换至夜间或 19:00–6:00 自动时段使用的主题">
                  <ThemePicker slot="night" />
                </PrefRow>
                <PrefRow label="按时间自动切换" hint="启用后每隔 10 分钟检查时段，19:00–6:00 自动切换夜间主题">
                  <PrefSwitch active={themeMode === 'auto'} onClick={onThemeModeChange} />
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
                        border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
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
                <PrefRow label="聊天背景" hint="聊天区域的背景图（16:9，自动模糊）">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {avatars.chatBackground.dataUrl ? (
                      <div style={{
                        width: 56, height: 32, borderRadius: 'var(--radius-xs)', overflow: 'hidden', flexShrink: 0,
                        backgroundImage: `url("${avatars.chatBackground.dataUrl}")`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        border: '1px solid var(--paper-edge)',
                      }} />
                    ) : (
                      <div style={{
                        width: 56, height: 32, borderRadius: 'var(--radius-xs)', flexShrink: 0,
                        background: 'var(--paper-3)', border: '1px solid var(--paper-edge)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 9, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>无</span>
                      </div>
                    )}
                    <button onClick={() => bgFileRef.current?.click()} disabled={bgSaving} style={prefActionButtonStyle}>
                      {bgSaving ? '处理中…' : '更换'}
                    </button>
                    {avatars.chatBackground.dataUrl && (
                      <button
                        onClick={() => avatarStore.clearChatBackground().catch(console.warn)}
                        style={{ ...prefActionButtonStyle, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                        清除
                      </button>
                    )}
                  </div>
                </PrefRow>
                <PrefRow label="背景模糊" hint="0 为清晰原图，36 为最大模糊">
                  <PrefRange
                    min={0}
                    max={36}
                    value={appearance.backgroundBlur}
                    onChange={(value: number) => onAppearanceChange({ backgroundBlur: value })}
                  />
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
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12,
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
                        padding: '6px 14px', borderRadius: 'var(--radius-sm)', fontSize: 12,
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
              </>
            ) : tab === 'color' ? (
              <ChatColorPage />
            ) : tab === 'world' ? (
              <PromptAssetsSettings onCharacterAvatarChange={onCharacterAvatarChange} onCharacterSwitched={onCharacterSwitched} />
            ) : tab === 'pet' ? (
              <>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>桌宠粒子风格</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
                    切换桌宠窗口的动画效果
                  </div>
                </div>
                <PrefRow label="粒子风格" hint="流体光球 · 散点粒子 · 神经网络">
                  <select
                    value={petVisualStyle}
                    onChange={e => onPetVisualStyleChange(e.target.value)}
                    style={{ ...prefSelectStyle, width: 140 }}
                  >
                    <option value="fluid">流体光球</option>
                    <option value="scatter">散点粒子</option>
                    <option value="network">神经网络</option>
                  </select>
                </PrefRow>
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>桌宠鼠标交互</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
                    控制害羞躲避、随机靠近与 Ctrl 钉住
                  </div>
                </div>
                <PrefRow label="启用鼠标交互" hint="关闭后桌宠不再自动躲避或靠近鼠标">
                  <PrefSwitch
                    active={petMouseSettings.enabled}
                    onClick={() => onPetMouseSettingsChange({ enabled: !petMouseSettings.enabled })}
                  />
                </PrefRow>
                <PrefRow label="随机靠近间隔" hint="每次靠近后重新随机；Ctrl 按住时会跳过">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <MinuteSelect
                      value={petMouseSettings.botherMinMinutes}
                      onChange={(value: number) => onPetMouseSettingsChange({ botherMinMinutes: value })}
                    />
                    <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>至</span>
                    <MinuteSelect
                      value={petMouseSettings.botherMaxMinutes}
                      onChange={(value: number) => onPetMouseSettingsChange({ botherMaxMinutes: value })}
                    />
                  </div>
                </PrefRow>
                <PrefRow label="玩耍模式" hint="开启后，叶瑄在对话里表达想一起玩 toy 时会自动进入玩耍模式；Ribbon 也会出现手动入口。默认关闭">
                  <PrefSwitch active={playModeEnabled} onClick={onPlayModeToggle} />
                </PrefRow>
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <PrefRow label="全屏漫游" hint="桌宠在屏幕上自动游走反弹；拖动或被交互时暂停。默认关闭">
                  <PrefSwitch active={petRoamEnabled} onClick={onPetRoamToggle} />
                </PrefRow>
                <PrefRow label="点击涟漪" hint="在桌宠粒子上点击会炸出扩散涟漪。默认开启">
                  <PrefSwitch active={petRippleEnabled} onClick={onPetRippleToggle} />
                </PrefRow>
                <div className="serif" style={{
                  padding: '14px 16px', border: '1px dashed var(--paper-edge)', borderRadius: 'var(--radius-md)',
                  color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.7,
                }}>
                  当前由「惊讶」情绪触发害羞躲避。按住 Ctrl 可临时钉住桌宠并稳定拖动。
                </div>
              </>
            ) : tab === 'chat' ? (
              <>
                <ChatSettingsSection />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <PrefRow label="允许存在感弹窗" hint="开启后，叶瑄被冷落久了会用带头像的弹窗找你；默认关闭">
                  <PrefSwitch active={presenceNagEnabled} onClick={onPresenceNagToggle} />
                </PrefRow>
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <PrefRow label="沉浸式挽留模式（废弃版仅保留视觉效果）" hint="5 秒倒计时后触发暗红遮罩与关一弹十小窗；ESC 退出">
                  <button onClick={onYandereOpen} style={prefActionButtonStyle}>启动</button>
                </PrefRow>
              </>
            ) : (
              <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13.5, textAlign: 'center', padding: '48px 0', fontStyle: 'italic' }}>
                未完待续
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Lorebook EntryManager schema ──────────────────────────────────────────────

const LORE_SCHEMA: EntryManagerSchema = {
  titleField: 'keyword',
  extraFields: [
    {
      key: 'keyword', label: '关键词（逗号分隔）', type: 'text',
      default: '', placeholder: '关键词1, 关键词2',
    },
    {
      key: 'insertion_order', label: '注入顺序（数字越小越靠前）', type: 'number',
      default: 100,
    },
    {
      key: 'regex', label: '正则模式（关键词作为正则表达式）', type: 'select',
      default: 'false',
      options: [{ value: 'false', label: '普通关键词' }, { value: 'true', label: '正则表达式' }],
    },
  ],
};

const LORE_CALLBACKS: EntryManagerCallbacks = {
  load: async () => {
    const rows = await getLoreEntries();
    return rows.map(r => ({
      ...r,
      keyword: Array.isArray(r.keyword) ? r.keyword.join(', ') : r.keyword,
    }) as unknown as ManagedEntry);
  },
  add: async entry => {
    const e = entry as unknown as Omit<LoreEntry, 'id'> & { keyword: string };
    await addLoreEntry({
      keyword: typeof e.keyword === 'string' ? e.keyword.split(',').map(s => s.trim()).filter(Boolean) : e.keyword,
      content: e.content,
      enabled: e.enabled,
      regex: String(e.regex) === 'true',
      insertion_order: Number(e.insertion_order) || 100,
    });
  },
  update: async (id, entry) => {
    const e = entry as unknown as Omit<LoreEntry, 'id'> & { keyword: string };
    await updateLoreEntry(id, {
      keyword: typeof e.keyword === 'string' ? e.keyword.split(',').map(s => s.trim()).filter(Boolean) : e.keyword,
      content: e.content,
      enabled: e.enabled,
      regex: String(e.regex) === 'true',
      insertion_order: Number(e.insertion_order) || 100,
    });
  },
  remove: deleteLoreEntry,
};

// ── Jailbreak EntryManager schema ─────────────────────────────────────────────

const JB_SCHEMA: EntryManagerSchema = {
  titleField: 'title',
  extraFields: [
    { key: 'title', label: '标题', type: 'text', default: '', placeholder: '条目标题' },
    {
      key: 'layer', label: '层级', type: 'select', default: 0,
      options: [
        { value: 0, label: '层 0（身份设定）' },
        { value: 2, label: '层 2（背景补充）' },
        { value: 11, label: '层 11（表达规则，权重最高）' },
      ],
    },
  ],
};

const JB_CALLBACKS: EntryManagerCallbacks = {
  load: async () => {
    const rows = await getJailbreakEntries();
    return rows as unknown as ManagedEntry[];
  },
  add: async entry => {
    const e = entry as unknown as Omit<JailbreakEntry, 'id'>;
    await addJailbreakEntry({ title: e.title ?? '', content: e.content, enabled: e.enabled, layer: Number(e.layer) || 0 });
  },
  update: async (id, entry) => {
    const e = entry as unknown as Omit<JailbreakEntry, 'id'>;
    await updateJailbreakEntry(id, { title: e.title ?? '', content: e.content, enabled: e.enabled, layer: Number(e.layer) || 0 });
  },
  remove: deleteJailbreakEntry,
};

// ── PromptAssetsSettings ──────────────────────────────────────────────────────

function PromptAssetsSettings({ onCharacterAvatarChange, onCharacterSwitched }: { onCharacterAvatarChange?: (dataUrl: string | null) => void; onCharacterSwitched?: () => void }) {
  const [worldSubTab, setWorldSubTab] = useState<'assets' | 'lorebook' | 'jailbreak'>('assets');
  const [assets, setAssets] = useState<PromptAssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCharAvatarDataUrl, setActiveCharAvatarDataUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const [avatarCropCharId, setAvatarCropCharId] = useState<string | null>(null);
  const charAvatarFileRef = useRef<HTMLInputElement>(null);

  const loadActiveCharAvatar = useCallback(async (charId: string, characters: PromptAssetsResponse['characters']) => {
    const char = characters.find(c => c.id === charId);
    if (!char?.avatar_url) {
      setActiveCharAvatarDataUrl(null);
      onCharacterAvatarChange?.(null);
      return;
    }
    try {
      const dataUrl = await getCharacterAvatar(charId);
      setActiveCharAvatarDataUrl(dataUrl);
      onCharacterAvatarChange?.(dataUrl);
    } catch {
      setActiveCharAvatarDataUrl(null);
      onCharacterAvatarChange?.(null);
    }
  }, [onCharacterAvatarChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getPromptAssets();
      setAssets(result);
      if (result.active.active_character) {
        void loadActiveCharAvatar(result.active.active_character, result.characters);
      }
    } catch (loadError) {
      setError(`读取失败：${String(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, [loadActiveCharAvatar]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    if (avatarCropSrc) URL.revokeObjectURL(avatarCropSrc);
  }, [avatarCropSrc]);

  const save = useCallback(async (patch: PromptAssetsPatch) => {
    if (!assets || saving) return;

    if (
      patch.active_character !== undefined
      && !assets.characters.some(character => character.id === patch.active_character)
    ) return;
    if (
      patch.enabled_lorebooks?.some(stem => !assets.lorebooks.some(option => option.id === stem))
      || patch.enabled_jailbreaks?.some(stem => !assets.jailbreaks.some(option => option.id === stem))
    ) return;

    setSaving(true);
    setError(null);
    try {
      const response = await patchPromptAssets(patch);
      setAssets(current => current ? { ...current, active: response.active } : current);
      if (patch.active_character && assets) {
        onCharacterSwitched?.();
        void loadActiveCharAvatar(patch.active_character, assets.characters);
      }
    } catch (saveError) {
      setError(`保存失败：${String(saveError)}`);
    } finally {
      setSaving(false);
    }
  }, [assets, saving, loadActiveCharAvatar]);

  const closeAvatarCropper = useCallback(() => {
    setAvatarCropSrc(null);
    setAvatarCropCharId(null);
  }, []);

  const handleAvatarFileChange = useCallback((file: File) => {
    if (!assets) return;
    const charId = assets.active.active_character;
    if (!charId) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setAvatarError(`不支持的格式：${file.type}，仅支持 PNG / JPEG / WebP`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('文件超过 5 MB 限制');
      return;
    }
    setAvatarError(null);
    setAvatarCropCharId(charId);
    setAvatarCropSrc(URL.createObjectURL(file));
  }, [assets]);

  const handleAvatarCropConfirm = useCallback(async (blob: Blob) => {
    if (!avatarCropCharId) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      await uploadCharacterAvatar(avatarCropCharId, file);
      const refreshed = await getPromptAssets();
      setAssets(refreshed);
      await loadActiveCharAvatar(refreshed.active.active_character, refreshed.characters);
      closeAvatarCropper();
    } catch (err) {
      setAvatarError(`上传失败：${String(err)}`);
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarCropCharId, closeAvatarCropper, loadActiveCharAvatar]);

  const handleAvatarRemove = useCallback(async () => {
    if (!assets) return;
    const charId = assets.active.active_character;
    if (!charId) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await deleteCharacterAvatar(charId);
      const refreshed = await getPromptAssets();
      setAssets(refreshed);
      void loadActiveCharAvatar(charId, refreshed.characters);
    } catch (err) {
      setAvatarError(`移除失败：${String(err)}`);
    } finally {
      setAvatarBusy(false);
    }
  }, [assets, loadActiveCharAvatar]);

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

  const toggle = (items: string[], id: string) => (
    items.includes(id) ? items.filter(item => item !== id) : [...items, id]
  );
  const activeCharacterAvailable = assets.characters.some(character => character.id === assets.active.active_character);
  const activeChar = assets.characters.find(c => c.id === assets.active.active_character);
  const hasRuntimeAvatar = activeChar?.has_runtime_avatar ?? false;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 3, borderBottom: '1px solid var(--paper-edge)', paddingBottom: 0 }}>
        {([
          ['assets', '素材选择'],
          ['lorebook', '世界书条目'],
          ['jailbreak', '破限条目'],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setWorldSubTab(key)} style={{
            padding: '5px 12px', border: 'none', borderRadius: '5px 5px 0 0',
            background: worldSubTab === key ? 'var(--paper)' : 'transparent',
            color: worldSubTab === key ? 'var(--ink)' : 'var(--ink-3)',
            fontFamily: 'inherit', fontSize: 11.5, fontWeight: worldSubTab === key ? 600 : 400,
            cursor: 'pointer',
            borderBottom: worldSubTab === key ? '2px solid var(--accent)' : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {worldSubTab === 'lorebook' && (
        <EntryManager schema={LORE_SCHEMA} callbacks={LORE_CALLBACKS} />
      )}
      {worldSubTab === 'jailbreak' && (
        <EntryManager schema={JB_SCHEMA} callbacks={JB_CALLBACKS} />
      )}

      {worldSubTab === 'assets' && (<>
      {avatarCropSrc && (
        <AvatarCropper
          imageSrc={avatarCropSrc}
          onConfirm={handleAvatarCropConfirm}
          onCancel={closeAvatarCropper}
          error={avatarError}
        />
      )}
      <input
        ref={charAvatarFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleAvatarFileChange(f);
          e.target.value = '';
        }}
      />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>角色卡</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 9 }}>单选 · 当前 Reality 对话使用的角色卡</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            border: '1px solid var(--paper-edge)', overflow: 'hidden',
            background: 'var(--paper-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {activeCharAvatarDataUrl ? (
              <img src={activeCharAvatarDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--font-serif)' }}>
                {(assets.active.active_character?.[0] ?? '?').toUpperCase()}
              </span>
            )}
          </div>
          <select
            value={activeCharacterAvailable ? assets.active.active_character : ''}
            disabled={saving || assets.characters.length === 0}
            onChange={event => void save({ active_character: event.target.value })}
            style={{ ...prefSelectStyle, flex: 1 }}
          >
            {!activeCharacterAvailable && <option value="">请选择可用角色卡</option>}
            {assets.characters.map(character => (
              <option key={character.id} value={character.id}>{character.label}</option>
            ))}
          </select>
        </div>
        {activeCharacterAvailable && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              disabled={avatarBusy || saving}
              onClick={() => charAvatarFileRef.current?.click()}
              style={prefActionButtonStyle}
            >
              {avatarBusy ? '处理中…' : '上传头像'}
            </button>
            {hasRuntimeAvatar && (
              <button
                disabled={avatarBusy || saving}
                onClick={() => void handleAvatarRemove()}
                style={prefActionButtonStyle}
              >
                移除自定义头像
              </button>
            )}
          </div>
        )}
        {avatarError && (
          <div className="mono" style={{ color: 'var(--danger)', fontSize: 9.5, letterSpacing: 0.8, marginTop: 5 }}>
            {avatarError}
          </div>
        )}
      </div>
      {(saving || error) && (
        <div className="mono" style={{ color: error ? 'var(--danger)' : 'var(--ink-3)', fontSize: 9.5, letterSpacing: 0.8 }}>
          {saving ? '正在保存…' : error}
        </div>
      )}
      </>)}
    </div>
  );
}

function PromptAssetChecks({ title, hint, options, selected, disabled, onToggle }: {
  title: string;
  hint: string;
  options: { id: string; label: string }[];
  selected: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{title}</div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 9 }}>{hint}</div>
      {options.length === 0 ? (
        <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>暂无可用选项。</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {options.map(option => (
            <label key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-2)', fontSize: 12.5 }}>
              <input
                type="checkbox"
                value={option.id}
                checked={selected.includes(option.id)}
                disabled={disabled}
                onChange={() => onToggle(option.id)}
              />
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6 }}>{option.label}</span>
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
  borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)',
  color: 'var(--ink-2)',
  fontFamily: 'inherit',
  fontSize: 11,
};

const prefActionButtonStyle: CSSProperties = {
  justifySelf: 'start',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
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

function MinuteSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      style={{ ...prefSelectStyle, width: 76 }}
    >
      {[0.25, 0.5, 1, 2, 3, 5, 10, 15, 30].map(minutes => (
        <option key={minutes} value={minutes}>{minutes < 1 ? `${minutes * 60}秒` : `${minutes}分`}</option>
      ))}
    </select>
  );
}

/* ── 对话设置 ── */
function ChatSettingsSection() {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getChatSettings()
      .then(s => { setSettings(s); setLoading(false); })
      .catch(e => { setStatus({ ok: false, msg: `读取失败：${String(e)}` }); setLoading(false); });
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const flash = (ok: boolean, msg: string) => {
    setStatus({ ok, msg });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), 3000);
  };

  const saveStyle = async (style: ChatSettings['style']) => {
    if (!settings || saving) return;
    setSaving(true);
    const prev = settings.style;
    setSettings(s => s ? { ...s, style } : s);
    try { await setChatStyle(style); flash(true, '对话风格已保存'); }
    catch (e) { setSettings(s => s ? { ...s, style: prev } : s); flash(false, `保存失败：${String(e)}`); }
    finally { setSaving(false); }
  };

  const saveMultiMessage = async (enabled: boolean) => {
    if (!settings || saving) return;
    setSaving(true);
    const prev = settings.multi_message;
    setSettings(s => s ? { ...s, multi_message: enabled } : s);
    try { await setChatMultiMessage(enabled); flash(true, '分条发送已保存'); }
    catch (e) { setSettings(s => s ? { ...s, multi_message: prev } : s); flash(false, `保存失败：${String(e)}`); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>读取对话设置…</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gap: 14 }}>
        <PrefRow label="对话风格" hint="chat：以对白与回应为核心 / roleplay：第一人称沉浸，动作心理用括号表达">
          <select
            value={settings?.style ?? 'roleplay'}
            disabled={saving || !settings}
            onChange={e => void saveStyle(e.target.value as ChatSettings['style'])}
            style={{ ...prefSelectStyle, width: 140 }}
          >
            <option value="chat">对白为主</option>
            <option value="roleplay">第一人称沉浸</option>
          </select>
        </PrefRow>
        <PrefRow label="多消息分条" hint="开启后 AI 回复拆分成多条气泡发送">
          <PrefSwitch
            active={settings?.multi_message ?? false}
            onClick={() => { if (settings) void saveMultiMessage(!settings.multi_message); }}
          />
        </PrefRow>
        {status && (
          <div className="mono" style={{
            fontSize: 9.5, letterSpacing: 0.8,
            color: status.ok ? 'var(--ink-3)' : 'var(--danger)',
          }}>
            {status.msg}
          </div>
        )}
      </div>
    </div>
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
      <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 5, height: 36, borderRadius: 'var(--radius-xs)', background: 'var(--paper-edge)', opacity: 0.5 }} />
    </div>
  );
}

/* ── ChatWindow (App) ── */
export function ChatWindow({ onActivityOpen, onToyOpen }: { onActivityOpen?: () => void; onToyOpen?: () => void } = {}) {
  const engineRef = useRef<StateEngine | null>(null);
  if (!engineRef.current) engineRef.current = new StateEngine();
  const engine = engineRef.current;

  const [theme, setTheme]                         = useState(() => getUIPref('chat.theme', 'paper'));
  const [themeMode, setThemeMode_]               = useState<'manual' | 'auto'>(() => getDayNight().mode);
  const [chatBackground, setChatBackground]        = useState(() => avatarStore.get().chatBackground);
  const [petVisible, setPetVisible]               = useState(false);
  const [sidebarOpen, setSidebarOpen]             = useState(true);
  const [sidebarTab, setSidebarTab]               = useState('flow');
  const [sidebarWidth, setSidebarWidth]           = useState(() => getUIPref('chat.sidebarWidth', SIDEBAR_DEFAULT));
  const [chatHeaderVisible, setChatHeaderVisible] = useState(() => getUIPref('chat.headerVisible', true));
  const [appearance, setAppearance]               = useState<ChatAppearance>(() => loadChatAppearance());
  const [petMouseSettings, setPetMouseSettings]   = useState<PetMouseSettings>(() => loadPetMouseSettings());
  const [petVisualStyle, setPetVisualStyle]       = useState<PetVisualStyle>(() => loadPetVisualStyle());
  const [presenceNagEnabled, setPresenceNagEnabledState] = useState(() => isPresenceNagEnabled());
  const [playModeEnabled, setPlayModeEnabledState] = useState(() => isPlayModeEnabled());
  const [petRoamEnabled, setPetRoamEnabled] = useState(() => loadPetRoamSettings().enabled);
  const [petRippleEnabled, setPetRippleEnabled] = useState(() => loadPetRippleSettings().enabled);
  const [yandereOpen, setYandereOpen] = useState(false);
  const [loadedFontFamily, setLoadedFontFamily]   = useState<string | null>(null);
  const [specOpen, setSpecOpen]                   = useState(false);
  const [prefsOpen, setPrefsOpen]                 = useState(false);
  const [dreamWindowOpen, setDreamWindowOpen]     = useState(false);
  const [dreamAfterglow, setDreamAfterglow]       = useState(false);
  const [characterAvatarDataUrl, setCharacterAvatarDataUrl] = useState<string | null>(null);
  const [charSwitchKey, setCharSwitchKey] = useState(0);
  // null = 1v1 chat | 'list' = group list | string = group_id
  const [groupView, setGroupView]                 = useState<null | 'list' | string>(null);

  useEffect(() => {
    applyRegisteredTheme(theme).catch(error => console.warn('[theme] 切换失败:', error));
  }, [theme]);

  useEffect(() => subscribeTheme(() => {
    setTheme(getUIPref('chat.theme', 'paper'));
    setThemeMode_(getDayNight().mode);
  }), []);
  useEffect(() => avatarStore.subscribe(c => setChatBackground(c.chatBackground)), []);
  useEffect(() => subscribePetMouseSettings(setPetMouseSettings), []);
  useEffect(() => subscribePetVisualStyle(setPetVisualStyle), []);
  useEffect(() => subscribePetRoamSettings(s => setPetRoamEnabled(s.enabled)), []);
  useEffect(() => subscribePetRippleSettings(s => setPetRippleEnabled(s.enabled)), []);

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

  const updatePetMouseSettings = useCallback((patch: Partial<PetMouseSettings>) => {
    setPetMouseSettings(savePetMouseSettings(patch));
  }, []);

  const updatePetVisualStyle = useCallback((style: PetVisualStyle) => {
    setPetVisualStyle(savePetVisualStyle(style));
  }, []);

  const handleYandereOpen = useCallback(() => {
    setPrefsOpen(false);
    setYandereOpen(true);
  }, []);

  const loadCharacterAvatar = useCallback(async (charId: string | null) => {
    if (!charId) { setCharacterAvatarDataUrl(null); return; }
    try {
      setCharacterAvatarDataUrl(await getCharacterAvatar(charId));
    } catch {
      setCharacterAvatarDataUrl(null);
    }
  }, []);

  useEffect(() => {
    getPromptAssets()
      .then(assets => loadCharacterAvatar(assets.active.active_character || null))
      .catch(() => {});
  }, [loadCharacterAvatar]);

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

  useEffect(() => wsClient.on('dream_invite', () => {
    setDreamAfterglow(false);
    setDreamWindowOpen(true);
  }), []);

  // 玩耍模式邀请：仅在开关开启时自动开窗，关闭时忽略（仍正常 ack）。
  useEffect(() => wsClient.on('toy_invite', () => {
    if (isPlayModeEnabled()) onToyOpen?.();
  }), [onToyOpen]);

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
          onOpenSpec={() => setSpecOpen(true)}
          onOpenPrefs={() => setPrefsOpen(true)}
          dreamWindowOpen={dreamWindowOpen}
          onDreamToggle={toggleDreamWindow}
          onActivityOpen={onActivityOpen}
          onToyOpen={onToyOpen}
          playModeEnabled={playModeEnabled}
          onGroupOpen={() => setGroupView('list')}
        />
        <div ref={bodyRef} className="chat-ui__body" style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative', '--chat-background-blur': `${appearance.backgroundBlur}px` } as CSSProperties}>
          {chatBackground.dataUrl && (
            <div className="chat-ui__background"
                 style={{ backgroundImage: `url("${chatBackground.dataUrl}")` } as CSSProperties}
                 aria-hidden="true" />
          )}
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
            {groupView === null ? (
              <ChatPanel key={charSwitchKey} engine={engine} chatRectRef={chatRectRef} headerVisible={chatHeaderVisible} chatFontSize={appearance.chatFontSize} dreamActive={dreamWindowOpen} characterAvatarDataUrl={characterAvatarDataUrl} />
            ) : groupView === 'list' ? (
              <GroupListPanel
                onSelectGroup={id => setGroupView(id)}
                onBack={() => setGroupView(null)}
              />
            ) : (
              <GroupChatPanel
                groupId={groupView}
                onBack={() => setGroupView('list')}
                fontSize={appearance.chatFontSize}
              />
            )}
          </div>
        </div>
      </div>

      {dreamWindowOpen && (
        <DreamWindow
          characterAvatarDataUrl={characterAvatarDataUrl}
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
        themeMode={themeMode}
        onThemeModeChange={() => {
          const next = themeMode === 'auto' ? 'manual' : 'auto';
          setThemeMode_(next);
          setThemeMode(next).catch(console.warn);
        }}
        chatHeaderVisible={chatHeaderVisible}
        onChatHeaderToggle={() => setChatHeaderVisible(v => { const next = !v; setUIPref('chat.headerVisible', next); return next; })}
        appearance={appearance}
        onAppearanceChange={updateAppearance}
        petMouseSettings={petMouseSettings}
        onPetMouseSettingsChange={updatePetMouseSettings}
        petVisualStyle={petVisualStyle}
        onPetVisualStyleChange={updatePetVisualStyle}
        presenceNagEnabled={presenceNagEnabled}
        onPresenceNagToggle={() => {
          const next = !presenceNagEnabled;
          void patchPresenceNagEnabled(next)
            .then(() => {
              setPresenceNagEnabledState(next);
              if (!next) void invoke('presence_nag_close_all').catch(error => console.warn('[presence_nag] 全部关闭失败:', error));
            })
            .catch(error => console.warn('[presence_nag] 切换失败:', error));
        }}
        playModeEnabled={playModeEnabled}
        onPlayModeToggle={() => {
          const next = !playModeEnabled;
          setPlayModeEnabled(next);
          setPlayModeEnabledState(next);
        }}
        petRoamEnabled={petRoamEnabled}
        onPetRoamToggle={() => savePetRoamSettings({ enabled: !petRoamEnabled })}
        petRippleEnabled={petRippleEnabled}
        onPetRippleToggle={() => savePetRippleSettings({ enabled: !petRippleEnabled })}
        onYandereOpen={handleYandereOpen}
        onCharacterAvatarChange={setCharacterAvatarDataUrl}
        onCharacterSwitched={() => setCharSwitchKey(k => k + 1)} />
      {yandereOpen && <YandereOverlay onClose={() => setYandereOpen(false)} />}
    </div>
  );
}
