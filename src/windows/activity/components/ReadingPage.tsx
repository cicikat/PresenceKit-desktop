import { useState, useEffect, useCallback } from 'react';
import { readingApi, type ReadingState, type ReadingPageResult } from '../../../shared/api/activity-api';

function StatusTag({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <span className="mono" style={{
      display: 'inline-block', padding: '2px 7px',
      fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
      background: ok ? 'oklch(0.38 0.13 145)' : 'var(--ink)',
      color: ok ? 'oklch(0.97 0.04 145)' : 'var(--paper)',
      borderRadius: 3, textTransform: 'uppercase',
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
        padding: '7px 14px', borderRadius: 5,
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

export function ReadingPage() {
  const [state, setState] = useState<ReadingState | null>(null);
  const [page, setPage] = useState<ReadingPageResult | null>(null);
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (e) {
      // no active session is normal
      setState(null);
    }
  }, []);

  useEffect(() => { refreshState(); }, [refreshState]);

  const handleStart = async () => {
    if (!filePath.trim()) return;
    setLoading(true); setError(null);
    try {
      await readingApi.start(filePath.trim());
      await refreshState();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
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
      setState(null); setPage(null); setFilePath('');
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
          border: '1px solid oklch(0.80 0.10 20)', borderRadius: 5,
          fontSize: 11, color: 'oklch(0.40 0.14 20)', letterSpacing: 0.5,
        }}>
          {error}
        </div>
      )}

      {!isActive ? (
        /* ── start reading ── */
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          maxWidth: 520,
          padding: 20, background: 'var(--paper-2)',
          border: '1px solid var(--paper-edge)', borderRadius: 8,
        }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--ink-3)', fontWeight: 600 }}>
            选择文件
          </div>
          <input
            type="text"
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleStart(); }}
            placeholder="文件路径（PDF / TXT），例如 C:\books\sample.pdf"
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              padding: '8px 10px', borderRadius: 5,
              background: 'var(--paper)', color: 'var(--ink)',
              border: '1px solid var(--paper-edge)',
              outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="solid" onClick={handleStart} disabled={loading || !filePath.trim()}>
              {loading ? '加载中…' : '开始阅读'}
            </Btn>
          </div>
        </div>
      ) : (
        /* ── active session ── */
        <>
          {/* session info */}
          <div style={{
            display: 'flex', gap: 16, alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 6,
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
            padding: '20px 24px',
            background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 8,
            overflowY: 'auto',
            lineHeight: 1.85, fontSize: 14.5,
            fontFamily: 'var(--font-serif)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            color: 'var(--ink)',
          }}>
            {page ? page.text : (
              <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>加载页面内容…</span>
            )}
          </div>

          {/* navigation */}
          <div style={{ display: 'flex', gap: 10, paddingBottom: 4 }}>
            <Btn onClick={() => handleTurnPage('prev')} disabled={loading || (state?.current_page ?? 1) <= 1}>
              ← 上一页
            </Btn>
            <Btn onClick={() => handleTurnPage('next')} disabled={loading || (state?.current_page ?? 0) >= (state?.total_pages ?? 0)}>
              下一页 →
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}
