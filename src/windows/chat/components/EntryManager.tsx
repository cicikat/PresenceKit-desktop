/* ============================================================
 * EntryManager — 通用条目管理组件（世界书 / 破限共用）
 * 按 id 增删改查 / 启停，差异通过 schema props 配置。
 * ============================================================ */

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';

// ── Field schema ──────────────────────────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  options?: { value: string | number; label: string }[];
  default: string | number | boolean;
  placeholder?: string;
}

export interface EntryManagerSchema {
  /** Displayed in list as primary title (e.g. "keyword" or "title") */
  titleField: string;
  /** Additional fields shown in the edit form (besides enabled + content) */
  extraFields: FieldDef[];
}

// ── Generic entry shape ───────────────────────────────────────────────────────

export interface ManagedEntry {
  id: string;
  content: string;
  enabled: boolean;
  [key: string]: unknown;
}

// ── API callbacks ─────────────────────────────────────────────────────────────

export interface EntryManagerCallbacks {
  load: () => Promise<ManagedEntry[]>;
  add: (entry: Omit<ManagedEntry, 'id'>) => Promise<void>;
  update: (id: string, entry: Omit<ManagedEntry, 'id'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EntryManager({
  schema,
  callbacks,
}: {
  schema: EntryManagerSchema;
  callbacks: EntryManagerCallbacks;
}) {
  const [entries, setEntries] = useState<ManagedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // null = new
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await callbacks.load());
    } catch (e) {
      setError(`读取失败：${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [callbacks]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openNew = () => {
    const defaults: Record<string, unknown> = { content: '', enabled: true };
    for (const f of schema.extraFields) defaults[f.key] = f.default;
    setForm(defaults);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (entry: ManagedEntry) => {
    setForm({ ...entry });
    setEditingId(entry.id);
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setSaving(false); };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { id: _id, ...rest } = form as ManagedEntry;
      if (editingId === null) {
        await callbacks.add(rest as Omit<ManagedEntry, 'id'>);
      } else {
        await callbacks.update(editingId, rest as Omit<ManagedEntry, 'id'>);
      }
      closeForm();
      await refresh();
    } catch (e) {
      setError(`保存失败：${String(e)}`);
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await callbacks.remove(id);
      await refresh();
    } catch (e) {
      setError(`删除失败：${String(e)}`);
    }
  };

  const setField = (key: string, value: unknown) =>
    setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => void refresh()} style={ghostBtn} disabled={loading}>刷新</button>
        <button onClick={openNew} style={primaryBtn}>＋ 新增</button>
        {error && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 0.7 }}>{error}</span>
        )}
      </div>

      {/* Entry list */}
      {loading ? (
        <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>加载中…</div>
      ) : entries.length === 0 ? (
        <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>暂无条目，点击「新增」添加第一条。</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {entries.map(entry => {
            const title = String(entry[schema.titleField] ?? entry.id);
            const displayTitle = Array.isArray(entry[schema.titleField])
              ? (entry[schema.titleField] as string[]).join(', ')
              : title;
            return (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--paper-edge)', background: 'var(--paper-2)',
              }}>
                <button
                  onClick={() => handleToggle(entry)}
                  title={entry.enabled ? '已启用（点击禁用）' : '已禁用（点击启用）'}
                  style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0, border: 'none',
                    cursor: 'pointer', padding: 0,
                    background: entry.enabled ? 'var(--accent-3)' : 'var(--paper-3)',
                    boxShadow: entry.enabled ? '0 0 0 2px var(--accent-3)' : '0 0 0 2px var(--paper-edge)',
                  }}
                />
                <span className="mono" style={{ flex: 1, fontSize: 11, color: 'var(--ink-2)', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayTitle}
                </span>
                <button onClick={() => openEdit(entry)} style={ghostBtnSm}>编辑</button>
                <button onClick={() => void handleDelete(entry.id)} style={dangerBtnSm}>删除</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      {formOpen && (
        <div onClick={closeForm} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'oklch(0.20 0.04 60 / 0.50)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(500px, 92vw)', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            background: 'var(--paper)', border: '1px solid var(--paper-edge)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            boxShadow: '0 24px 60px var(--shadow-rgb-mix)',
          }}>
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid var(--paper-edge)',
              display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-2)',
            }}>
              <div className="serif" style={{ fontWeight: 600, fontSize: 15 }}>
                {editingId === null ? '新增条目' : '编辑条目'}
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={closeForm} style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 18, padding: 0 }}>×</button>
            </div>
            <div style={{ padding: '14px 18px', display: 'grid', gap: 12, overflowY: 'auto', flex: 1 }}>
              {/* Extra fields */}
              {schema.extraFields.map(f => (
                <FormField key={f.key} def={f} value={form[f.key]} onChange={v => setField(f.key, v)} />
              ))}
              {/* Content */}
              <div>
                <label style={labelStyle}>内容</label>
                <textarea
                  value={String(form.content ?? '')}
                  onChange={e => setField('content', e.target.value)}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  placeholder="注入到 prompt 的文本…"
                />
              </div>
              {/* Enabled */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.enabled} onChange={e => setField('enabled', e.target.checked)} />
                启用此条目
              </label>
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--paper-edge)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--paper-2)' }}>
              <button onClick={closeForm} style={ghostBtn}>取消</button>
              <button onClick={() => void handleSave()} disabled={saving} style={primaryBtn}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function handleToggle(entry: ManagedEntry) {
    void (async () => {
      try {
        const { id: _id, ...rest } = entry;
        await callbacks.update(entry.id, { ...rest, enabled: !entry.enabled });
        await refresh();
      } catch (e) {
        setError(`切换失败：${String(e)}`);
      }
    })();
  }
}

// ── Form field renderer ───────────────────────────────────────────────────────

function FormField({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (def.type === 'textarea') {
    return (
      <div>
        <label style={labelStyle}>{def.label}</label>
        <textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder={def.placeholder}
        />
      </div>
    );
  }
  if (def.type === 'number') {
    return (
      <div>
        <label style={labelStyle}>{def.label}</label>
        <input type="number" value={String(value ?? def.default)} onChange={e => onChange(Number(e.target.value))} style={inputStyle} />
      </div>
    );
  }
  if (def.type === 'select') {
    return (
      <div>
        <label style={labelStyle}>{def.label}</label>
        <select value={String(value ?? def.default)} onChange={e => onChange(Number(e.target.value) || e.target.value)} style={inputStyle}>
          {def.options?.map(opt => (
            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label style={labelStyle}>{def.label}</label>
      <input
        type="text"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
        placeholder={def.placeholder}
      />
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)',
  marginBottom: 5, fontFamily: 'var(--font-mono)', letterSpacing: 0.8,
};

const inputStyle: CSSProperties = {
  width: '100%', padding: '6px 9px', boxSizing: 'border-box',
  border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12,
};

const ghostBtn: CSSProperties = {
  padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12,
  background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
  color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
};

const primaryBtn: CSSProperties = {
  ...ghostBtn, background: 'var(--accent-3)', color: 'var(--paper)',
  border: '1px solid transparent',
};

const ghostBtnSm: CSSProperties = {
  ...ghostBtn, padding: '3px 8px', fontSize: 11,
};

const dangerBtnSm: CSSProperties = {
  ...ghostBtnSm, color: 'var(--danger)', borderColor: 'var(--danger)',
};
