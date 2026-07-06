import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadUserPresets,
  saveUserPresets,
  createPresetFromBase,
  exportPreset,
  importPresetFromJson,
  type UserThemePreset,
} from '../../../shared/theme/userPresets';
import {
  getDayNight,
  setSlotTheme,
  invalidateThemeCache,
  listThemes,
  subscribe as subscribeTheme,
} from '../../../shared/theme/registry';
import { applyTheme } from '../../../shared/theme/loader';
import { PAPER_THEME, DARK_THEME } from '../../../shared/theme/builtinThemes';
import { suspendMoodOverlay, resumeMoodOverlay } from '../../../shared/theme/moodReactive';

// ── Token groups shown in the editor ────────────────────────────────────────

const CORE_GROUPS: Array<{ label: string; tokens: string[] }> = [
  { label: '主页面背景', tokens: ['--paper', '--paper-2', '--paper-3', '--paper-edge'] },
  { label: '正文文字', tokens: ['--ink', '--ink-2', '--ink-3', '--ink-4'] },
  { label: '导航主题绿', tokens: ['--forest', '--forest-1', '--forest-2', '--forest-3', '--forest-line', '--on-forest', '--on-forest-2'] },
  { label: '强调色', tokens: ['--accent', '--accent-2', '--accent-3', '--danger'] },
];

// ── Color conversion helper ──────────────────────────────────────────────────

function cssColorToHex(cssValue: string): string {
  try {
    const el = document.createElement('div');
    el.style.color = cssValue;
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = computed.match(/\d+/g);
    if (!m || m.length < 3) return '#888888';
    return '#' +
      parseInt(m[0]).toString(16).padStart(2, '0') +
      parseInt(m[1]).toString(16).padStart(2, '0') +
      parseInt(m[2]).toString(16).padStart(2, '0');
  } catch {
    return '#888888';
  }
}

function hexToLabel(hex: string): string {
  return hex.toUpperCase();
}

// ── Token row component ──────────────────────────────────────────────────────

