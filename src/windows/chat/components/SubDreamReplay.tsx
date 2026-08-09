import { useEffect, useState } from 'react';
import { Btn, Tag } from './UIKit';
import { dreamGetArchive, dreamListArchive } from '../../../shared/api/dream';
import type {
  DreamArchiveDetailResponse,
  DreamArchiveMetadata,
} from '../../../shared/api/dream-types';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { useI18n } from '../../../shared/i18n';

const PAGE_SIZE = 20;

function translateValue(t: (key: never) => string, value: string, prefix: string): string {
  const key = `${prefix}.${value}`;
  return t(key as never) || value;
}

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

function summaryText(item: DreamArchiveMetadata, empty: string, legacy: string): string {
  const preview = (item.summary_preview || item.summary_title || '').trim();
  if (preview) return preview;
  return item.summary_present ? empty : legacy;
}

function ReplayMeta({ item, language, t }: { item: DreamArchiveMetadata; language: string; t: (key: never) => string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      <Tag hue={230}>{translateValue(t, item.dream_mode, 'dreamReplay.mode')}</Tag>
      <Tag variant="outline">{translateValue(t, item.completion, 'dreamReplay.completion')}</Tag>
      <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 0.8 }}>
        {item.valid_turns} {t('dreamReplay.turns' as never)} · {formatDuration(
          item.started_at,
          item.ended_at,
          t('dreamReplay.minuteShort' as never),
          t('dreamReplay.secondShort' as never),
          t('dreamReplay.unknown' as never),
        )}
      </span>
      <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 0.8 }}>
        {formatTimestamp(item.started_at, language, t('dreamReplay.unknown' as never))}
      </span>
    </div>
  );
}

function ReplayListItem({ item, onClick, language, t }: {
  item: DreamArchiveMetadata;
  onClick: () => void;
  language: string;
  t: (key: never) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '11px 14px',
        background: 'transparent', border: 'none', borderLeft: '2px solid transparent',
        color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={event => {
        event.currentTarget.style.background = 'oklch(0.27 0.04 168)';
        event.currentTarget.style.borderLeftColor = 'oklch(0.62 0.13 230)';
      }}
      onMouseLeave={event => {
        event.currentTarget.style.background = 'transparent';
        event.currentTarget.style.borderLeftColor = 'transparent';
      }}
    >
      <div className="serif" style={{ color: 'var(--on-forest)', fontSize: chatThemeFontSize(15), fontWeight: 600, marginBottom: 5 }}>
        {item.summary_title || `${t('dreamReplay.session' as never)} · ${item.dream_id}`}
      </div>
      <ReplayMeta item={item} language={language} t={t} />
      <div style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(12), lineHeight: 1.55, marginTop: 7, fontFamily: 'var(--font-serif)' }}>
        {summaryText(item, t('dreamReplay.noSummary' as never), t('dreamReplay.legacyArchive' as never))}
      </div>
    </button>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9), letterSpacing: 1.1, marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--on-forest)', fontSize: chatThemeFontSize(11.5), overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

