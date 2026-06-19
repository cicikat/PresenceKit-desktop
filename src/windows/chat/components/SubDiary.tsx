/* SubDiary — 日记面板 (Phase 2d.2, char-tab) */

import { useState, useEffect, useMemo } from 'react';
import { Tag, Btn } from './UIKit';
import { loadDiaryList, loadDiaryEntry, getPromptAssets } from '../../../shared/api/backend';
import type { DiaryListResponse, DiaryListItem, DiaryEntry } from '../../../shared/api/types';
import type { PromptAssetCharacter } from '../../../shared/api/types';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { chatThemeFontSize } from '../../../shared/chatAppearance';

/* emotion → hue 映射，emotion 为 null 时整个标签不渲染 */
const EMOTION_HUE: Record<string, number> = {
  '日常': 145,
  '心情': 85,
  '私语': 295,
  '梦境': 230,
  '杂记': 50,
};
function emotionHue(emotion: string): number {
  return EMOTION_HUE[emotion] ?? 168;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

/* ── 正文简化渲染 ── */
function renderBody(body: string): React.ReactNode[] {
  const segments = body.split(/\n\n+/);
  const nodes: React.ReactNode[] = [];
  segments.forEach((seg, i) => {
    const trimmed = seg.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('## ')) {
      nodes.push(
        <h3 key={i} style={{
          fontSize: chatThemeFontSize(15), fontWeight: 600, margin: '1.2em 0 0.4em',
          color: 'var(--ink)', letterSpacing: -0.1,
        }}>
          {trimmed.slice(3)}
        </h3>
      );
      return;
    }
    const lines = trimmed.split('\n');
    nodes.push(
      <p key={i} style={{ margin: '0 0 1em', color: 'var(--ink)', lineHeight: 1.85 }}>
        {lines.map((line, j) => (
          <span key={j}>
            {line}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
  return nodes;
}

/* ── 日记详情浮窗内容 ── */
export function DiaryDetailPane({ date, charId }: { date: string; charId?: string }) {
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntry(null);
    setError(null);
    loadDiaryEntry(date, charId)
      .then(setEntry)
      .catch((e: any) => setError(String(e)));
  }, [date, charId]);

  if (error) {
    return (
      <div style={{ padding: 32, color: 'var(--ink-2)', fontSize: chatThemeFontSize(13), fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
        加载失败：{error}
      </div>
    );
  }
  if (!entry) {
    return (
      <div style={{ padding: 32, color: 'var(--ink-2)', fontSize: chatThemeFontSize(12), fontFamily: 'var(--font-mono)', letterSpacing: 1.2 }}>
        加载中…
      </div>
    );
  }

  return (
    <div style={{ padding: '26px 32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {entry.emotion !== null && (
          <Tag hue={emotionHue(entry.emotion)}>{entry.emotion}</Tag>
        )}
        <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-3)', letterSpacing: 1.2 }}>
          {formatDate(entry.date)}
        </span>
      </div>
      <h1 className="serif" style={{
        fontSize: chatThemeFontSize(28), fontWeight: 600, letterSpacing: -0.5,
        margin: '4px 0 20px', color: 'var(--ink)',
      }}>
        {entry.title}
      </h1>
      <div style={{ height: 1, background: 'var(--paper-edge)', marginBottom: 20 }} />
      <div className="serif" style={{ fontSize: chatThemeFontSize(16), lineHeight: 1.85, color: 'var(--ink)', fontStyle: 'normal' }}>
        {renderBody(entry.body)}
      </div>
    </div>
  );
}

/* ── 列表 entry 行 ── */
function DiaryListEntry({ item, onClick }: { item: DiaryListItem; onClick: () => void }) {
  const hue = item.emotion !== null ? emotionHue(item.emotion) : 168;
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 16px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        borderLeft: '2px solid transparent', transition: 'background 0.15s, border-color 0.15s',
        fontFamily: 'inherit', color: 'inherit',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'oklch(0.27 0.04 168)';
        (e.currentTarget as HTMLButtonElement).style.borderLeftColor = `oklch(0.62 0.13 ${hue})`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.borderLeftColor = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), letterSpacing: 1.2, color: 'var(--on-forest-2)' }}>
          {formatDate(item.date)}
        </span>
        {item.emotion !== null && (
          <Tag hue={emotionHue(item.emotion)} size="sm">{item.emotion}</Tag>
        )}
      </div>
      <div className="serif" style={{
        fontSize: chatThemeFontSize(14), fontWeight: 600, color: 'var(--on-forest)', marginBottom: 4, letterSpacing: -0.2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {item.title}
      </div>
      <div style={{
        fontSize: chatThemeFontSize(12), color: 'var(--on-forest-2)', lineHeight: 1.5,
        fontFamily: 'var(--font-serif)', fontStyle: 'italic',
      }}>
        —
      </div>
    </button>
  );
}

/* ── SubDiary 主组件 ── */
export function SubDiary() {
  const [characters, setCharacters] = useState<PromptAssetCharacter[]>([]);
  const [activeCharId, setActiveCharId] = useState<string>('');
  const [data, setData] = useState<DiaryListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* 拉角色列表，初始选 active 角色 */
  useEffect(() => {
    getPromptAssets()
      .then(assets => {
        setCharacters(assets.characters);
        const active = assets.active?.active_character;
        setActiveCharId(active && active.length > 0 ? active : (assets.characters[0]?.id ?? ''));
      })
      .catch(() => {
        /* 角色列表加载失败时静默降级，使用 active 字符 */
      });
  }, []);

  const fetchList = async (charId: string) => {
    setLoading(true);
    try {
      const result = await loadDiaryList(charId || undefined);
      setData(result);
      setError(null);
    } catch (e: any) {
      console.error('loadDiaryList failed:', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList(activeCharId);
  }, [activeCharId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.entries;
  }, [data]);

  function openEntry(item: DiaryListItem) {
    const charId = activeCharId || '';
    const label = `diary-detail-${charId}-${item.date}`;
    const params = new URLSearchParams({ window: 'diary-detail', date: item.date, char: charId });
    const existing = WebviewWindow.getByLabel(label);
    if (existing) {
      existing.then(w => w?.setFocus()).catch(() => {});
      return;
    }
    new WebviewWindow(label, {
      url: `index.html?${params.toString()}`,
      title: `${formatDate(item.date)} · ${item.title}`,
      width: 520,
      height: 600,
      decorations: false,
      resizable: true,
      focus: true,
    });
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(11), color: 'var(--on-forest-2)', letterSpacing: 1.2 }}>加载中…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
      }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(11), color: 'var(--on-forest-2)', letterSpacing: 1.2, textAlign: 'center' }}>
          {error || '无数据'}
        </span>
        <Btn onClick={() => fetchList(activeCharId)}>重试</Btn>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 角色分类栏 */}
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--forest-line)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {characters.map(char => (
            <button key={char.id} onClick={() => setActiveCharId(char.id)} style={{
              padding: '3px 9px', borderRadius: 3, fontSize: chatThemeFontSize(11),
              background: activeCharId === char.id ? 'var(--on-forest)' : 'transparent',
              color: activeCharId === char.id ? 'var(--forest)' : 'var(--on-forest-2)',
              border: activeCharId === char.id ? '1px solid var(--on-forest)' : '1px solid var(--forest-line)',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: activeCharId === char.id ? 600 : 500,
              transition: 'all 0.15s',
            }}>{char.label || char.id}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => fetchList(activeCharId)}
            title="刷新"
            style={{
              width: 22, height: 22, borderRadius: 3,
              background: 'transparent', border: '1px solid var(--forest-line)',
              color: 'var(--on-forest-2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: chatThemeFontSize(12), fontFamily: 'inherit',
            }}
          >↻</button>
        </div>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 6 }}>
          {filtered.length} ENTRIES · {activeCharId.toUpperCase() || 'ALL'}
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', padding: 24,
          }}>
            <div className="serif" style={{ fontSize: chatThemeFontSize(14), color: 'var(--on-forest-2)', fontStyle: 'italic' }}>
              他还没开始写日记。
            </div>
          </div>
        ) : (
          filtered.map(item => (
            <DiaryListEntry key={item.date} item={item} onClick={() => openEntry(item)} />
          ))
        )}
      </div>
    </div>
  );
}