function TokenRow({
  token,
  value,
  onChange,
}: {
  token: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const hex = cssColorToHex(value || '#888888');
  const shortName = token.replace(/^--/, '');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <input
        type="color"
        value={hex}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 28, height: 28, padding: 2, border: '1px solid var(--paper-edge)',
          borderRadius: 4, cursor: 'pointer', background: 'none',
        }}
        title={token}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--font-mono, monospace)' }}>
          {shortName}
        </div>
      </div>
      <div style={{
        fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: 0.5,
      }}>
        {hexToLabel(hex)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChatColorPage() {
  const [editSlot, setEditSlot] = useState<'day' | 'night'>(() => getDayNight().active);
  const [presets, setPresets] = useState<UserThemePreset[]>(() => loadUserPresets());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [renameMode, setRenameMode] = useState(false);
  const [renameName, setRenameName] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const originalThemeRef = useRef<string>(getDayNight().active === 'day' ? getDayNight().day : getDayNight().night);

  const selectedPreset = presets.find(p => p.id === selectedId) ?? null;

  // Explicit slot switch (day/night toggle buttons) — resets selection since the
  // user hasn't picked anything for the new slot yet. Deliberately NOT a useEffect
  // keyed on `editSlot`: selecting a preset from the other slot (see handleSelectPreset)
  // also changes `editSlot`, and that path must NOT wipe the selection it just made.
  const switchSlot = (slot: 'day' | 'night') => {
    if (slot === editSlot) return;
    const dn = getDayNight();
    originalThemeRef.current = slot === 'day' ? dn.day : dn.night;
    setEditSlot(slot);
    setSelectedId(null);
    setTokens({});
    setDirty(false);
  };

  // Subscribe to registry changes (e.g. day/night auto-switch timer, another window's
  // edits). This refreshes the preset list only — it must not touch selectedId/tokens/
  // dirty, otherwise an unrelated theme event silently rolls back an in-progress edit.
  useEffect(() => subscribeTheme(() => {
    setPresets(loadUserPresets());
  }), []);

  // Suspend the mood-reactive overlay while this page can edit the exact tokens
  // it would otherwise overwrite a few seconds later; restore on close.
  useEffect(() => {
    suspendMoodOverlay();
    return () => resumeMoodOverlay();
  }, []);

  // Load token values when the *selected id* changes (not the preset object reference,
  // which gets rebuilt — and thus reference-changes — every time `presets` reloads).
  useEffect(() => {
    if (!selectedPreset) { setTokens({}); return; }
    setTokens({ ...selectedPreset.tokens as Record<string, string> });
    setDirty(false);
    // Live-preview the selected preset
    applyTheme({
      id: selectedPreset.id,
      name: selectedPreset.name,
      base: selectedPreset.base,
      tokens: selectedPreset.tokens,
    });
  }, [selectedId]);

  // Live-preview token edits as user picks colors
  const handleTokenChange = useCallback((token: string, hex: string) => {
    setTokens(prev => {
      const next = { ...prev, [token]: hex };
      // Apply just this one token immediately
      document.documentElement.style.setProperty(token, hex);
      return next;
    });
    setDirty(true);
  }, []);

  // Restore the registered theme when component unmounts (panel closed without saving)
  useEffect(() => {
    return () => {
      const dn = getDayNight();
      const activeId = dn.active === 'day' ? dn.day : dn.night;
      listThemes().then(all => {
        const record = all.find(r => r.manifest.id === activeId);
        if (record) applyTheme(record.manifest);
      }).catch(() => {});
    };
  }, []);

  // ── Preset actions ──────────────────────────────────────────────────────────

  const createNew = () => {
    const base = editSlot === 'day' ? 'light' : 'dark';
    const name = `自定义 ${presets.length + 1}`;
    const preset = createPresetFromBase(name, base);
    const next = [...presets, preset];
    setPresets(next);
    saveUserPresets(next);
    invalidateThemeCache();
    setSelectedId(preset.id);
  };

  const saveChanges = async () => {
    if (!selectedPreset || !dirty) return;
    const updated: UserThemePreset = { ...selectedPreset, tokens };
    const next = presets.map(p => p.id === updated.id ? updated : p);
    setPresets(next);
    saveUserPresets(next);
    invalidateThemeCache();
    // Register and apply to the slot
    await setSlotTheme(editSlot, updated.id);
    setDirty(false);
  };

  const deletePreset = () => {
    if (!selectedPreset) return;
    const next = presets.filter(p => p.id !== selectedPreset.id);
    setPresets(next);
    saveUserPresets(next);
    invalidateThemeCache();
    setSelectedId(null);
    // Restore to built-in base
    const baseId = editSlot === 'day' ? 'paper' : 'dark';
    setSlotTheme(editSlot, baseId).catch(() => {});
  };

  const startRename = () => {
    if (!selectedPreset) return;
    setRenameName(selectedPreset.name);
    setRenameMode(true);
  };

  const confirmRename = () => {
    if (!selectedPreset || !renameName.trim()) { setRenameMode(false); return; }
    const updated = { ...selectedPreset, name: renameName.trim() };
    const next = presets.map(p => p.id === updated.id ? updated : p);
    setPresets(next);
    saveUserPresets(next);
    invalidateThemeCache();
    setRenameMode(false);
  };

  const handleExport = async () => {
    if (!selectedPreset) return;
    try {
      await exportPreset(selectedPreset);
    } catch (e) {
      console.warn('[theme] 导出失败:', e);
    }
  };

  const handleImport = () => { importRef.current?.click(); };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const imported = importPresetFromJson(ev.target?.result as string);
      if (!imported) { alert('无效的主题文件'); return; }
      const next = [...presets, imported];
      setPresets(next);
      saveUserPresets(next);
      invalidateThemeCache();
      setSelectedId(imported.id);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyToSlot = () => {
    if (!selectedPreset) return;
    setSlotTheme(editSlot, selectedPreset.id).catch(() => {});
  };

  // ── Styles ──────────────────────────────────────────────────────────────────

  const btnStyle: React.CSSProperties = {
    padding: '5px 10px', border: '1px solid var(--paper-edge)',
    borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)',
    color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 11,
    cursor: 'pointer', whiteSpace: 'nowrap',
  };
  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--accent)', color: 'var(--on-forest)',
    border: '1px solid transparent', fontWeight: 600,
  };

  const handleSelectPreset = (id: string | null) => {
    setSelectedId(id);
    if (!id) return;
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    const wantSlot: 'day' | 'night' = preset.base === 'light' ? 'day' : 'night';
    if (wantSlot !== editSlot) {
      const dn = getDayNight();
      originalThemeRef.current = wantSlot === 'day' ? dn.day : dn.night;
      setEditSlot(wantSlot);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Slot switcher */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>编辑槽位：</span>
        {(['day', 'night'] as const).map(slot => (
          <button
            key={slot}
            style={{
              ...btnStyle,
              background: editSlot === slot ? 'var(--forest)' : 'var(--paper-2)',
              color: editSlot === slot ? 'var(--on-forest)' : 'var(--ink-2)',
              borderColor: editSlot === slot ? 'transparent' : undefined,
              fontWeight: editSlot === slot ? 600 : 400,
            }}
            onClick={() => switchSlot(slot)}
          >
            {slot === 'day' ? '☀ 日间' : '☾ 夜间'}
          </button>
        ))}
      </div>

      {/* Preset bar */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedId ?? ''}
            onChange={e => handleSelectPreset(e.target.value || null)}
            style={{
              flex: '1 1 140px', padding: '6px 9px',
              border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
              background: 'var(--paper-2)', color: 'var(--ink-2)',
              fontFamily: 'inherit', fontSize: 11,
            }}
          >
            <option value="">— 选择自定义预设 —</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>[{p.base === 'light' ? '日' : '夜'}] {p.name}</option>
            ))}
          </select>
          <button style={btnStyle} onClick={createNew}>新建</button>
          <button style={btnStyle} onClick={handleImport}>导入</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>

        {selectedPreset && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {renameMode ? (
              <>
                <input
                  autoFocus
                  value={renameName}
                  onChange={e => setRenameName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenameMode(false); }}
                  style={{
                    padding: '5px 9px', border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-sm)', background: 'var(--paper)',
                    color: 'var(--ink)', fontFamily: 'inherit', fontSize: 11, flex: 1, minWidth: 0,
                  }}
                />
                <button style={btnPrimaryStyle} onClick={confirmRename}>确认</button>
                <button style={btnStyle} onClick={() => setRenameMode(false)}>取消</button>
              </>
            ) : (
              <>
                <button style={btnStyle} onClick={startRename}>重命名</button>
                <button style={btnStyle} onClick={handleExport}>导出 ↓</button>
                <button style={{ ...btnStyle, color: 'var(--danger)' }} onClick={deletePreset}>删除</button>
                <div style={{ flex: 1 }} />
                <button style={dirty ? btnPrimaryStyle : btnStyle} onClick={saveChanges} disabled={!dirty}>
                  {dirty ? '保存修改' : '已保存'}
                </button>
                <button style={btnStyle} onClick={applyToSlot}>
                  应用到{editSlot === 'day' ? '日间' : '夜间'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Color groups */}
      {selectedPreset ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {CORE_GROUPS.map(group => (
            <div key={group.label}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--ink-3)',
                letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4,
              }}>
                {group.label}
              </div>
              {group.tokens.map(token => (
                <TokenRow
                  key={token}
                  token={token}
                  value={tokens[token] ?? ''}
                  onChange={hex => handleTokenChange(token, hex)}
                />
              ))}
            </div>
          ))}
          <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 4, lineHeight: 1.5 }}>
            修改后点「保存修改」并「应用到日/夜间」以生效；未保存时关闭面板会恢复原主题。
          </div>
        </div>
      ) : (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          color: 'var(--ink-4)', fontSize: 12, lineHeight: 1.8,
        }}>
          点击「新建」创建自定义配色预设<br />
          或从下拉框选择已有预设进行编辑
        </div>
      )}
    </div>
  );
}