function ReplayDetail({ detail, onBack, language, t }: {
  detail: DreamArchiveDetailResponse;
  onBack: () => void;
  language: string;
  t: (key: never) => string;
}) {
  const item = detail.metadata;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--forest-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={onBack} aria-label={t('dreamReplay.back' as never)} title={t('dreamReplay.back' as never)} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid var(--forest-line)', background: 'transparent', color: 'var(--on-forest-2)', cursor: 'pointer', fontSize: 16 }}>‹</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="serif" style={{ color: 'var(--on-forest)', fontSize: chatThemeFontSize(16), fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.summary_title || `${t('dreamReplay.session' as never)} · ${detail.dream_id}`}
          </div>
          <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9), letterSpacing: 1 }}>
            {formatTimestamp(item.started_at, language, t('dreamReplay.unknown' as never))}
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--forest-line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
        <DetailField label={t('dreamReplay.field.mode' as never)} value={translateValue(t, item.dream_mode, 'dreamReplay.mode')} />
        <DetailField label={t('dreamReplay.field.world' as never)} value={item.world_name || t('dreamReplay.unknown' as never)} />
        <DetailField label={t('dreamReplay.field.completion' as never)} value={translateValue(t, item.completion, 'dreamReplay.completion')} />
        <DetailField label={t('dreamReplay.field.exit' as never)} value={translateValue(t, item.exit_mechanism, 'dreamReplay.mechanism')} />
      </div>
      {detail.partial_read && (
        <div style={{ padding: '7px 14px', color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(10), borderBottom: '1px solid var(--forest-line)' }}>
          {t('dreamReplay.partialRead' as never)}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 10px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {detail.messages.length === 0 ? (
          <div className="serif" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(13), fontStyle: 'italic', textAlign: 'center', padding: 24 }}>
            {t('dreamReplay.noMessages' as never)}
          </div>
        ) : detail.messages.map((message, index) => {
          const isUser = message.role === 'user';
          return (
            <div key={`${message.ts ?? 'none'}-${index}`} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '88%', minWidth: 0 }}>
                <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9), letterSpacing: 1, margin: '0 4px 3px', textAlign: isUser ? 'right' : 'left' }}>
                  {t(isUser ? 'dreamReplay.role.user' as never : 'dreamReplay.role.assistant' as never)}
                  {message.ts !== null && ` · ${formatTimestamp(message.ts, language, t('dreamReplay.unknown' as never))}`}
                </div>
                <div style={{ padding: '9px 11px', borderRadius: isUser ? '10px 3px 10px 10px' : '3px 10px 10px 10px', background: isUser ? 'var(--on-forest)' : 'oklch(0.27 0.04 168)', color: isUser ? 'var(--forest)' : 'var(--on-forest)', border: isUser ? 'none' : '1px solid var(--forest-line)', fontFamily: 'var(--font-serif)', fontSize: chatThemeFontSize(13), lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {message.content}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SubDreamReplay() {
  const { language, t } = useI18n();
  const [items, setItems] = useState<DreamArchiveMetadata[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DreamArchiveDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPage = async (append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const result = await dreamListArchive({ offset: append ? items.length : 0, limit: PAGE_SIZE });
      setItems(previous => append ? [...previous, ...result.items] : result.items);
      setHasMore(result.has_more);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  };

  useEffect(() => { void loadPage(false); }, []);

  const openDetail = async (item: DreamArchiveMetadata) => {
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await dreamGetArchive(item.dream_id, item.char_id));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setDetailLoading(false);
    }
  };

  if (detailLoading) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-forest-2)' }}><span className="mono" style={{ fontSize: chatThemeFontSize(11), letterSpacing: 1 }}>{t('common.loading' as never)}…</span></div>;
  }
  if (detail) return <ReplayDetail detail={detail} onBack={() => setDetail(null)} language={language} t={t as (key: never) => string} />;
  if (loading) {
    return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-forest-2)' }}><span className="mono" style={{ fontSize: chatThemeFontSize(11), letterSpacing: 1 }}>{t('common.loading' as never)}…</span></div>;
  }
  if (error && items.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center', padding: 22, textAlign: 'center' }}>
        <span className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(10.5) }}>{t('dreamReplay.loadFailed' as never)}</span>
        <Btn dense onClick={() => { setError(null); void loadPage(false); }}>{t('common.refresh' as never)}</Btn>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '10px 14px 7px', borderBottom: '1px solid var(--forest-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="mono" style={{ flex: 1, color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9.5), letterSpacing: 1.2 }}>{items.length} · {t('dreamReplay.archived' as never)}</div>
        <button type="button" onClick={() => { setError(null); void loadPage(false); }} title={t('common.refresh' as never)} aria-label={t('common.refresh' as never)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--forest-line)', background: 'transparent', color: 'var(--on-forest-2)', cursor: 'pointer', fontSize: 14 }}>↻</button>
      </div>
      {error && <div style={{ padding: '7px 14px', color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(10) }}>{t('dreamReplay.loadFailed' as never)}</div>}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '5px 0' }}>
        {items.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, textAlign: 'center' }}>
            <div className="serif" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(13), fontStyle: 'italic' }}>{t('dreamReplay.empty' as never)}</div>
          </div>
        ) : items.map(item => <ReplayListItem key={`${item.char_id}:${item.dream_id}`} item={item} onClick={() => void openDetail(item)} language={language} t={t as (key: never) => string} />)}
        {hasMore && (
          <div style={{ padding: '8px 14px 14px', textAlign: 'center' }}>
            <Btn dense onClick={() => void loadPage(true)}>{loadingMore ? `${t('common.loading' as never)}…` : t('dreamReplay.loadMore' as never)}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
