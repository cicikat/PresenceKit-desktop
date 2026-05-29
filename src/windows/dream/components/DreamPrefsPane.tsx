import { useState, useEffect, useCallback } from 'react';
import type { DreamState, DreamSettings, MemoryAccess, BoundaryLevel, WorldLayer, LucidMode } from '../../../shared/api/dream-types';
import { dreamGetSettings, dreamUpdateSettings } from '../../../shared/api/dream';

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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface DreamPrefsPaneProps {
  dreamState: DreamState | null;
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
        <span className="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: 'var(--dt-ink-2)' }}>
          {label}
        </span>
        {deferred && (
          <span className="mono" style={{ fontSize: 9, letterSpacing: 0.8, color: 'var(--dt-ink-4)', fontStyle: 'italic' }}>
            下次入梦生效
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: 'var(--dt-ink-4)', lineHeight: 1.4, marginBottom: 2 }}>
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
            padding: '4px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
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

export function DreamPrefsPane({ dreamState, onClose }: DreamPrefsPaneProps) {
  const [settings, setSettings] = useState<DreamSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const isDreamActive = dreamState?.status === 'DREAM_ACTIVE' || dreamState?.status === 'DREAM_EXIT_REQUESTED';

  useEffect(() => {
    dreamGetSettings()
      .then(s => setSettings(s))
      .catch(e => setLoadError(String(e)));
  }, []);

  const patch = useCallback(async (update: Partial<DreamSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...update };
    setSettings(next);
    setSaveState('saving');
    try {
      const resp = await dreamUpdateSettings(update);
      setSettings(resp.settings);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch {
      setSettings(settings);
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2000);
    }
  }, [settings]);

  return (
    <aside
      className="dream-theme__sidebar"
      aria-label="梦境偏好"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.8, color: 'var(--dt-ink)' }}>偏好</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: 1.5, color: 'var(--dt-ink-3)' }}>DREAM SETTINGS</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveState === 'saving' && (
            <span className="mono" style={{ fontSize: 9, color: 'var(--dt-ink-4)', letterSpacing: 0.8 }}>保存中…</span>
          )}
          {saveState === 'saved' && (
            <span className="mono" style={{ fontSize: 9, color: 'var(--dt-flower-bluebell)', letterSpacing: 0.8 }}>已保存</span>
          )}
          {saveState === 'error' && (
            <span className="mono" style={{ fontSize: 9, color: 'oklch(0.6 0.15 20)', letterSpacing: 0.8 }}>保存失败</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭偏好"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--dt-ink-3)', cursor: 'pointer',
              fontSize: 18, lineHeight: 1, padding: 4,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {isDreamActive && (
        <div style={{
          padding: '8px 12px', borderRadius: 10,
          background: 'var(--dt-surface-deep)',
          border: '1px solid var(--dt-border-soft)',
          fontSize: 11, color: 'var(--dt-ink-3)', lineHeight: 1.5,
        }}>
          梦境进行中 — 以下修改将在<strong style={{ color: 'var(--dt-ink-2)' }}>下次入梦</strong>时生效。
        </div>
      )}

      {loadError && (
        <div className="mono" style={{ fontSize: 10, color: 'oklch(0.52 0.14 20)', letterSpacing: 0.8 }}>
          加载失败：{loadError}
        </div>
      )}

      {settings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* memory_access */}
          <SettingRow label="记忆读取" deferred={isDreamActive}>
            <SelectPref<MemoryAccess>
              value={settings.memory_access}
              options={['card_only', 'relationship_summary', 'full_snapshot']}
              labels={MEMORY_ACCESS_LABELS}
              onChange={v => patch({ memory_access: v })}
            />
          </SettingRow>

          {/* boundary_level */}
          <SettingRow label="感知边界" deferred={isDreamActive}>
            <SelectPref<BoundaryLevel>
              value={settings.boundary_level}
              options={['vague', 'body_perceptible', 'numbers_visible', 'threshold_break']}
              labels={BOUNDARY_LEVEL_LABELS}
              onChange={v => patch({ boundary_level: v })}
            />
          </SettingRow>

          {/* world_layer */}
          <SettingRow label="世界层" deferred={isDreamActive}>
            <SelectPref<WorldLayer>
              value={settings.world_layer}
              options={['reality_derived', 'abo', 'vampire', 'cat', 'flower_bud', 'custom']}
              labels={WORLD_LAYER_LABELS}
              onChange={v => patch({ world_layer: v })}
            />
          </SettingRow>

          {/* lucid_mode */}
          <SettingRow label="清明模式" deferred={isDreamActive}>
            <SelectPref<LucidMode>
              value={settings.lucid_mode}
              options={['lucid_shared', 'non_lucid']}
              labels={LUCID_MODE_LABELS}
              onChange={v => patch({ lucid_mode: v })}
            />
          </SettingRow>

          {/* enable_dream_lorebook */}
          <SettingRow label="梦境 Lorebook" deferred={isDreamActive}>
            <button
              type="button"
              onClick={() => patch({ enable_dream_lorebook: !settings.enable_dream_lorebook })}
              style={{
                padding: '4px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
                background: settings.enable_dream_lorebook ? 'var(--dt-flower-dandelion)' : 'var(--dt-surface-2)',
                color: settings.enable_dream_lorebook ? 'var(--dt-ink)' : 'var(--dt-ink-3)',
                border: settings.enable_dream_lorebook ? '1px solid transparent' : '1px solid var(--dt-border-soft)',
                transition: 'background 0.15s, color 0.15s',
                alignSelf: 'flex-start',
              }}
            >
              {settings.enable_dream_lorebook ? '已启用' : '已禁用'}
            </button>
          </SettingRow>
        </div>
      )}
    </aside>
  );
}
