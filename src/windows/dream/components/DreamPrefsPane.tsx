import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DEFAULT_DREAM_SETTINGS,
  type DreamState,
  type DreamScenarioState,
  type DreamMirrorCoreState,
  type DreamEntryMode,
  type DreamSettings,
  type DreamStats,
  type MemoryAccess,
  type BoundaryLevel,
  type LucidMode,
  type DreamJailbreakPreset,
} from '../../../shared/api/dream-types';
import {
  dreamGetSettings, dreamUpdateSettings, dreamGetStats,
  dreamGroupGetSettings, dreamGroupUpdateSettings, dreamListPresets, dreamListWorlds,
} from '../../../shared/api/dream';
import { getPromptAssets } from '../../../shared/api/backend';
import type { PromptAssetOption } from '../../../shared/api/types';
import {
  avatarStore,
  type DreamBackgroundAsset,
  type DreamBackgroundTone,
} from '../../../shared/avatars/store';
import {
  listDreamFonts,
  DREAM_DAY_DEFAULTS,
  DREAM_NIGHT_DEFAULTS,
  type DreamAppearance,
  type DreamFontOption,
} from '../../../shared/dreamAppearance';
import { Icon } from '../../chat/components/UIKit';
import { DreamBackgroundCropper } from './DreamBackgroundCropper';
import { useI18n } from '../../../shared/i18n';

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


const LUCID_MODE_LABELS: Record<LucidMode, string> = {
  lucid_shared: '清明共享',
  non_lucid: '非清明',
};

