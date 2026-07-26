import { useCallback, useEffect, useRef, useState } from 'react';
import { getCharacterAvatar, getPromptAssets, patchPromptAssets, deleteCharacterAvatar, uploadCharacterAvatar } from '../../../../shared/api/backend';
import type { PromptAssetsPatch, PromptAssetsResponse } from '../../../../shared/api/types';
import { updateActiveCharacterFromAssets } from '../../../../shared/activeCharacter';
import { getLoreEntries, addLoreEntry, updateLoreEntry, deleteLoreEntry, getJailbreakEntries, addJailbreakEntry, updateJailbreakEntry, deleteJailbreakEntry, type JailbreakEntry, type LoreEntry } from '../../../../shared/api/entries';
import { EntryManager, type EntryManagerCallbacks, type EntryManagerSchema, type ManagedEntry } from '../EntryManager';
import { AvatarCropper } from '../AvatarCropper';
import { prefActionButtonStyle, prefSelectStyle } from './PrefAtoms';
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

export function PromptAssetsSettings({ onCharacterAvatarChange, onCharacterSwitched }: { onCharacterAvatarChange?: (dataUrl: string | null) => void; onCharacterSwitched?: () => void }) {
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
      updateActiveCharacterFromAssets(result);
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
        updateActiveCharacterFromAssets({ ...assets, active: response.active });
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
