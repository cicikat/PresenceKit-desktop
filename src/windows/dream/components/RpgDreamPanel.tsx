import { useCallback, useEffect, useState } from 'react';
import { dreamRpgState, dreamRpgTranscript, dreamRpgTurn, dreamRpgCorrection } from '../../../shared/api/dream';
import type { RpgState, RpgTranscriptEntry } from '../../../shared/api/dream-types';
import { useI18n } from '../../../shared/i18n';
import { classifyHttpError } from '../../../shared/api/httpError';

export function RpgDreamPanel({ disabled = false }: { disabled?: boolean }) {
  const { t } = useI18n();
  const [state, setState] = useState<RpgState | null>(null);
  const [entries, setEntries] = useState<RpgTranscriptEntry[]>([]);
  const [lane, setLane] = useState<'character' | 'kp'>('character');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const reload = useCallback(async (dreamId?: string) => {
    try {
      const nextState = await dreamRpgState();
      const transcript = await dreamRpgTranscript(null, 80, dreamId ?? nextState.dream_id);
      setState(nextState); setEntries(transcript.entries ?? []); setNextCursor(transcript.next_cursor ?? null); setError(transcript.partial_read ? t('dream.rpg.partialRead') : null);
    } catch (e) { setError(String(e)); }
  }, [t]);
  useEffect(() => { void reload(); }, [reload]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try { const page = await dreamRpgTranscript(nextCursor, 80, state?.dream_id); setEntries(current => [...current, ...(page.entries ?? [])]); setNextCursor(page.next_cursor ?? null); } catch (e) { setError(String(e)); } finally { setLoadingMore(false); }
  };

  const submit = async () => {
    const text = input.trim(); if (!text || busy || disabled) return;
    setBusy(true); setError(null);
    try {
      if (needsConfirm) setNeedsConfirm(false);
      const body = { dream_id: state?.dream_id, request_id: crypto.randomUUID(), lane, message: text, expected_scene_revision: state?.scene_revision ?? 0 };
      let response = correction ? await dreamRpgCorrection({ dream_id: state?.dream_id, request_id: body.request_id, operation: 'clarify', target_round_id: String(state?.round ?? ''), text, reason: '', expected_scene_revision: body.expected_scene_revision }) : await dreamRpgTurn(body);
      if (response.detail?.code === 'RPG_ROUND_BUSY') {
        await new Promise(resolve => setTimeout(resolve, 500));
        response = correction ? await dreamRpgCorrection({ dream_id: state?.dream_id, request_id: body.request_id, operation: 'clarify', target_round_id: String(state?.round ?? ''), text, reason: '', expected_scene_revision: body.expected_scene_revision }) : await dreamRpgTurn(body);
      }
      if (response.detail?.code === 'RPG_REVISION_CONFLICT') { setNeedsConfirm(true); await reload(state?.dream_id); return; }
      if (response.error) setError(response.detail?.code ?? response.error);
      setInput(''); await reload(state?.dream_id);
    } catch (e) {
      const classified = classifyHttpError(e);
      if (classified.code === 'RPG_REVISION_CONFLICT') { setNeedsConfirm(true); setError(t('dream.rpg.revisionConflict')); await reload(state?.dream_id); }
      else setError(classified.code ?? classified.message);
    } finally { setBusy(false); }
  };
  const laneEntries = (name: string) => entries.filter(entry => entry.lane === name);
  const renderEntry = (entry: RpgTranscriptEntry, index: number) => <div key={`${entry.correlation_id ?? index}`} style={{ padding: '7px 10px', borderBottom: '1px solid var(--dt-border-soft)' }}>{String(entry.content ?? entry.text ?? '')}</div>;
  return <div className="dream-rpg" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', minHeight: 0, flex: 1 }}>
    <section><div className="mono" style={{ padding: 10 }}>{t('dream.rpg.character')}</div>{laneEntries('character').map(renderEntry)}</section>
    <section><div className="mono" style={{ padding: 10 }}>KP</div>{laneEntries('kp').map(renderEntry)}</section>
    <section><div className="mono" style={{ padding: 10 }}>SHARED</div>{laneEntries('shared').map(renderEntry)}</section>
    {nextCursor && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} style={{ gridColumn: '1 / -1' }}>{loadingMore ? 'Loading...' : 'Load more'}</button>}
    <div style={{ gridColumn: '1 / -1', padding: 10, borderTop: '1px solid var(--dt-border-soft)' }}>
      <select value={lane} onChange={e => setLane(e.target.value as 'character' | 'kp')} disabled={busy}><option value="character">Character</option><option value="kp">KP</option></select>
      <button type="button" onClick={() => setCorrection(value => !value)} disabled={busy} style={{ marginLeft: 8 }}>{correction ? '修正中' : '修正'}</button>
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} disabled={busy || disabled} placeholder="提交回合" style={{ marginLeft: 8, width: '65%' }} />
      <button type="button" onClick={() => void submit()} disabled={busy || disabled || !input.trim()} style={{ marginLeft: 8 }}>{busy ? '发送中' : '发送'}</button>
      {error && <span className="mono" style={{ color: 'var(--dt-danger)', marginLeft: 8 }}>{error}</span>}
      {needsConfirm && <span className="mono" style={{ color: 'var(--dt-danger)', marginLeft: 8 }}>场景已变化，请确认后重新提交</span>}
    </div>
  </div>;
}
