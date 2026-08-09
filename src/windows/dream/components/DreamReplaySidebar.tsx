import { useEffect, useRef, useState } from 'react';
import { dreamListArchive } from '../../../shared/api/dream';
import type { DreamArchiveMetadata } from '../../../shared/api/dream-types';
import { useI18n } from '../../../shared/i18n';

const PAGE_SIZE = 20;
type Translator = (key: never) => string;

function timestampMs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

function formatTimestamp(value: number | null | undefined, language: string, unknown: string): string {
  const ms = timestampMs(value);
  if (ms === null) return unknown;
  return new Intl.DateTimeFormat(language, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms));
}

function formatDuration(
  started: number | null | undefined,
  ended: number | null | undefined,
  minute: string,
  second: string,
  unknown: string,
): string {
  const startMs = timestampMs(started);
  const endMs = timestampMs(ended);
  if (startMs === null || endMs === null || endMs < startMs) return unknown;
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}${minute} ${seconds}${second}` : `${seconds}${second}`;
}

function translateValue(t: Translator, value: string, prefix: string): string {
  return t(`${prefix}.${value}` as never) || value;
}

function summaryText(item: DreamArchiveMetadata, empty: string, legacy: string): string {
  const preview = (item.summary_preview || item.summary_title || '').trim();
  if (preview) return preview;
  return item.summary_present ? empty : legacy;
}

function ReplayMeta({ item, language, t }: {
  item: DreamArchiveMetadata;
  language: string;
  t: Translator;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span className="mono" style={{
        padding: '3px 7px', borderRadius: 999,
        background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border-soft)',
        color: 'var(--dt-ink-2)', fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.8,
      }}>
        {translateValue(t, item.dream_mode, 'dreamReplay.mode')}
      </span>
      <span className="mono" style={{
        padding: '3px 7px', borderRadius: 999,
        border: '1px solid var(--dt-border-soft)', color: 'var(--dt-ink-3)',
        fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.8,
      }}>
        {translateValue(t, item.completion, 'dreamReplay.completion')}
      </span>
      <span className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-3)', letterSpacing: 0.8 }}>
        {item.valid_turns} {t('dreamReplay.turns' as never)} · {formatDuration(
          item.started_at,
          item.ended_at,
          t('dreamReplay.minuteShort' as never),
          t('dreamReplay.secondShort' as never),
          t('dreamReplay.unknown' as never),
        )}
      </span>
      <span className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', letterSpacing: 0.8 }}>
        {t('dreamReplay.role.assistant' as never)} · {item.char_id}
      </span>
      <span className="mono" style={{ fontSize: 'calc(9px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-4)', letterSpacing: 0.8 }}>
        {formatTimestamp(item.started_at, language, t('dreamReplay.unknown' as never))}
      </span>
    </div>
  );
}

export interface DreamReplaySidebarProps {
  selectedDreamId: string | null;
  onSelect: (item: DreamArchiveMetadata) => void;
  onClose: () => void;
}

export function DreamReplaySidebar({ selectedDreamId, onSelect, onClose }: DreamReplaySidebarProps) {
  const { language, t } = useI18n();
  const translate = t as Translator;
  const [items, setItems] = useState<DreamArchiveMetadata[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const requestRef = useRef(0);
  const itemsRef = useRef<DreamArchiveMetadata[]>([]);

  const loadPage = async (append: boolean) => {
    const requestId = ++requestRef.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadingMore(false);
    }
    try {
      const result = await dreamListArchive({
        offset: append ? itemsRef.current.length : 0,
        limit: PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      const next = append
        ? [...itemsRef.current, ...result.items.filter(item => !itemsRef.current.some(existing => existing.dream_id === item.dream_id))]
        : result.items;
      itemsRef.current = next;
      setItems(next);
      setHasMore(result.has_more);
      setError(false);
    } catch {
      if (requestId === requestRef.current) setError(true);
    } finally {
      if (append) setLoadingMore(false);
      else if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadPage(false);
    return () => { requestRef.current += 1; };
  }, []);

  return (
    <aside
      className="dream-theme__sidebar dream-replay-sidebar"
      aria-label={t('dreamReplay.title')}
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
    >
      <div className="dream-side-placeholder__head" style={{ flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div className="dream-side-placeholder__title">{t('dreamReplay.title')}</div>
          <div className="dream-side-placeholder__kicker">{t('dreamReplay.subtitle')}</div>
        </div>
        <button type="button" className="dream-side-placeholder__close" onClick={onClose} aria-label="关闭侧栏">×</button>
      </div>

      <div style={{ padding: '0 16px 10px', borderBottom: '1px solid var(--dt-border-soft)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div className="mono" style={{ flex: 1, color: 'var(--dt-ink-3)', fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 1.1 }}>
          {items.length} · {t('dreamReplay.archived')}
        </div>
        <button
          type="button"
          onClick={() => { setError(false); void loadPage(false); }}
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
          style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid var(--dt-border-soft)', background: 'transparent', color: 'var(--dt-ink-3)', cursor: 'pointer' }}
        >
          ↻
        </button>
      </div>

      {error && (
        <div style={{ padding: '8px 16px', color: 'var(--dt-ink-3)', fontSize: 'calc(10px * var(--dream-theme-font-scale, 1))', flexShrink: 0 }}>
          {t('dreamReplay.loadFailed')}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 0' }}>
        {loading ? (
          <div className="mono" style={{ padding: 24, color: 'var(--dt-ink-3)', fontSize: 'calc(10.5px * var(--dream-theme-font-scale, 1))', textAlign: 'center' }}>
            {t('common.loading')}…
          </div>
        ) : items.length === 0 ? (
          <div className="serif" style={{ padding: 24, color: 'var(--dt-ink-3)', fontSize: 'calc(13px * var(--dream-theme-font-scale, 1))', fontStyle: 'italic', textAlign: 'center' }}>
            {t('dreamReplay.empty')}
          </div>
        ) : items.map(item => {
          const selected = item.dream_id === selectedDreamId;
          return (
            <button
              key={`${item.char_id}:${item.dream_id}`}
              type="button"
              onClick={() => onSelect(item)}
              aria-current={selected ? 'true' : undefined}
              style={{
                width: '100%', textAlign: 'left', padding: '12px 16px',
                background: selected ? 'var(--dt-surface-2)' : 'transparent',
                border: 'none', borderLeft: `2px solid ${selected ? 'var(--dt-flower-bluebell)' : 'transparent'}`,
                color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <div className="serif" style={{ color: 'var(--dt-ink)', fontSize: 'calc(15px * var(--dream-theme-font-scale, 1))', fontWeight: 600, marginBottom: 6 }}>
                {item.summary_title || `${t('dreamReplay.session')} · ${item.dream_id}`}
              </div>
              <ReplayMeta item={item} language={language} t={translate} />
              <div style={{ color: 'var(--dt-ink-2)', fontSize: 'calc(12px * var(--dream-theme-font-scale, 1))', lineHeight: 1.55, marginTop: 7, fontFamily: 'var(--font-serif)' }}>
                {summaryText(item, t('dreamReplay.noSummary'), t('dreamReplay.legacyArchive'))}
              </div>
            </button>
          );
        })}

        {hasMore && (
          <div style={{ padding: '10px 16px 16px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => void loadPage(true)}
              disabled={loadingMore}
              style={{ padding: '7px 13px', borderRadius: 999, border: '1px solid var(--dt-border-soft)', background: 'var(--dt-surface-2)', color: 'var(--dt-ink-2)', cursor: loadingMore ? 'default' : 'pointer', fontFamily: 'inherit', opacity: loadingMore ? 0.6 : 1 }}
            >
              {loadingMore ? `${t('common.loading')}…` : t('dreamReplay.loadMore')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
