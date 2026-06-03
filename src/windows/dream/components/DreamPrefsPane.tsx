import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DEFAULT_DREAM_SETTINGS,
  type DreamState,
  type DreamSettings,
  type MemoryAccess,
  type BoundaryLevel,
  type WorldLayer,
  type LucidMode,
  type DreamJailbreakPreset,
} from '../../../shared/api/dream-types';
import { dreamGetSettings, dreamUpdateSettings } from '../../../shared/api/dream';
import {
  avatarStore,
  type DreamBackgroundAsset,
  type DreamBackgroundTone,
} from '../../../shared/avatars/store';
import { listDreamFonts, type DreamAppearance, type DreamFontOption } from '../../../shared/dreamAppearance';
import { Icon } from '../../chat/components/UIKit';
import { DreamBackgroundCropper } from './DreamBackgroundCropper';

const MEMORY_ACCESS_LABELS: Record<MemoryAccess, string> = {
  card_only: '仅角色卡',
  relationship_summary: '关系摘要',
  full_snapshot: '完整快照',
};

const BOUNDARY_LEVEL_LABELS: Record<BoundaryLevel, string> = {
  vague: '模糊',
  body_perceptible: '身体可感知',
  numbers_visible: '数值可见',
  threshold_break: '阈值突破',
};

const WORLD_LAYER_LABELS: Record<WorldLayer, string> = {
  reality_derived: '现实衍生',
  abo: 'ABO',
  vampire: '吸血鬼',
  cat: '猫',
  flower_bud: '花苞',
  custom: '自定义',
};

const LUCID_MODE_LABELS: Record<LucidMode, string> = {
  lucid_shared: '清明共享',
  non_lucid: '非清明',
};

