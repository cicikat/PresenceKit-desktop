import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { getActiveCharacterName, subscribeActiveCharacter } from '../../../shared/activeCharacter';
import { reasoningErrorKey, type TurnReasoning, type TurnReasoningCache } from '../../../shared/api/turnReasoningState';
import { reasoningNarrationText } from '../reasoningNarration';
import './TurnReasoningPanel.css';

export function TurnReasoningPanel({ turnId, cache }: { turnId: string; cache: TurnReasoningCache }) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastAttempt = useRef(0);
  const [characterName, setCharacterName] = useState(() => getActiveCharacterName(''));
  const [data, setData] = useState<TurnReasoning | null>(null);
  const [error, setError] = useState<ReturnType<typeof reasoningErrorKey> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeActiveCharacter(() => setCharacterName(getActiveCharacterName(''))), []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    const refresh = attempt !== lastAttempt.current;
    lastAttempt.current = attempt;
    cache.load(turnId, refresh).then(result => {
      if (active) setData(result);
    }).catch(reason => {
      if (active) setError(reasoningErrorKey(reason));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, turnId, cache, attempt]);

  const text = data ? reasoningNarrationText(data) : '';
  return <section className="turn-reasoning" data-turn-id={turnId}>
    <button className="turn-reasoning-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {t(open ? 'chat.reasoning.collapse' : 'chat.reasoning.expand')}
    </button>
    {open && <div id={id} className="turn-reasoning-content" aria-busy={loading}>
      {loading && <p role="status">{t('chat.reasoning.loading')}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {data && !text && <p>{t('chat.reasoning.empty')}</p>}
      {text && <>
        <p className="turn-reasoning-caption">{t('chat.reasoning.caption').replace('{name}', characterName || t('chat.reasoning.characterFallback'))}</p>
        <pre>{text}</pre>
      </>}
      {!loading && <button className="turn-reasoning-retry" type="button" onClick={() => setAttempt(value => value + 1)}>{t('chat.reasoning.retry')}</button>}
    </div>}
  </section>;
}
