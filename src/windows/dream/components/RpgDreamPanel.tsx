import { useCallback, useEffect, useState } from 'react';
import { dreamRpgState, dreamRpgTranscript, dreamRpgTurn, dreamRpgCorrection } from '../../../shared/api/dream';
import type { RpgState, RpgTranscriptEntry } from '../../../shared/api/dream-types';
import { useI18n } from '../../../shared/i18n';

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

  const reload = useCallback(async () => {
    try {
      const [nextState, transcript] = await Promise.all([dreamRpgState(), dreamRpgTranscript(null, 80, state?.dream_id)]);
      setState(nextState); setEntries(transcript.entries ?? []); setError(transcript.partial_read ? t('dream.rpg.partialRead') : null);
    } catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

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
      if (response.detail?.code === 'RPG_REVISION_CONFLICT') { setNeedsConfirm(true); await reload(); return; }
      if (response.error) setError(response.detail?.code ?? response.error);
      setInput(''); await reload();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const laneEntries = (name: string) => entries.filter(entry => entry.lane === name);
  const renderEntry = (entry: RpgTranscriptEntry, index: number) => <div key={`${entry.correlation_id ?? index}`} style={{ padding: '7px 10px', borderBottom: '1px solid var(--dt-border-soft)' }}>{String(entry.content ?? entry.text ?? '')}</div>;
  return <div className="dream-rpg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0, flex: 1 }}>
    <section><div className="mono" style={{ padding: 10 }}>{t('dream.rpg.character')}</div>{laneEntries('character').map(renderEntry)}</section>
    <section><div className="mono" style={{ padding: 10 }}>{t('dream.rpg.kpShared')}</div>{[...laneEntries('kp'), ...laneEntries('shared')].map(renderEntry)}</section>
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