const DREAM_JAILBREAK_PRESET_LABELS: Record<DreamJailbreakPreset, string> = {
  default: '默认',
  abo: 'ABO',
  custom: '自定义',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type DreamPrefsTab = 'status' | 'context' | 'system' | 'world' | 'other';

const DREAM_PREF_TABS: Array<[DreamPrefsTab, string]> = [
  ['status', '1 · 当前状态'],
  ['context', '2 · 梦境上下文'],
  ['system', '3 · 系统设置'],
  ['world', '4 · 世界'],
  ['other', '5 · 其他'],
];

function normalizeDreamSettings(settings: DreamSettings): DreamSettings {
  return {
    ...DEFAULT_DREAM_SETTINGS,
    ...settings,
    display: {
      ...DEFAULT_DREAM_SETTINGS.display,
      ...settings.display,
    },
  };
}

interface DreamPrefsPaneProps {
  open: boolean;
  dreamState: DreamState | null;
  appearance: DreamAppearance;
  onAppearanceChange: (patch: Partial<DreamAppearance>) => void;
  onClose: () => void;
}

function SettingRow({ label, hint, deferred, children }: {
  label: string;
  hint?: string;
  deferred: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="mono" style={{ fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.2, color: 'var(--dt-ink-2)' }}>
          {label}
        </span>
        {deferred && (
          <span className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.8, color: 'var(--dt-ink-4)', fontStyle: 'italic' }}>
            下次入梦生效
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 'calc(10px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', lineHeight: 1.4, marginBottom: 2 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function SelectPref<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
            background: value === opt ? 'var(--dt-flower-dandelion)' : 'var(--dt-surface-2)',
            color: value === opt ? 'var(--dt-ink)' : 'var(--dt-ink-3)',
            border: value === opt ? '1px solid transparent' : '1px solid var(--dt-border-soft)',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

function StatusItem({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="dream-prefs__status-item">
      <div className="dream-prefs__status-label">{label}</div>
      <div className="dream-prefs__status-value">{value}</div>
      {detail && <div className="dream-prefs__status-detail">{detail}</div>}
    </div>
  );
}

function BackgroundImportCard({
  label,
  background,
  saving,
  disabled,
  onImport,
  onClear,
}: {
  label: string;
  background: DreamBackgroundAsset;
  saving: boolean;
  disabled: boolean;
  onImport: () => void;
  onClear: () => void;
}) {
  return (
    <div className="dream-prefs__background-card">
      <div className="dream-prefs__background-label">{label}</div>
      <div
        className={`dream-prefs__background-preview${background.dataUrl ? ' has-image' : ''}`}
        style={background.dataUrl ? { backgroundImage: `url("${background.dataUrl}")` } : undefined}
      >
        {!background.dataUrl && <span>尚未导入背景</span>}
      </div>
      <div className="dream-prefs__background-actions">
        <button type="button" onClick={onImport} disabled={disabled}>
          {saving ? '保存中…' : '导入并裁切'}
        </button>
        {background.dataUrl && (
          <button type="button" onClick={onClear} disabled={disabled}>移除背景</button>
        )}
      </div>
    </div>
  );
}

export function DreamPrefsPane({ open, dreamState, appearance, onAppearanceChange, onClose }: DreamPrefsPaneProps) {
  const [settings, setSettings] = useState<DreamSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tab, setTab] = useState<DreamPrefsTab>('status');
  const [fonts, setFonts] = useState<DreamFontOption[]>([]);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const [backgrounds, setBackgrounds] = useState(() => avatarStore.get().dreamBackgrounds);
  const [backgroundCropSrc, setBackgroundCropSrc] = useState<string | null>(null);
  const [backgroundCropTone, setBackgroundCropTone] = useState<DreamBackgroundTone | null>(null);
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const backgroundFileRef = useRef<HTMLInputElement>(null);
  const backgroundFileToneRef = useRef<DreamBackgroundTone>('day');

  const isDreamActive = dreamState?.status === 'DREAM_ACTIVE' || dreamState?.status === 'DREAM_EXIT_REQUESTED';

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setLoadError(null);
    try {
      setSettings(normalizeDreamSettings(await dreamGetSettings()));
    } catch (error) {
      setSettings(current => current ?? normalizeDreamSettings(DEFAULT_DREAM_SETTINGS));
      setLoadError(String(error));
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || settings || settingsLoading) return;
    void loadSettings();
  }, [loadSettings, open, settings, settingsLoading]);

  useEffect(() => avatarStore.subscribe(config => {
    setBackgrounds(config.dreamBackgrounds);
  }), []);

  useEffect(() => {
    if (!open || tab !== 'system') return;
    setFontLoadError(null);
    listDreamFonts()
      .then(setFonts)
      .catch(error => setFontLoadError(String(error)));
  }, [open, tab]);

  const patch = useCallback(async (update: Partial<DreamSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...update };
    setSettings(next);
    setSaveState('saving');
    try {
      const resp = await dreamUpdateSettings(update);
      const savedSettings = normalizeDreamSettings(resp.settings);
      setSettings(savedSettings);
      window.dispatchEvent(new CustomEvent<DreamSettings>('dream-settings-updated', { detail: savedSettings }));
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch {
      setSettings(settings);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2000);
    }
  }, [settings]);

  const chooseBackgroundFile = (tone: DreamBackgroundTone) => {
    backgroundFileToneRef.current = tone;
    backgroundFileRef.current?.click();
  };

  const handleBackgroundFile = (file: File) => {
    setBackgroundCropTone(backgroundFileToneRef.current);
    setBackgroundCropSrc(URL.createObjectURL(file));
  };

  const closeBackgroundCropper = () => {
    if (backgroundCropSrc) URL.revokeObjectURL(backgroundCropSrc);
    setBackgroundCropSrc(null);
    setBackgroundCropTone(null);
  };

  const saveBackground = async (blob: Blob) => {
    if (!backgroundCropTone) return;
    setBackgroundSaving(true);
    setBackgroundError(null);
    try {
      await avatarStore.setDreamBackground(backgroundCropTone, blob);
      closeBackgroundCropper();
    } catch (error) {
      setBackgroundError(String(error));
    } finally {
      setBackgroundSaving(false);
    }
  };

  const saveCurrentColor = () => {
    if (appearance.savedColors.includes(appearance.accentColor)) return;
    onAppearanceChange({ savedColors: [...appearance.savedColors, appearance.accentColor] });
  };

  if (!open) return null;

  return (
    <>
      {backgroundCropSrc && (
        <DreamBackgroundCropper
          imageSrc={backgroundCropSrc}
          onConfirm={saveBackground}
          onCancel={closeBackgroundCropper}
        />
      )}
      <input
        ref={backgroundFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) handleBackgroundFile(file);
          event.target.value = '';
        }}
      />
      <div
        className="dream-modal__backdrop"
        onClick={onClose}
        role="presentation"
      >
      <section
        className="dream-modal dream-modal--prefs"
        aria-label="梦境偏好"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <header className="dream-modal__header">
          <Icon name="settings" size={17} />
          <div className="dream-modal__title">偏好</div>
          <div className="dream-modal__kicker">DREAM SETTINGS</div>
          <div className="dream-modal__header-spacer" />
          {saveState === 'saving' && (
            <span className="dream-modal__save-state">保存中…</span>
          )}
          {saveState === 'saved' && (
            <span className="dream-modal__save-state dream-modal__save-state--saved">已保存</span>
          )}
          {saveState === 'error' && (
            <span className="dream-modal__save-state dream-modal__save-state--error">保存失败</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭偏好"
            className="dream-modal__close"
          >
            ×
          </button>
        </header>

        <nav className="dream-prefs__tabs" aria-label="梦境偏好分类">
          {DREAM_PREF_TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`dream-prefs__tab${tab === key ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="dream-modal__body">
          {isDreamActive && (
            <div className="dream-modal__notice">
              梦境进行中 — 以下修改将在<strong>下次入梦</strong>时生效。
            </div>
          )}

          {loadError && (
            <div className="dream-modal__error">
              加载失败，当前显示默认设置：{loadError}
              <button type="button" onClick={() => void loadSettings()}>重试读取</button>
            </div>
          )}

          {tab === 'status' && (
            <div className="dream-prefs__groups">
              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">当前可信状态</div>
                  <div className="dream-prefs__group-hint">只读汇总 · 当前生效读取冻结快照，其余项目暂显示已保存偏好</div>
                </div>
                <div className="dream-prefs__status-grid">
                  <StatusItem
                    label="当前世界"
                    value={settings ? WORLD_LAYER_LABELS[settings.world_layer] : 'ABO'}
                    detail="WORLD LAYER"
                  />
                  <StatusItem
                    label="当前生效"
                    value={dreamState?.frozen_world?.replace(/_/g, ' ') ?? '本次梦境 frozen_world'}
                    detail="FROZEN WORLD"
                  />
                  <StatusItem
                    label="已经历"
                    value="x 次"
                    detail="待接入统计"
                  />
                  <StatusItem
                    label="Lorebook"
                    value={settings ? (settings.enable_dream_lorebook ? '已启用' : '已禁用') : '启用 / 禁用状态'}
                    detail="DREAM LOREBOOK"
                  />
                  <StatusItem
                    label="Memory"
                    value={settings ? MEMORY_ACCESS_LABELS[settings.memory_access] : '角色卡 / 关系摘要 / 完整快照'}
                    detail="MEMORY ACCESS"
                  />
                  <StatusItem
                    label="Boundary"
                    value={settings ? BOUNDARY_LEVEL_LABELS[settings.boundary_level] : '阈值突破'}
                    detail="PERCEPTION BOUNDARY"
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'context' && settings && (
            <div className="dream-prefs__groups">
              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">梦境上下文</div>
                  <div className="dream-prefs__group-hint">控制进入梦境时允许读取的信息和感知深度</div>
                </div>
                <div className="dream-prefs__grid">
                  <SettingRow label="记忆读取" deferred={isDreamActive}>
                    <SelectPref<MemoryAccess>
                      value={settings.memory_access}
                      options={['card_only', 'relationship_summary', 'full_snapshot']}
                      labels={MEMORY_ACCESS_LABELS}
                      onChange={v => patch({ memory_access: v })}
                    />
                  </SettingRow>

                  <SettingRow label="感知边界" deferred={isDreamActive}>
                    <SelectPref<BoundaryLevel>
                      value={settings.boundary_level}
                      options={['vague', 'body_perceptible', 'numbers_visible', 'threshold_break']}
                      labels={BOUNDARY_LEVEL_LABELS}
                      onChange={v => patch({ boundary_level: v })}
                    />
                  </SettingRow>
                </div>
              </div>

              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">附加设定</div>
                  <div className="dream-prefs__group-hint">控制梦中双方的清醒方式，并补充独立 lorebook 内容</div>
                </div>
                <div className="dream-prefs__grid">
                  <SettingRow label="清明模式" deferred={isDreamActive}>
                    <SelectPref<LucidMode>
                      value={settings.lucid_mode}
                      options={['lucid_shared', 'non_lucid']}
                      labels={LUCID_MODE_LABELS}
                      onChange={v => patch({ lucid_mode: v })}
                    />
                  </SettingRow>

                  <SettingRow label="梦境 Lorebook" deferred={isDreamActive}>
                    <button
                      type="button"
                      onClick={() => patch({ enable_dream_lorebook: !settings.enable_dream_lorebook })}
                      className={`dream-prefs__toggle${settings.enable_dream_lorebook ? ' is-active' : ''}`}
                    >
                      {settings.enable_dream_lorebook ? '已启用' : '已禁用'}
                    </button>
                  </SettingRow>
                </div>
              </div>
            </div>
          )}

          {tab === 'context' && settingsLoading && !settings && (
            <div className="dream-prefs__placeholder">正在读取梦境上下文…</div>
          )}

          {tab === 'system' && (
            <div className="dream-prefs__groups">
              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">系统设置</div>
                  <div className="dream-prefs__group-hint">Dream UI 个性化 · 修改会立即保存并作用于当前 Dream 窗口</div>
                </div>
                <div className="dream-prefs__system-list">
                  <SettingRow label="聊天字体大小" deferred={false}>
                    <div className="dream-prefs__range-row">
                      <input
                        type="range"
                        min={11}
                        max={24}
                        step={1}
                        value={appearance.chatFontSize}
                        onChange={event => onAppearanceChange({ chatFontSize: Number(event.target.value) })}
                      />
                      <span>{appearance.chatFontSize}px</span>
                    </div>
                  </SettingRow>

                  <SettingRow label="主题字体大小" hint="控制聊天区域以外的 Dream 界面文字" deferred={false}>
                    <div className="dream-prefs__range-row">
                      <input
                        type="range"
                        min={11}
                        max={22}
                        step={1}
                        value={appearance.themeFontSize}
                        onChange={event => onAppearanceChange({ themeFontSize: Number(event.target.value) })}
                      />
                      <span>{appearance.themeFontSize}px</span>
                    </div>
                  </SettingRow>

                  <SettingRow label="字体包" hint="动态读取 public/fonts/ 下的字体文件" deferred={false}>
                    <select
                      className="dream-prefs__select"
                      value={appearance.fontFile ?? ''}
                      onChange={event => onAppearanceChange({ fontFile: event.target.value || null })}
                    >
                      <option value="">默认字体</option>
                      {fonts.map(font => (
                        <option key={font.fileName} value={font.fileName}>{font.label}</option>
                      ))}
                    </select>
                    {fontLoadError && <div className="dream-modal__error">字体目录读取失败：{fontLoadError}</div>}
                  </SettingRow>

                  <SettingRow label="颜色方案" hint="选择 RGB 颜色并保存为自己的配色" deferred={false}>
                    <div className="dream-prefs__color-row">
                      <input
                        type="color"
                        value={appearance.accentColor}
                        onChange={event => onAppearanceChange({ accentColor: event.target.value })}
                        aria-label="选择 Dream 主题色"
                      />
                      <span>{appearance.accentColor.toUpperCase()}</span>
                      <button type="button" onClick={saveCurrentColor}>保存当前配色</button>
                    </div>
                    {appearance.savedColors.length > 0 && (
                      <div className="dream-prefs__saved-colors">
                        {appearance.savedColors.map(color => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`使用配色 ${color}`}
                            title={color}
                            style={{ background: color }}
                            onClick={() => onAppearanceChange({ accentColor: color })}
                          />
                        ))}
                      </div>
                    )}
                  </SettingRow>
                </div>
              </div>

              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">聊天背景</div>
                  <div className="dream-prefs__group-hint">日间与夜间分别导入 · 只作用于 Dream 聊天区域 · 图片与头像一同保存在运行时 AppData</div>
                </div>
                <div className="dream-prefs__background-grid">
                  <BackgroundImportCard
                    label="日间背景"
                    background={backgrounds.day}
                    saving={backgroundSaving && backgroundCropTone === 'day'}
                    disabled={backgroundSaving}
                    onImport={() => chooseBackgroundFile('day')}
                    onClear={() => avatarStore.clearDreamBackground('day')}
                  />
                  <BackgroundImportCard
                    label="夜间背景"
                    background={backgrounds.night}
                    saving={backgroundSaving && backgroundCropTone === 'night'}
                    disabled={backgroundSaving}
                    onImport={() => chooseBackgroundFile('night')}
                    onClear={() => avatarStore.clearDreamBackground('night')}
                  />
                </div>
                {backgroundError && <div className="dream-modal__error">背景保存失败：{backgroundError}</div>}
                <SettingRow label="背景模糊度" hint="控制 Dream 聊天窗口中导入背景的模糊力度" deferred={false}>
                  <div className="dream-prefs__range-row">
                    <input
                      type="range"
                      min={0}
                      max={36}
                      step={1}
                      value={appearance.backgroundBlur}
                      onChange={event => onAppearanceChange({ backgroundBlur: Number(event.target.value) })}
                    />
                    <span>{appearance.backgroundBlur}px</span>
                  </div>
                </SettingRow>
                {settings && (
                  <div className="dream-prefs__developer-row">
                    <span>开发者模式</span>
                    <button
                      type="button"
                      title="开启后在 Dream 状态页显示生理唤醒指标"
                      onClick={() => patch({
                        display: {
                          physiological_arousal: settings.display?.physiological_arousal !== true,
                        },
                      })}
                      className={`dream-prefs__toggle${settings.display?.physiological_arousal === true ? ' is-active' : ''}`}
                    >
                      {settings.display?.physiological_arousal === true ? '已开启' : '已关闭'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'world' && settings && (
            <div className="dream-prefs__groups">
              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">梦境世界卡</div>
                  <div className="dream-prefs__group-hint">选择下一次入梦时使用的独立世界层</div>
                </div>
                <SettingRow label="世界卡" deferred={isDreamActive}>
                  <SelectPref<WorldLayer>
                    value={settings.world_layer}
                    options={['reality_derived', 'abo', 'vampire', 'cat', 'flower_bud', 'custom']}
                    labels={WORLD_LAYER_LABELS}
                    onChange={v => patch({ world_layer: v })}
                  />
                </SettingRow>
              </div>

              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">梦境破限</div>
                  <div className="dream-prefs__group-hint">Dream 独立 D0 预设 · 不会写入 Reality prompt</div>
                </div>
                <SettingRow label="破限预设" deferred={isDreamActive}>
                  <SelectPref<DreamJailbreakPreset>
                    value={settings.jailbreak_preset}
                    options={['default', 'abo', 'custom']}
                    labels={DREAM_JAILBREAK_PRESET_LABELS}
                    onChange={v => patch({ jailbreak_preset: v })}
                  />
                </SettingRow>
              </div>
            </div>
          )}

          {tab === 'world' && settingsLoading && !settings && (
            <div className="dream-prefs__placeholder">正在读取梦境世界设置…</div>
          )}

          {tab === 'other' && (
            <div className="dream-prefs__placeholder">
              其他梦境偏好待导入。
            </div>
          )}
        </div>
      </section>
    </div>
    </>
  );
}
