import { useEffect, useState } from 'react';
import type { DreamArchiveDetailResponse } from '../../../shared/api/dream-types';
import { useI18n } from '../../../shared/i18n';
import { DreamChatPanel } from './DreamChatPanel';
import { mapArchiveMessages } from '../replaySelection';
import { normalizeChatDisplayText } from '../../chat/chatDisplay';
import { renderInlineStyled } from '../../chat/inlineStyle';

const INITIAL_MESSAGE_LIMIT = 80;

function translateValue(t: (key: never) => string, value: string, prefix: string): string {
  return t(`${prefix}.${value}` as never) || value;
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

function RpgReplay({ messages }: { messages: DreamArchiveDetailResponse['messages'] }) {
  const lanes = ['character', 'kp', 'shared'] as const;
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', flex: 1, minHeight: 0, overflow: 'auto' }}>
    {lanes.map(lane => <section key={lane} style={{ borderRight: '1px solid var(--dt-border-soft)' }}><div className="mono" style={{ padding: 10 }}>{lane.toUpperCase()}</div>{messages.filter(message => message.lane === lane).map((message, index) => <div key={`${message.correlation_id ?? index}`} style={{ padding: '7px 10px', borderBottom: '1px solid var(--dt-border-soft)' }}>{renderInlineStyled(normalizeChatDisplayText(message.content))}</div>)}</section>)}
  </div>;
}

export interface DreamReplayTranscriptProps {
  detail: DreamArchiveDetailResponse;
  herDataUrl: string | null;
  characterName: string;
  onExit: () => void;
}

export function DreamReplayTranscript({ detail, herDataUrl, characterName, onExit }: DreamReplayTranscriptProps) {
  const { language, t } = useI18n();
  const [visibleCount, setVisibleCount] = useState(INITIAL_MESSAGE_LIMIT);
  const item = detail.metadata;

  useEffect(() => {
    setVisibleCount(INITIAL_MESSAGE_LIMIT);
  }, [detail.dream_id]);

  const start = Math.max(0, detail.messages.length - visibleCount);
  const visibleMessages = mapArchiveMessages(detail.dream_id, detail.messages.slice(start), start);
  const hasMoreMessages = start > 0;

  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <header className="dream-theme__head" style={{ minHeight: 76, flexShrink: 0 }}>
        {herDataUrl ? (
          <img src={herDataUrl} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div className="dream-theme__avatar" style={{ flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dream-theme__title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.summary_title || `${t('dreamReplay.session')} · ${detail.dream_id}`}
          </div>
          <div className="dream-theme__status">
            <span className="dream-theme__status-dot" />
            {t('dreamReplay.readOnly')}
          </div>
        </div>
        <button
          type="button"
          onClick={onExit}
          style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--dt-border-soft)', background: 'var(--dt-surface-2)', color: 'var(--dt-ink-2)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
        >
          {t('dreamReplay.returnToCurrent')}
        </button>
      </header>

      <div style={{ padding: '9px 24px', borderBottom: '1px solid var(--dt-border-soft)', display: 'flex', flexWrap: 'wrap', gap: '5px 16px', flexShrink: 0 }}>
        <span className="mono" style={{ color: 'var(--dt-ink-3)', fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.9 }}>
          {formatTimestamp(item.started_at, language, t('dreamReplay.unknown'))}
        </span>
        <span className="mono" style={{ color: 'var(--dt-ink-3)', fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.9 }}>
          {translateValue(t as (key: never) => string, item.dream_mode, 'dreamReplay.mode')}
        </span>
        <span className="mono" style={{ color: 'var(--dt-ink-3)', fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.9 }}>
          {item.world_name || t('dreamReplay.unknown')}
        </span>
        <span className="mono" style={{ color: 'var(--dt-ink-3)', fontSize: 'calc(9.5px * var(--dream-theme-font-scale, 1))', letterSpacing: 0.9 }}>
          {translateValue(t as (key: never) => string, item.completion, 'dreamReplay.completion')}
        </span>
      </div>

      {detail.partial_read && (
        <div style={{ padding: '7px 24px', color: 'var(--dt-ink-3)', fontSize: 'calc(10px * var(--dream-theme-font-scale, 1))', borderBottom: '1px solid var(--dt-border-soft)', flexShrink: 0 }}>
          {t('dreamReplay.partialRead')}
        </div>
      )}

      {item.dream_mode === 'rpg' ? <RpgReplay messages={detail.messages.slice(start)} /> : <DreamChatPanel
        messages={visibleMessages}
        loading={false}
        inputDisabled
        herDataUrl={herDataUrl}
        speakerName={characterName}
        onSend={() => undefined}
        readOnly
        emptyMessage={t('dreamReplay.noMessages')}
        readOnlyFooter={hasMoreMessages ? (
          <div style={{ padding: '8px 0 4px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setVisibleCount(count => count + INITIAL_MESSAGE_LIMIT)}
              style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid var(--dt-border-soft)', background: 'var(--dt-surface-2)', color: 'var(--dt-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('dreamReplay.loadMore')}
            </button>
          </div>
        ) : undefined}
      />}
    </div>
  );
}
