import { FormEvent, useEffect, useRef, useState } from 'react';
import { dreamSeedApi } from '../../../shared/api/activity-api';
import { useI18n } from '../../../shared/i18n';
import './DreamSeedPanel.css';

interface DreamSeedMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  failed?: boolean;
}

export function DreamSeedPanel() {
  const { t } = useI18n();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [seedPreview, setSeedPreview] = useState('');
  const [seedText, setSeedText] = useState('');
  const [messages, setMessages] = useState<DreamSeedMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [working, setWorking] = useState<'start' | 'send' | 'close' | null>(null);
  const [error, setError] = useState('');
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  const loadState = async () => {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      const state = await dreamSeedApi.state();
      setSessionId(state.active ? state.session_id : null);
      setRestored(state.active && !!state.session_id);
      setSeedPreview(state.has_seed ? state.seed_preview : '');
    } catch {
      setLoadFailed(true);
      setError(t('activity.dreamSeed.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadState(); }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, working]);

  const start = async () => {
    setWorking('start');
    setError('');
    setSeedText('');
    try {
      const result = await dreamSeedApi.start();
      setSessionId(result.session_id);
      setRestored(false);
      setMessages([]);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setWorking(null);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!sessionId || !text || working) return;
    const userMessage: DreamSeedMessage = { id: nextId.current++, role: 'user', text };
    setInput('');
    setError('');
    setMessages(current => [...current, userMessage]);
    setWorking('send');
    try {
      const result = await dreamSeedApi.chat({ session_id: sessionId, message: text });
      setMessages(current => [...current, {
        id: nextId.current++, role: 'assistant', text: result.reply,
      }]);
    } catch (err) {
      setMessages(current => current.map(message => (
        message.id === userMessage.id ? { ...message, failed: true } : message
      )));
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setWorking(null);
    }
  };

  const close = async () => {
    if (!sessionId || working) return;
    setWorking('close');
    setError('');
    try {
      const result = await dreamSeedApi.close(sessionId);
      if (!result.success) {
        setError(t('activity.dreamSeed.needMore'));
        return;
      }
      setSeedText(result.seed_text);
      setSeedPreview(result.seed_text);
      setSessionId(null);
      setMessages([]);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return <div className="dream-seed-panel dream-seed-panel--center">{t('common.loading')}</div>;
  }

  if (!sessionId) {
    return (
      <main className="dream-seed-panel dream-seed-panel--center">
        <section className="dream-seed-intro">
          <span className="dream-seed-mark" aria-hidden="true">✦</span>
          <h1>{t('activity.dreamSeed.title')}</h1>
          <p>{t('activity.dreamSeed.description')}</p>
          {(seedText || seedPreview) && (
            <div className="dream-seed-result">
              <strong>{seedText ? t('activity.dreamSeed.ready') : t('activity.dreamSeed.existingSeed')}</strong>
              <span>{seedText || seedPreview}</span>
            </div>
          )}
          {error && <div className="dream-seed-error" role="alert">{error}</div>}
          <button className="dream-seed-primary" onClick={loadFailed ? loadState : start} disabled={working !== null}>
            {error ? t('activity.dreamSeed.retry') : working === 'start' ? t('activity.dreamSeed.starting') : t('activity.dreamSeed.start')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="dream-seed-panel">
      <header className="dream-seed-header">
        <div>
          <span className="mono">DREAM SEED</span>
          <h1>{t('activity.dreamSeed.title')}</h1>
        </div>
        <button className="dream-seed-secondary" onClick={close} disabled={working !== null}>
          {working === 'close' ? t('activity.dreamSeed.finishing') : t('activity.dreamSeed.finish')}
        </button>
      </header>
      <div className="dream-seed-messages" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <div className="dream-seed-empty">
            {restored && <strong>{t('activity.dreamSeed.restored')}</strong>}
            <span>{t('activity.dreamSeed.empty')}</span>
          </div>
        )}
        {messages.map(message => (
          <div key={message.id} className={`dream-seed-message dream-seed-message--${message.role}${message.failed ? ' is-failed' : ''}`}>
            {message.text}
          </div>
        ))}
        {working === 'send' && <div className="dream-seed-message dream-seed-message--assistant is-pending">{t('activity.dreamSeed.sending')}</div>}
      </div>
      {error && <div className="dream-seed-error" role="alert">{error}</div>}
      <form className="dream-seed-composer" onSubmit={send}>
        <textarea
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={t('activity.dreamSeed.inputPlaceholder')}
          maxLength={1000}
          rows={2}
          disabled={working !== null}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="dream-seed-primary" type="submit" disabled={!input.trim() || working !== null}>
          {t('activity.dreamSeed.send')}
        </button>
      </form>
    </main>
  );
}
