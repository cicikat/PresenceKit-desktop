import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { getActiveCharacterName, subscribeActiveCharacter } from '../../../shared/activeCharacter';
import { reasoningErrorKey, type TurnReasoning, type TurnReasoningCache } from '../../../shared/api/turnReasoningState';
import { reasoningNarrationText } from '../reasoningNarration';
import './TurnReasoningPanel.css';

export function TurnReasoningPanel({ turnId, cache, pending = false }: { turnId?: string; cache: TurnReasoningCache; pending?: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [characterName, setCharacterName] = useState(() => getActiveCharacterName(''));
  const [data, setData] = useState<TurnReasoning | null>(null);
  const [error, setError] = useState<ReturnType<typeof reasoningErrorKey> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeActiveCharacter(() => setCharacterName(getActiveCharacterName(''))), []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    setError(null);
    setLoading(true);
    if (!turnId) {
      timer = setTimeout(() => { if (active) { setLoading(false); setError('chat.reasoning.unavailable'); } }, 60000);
      return () => { active = false; clearTimeout(timer); };
    }
    const load = async () => {
      try {
        const result = await cache.load(turnId, polls > 0 || pending);
        if (!active) return;
        setData(result);
        if ((pending || !reasoningNarrationText(result)) && ++polls < 30) {
          timer = setTimeout(load, 2000);
        } else setLoading(false);
      } catch (reason) {
        if (active) { setError(reasoningErrorKey(reason)); setLoading(false); }
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [open, turnId, cache, pending]);

  const text = data ? reasoningNarrationText(data) : '';
  return <section className="turn-reasoning" data-turn-id={turnId}>
    <button className="turn-reasoning-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {t(open ? 'chat.reasoning.collapse' : 'chat.reasoning.expand')}
    </button>
    {open && <div id={id} className="turn-reasoning-content" aria-busy={loading}>
      {loading && <p role="status">{t('chat.reasoning.loading')}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {!loading && data && !text && <p>{t('chat.reasoning.empty')}</p>}
      {text && <>
        <p className="turn-reasoning-caption">{t('chat.reasoning.caption').replace('{name}', characterName || t('chat.reasoning.characterFallback'))}</p>
        <pre>{text}</pre>
      </>}
    </div>}
  </section>;
}
