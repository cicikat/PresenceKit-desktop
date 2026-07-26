import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { avatarStore } from '../../../../shared/avatars/store';
import { getActiveCharacterName, subscribeActiveCharacter } from '../../../../shared/activeCharacter';
import type { PetMouseSettings } from '../../../../shared/pet/mouseSettings';
import type { PetVisualStyle } from '../../../../shared/pet/petVisualStyle';
import { chatFontFamily, chatFontUrl, listChatFonts, type BackgroundKind, type ChatAppearance, type ChatFontOption } from '../../../../shared/chatAppearance';
import { AvatarCropper } from '../AvatarCropper';
import { DreamBackgroundCropper } from '../../../dream/components/DreamBackgroundCropper';
import { ThemePicker } from '../../../../shared/theme/ThemePicker';
import { ChatColorPage } from '../ChatColorPage';
import { CallSettingsPage } from '../CallSettingsPage';
import { CoplaySettingsPage } from '../CoplaySettingsPage';
import { ConnectionSettingsPage } from '../ConnectionSettingsPage';
import { ToolLoopSettingsPage } from '../ToolLoopSettingsPage';
import { ThinkingSettingsPage } from '../ThinkingSettingsPage';
import { OutputSegmentEnforceSettingsPage } from '../OutputSegmentEnforceSettingsPage';
import { ModelRoutingSettingsPage } from '../ModelRoutingSettingsPage';
import { CharacterModelRoutingSettingsPage } from '../CharacterModelRoutingSettingsPage';
import { DesktopTtsSettingsPage } from '../DesktopTtsSettingsPage';
import { VisualPerceptionSettingsPage } from '../VisualPerceptionSettingsPage';
import { useI18n, type Language } from '../../../../shared/i18n';
import { Icon } from '../UIKit';
import { PromptAssetsSettings } from './PromptAssetsSettings';
import { ChatSettingsSection } from './ChatSettingsSection';
import { MinuteSelect, PrefRange, PrefRow, PrefSwitch, prefActionButtonStyle, prefSelectStyle } from './PrefAtoms';
export function PreferencesPanel({ open, onClose, themeMode, onThemeModeChange, chatHeaderVisible, onChatHeaderToggle, appearance, onAppearanceChange, onCharacterAvatarChange, onCharacterSwitched, petMouseSettings, onPetMouseSettingsChange, petVisualStyle, onPetVisualStyleChange, model3dZoom, onModel3dZoomChange, live2dZoom, onLive2dZoomChange, presenceNagEnabled, onPresenceNagToggle, proactiveGapHours, onProactiveGapChange, playModeEnabled, onPlayModeToggle, petRoamEnabled, onPetRoamToggle, petRippleEnabled, onPetRippleToggle, onYandereOpen }: any) {
  const { language, setLanguage, t } = useI18n();
  const [avatars, setAvatars] = useState(avatarStore.get());
  const [tab, setTab] = useState<'system' | 'appearance' | 'color' | 'world' | 'pet' | 'chat' | 'call' | 'other'>('appearance');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropRole, setCropRole] = useState<'her' | 'you' | null>(null);
  const [bgCropSrc, setBgCropSrc] = useState<string | null>(null);
  const [bgSaving, setBgSaving] = useState(false);
  const [fonts, setFonts] = useState<ChatFontOption[]>([]);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const [activeCharName, setActiveCharName] = useState(() => getActiveCharacterName());
  const herFileRef = useRef<HTMLInputElement>(null);
  const youFileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => avatarStore.subscribe(setAvatars), []);
  useEffect(() => subscribeActiveCharacter(() => setActiveCharName(getActiveCharacterName())), []);
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
              ['system', '0', '系统设置'],
              ['appearance', '1', '外观'],
              ['color', '2', '色彩自定义'],
              ['world', '3', '世界'],
              ['pet', '4', '桌宠'],
              ['chat', '5', '对话'],
              ['call', '6', '视频通话'],
              ['other', '7', '其他'],
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
            {tab === 'system' ? (
              <>
                <PrefRow label={t('common.language')} hint={t('settings.language.hint')}>
                  <select
                    value={language}
                    onChange={event => setLanguage(event.target.value as Language)}
                    style={{ ...prefSelectStyle, width: 160 }}
                  >
                    <option value="zh-CN">{t('common.chinese')}</option>
                    <option value="en-US">{t('common.english')}</option>
                  </select>
                </PrefRow>
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <ConnectionSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <ModelRoutingSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <CharacterModelRoutingSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <DesktopTtsSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <ToolLoopSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <ThinkingSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <OutputSegmentEnforceSettingsPage />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <VisualPerceptionSettingsPage />
              </>
            ) : tab === 'appearance' ? (
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
                <PrefRow label="背景来源" hint="无 · 图片 · 粒子（跟随情绪）· 视频">
                  <select
                    value={appearance.backgroundKind}
                    onChange={e => onAppearanceChange({ backgroundKind: e.target.value as BackgroundKind })}
                    style={{ ...prefSelectStyle, width: 140 }}
                  >
                    <option value="none">无</option>
                    <option value="image">图片</option>
                    <option value="particles">粒子动态背景</option>
                    <option value="video">视频</option>
                  </select>
                </PrefRow>
                {appearance.backgroundKind === 'video' && (
                  <PrefRow label="视频路径" hint="public/ 下的路径，如 /backgrounds/bg.mp4">
                    <input
                      type="text"
                      placeholder="/backgrounds/bg.mp4"
                      value={appearance.backgroundVideoPath ?? ''}
                      onChange={e => onAppearanceChange({ backgroundVideoPath: e.target.value || null })}
                      style={{
                        ...prefSelectStyle, width: 200,
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                      }}
                    />
                  </PrefRow>
                )}
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
                <PrefRow label="界面动效" hint="0 关闭所有动画，1 默认，1.5 加强">
                  <PrefRange
                    min={0}
                    max={1.5}
                    step={0.1}
                    value={appearance.motionScale}
                    onChange={(value: number) => onAppearanceChange({ motionScale: value })}
                  />
                </PrefRow>
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                {/* 情绪联动分区 */}
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>情绪联动主题</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
                    界面会随她的情绪轻微变化
                  </div>
                </div>
                <PrefRow label="情绪联动" hint="开启后，accent 与侧栏氛围随 mood 平滑偏移；正文与主背景不受影响">
                  <PrefSwitch
                    active={appearance.moodReactive.enabled}
                    onClick={() => onAppearanceChange({ moodReactive: { ...appearance.moodReactive, enabled: !appearance.moodReactive.enabled } })}
                  />
                </PrefRow>
                {appearance.moodReactive.enabled && (
                  <PrefRow label="联动强度" hint="0 ≈ 无变化，1 明显但不辣眼">
                    <PrefRange
                      min={0}
                      max={1}
                      step={0.05}
                      value={appearance.moodReactive.intensity}
                      onChange={(value: number) => onAppearanceChange({ moodReactive: { ...appearance.moodReactive, intensity: value } })}
                    />
                  </PrefRow>
                )}
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
                <PrefRow label="粒子风格" hint="流体光球 · 散点粒子 · 神经网络 · 3D 模型">
                  <select
                    value={petVisualStyle}
                    onChange={e => onPetVisualStyleChange(e.target.value)}
                    style={{ ...prefSelectStyle, width: 140 }}
                  >
                    <option value="fluid">流体光球</option>
                    <option value="scatter">散点粒子</option>
                    <option value="network">神经网络</option>
                    <option value="live2d">Live2D</option>
                    <option value="model3d">3D 模型</option>
                  </select>
                </PrefRow>
                {petVisualStyle === 'model3d' && (
                  <PrefRow label="3D 缩放" hint="正交相机缩放，值越大越近">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="range"
                        min={0.3}
                        max={4}
                        step={0.05}
                        value={model3dZoom ?? 1}
                        onChange={e => onModel3dZoomChange(parseFloat(e.target.value))}
                        style={{ width: 100 }}
                      />
                      <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 10, minWidth: 28 }}>
                        {(model3dZoom ?? 1).toFixed(2)}×
                      </span>
                    </div>
                  </PrefRow>
                )}
                {petVisualStyle === 'live2d' && (
                  <>
                    <PrefRow label="Live2D 缩放" hint="值越大越近">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="range"
                          min={0.3}
                          max={4}
                          step={0.05}
                          value={live2dZoom ?? 1}
                          onChange={e => onLive2dZoomChange(parseFloat(e.target.value))}
                          style={{ width: 100 }}
                        />
                        <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 10, minWidth: 28 }}>
                          {(live2dZoom ?? 1).toFixed(2)}×
                        </span>
                      </div>
                    </PrefRow>
                    <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
                      模型与表情映射与视频通话共用，去 6 视频通话 页配置
                    </div>
                  </>
                )}
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
                <PrefRow label="玩耍模式" hint={`开启后，${activeCharName}在对话里表达想一起玩 toy 时会自动进入玩耍模式；Ribbon 也会出现手动入口。默认关闭`}>
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
            ) : tab === 'call' ? (
              <CallSettingsPage />
            ) : tab === 'chat' ? (
              <>
                <ChatSettingsSection />
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <PrefRow label="允许存在感弹窗" hint={`开启后，${activeCharName}被冷落久了会用带头像的弹窗找你；默认关闭`}>
                  <PrefSwitch active={presenceNagEnabled} onClick={onPresenceNagToggle} />
                </PrefRow>
                <PrefRow label="主动消息最小间隔" hint={`${activeCharName}每隔至少 ${proactiveGapHours} h 才会主动发消息 · 范围 0.5–12`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <button
                      onClick={() => onProactiveGapChange(Math.max(0.5, proactiveGapHours - 0.5))}
                      style={prefActionButtonStyle}
                    >−</button>
                    <span className="mono" style={{ width: 38, textAlign: 'center', color: 'var(--ink-2)', fontSize: 11 }}>
                      {proactiveGapHours}h
                    </span>
                    <button
                      onClick={() => onProactiveGapChange(Math.min(12, proactiveGapHours + 0.5))}
                      style={prefActionButtonStyle}
                    >+</button>
                  </div>
                </PrefRow>
                <div style={{ height: 1, background: 'var(--paper-edge)' }} />
                <PrefRow label="沉浸式挽留模式（废弃版仅保留视觉效果）" hint="5 秒倒计时后触发暗红遮罩与关一弹十小窗；ESC 退出">
                  <button onClick={onYandereOpen} style={prefActionButtonStyle}>启动</button>
                </PrefRow>
              </>
            ) : tab === 'other' ? (
              <CoplaySettingsPage />
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