function JailbreakMultiPicker({
  selected,
  available,
  disabled,
  onChange,
}: {
  selected: DreamJailbreakPreset[];
  available: PromptAssetOption[];
  disabled: boolean;
  onChange: (presets: DreamJailbreakPreset[]) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const unselected = available.filter(a => !selected.includes(a.id));

  const remove = (id: string) => onChange(selected.filter(s => s !== id));
  const add = (id: string) => { onChange([...selected, id]); setDropdownOpen(false); };

  const labelOf = (id: string) => available.find(a => a.id === id)?.label ?? id;

  const btnBase: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    border: '1px solid var(--dt-border-soft)',
    borderRadius: 8,
    background: 'var(--dt-surface-2)',
    color: 'var(--dt-ink-3)',
    padding: '3px 10px',
    letterSpacing: 0.8,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {selected.map(id => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))',
            letterSpacing: 0.8,
            background: 'var(--dt-flower-dandelion)',
            color: 'var(--dt-ink)',
            padding: '3px 10px',
            borderRadius: 8,
            border: '1px solid transparent',
          }}>
            {labelOf(id)}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(id)}
            style={{ ...btnBase, padding: '3px 8px', fontSize: 'calc(12px * var(--dream-theme-font-scale, 1))' }}
            aria-label={`移除 ${labelOf(id)}`}
          >×</button>
        </div>
      ))}
      {unselected.length > 0 && (
        <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDropdownOpen(v => !v)}
            style={{ ...btnBase }}
          >+ 添加</button>
          {dropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'var(--dt-surface-2)',
              border: '1px solid var(--dt-border-soft)',
              borderRadius: 8,
              padding: '4px 0',
              zIndex: 20,
              minWidth: 140,
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}>
              {unselected.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => add(item.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 14px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))',
                    letterSpacing: 0.8,
                    color: 'var(--dt-ink-2)',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {selected.length === 0 && available.length === 0 && (
        <span style={{ fontSize: 'calc(10px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)' }}>
          读取中…
        </span>
      )}
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type DreamPrefsTab = 'status' | 'context' | 'system' | 'world' | 'color' | 'other';

const DREAM_PREF_TABS: Array<[DreamPrefsTab, string]> = [
  ['status', '1 · 当前状态'],
  ['context', '2 · 梦境上下文'],
  ['system', '3 · 系统设置'],
  ['world', '4 · 世界'],
  ['color', '5 · 色彩'],
  ['other', '6 · 其他'],
];

function normalizeDreamSettings(raw: DreamSettings): DreamSettings {
  const settings = raw as DreamSettings & { jailbreak_preset?: string };
  let jailbreak_presets = settings.jailbreak_presets;
  if (!Array.isArray(jailbreak_presets) || jailbreak_presets.length === 0) {
    const legacy = settings.jailbreak_preset;
    jailbreak_presets = legacy ? [legacy] : DEFAULT_DREAM_SETTINGS.jailbreak_presets;
  }
  return {
    ...DEFAULT_DREAM_SETTINGS,
    ...settings,
    jailbreak_presets,
    display: {
      ...DEFAULT_DREAM_SETTINGS.display,
      ...settings.display,
    },
  };
}

interface DreamPrefsPaneProps {
  open: boolean;
  dreamState: DreamState | null;
  mode?: 'single' | 'group';
  groupId?: string | null;
  groupRoster?: Record<string, { label: string; avatarDataUrl: string | null }>;
  entryMode: DreamEntryMode;
  scenarioScriptId: string;
  appearance: DreamAppearance;
  onEntryModeChange: (mode: DreamEntryMode) => void;
  onScenarioScriptIdChange: (scriptId: string) => void;
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
  disabled = false,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
            background: value === opt ? 'var(--dt-flower-dandelion)' : 'var(--dt-surface-2)',
            color: value === opt ? 'var(--dt-ink)' : 'var(--dt-ink-3)',
            border: value === opt ? '1px solid transparent' : '1px solid var(--dt-border-soft)',
            transition: 'background 0.15s, color 0.15s',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

function DynamicSelectPref({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string;
  options: PromptAssetOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
            background: value === opt.id ? 'var(--dt-flower-dandelion)' : 'var(--dt-surface-2)',
            color: value === opt.id ? 'var(--dt-ink)' : 'var(--dt-ink-3)',
            border: value === opt.id ? '1px solid transparent' : '1px solid var(--dt-border-soft)',
            transition: 'background 0.15s, color 0.15s',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          {opt.label}
        </button>
      ))}
      {options.length === 0 && (
        <span style={{ fontSize: 'calc(10px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)' }}>
          读取中…
        </span>
      )}
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

function scenarioValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function formatDreamMode(mode: string | null | undefined): string {
  if (mode === 'sandbox') return 'sandbox / 沙盒';
  if (mode === 'scenario') return 'scenario / 剧本';
  if (mode === 'mirror') return 'mirror / 镜像';
  return scenarioValue(mode);
}

function getScenarioState(dreamState: DreamState): DreamScenarioState {
  return dreamState.scenario ?? {
    script_id: dreamState.script_id,
    current_stage_id: dreamState.current_stage_id,
    stage_turns: dreamState.stage_turns,
    ending_state: dreamState.ending_state,
    last_progress_signal: dreamState.last_progress_signal,
    satisfied_streak: dreamState.satisfied_streak,
    last_matched_exit_signs: dreamState.last_matched_exit_signs,
    last_blocked_events: dreamState.last_blocked_events,
  };
}

function getMirrorState(dreamState: DreamState): DreamMirrorCoreState {
  return dreamState.mirror_core ?? dreamState.mirror ?? {};
}

function MirrorStateGroup({ dreamState }: { dreamState: DreamState }) {
  const mode = dreamState.dream_mode ?? dreamState.mode;
  if (mode !== 'mirror') return null;

  const mirror = getMirrorState(dreamState);
  const bucketEntries = Object.entries(mirror.snapshot_buckets ?? {});
  const hints = mirror.symbolic_hints ?? [];

  return (
    <div className="dream-prefs__group">
      <div className="dream-prefs__group-head">
        <div className="dream-prefs__group-title">镜像模式状态</div>
        <div className="dream-prefs__group-hint">Mirror v0.1 · 只读后端 snapshot · 不写回长期状态</div>
      </div>
      <div className="dream-prefs__status-grid">
        <StatusItem label="模式" value={formatDreamMode(mode)} detail="MODE" />
        <StatusItem label="Mirror" value="v0.1" detail="MIRROR MODE" />
        <StatusItem label="版本" value={scenarioValue(mirror.version)} detail="MIRROR CORE VERSION" />
        <StatusItem label="来源" value={scenarioValue(mirror.source)} detail="SOURCE" />
        <StatusItem label="Bucket" value={bucketEntries.length ? `${bucketEntries.length} 项` : '—'} detail="SNAPSHOT BUCKETS" />
        <StatusItem label="Hints" value={hints.length ? `${hints.length} 条` : '—'} detail="SYMBOLIC HINTS" />
      </div>
      {(bucketEntries.length > 0 || hints.length > 0) && (
        <details className="dream-prefs__scenario-details">
          <summary>展开 Mirror 调试详情</summary>
          {bucketEntries.length > 0 && (
            <div className="dream-prefs__scenario-detail">
              <div>SNAPSHOT BUCKETS</div>
              <ul>{bucketEntries.map(([key, value]) => <li key={key}>{key}: {value}</li>)}</ul>
            </div>
          )}
          {hints.length > 0 && (
            <div className="dream-prefs__scenario-detail">
              <div>SYMBOLIC HINTS</div>
              <ul>{hints.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </div>
          )}
        </details>
      )}
    </div>
  );
}

function ScenarioStateGroup({ dreamState }: { dreamState: DreamState }) {
  const mode = dreamState.dream_mode ?? dreamState.mode;
  if (mode !== 'scenario') return null;

  const scenario = getScenarioState(dreamState);
  const completed = scenario.ending_state === 'completed';
  const matchedExitSigns = scenario.last_matched_exit_signs ?? [];
  const blockedEvents = scenario.last_blocked_events ?? [];
  const hasDetails = matchedExitSigns.length > 0 || blockedEvents.length > 0;

  return (
    <div className="dream-prefs__group">
      <div className="dream-prefs__group-head">
        <div className="dream-prefs__group-title">剧本模式状态</div>
        <div className="dream-prefs__group-hint">只读开发信息 · 阶段推进与完成状态由后端负责</div>
      </div>
      {completed && <div className="dream-prefs__scenario-complete">剧本已完成</div>}
      <div className="dream-prefs__status-grid">
        <StatusItem label="模式" value={formatDreamMode(mode)} detail="MODE" />
        <StatusItem label="剧本" value={scenarioValue(scenario.script_id)} detail="SCRIPT ID" />
        <StatusItem label="当前阶段" value={scenarioValue(scenario.current_stage_id)} detail="CURRENT STAGE ID" />
        <StatusItem label="阶段轮次" value={scenarioValue(scenario.stage_turns)} detail="STAGE TURNS" />
        <StatusItem label="进展信号" value={scenarioValue(scenario.last_progress_signal)} detail="DEV · LAST PROGRESS SIGNAL" />
        <StatusItem label="满足连续数" value={scenarioValue(scenario.satisfied_streak)} detail="DEV · SATISFIED STREAK" />
        <StatusItem label="结束状态" value={scenarioValue(scenario.ending_state)} detail="ENDING STATE" />
      </div>
      {hasDetails && (
        <details className="dream-prefs__scenario-details">
          <summary>展开 Scenario 调试详情</summary>
          {matchedExitSigns.length > 0 && (
            <div className="dream-prefs__scenario-detail">
              <div>LAST MATCHED EXIT SIGNS</div>
              <ul>{matchedExitSigns.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </div>
          )}
          {blockedEvents.length > 0 && (
            <div className="dream-prefs__scenario-detail">
              <div>LAST BLOCKED EVENTS</div>
              <ul>{blockedEvents.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </div>
          )}
        </details>
      )}
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

// ── Dream color editor ───────────────────────────────────────────────────────

const DREAM_COLOR_GROUPS: Array<{ label: string; tokens: string[] }> = [
  { label: '背景', tokens: ['--dt-bg-1', '--dt-bg-2', '--dt-bg-3'] },
  { label: '文字', tokens: ['--dt-ink', '--dt-ink-2', '--dt-ink-3', '--dt-ink-4'] },
  { label: '花卉装饰', tokens: ['--dt-flower-dandelion', '--dt-flower-rose', '--dt-flower-bluebell', '--dt-flower-daisy', '--dt-flower-sun'] },
  { label: '强调色', tokens: ['--dt-accent-rose', '--dt-accent-violet', '--dt-accent-azure'] },
];

function DreamColorTab({
  appearance,
  onAppearanceChange,
}: {
  appearance: DreamAppearance;
  onAppearanceChange: (patch: Partial<DreamAppearance>) => void;
}) {
  const [tone, setTone] = useState<'day' | 'night'>('day');

  const overrides = tone === 'day' ? appearance.colorOverridesDay : appearance.colorOverridesNight;
  const defaults = tone === 'day' ? DREAM_DAY_DEFAULTS : DREAM_NIGHT_DEFAULTS;

  const handleChange = (token: string, hex: string) => {
    const updated = { ...overrides, [token]: hex };
    onAppearanceChange(
      tone === 'day'
        ? { colorOverridesDay: updated }
        : { colorOverridesNight: updated },
    );
  };

  const handleReset = (token: string) => {
    const updated = { ...overrides };
    delete updated[token];
    onAppearanceChange(
      tone === 'day'
        ? { colorOverridesDay: updated }
        : { colorOverridesNight: updated },
    );
  };

  const handleResetAll = () => {
    onAppearanceChange(
      tone === 'day'
        ? { colorOverridesDay: {} }
        : { colorOverridesNight: {} },
    );
  };

  const hasAnyOverride = Object.keys(overrides).length > 0;

  const fontScale = 'calc(1px * var(--dream-theme-font-scale, 1))';

  return (
    <div className="dream-prefs__groups">
      <div className="dream-prefs__group">
        <div className="dream-prefs__group-head">
          <div className="dream-prefs__group-title">色彩自定义</div>
          <div className="dream-prefs__group-hint">分别编辑日间 / 夜间的 Dream 配色 · 改动即时预览</div>
        </div>

        {/* Tone switcher */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          {(['day', 'night'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              style={{
                padding: '4px 12px', borderRadius: 8,
                fontSize: `calc(11px * var(--dream-theme-font-scale, 1))`,
                fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
                background: tone === t ? 'var(--dt-flower-dandelion)' : 'var(--dt-surface-2)',
                color: tone === t ? 'var(--dt-ink)' : 'var(--dt-ink-3)',
                border: tone === t ? '1px solid transparent' : '1px solid var(--dt-border-soft)',
                cursor: 'pointer', transition: 'background 0.15s',
              }}
            >
              {t === 'day' ? '☀ 日间' : '☾ 夜间'}
            </button>
          ))}
          {hasAnyOverride && (
            <button
              type="button"
              onClick={handleResetAll}
              style={{
                marginLeft: 'auto', padding: '4px 10px', borderRadius: 8,
                fontSize: `calc(10px * var(--dream-theme-font-scale, 1))`,
                fontFamily: 'var(--font-mono)', letterSpacing: 0.6,
                background: 'transparent', color: 'var(--dt-ink-4)',
                border: '1px solid var(--dt-border-soft)', cursor: 'pointer',
              }}
            >
              重置全部
            </button>
          )}
        </div>

        {/* Color groups */}
        {DREAM_COLOR_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: `calc(10px * var(--dream-theme-font-scale, 1))`,
              fontWeight: 600, color: 'var(--dt-ink-4)',
              letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
            }}>
              {group.label}
            </div>
            {group.tokens.map(token => {
              const hasOverride = token in overrides;
              const currentHex = overrides[token] ?? defaults[token] ?? '#888888';
              return (
                <div key={token} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '3px 0',
                }}>
                  <input
                    type="color"
                    value={currentHex}
                    onChange={e => handleChange(token, e.target.value)}
                    style={{
                      width: 26, height: 26, padding: 2, border: '1px solid var(--dt-border-soft)',
                      borderRadius: 4, cursor: 'pointer', background: 'transparent',
                      flexShrink: 0,
                    }}
                    title={token}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: `calc(10px * var(--dream-theme-font-scale, 1))`,
                      color: hasOverride ? 'var(--dt-ink-2)' : 'var(--dt-ink-4)',
                      fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {token.replace(/^--/, '')}
                    </div>
                  </div>
                  <div style={{
                    fontSize: `calc(9px * var(--dream-theme-font-scale, 1))`,
                    color: 'var(--dt-ink-4)', fontFamily: 'var(--font-mono)',
                  }}>
                    {currentHex.toUpperCase()}
                  </div>
                  {hasOverride && (
                    <button
                      type="button"
                      onClick={() => handleReset(token)}
                      title="恢复默认"
                      style={{
                        background: 'transparent', border: 'none', color: 'var(--dt-ink-4)',
                        cursor: 'pointer', fontSize: `calc(11px * var(--dream-theme-font-scale, 1))`,
                        padding: '0 2px', lineHeight: 1,
                      }}
                    >
                      ↺
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{
          fontSize: `calc(10px * var(--dream-theme-font-scale, 1))`,
          color: 'var(--dt-ink-4)', lineHeight: 1.5, marginTop: 4,
        }}>
          调整颜色后立即生效 · 点击 ↺ 恢复单个 token 默认值
        </div>
      </div>
    </div>
  );
}

export function DreamPrefsPane({
  open,
  dreamState,
  mode = 'single',
  groupId = null,
  groupRoster = {},
  entryMode,
  scenarioScriptId,
  appearance,
  onEntryModeChange,
  onScenarioScriptIdChange,
  onAppearanceChange,
  onClose,
}: DreamPrefsPaneProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<DreamSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dreamStats, setDreamStats] = useState<DreamStats | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [tab, setTab] = useState<DreamPrefsTab>('status');
  const [fonts, setFonts] = useState<DreamFontOption[]>([]);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);
  const [backgrounds, setBackgrounds] = useState(() => avatarStore.get().dreamBackgrounds);
  const [availablePresets, setAvailablePresets] = useState<PromptAssetOption[]>([]);
  const [availableWorldCards, setAvailableWorldCards] = useState<PromptAssetOption[]>([]);
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
      const loaded = mode === 'group' && groupId
        ? await dreamGroupGetSettings(groupId)
        : await dreamGetSettings();
      setSettings(normalizeDreamSettings(loaded));
    } catch (error) {
      setSettings(current => current ?? normalizeDreamSettings(DEFAULT_DREAM_SETTINGS));
      setLoadError(String(error));
    } finally {
      setSettingsLoading(false);
    }
  }, [groupId, mode]);

  useEffect(() => {
    if (!open || settings || settingsLoading) return;
    void loadSettings();
  }, [loadSettings, open, settings, settingsLoading]);

  useEffect(() => {
    if (!open) return;
    dreamGetStats().then(setDreamStats).catch(() => {});
  }, [open]);

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

  useEffect(() => {
    if (!open || tab !== 'world') return;
    if (mode === 'group') {
      Promise.all([dreamListPresets(), dreamListWorlds()])
        .then(([presets, worlds]) => {
          setAvailablePresets(presets);
          setAvailableWorldCards(worlds);
        })
        .catch(() => {});
      return;
    }
    getPromptAssets().then(data => {
      setAvailablePresets(data.dream_presets ?? []);
      setAvailableWorldCards(data.world_cards ?? []);
    }).catch(() => {});
  }, [mode, open, tab]);

  useEffect(() => {
    if (!open || mode === 'group') return;
    getPromptAssets()
      .then(data => setAvailableWorldCards(data.world_cards ?? []))
      .catch(() => {});
  }, [mode, open]);

  const patch = useCallback(async (update: Partial<DreamSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...update };
    setSettings(next);
    setSaveState('saving');
    try {
      const resp = mode === 'group' && groupId
        ? await dreamGroupUpdateSettings(groupId, update)
        : await dreamUpdateSettings(update);
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
  }, [groupId, mode, settings]);

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
          {DREAM_PREF_TABS.filter(([key]) => mode === 'single' || key !== 'context').map(([key, label]) => (
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
                    value={settings ? (availableWorldCards.find(w => w.id === settings.world_layer)?.label ?? settings.world_layer) : '—'}
                    detail="WORLD LAYER"
                  />
                  <StatusItem
                    label="当前生效"
                    value={dreamState?.frozen_world?.replace(/_/g, ' ') ?? '—'}
                    detail="FROZEN WORLD"
                  />
                  <StatusItem
                    label="已经历"
                    value={dreamStats !== null ? String(dreamStats.total_valid) : '—'}
                    detail="VALID DREAMS"
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

          {mode === 'single' && tab === 'context' && settings && (
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

          {mode === 'single' && tab === 'context' && settingsLoading && !settings && (
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
                {mode === 'single' && settings && (
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

              {mode === 'group' && settings && (
                <div className="dream-prefs__group">
                  <div className="dream-prefs__group-head">
                    <div className="dream-prefs__group-title">{t('groupDream.prefs.shared.title')}</div>
                    <div className="dream-prefs__group-hint">{t('groupDream.prefs.shared.hint')}</div>
                  </div>
                  <div className="dream-prefs__grid">
                    <SettingRow label={t('groupDream.prefs.boundary')} deferred={isDreamActive}>
                      <SelectPref<BoundaryLevel>
                        value={settings.boundary_level}
                        options={['vague', 'body_perceptible', 'numbers_visible', 'threshold_break']}
                        labels={BOUNDARY_LEVEL_LABELS}
                        onChange={boundary_level => patch({ boundary_level })}
                      />
                    </SettingRow>
                    <SettingRow label={t('groupDream.prefs.lorebook')} deferred={isDreamActive}>
                      <button
                        type="button"
                        onClick={() => patch({ enable_dream_lorebook: !settings.enable_dream_lorebook })}
                        className={`dream-prefs__toggle${settings.enable_dream_lorebook ? ' is-active' : ''}`}
                      >
                        {settings.enable_dream_lorebook ? t('groupDream.prefs.enabled') : t('groupDream.prefs.disabled')}
                      </button>
                    </SettingRow>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'world' && settings && (
            <div className="dream-prefs__groups">
              {mode === 'single' && <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">入梦模式</div>
                  <div className="dream-prefs__group-hint">选择下一次进入梦境时使用的模式 · 梦境进行中不可切换</div>
                </div>
                <SettingRow label="模式" deferred={isDreamActive}>
                  <SelectPref<DreamEntryMode>
                    value={entryMode}
                    options={['sandbox', 'scenario', 'mirror']}
                    labels={{ sandbox: '沙盒', scenario: '剧本', mirror: '镜像' }}
                    onChange={onEntryModeChange}
                    disabled={isDreamActive}
                  />
                </SettingRow>
                {entryMode === 'scenario' && (
                  <SettingRow label="剧本 ID" hint="对应后端 data/dream/scenarios/{script_id}.yaml" deferred={isDreamActive}>
                    <input
                      className="dream-prefs__text-input"
                      type="text"
                      value={scenarioScriptId}
                      disabled={isDreamActive}
                      placeholder="例如 prison_demo"
                      spellCheck={false}
                      onChange={event => onScenarioScriptIdChange(event.target.value)}
                    />
                  </SettingRow>
                )}
                {entryMode === 'mirror' && (
                  <div className="dream-prefs__mode-note">
                    镜像梦：根据现实状态与内在状态生成隐喻梦境。当前为 v0.1，只读，不写回长期状态。
                  </div>
                )}
              </div>}

              {mode === 'group' && (dreamState?.roster?.length ?? 0) > 0 && (
                <div className="dream-prefs__group">
                  <div className="dream-prefs__group-head">
                    <div className="dream-prefs__group-title">{t('groupDream.prefs.perChar.title')}</div>
                    <div className="dream-prefs__group-hint">{t('groupDream.prefs.perChar.hint')}</div>
                  </div>
                  <div className="dream-prefs__grid">
                    {dreamState!.roster!.map(charId => (
                      <SettingRow key={charId} label={groupRoster[charId]?.label ?? charId} deferred={isDreamActive}>
                        <JailbreakMultiPicker
                          selected={settings.per_char?.[charId]?.jailbreak_presets ?? []}
                          available={availablePresets}
                          disabled={isDreamActive}
                          onChange={jailbreak_presets => patch({
                            per_char: {
                              ...(settings.per_char ?? {}),
                              [charId]: { jailbreak_presets },
                            },
                          })}
                        />
                      </SettingRow>
                    ))}
                  </div>
                </div>
              )}

              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">梦境世界卡</div>
                  <div className="dream-prefs__group-hint">选择下一次入梦时使用的独立世界层</div>
                </div>
                <SettingRow label="世界卡" deferred={isDreamActive}>
                  <DynamicSelectPref
                    value={settings.world_layer}
                    options={availableWorldCards}
                    onChange={v => patch({ world_layer: v })}
                    disabled={isDreamActive}
                  />
                </SettingRow>
              </div>

              <div className="dream-prefs__group">
                <div className="dream-prefs__group-head">
                  <div className="dream-prefs__group-title">梦境破限</div>
                  <div className="dream-prefs__group-hint">Dream 独立 D0 预设 · 不会写入 Reality prompt · 支持多选叠加</div>
                </div>
                <SettingRow label="破限预设" deferred={isDreamActive}>
                  <JailbreakMultiPicker
                    selected={settings.jailbreak_presets}
                    available={availablePresets}
                    disabled={isDreamActive}
                    onChange={presets => patch({ jailbreak_presets: presets })}
                  />
                </SettingRow>
              </div>

              {dreamState && <ScenarioStateGroup dreamState={dreamState} />}
              {dreamState && <MirrorStateGroup dreamState={dreamState} />}
            </div>
          )}

          {tab === 'world' && settingsLoading && !settings && (
            <div className="dream-prefs__placeholder">正在读取梦境世界设置…</div>
          )}

          {tab === 'color' && (
            <DreamColorTab appearance={appearance} onAppearanceChange={onAppearanceChange} />
          )}

          {tab === 'other' && (
            <div className="dream-prefs__placeholder" style={{ fontStyle: 'italic' }}>
              未完待续
            </div>
          )}

        </div>
      </section>
    </div>
    </>
  );
}
