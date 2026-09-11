import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { reasoningErrorKey, type TurnReasoning, type TurnReasoningCache } from '../../../shared/api/turnReasoningState';
import './TurnReasoningPanel.css';

export function TurnReasoningPanel({ turnId, cache }: { turnId: string; cache: TurnReasoningCache }) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<TurnReasoning | null>(null);
  const [error, setError] = useState<ReturnType<typeof reasoningErrorKey> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    cache.load(turnId, attempt > 0).then(result => {
      if (active) setData(result);
    }).catch(reason => {
      if (active) setError(reasoningErrorKey(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, turnId, cache, attempt]);

  return <section className="turn-reasoning">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true">{open ? '▾' : '▸'}</span> {t('chat.reasoning.title')}
    </button>
    {open && <div id={id} className="turn-reasoning-content" aria-busy={loading}>
      {loading && <p role="status">{t('chat.reasoning.loading')}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {data && (!data.available || !data.entries.length) && <p>{t('chat.reasoning.empty')}</p>}
      {data?.available && data.entries.map((entry, index) => <article key={`${entry.call_id}-${index}`}>
        <div className="turn-reasoning-meta">
          <strong>{t('chat.reasoning.call')} {entry.seq} · {entry.model}</strong>
          <span>{t(entry.status === 'interrupted' ? 'chat.reasoning.interrupted' : 'chat.reasoning.completed')}</span>
        </div>
        {entry.parts.map((part, partIndex) => <div key={partIndex}>
          <small>{part.source}</small>
          <pre>{part.text}</pre>
        </div>)}
      </article>)}
      {!loading && <button type="button" onClick={() => setAttempt(value => value + 1)}>{t('chat.reasoning.retry')}</button>}
    </div>}
  </section>;
}
