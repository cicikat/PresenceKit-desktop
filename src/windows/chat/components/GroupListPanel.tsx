/* ============================================================
 * GroupListPanel — 群列表 + 建群入口 (spec-10 §4/§5)
 * 角色花名册从 /settings/prompt-assets characters 多选；
 * N/M 设置；domain 固定 reality。
 * ============================================================ */

import { useState, useEffect, useCallback } from 'react';
import { listGroups, createGroup, getPromptAssets, deleteGroup } from '../../../shared/api/backend';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import type { GroupSummary, PromptAssetCharacter } from '../../../shared/api/types';

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Btn({
  onClick, disabled, children, primary, danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--paper-edge)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
        background: primary ? 'var(--ink)' : danger ? 'oklch(0.55 0.16 25)' : 'var(--paper-2)',
        color: primary || danger ? 'var(--paper)' : 'var(--ink-2)',
        transition: 'opacity 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ── Create-group form ─────────────────────────────────────────────────────────

function CreateGroupForm({
  characters,
  onCreated,
  onCancel,
}: {
  characters: PromptAssetCharacter[];
  onCreated: (groupId: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [minR, setMinR] = useState(1);
  const [maxR, setMaxR] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreate = async () => {
    if (selected.length < 1) { setError('至少选择 1 位角色'); return; }
    setSaving(true);
    setError(null);
    try {
      const detail = await createGroup(selected, 'reality', {
        min_responders: minR,
        max_responders: Math.max(minR, maxR),
      });
      onCreated(detail.group_id);
    } catch (err) {
      setError(`建群失败：${String(err)}`);
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>选择成员</div>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 10 }}>
          多选 · 已选 {selected.length} 位
        </div>
        {characters.length === 0 ? (
          <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic' }}>
            暂无可用角色。请先在「偏好 → 世界」中配置角色卡。
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {characters.map(c => (
              <label
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${selected.includes(c.id) ? 'oklch(0.55 0.13 210)' : 'var(--paper-edge)'}`,
                  background: selected.includes(c.id) ? 'oklch(0.95 0.04 210 / 0.4)' : 'var(--paper-2)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  style={{ accentColor: 'oklch(0.55 0.13 210)', width: 14, height: 14 }}
                />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--font-serif)' }}>
                  {c.label}
                </span>
                <span className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-4)', letterSpacing: 0.8 }}>
                  {c.id}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>
            N 最少回应人数 <span className="mono" style={{ fontWeight: 700, color: 'oklch(0.50 0.13 210)' }}>{minR}</span>
          </div>
          <input
            type="range" min={1} max={Math.min(selected.length || 1, 6)} value={minR}
            onChange={e => { const v = Number(e.target.value); setMinR(v); if (maxR < v) setMaxR(v); }}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>
            M 最多回应人数 <span className="mono" style={{ fontWeight: 700, color: 'oklch(0.50 0.13 210)' }}>{Math.max(minR, maxR)}</span>
          </div>
          <input
            type="range" min={minR} max={Math.min(selected.length || 1, 6)} value={Math.max(minR, maxR)}
            onChange={e => setMaxR(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-3)', letterSpacing: 0.8 }}>
          Domain: reality · 每轮 {minR}–{Math.max(minR, maxR)} 位成员回应
        </div>
      </div>

      {error && (
        <div className="mono" style={{ color: 'var(--danger)', fontSize: chatThemeFontSize(10), letterSpacing: 0.8 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={onCancel} disabled={saving}>取消</Btn>
        <Btn primary onClick={() => void handleCreate()} disabled={saving || selected.length === 0}>
          {saving ? '建群中…' : '确认建群'}
        </Btn>
      </div>
    </div>
  );
}

// ── GroupListPanel ────────────────────────────────────────────────────────────

export function GroupListPanel({
  onSelectGroup, onBack,
}: {
  onSelectGroup: (groupId: string) => void;
  onBack: () => void;
}) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [characters, setCharacters] = useState<PromptAssetCharacter[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listGroups();
      setGroups(list);
    } catch (err) {
      setError(`加载群列表失败：${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = async () => {
    setShowCreate(true);
    setCharsLoading(true);
    try {
      const assets = await getPromptAssets();
      setCharacters(assets.characters);
    } catch {
      setCharacters([]);
    } finally {
      setCharsLoading(false);
    }
  };

  const handleCreated = (groupId: string) => {
    setShowCreate(false);
    onSelectGroup(groupId);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`删除「${name}」？聊天记录一并清除，不可恢复。`)) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteGroup(id);
      await load();
    } catch (err) {
      setError(`删除失败：${String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper)' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--paper-edge)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--paper-2)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          title="关闭"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', fontSize: 20, padding: '0 4px', lineHeight: 1,
            display: 'flex', alignItems: 'center',
          }}
        >‹</button>
        <div className="serif" style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>群聊</div>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-3)', letterSpacing: 1.3 }}>GROUP CHAT</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {showCreate ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <button onClick={() => setShowCreate(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 14, padding: 0 }}>‹</button>
              <div className="serif" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>新建群聊</div>
            </div>
            {charsLoading ? (
              <div className="mono" style={{ color: 'var(--ink-4)', fontSize: 11, letterSpacing: 1.2 }}>正在读取角色列表…</div>
            ) : (
              <CreateGroupForm
                characters={characters}
                onCreated={handleCreated}
                onCancel={() => setShowCreate(false)}
              />
            )}
          </>
        ) : (
          <>
            {/* New group button */}
            <button
              onClick={() => void openCreate()}
              style={{
                width: '100%', padding: '11px 14px', marginBottom: 12,
                borderRadius: 'var(--radius-md)', border: '1px dashed oklch(0.55 0.13 210)',
                background: 'oklch(0.95 0.03 210 / 0.3)',
                color: 'oklch(0.40 0.13 210)', cursor: 'pointer',
                fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 400 }}>+</span>
              新建群聊
            </button>

            {loading && (
              <div className="mono" style={{ color: 'var(--ink-4)', fontSize: 11, letterSpacing: 1.2, textAlign: 'center', paddingTop: 20 }}>
                加载中…
              </div>
            )}

            {error && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="mono" style={{ color: 'var(--danger)', fontSize: chatThemeFontSize(10), letterSpacing: 0.8 }}>{error}</div>
                <Btn onClick={() => void load()}>重试</Btn>
              </div>
            )}

            {!loading && !error && groups.length === 0 && (
              <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingTop: 20 }}>
                还没有群聊。点击上方「新建群聊」开始。
              </div>
            )}

            {groups.map(g => (
              <div
                key={g.group_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectGroup(g.group_id)}
                onKeyDown={e => { if (e.key === 'Enter') onSelectGroup(g.group_id); }}
                style={{
                  width: '100%', padding: '12px 14px', marginBottom: 6,
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--paper-edge)',
                  background: 'var(--paper-2)',
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.12s',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--paper-2)')}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div className="serif" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {g.title || g.group_id}
                  </div>
                  <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-3)', letterSpacing: 0.8 }}>
                    {g.roster.map(r => r.label).join(' · ')}
                  </div>
                  <div className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-4)', letterSpacing: 0.6 }}>
                    {g.domain.toUpperCase()} · {g.group_id}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); void handleDelete(g.group_id, g.title || g.group_id); }}
                  disabled={deletingId === g.group_id}
                  style={{
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid transparent',
                    cursor: deletingId === g.group_id ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', fontSize: 11, fontWeight: 500,
                    opacity: deletingId === g.group_id ? 0.5 : 0.75,
                    background: 'oklch(0.55 0.16 25)', color: 'var(--paper)',
                    flexShrink: 0, transition: 'opacity 0.15s',
                  }}
                >
                  {deletingId === g.group_id ? '…' : '删除'}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
