import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  readingApi,
  type ReadingState, type ReadingPageResult, type ReadingLibraryBook,
} from '../../../shared/api/activity-api';
import { ActivityCompanionPanel } from './ActivityCompanionPanel';
import { getUIPref, onUIPrefChange } from '../../../shared/uiPreferences';

function StatusTag({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <span className="mono" style={{
      display: 'inline-block', padding: '2px 7px',
      fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
      background: ok ? 'oklch(0.38 0.13 145)' : 'var(--ink)',
      color: ok ? 'oklch(0.97 0.04 145)' : 'var(--paper)',
      borderRadius: 'var(--radius-xs)', textTransform: 'uppercase',
    }}>{text}</span>
  );
}

function Btn({ children, onClick, variant = 'ghost', disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'inherit', fontSize: 12.5,
        padding: '7px 14px', borderRadius: 'var(--radius-sm)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: 0.3, transition: 'background 0.15s',
        opacity: disabled ? 0.45 : 1,
        border: variant === 'solid'
          ? '1px solid var(--ink)'
          : variant === 'accent'
            ? '1px solid var(--accent)'
            : '1px solid var(--paper-edge)',
        background: variant === 'solid'
          ? 'var(--ink)'
          : variant === 'accent'
            ? 'var(--accent)'
            : 'var(--paper-2)',
        color: (variant === 'solid' || variant === 'accent') ? 'var(--paper)' : 'var(--ink)',
        fontWeight: variant === 'ghost' ? 500 : 600,
      }}
    >{children}</button>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function BookListItem({ book, onRead, disabled }: { book: ReadingLibraryBook; onRead: () => void; disabled: boolean }) {
  const [hover, setHover] = useState(false);
  const name = book.filename.replace(/\.pdf$/i, '');
  return (
    <div
      onClick={disabled ? undefined : onRead}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-sm)',
        background: hover ? 'var(--paper-3, var(--paper-edge))' : 'transparent',
        border: '1px solid ' + (hover ? 'var(--accent, var(--paper-edge))' : 'var(--paper-edge)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.12s, border-color 0.12s',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="serif" style={{
          fontSize: 14, fontWeight: 600, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2, letterSpacing: 0.5 }}>
          {formatBytes(book.size_bytes)}
        </div>
      </div>
      <div style={{
        fontSize: 11, color: 'var(--ink-3)', flexShrink: 0,
        fontFamily: 'var(--font-mono)',
      }}>
        阅读 →
      </div>
    </div>
  );
}

