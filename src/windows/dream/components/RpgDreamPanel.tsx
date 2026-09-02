import { useCallback, useEffect, useState } from 'react';
import { dreamRpgState, dreamRpgTranscript, dreamRpgTurn, dreamRpgCorrection } from '../../../shared/api/dream';
import type { RpgState, RpgTranscriptEntry } from '../../../shared/api/dream-types';

export function RpgDreamPanel({ disabled = false }: { disabled?: boolean }) {
  const [state, setState] = useState<RpgState | null>(null);
  const [entries, setEntries] = useState<RpgTranscriptEntry[]>([]);
  const [lane, setLane] = useState<'character' | 'kp'>('character');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [nextState, transcript] = await Promise.all([dreamRpgState(), dreamRpgTranscript(null, 80)]);
      setState(nextState); setEntries(transcript.entries ?? []); setError(transcript.partial_read ? 'partial_read' : null);
    } catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const submit = async () => {
    const text = input.trim(); if (!text || busy || disabled) return;
    setBusy(true); setError(null);
    try {
      const body = { lane, content: text, request_id: crypto.randomUUID(), scene_revision: state?.scene_revision ?? null };
      let response = correction ? await dreamRpgCorrection({ ...body, target_round: state?.round ?? null, reason: 'user_correction' }) : await dreamRpgTurn(body);
      if (response.detail?.code === 'RPG_ROUND_BUSY') {
        await new Promise(resolve => setTimeout(resolve, 500));
        response = correction ? await dreamRpgCorrection({ ...body, target_round: state?.round ?? null, reason: 'user_correction' }) : await dreamRpgTurn(body);
      }
      if (response.error) setError(response.detail?.code ?? response.error);
      setInput(''); await reload();
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const laneEntries = (name: string) => entries.filter(entry => entry.lane === name);
  const renderEntry = (entry: RpgTranscriptEntry, index: number) => <div key={`${entry.correlation_id ?? index}`} style={{ padding: '7px 10px', borderBottom: '1px solid var(--dt-border-soft)' }}>{String(entry.content ?? entry.text ?? '')}</div>;
  return <div className="dream-rpg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0, flex: 1 }}>
    <section><div className="mono" style={{ padding: 10 }}>CHARACTER</div>{laneEntries('character').map(renderEntry)}</section>
    <section><div className="mono" style={{ padding: 10 }}>KP / SHARED</div>{[...laneEntries('kp'), ...laneEntries('shared')].map(renderEntry)}</section>
    <div style={{ gridColumn: '1 / -1', padding: 10, borderTop: '1px solid var(--dt-border-soft)' }}>
      <select value={lane} onChange={e => setLane(e.target.value as 'character' | 'kp')} disabled={busy}><option value="character">Character</option><option value="kp">KP</option></select>
      <button type="button" onClick={() => setCorrection(value => !value)} disabled={busy} style={{ marginLeft: 8 }}>{correction ? '修正中' : '修正'}</button>
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} disabled={busy || disabled} placeholder="提交回合" style={{ marginLeft: 8, width: '65%' }} />
      <button type="button" onClick={() => void submit()} disabled={busy || disabled || !input.trim()} style={{ marginLeft: 8 }}>{busy ? '发送中' : '发送'}</button>
      {error && <span className="mono" style={{ color: 'var(--dt-danger)', marginLeft: 8 }}>{error}</span>}
    </div>
  </div>;
}