export function ReadingPage() {
  const [state, setState] = useState<ReadingState | null>(null);
  const [page, setPage] = useState<ReadingPageResult | null>(null);
  const [books, setBooks] = useState<ReadingLibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingBook, setAddingBook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(() => getUIPref('activity.reading.fontSize', 16));
  const [maxWidth, setMaxWidth] = useState(() => getUIPref('activity.reading.maxWidth', 760));
  const [showDebug, setShowDebug] = useState(() => getUIPref('activity.debug', false));

  useEffect(() => onUIPrefChange(key => {
    if (key === 'activity.reading.fontSize') setFontSize(getUIPref('activity.reading.fontSize', 16));
    if (key === 'activity.reading.maxWidth') setMaxWidth(getUIPref('activity.reading.maxWidth', 760));
    if (key === 'activity.debug') setShowDebug(getUIPref('activity.debug', false));
  }), []);

  const refreshLibrary = useCallback(async () => {
    try {
      const result = await readingApi.library();
      setBooks(result.books);
    } catch {
      // 书库为空或后端未运行时静默
    }
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const s = await readingApi.state();
      setState(s);
      if (s.status === 'active' && s.session_id) {
        const p = await readingApi.page(s.session_id, s.current_page);
        setPage(p);
      } else {
        setPage(null);
      }
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    refreshState();
    refreshLibrary();
  }, [refreshState, refreshLibrary]);

  const handleReadBook = async (book: ReadingLibraryBook) => {
    setLoading(true); setError(null);
    try {
      await readingApi.startFromLibrary(book.book_id);
      await refreshState();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleAddBook = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });
    if (!selected) return;
    const path = typeof selected === 'string' ? selected : selected[0];
    if (!path) return;

    setAddingBook(true); setError(null);
    try {
      await readingApi.addBook(path);
      await refreshLibrary();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setAddingBook(false);
    }
  };

  const handleTurnPage = async (dir: 'next' | 'prev') => {
    setLoading(true); setError(null);
    try {
      const p = await readingApi.turnPage(state!.session_id!, dir);
      setPage(p);
      setState(s => s ? { ...s, current_page: p.page } : s);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    setLoading(true); setError(null);
    try {
      await readingApi.close(state!.session_id!);
      setState(null); setPage(null);
      await refreshLibrary();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const isActive = state?.status === 'active' && !!state.session_id;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '28px 32px', gap: 20, overflowY: 'auto',
      background: 'var(--paper)', color: 'var(--ink)',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
          一起看书
        </div>
        {state?.status && (
          <StatusTag text={state.status} ok={isActive} />
        )}
      </div>

      {/* error */}
      {error && (
        <div className="mono" style={{
          padding: '8px 12px', background: 'oklch(0.95 0.05 20)',
          border: '1px solid oklch(0.80 0.10 20)', borderRadius: 'var(--radius-sm)',
          fontSize: 11, color: 'oklch(0.40 0.14 20)', letterSpacing: 0.5,
        }}>
          {error}
        </div>
      )}

      {!isActive ? (
        /* ── 书库选书 ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          {/* 书库列表 */}
          <div style={{
            padding: 16,
            background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600 }}>
                书库
              </div>
              <Btn onClick={handleAddBook} disabled={addingBook || loading}>
                {addingBook ? '添加中…' : '+ 添加书籍'}
              </Btn>
            </div>

            {books.length === 0 ? (
              <div className="serif" style={{
                padding: '20px 0', textAlign: 'center',
                fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic',
              }}>
                书库还是空的，先添加一本 PDF 吧。
              </div>
            ) : (
              books.map(book => (
                <BookListItem
                  key={book.book_id}
                  book={book}
                  onRead={() => handleReadBook(book)}
                  disabled={loading}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* ── 阅读中 ── */
        <>
          {/* session info */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="serif" style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {state?.title ?? '—'}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 0.8, marginTop: 2 }}>
                第 {state?.current_page ?? '?'} 页 / 共 {state?.total_pages ?? '?'} 页
              </div>
            </div>
            <Btn onClick={handleClose} disabled={loading}>关闭阅读</Btn>
          </div>

          {/* page content */}
          <div style={{
            flex: 1, minHeight: 0,
            background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
            overflowY: 'auto',
          }}>
            <div style={{
              maxWidth: maxWidth, margin: '0 auto',
              padding: '20px 24px',
              lineHeight: 1.85, fontSize: fontSize,
              fontFamily: 'var(--font-serif)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              color: 'var(--ink)',
            }}>
              {page ? page.text : (
                <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>加载页面内容…</span>
              )}
            </div>
          </div>

          {showDebug && (
            <div className="mono" style={{
              padding: '8px 12px', background: 'var(--paper-2)',
              border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
              fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 0.5,
            }}>
              session_id: {state?.session_id ?? '—'} · page: {state?.current_page ?? '—'} / {state?.total_pages ?? '—'}
            </div>
          )}

          {/* navigation */}
          <div style={{ display: 'flex', gap: 10, paddingBottom: 4 }}>
            <Btn onClick={() => handleTurnPage('prev')} disabled={loading || (state?.current_page ?? 1) <= 1}>
              ← 上一页
            </Btn>
            <Btn onClick={() => handleTurnPage('next')} disabled={loading || (state?.current_page ?? 0) >= (state?.total_pages ?? 0)}>
              下一页 →
            </Btn>
          </div>

          <ActivityCompanionPanel
            activityId="reading"
            sessionId={state?.session_id ?? null}
            sessionActive={isActive}
            sessionFinished={false}
          />
        </>
      )}
    </div>
  );
}
