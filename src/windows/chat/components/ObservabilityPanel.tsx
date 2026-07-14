import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { getPromptAssets, listGroups } from '../../../shared/api/backend';
import type { GroupSummary } from '../../../shared/api/types';
import {
  droppedReasons,
  interestId,
  isRecord,
  loadGroupObservability,
  loadGrowthObservability,
  loadMemoryObservability,
  loadSpendObservability,
  loadVisualObservability,
  loadWorkContent,
  numberValue,
  records,
  stringValue,
  trendOf,
  visualHeat,
  type GrowthBundle,
  type JsonRecord,
  type SpendBundle,
} from '../../../shared/api/observability-api';
import { useI18n } from '../../../shared/i18n';
import { chatThemeFontSize } from '../../../shared/chatAppearance';

type Section = 'growth' | 'visual' | 'spend' | 'group' | 'memory';
type GroupBundle = Awaited<ReturnType<typeof loadGroupObservability>>;
type MemoryBundle = Awaited<ReturnType<typeof loadMemoryObservability>>;

const POLL_MS = 30_000;
const sections: Section[] = ['growth', 'visual', 'spend', 'group', 'memory'];

const panel: CSSProperties = {
  border: '1px solid var(--forest-line)',
  borderRadius: 8,
  background: 'var(--forest-1)',
  padding: 10,
};

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...panel, ...style }}>{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mono" style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(11) }}>
      {children}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(10), letterSpacing: 1, margin: '4px 0 7px' }}>{children}</div>;
}

function Timestamp({ value }: { value: unknown }) {
  const timestamp = numberValue(value);
  if (timestamp) return <>{new Date(timestamp * 1000).toLocaleString()}</>;
  const text = stringValue(value);
  const parsed = text ? Date.parse(text) : Number.NaN;
  return <>{Number.isNaN(parsed) ? text || '—' : new Date(parsed).toLocaleString()}</>;
}

function ProgressBar({ value, max = 1 }: { value: number; max?: number }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div style={{ height: 6, borderRadius: 99, overflow: 'hidden', background: 'var(--forest-line)', marginTop: 5 }}>
      <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 99, background: 'var(--accent, #9bbf8b)' }} />
    </div>
  );
}

function ScoreSparkline({ values }: { values: number[] }) {
  const scores = values.filter(Number.isFinite);
  if (scores.length < 2) return null;
  const width = 220;
  const height = 42;
  const points = scores.map((score, index) => {
    const x = (index / (scores.length - 1)) * width;
    const y = height - (Math.min(10, Math.max(0, score)) / 10) * height;
    return `${x},${y}`;
  }).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" style={{ width: '100%', height: 42, marginTop: 6 }}>
    <polyline points={points} fill="none" stroke="var(--accent, #9bbf8b)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

function valueText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value == null) return '';
  try { return JSON.stringify(value); } catch { return ''; }
}

export function ObservabilityPanel() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('growth');
  const [characters, setCharacters] = useState<Array<{ id: string; label: string }>>([]);
  const [charId, setCharId] = useState('');
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupId, setGroupId] = useState('');
  const [growth, setGrowth] = useState<GrowthBundle | null>(null);
  const [visual, setVisual] = useState<JsonRecord[] | null>(null);
  const [visualDate, setVisualDate] = useState(localDate());
  const [spend, setSpend] = useState<SpendBundle | null>(null);
  const [group, setGroup] = useState<GroupBundle | null>(null);
  const [memory, setMemory] = useState<MemoryBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [workContent, setWorkContent] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    getPromptAssets()
      .then(assets => {
        if (!active) return;
        const nextCharacters = assets.characters.map(item => ({ id: item.id, label: item.label }));
        setCharacters(nextCharacters);
        setCharId(current => current || assets.active.active_character || nextCharacters[0]?.id || '');
      })
      .catch(reason => active && setError(String(reason)));
    listGroups()
      .then(groupList => {
        if (!active) return;
        setGroups(groupList);
        setGroupId(current => current || groupList[0]?.group_id || '');
      })
      .catch(reason => active && setError(String(reason)));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setGrowth(null);
    setMemory(null);
    setWorkContent({});
  }, [charId]);

  useEffect(() => {
    setGroup(null);
  }, [groupId]);

  useEffect(() => {
    setVisual(null);
  }, [visualDate]);

  const refresh = useCallback(async () => {
    if ((section === 'growth' || section === 'memory') && !charId) return;
    if (section === 'group' && !groupId) return;
    setLoading(true);
    setError('');
    try {
      if (section === 'growth') setGrowth(await loadGrowthObservability(charId));
      if (section === 'visual') setVisual(await loadVisualObservability(visualDate));
      if (section === 'spend') setSpend(await loadSpendObservability());
      if (section === 'group') setGroup(await loadGroupObservability(groupId));
      if (section === 'memory') setMemory(await loadMemoryObservability(charId));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setLoading(false);
    }
  }, [charId, groupId, section, visualDate]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openWork = useCallback(async (interest: string, filename: string) => {
    const cacheKey = `${charId}/${interest}/${filename}`;
    if (workContent[cacheKey] !== undefined) {
      setWorkContent(current => {
        const next = { ...current };
        delete next[cacheKey];
        return next;
      });
      return;
    }
    try {
      const response = await loadWorkContent(charId, interest, filename);
      setWorkContent(current => ({ ...current, [cacheKey]: stringValue(response.content) }));
    } catch (reason) {
      setError(String(reason));
    }
  }, [charId, workContent]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '10px 12px 18px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {sections.map(item => (
          <button key={item} onClick={() => setSection(item)} style={{
            border: '1px solid var(--forest-line)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
            background: section === item ? 'var(--on-forest)' : 'transparent',
            color: section === item ? 'var(--forest)' : 'var(--on-forest-2)',
            fontSize: chatThemeFontSize(10),
          }}>{t(`observability.${item}`)}</button>
        ))}
      </div>

      {(section === 'growth' || section === 'memory') && (
        <select aria-label={t('observability.character')} value={charId} onChange={event => setCharId(event.target.value)} style={selectStyle}>
          {characters.map(character => <option key={character.id} value={character.id}>{character.label}</option>)}
        </select>
      )}
      {section === 'group' && (
        <select aria-label={t('observability.groupSelect')} value={groupId} onChange={event => setGroupId(event.target.value)} style={selectStyle}>
          {groups.map(item => <option key={item.group_id} value={item.group_id}>{item.title || item.group_id}</option>)}
        </select>
      )}
      {section === 'visual' && (
        <input aria-label={t('observability.date')} type="date" value={visualDate} onChange={event => setVisualDate(event.target.value)} style={selectStyle} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 28, margin: '5px 0' }}>
        <span className="mono" style={{ color: error ? 'var(--status-error)' : 'var(--on-forest-2)', fontSize: chatThemeFontSize(9.5) }}>
          {error ? `${t('common.loadFailed')}: ${error}` : loading ? t('common.loading') : t('observability.polling')}
        </span>
        <button onClick={() => void refresh()} disabled={loading} style={smallButton}>{t('common.refresh')}</button>
      </div>

      {section === 'growth' && <GrowthView charId={charId} value={growth} workContent={workContent} onOpenWork={openWork} />}
      {section === 'visual' && <VisualView value={visual} />}
      {section === 'spend' && <SpendView value={spend} />}
      {section === 'group' && (groups.length === 0
        ? <Empty>{t('observability.noGroups')}</Empty>
        : <GroupView value={group} />)}
      {section === 'memory' && <MemoryView value={memory} />}
    </div>
  );
}

function GrowthView({ charId, value, workContent, onOpenWork }: {
  charId: string;
  value: GrowthBundle | null;
  workContent: Record<string, string>;
  onOpenWork: (interest: string, filename: string) => void;
}) {
  const { t } = useI18n();
  if (!value || value.interests.length === 0) return <Empty>{t('common.notEnabled')}</Empty>;
  return <div style={{ display: 'grid', gap: 9 }}>
    {value.interests.map((interest, index) => {
      const id = interestId(interest);
      const works = value.works[id] ?? [];
      const notes = value.notes[id] ?? [];
      const scores = Array.isArray(interest.recent_scores)
        ? interest.recent_scores.map(numberValue)
        : works.map(row => numberValue(row.score));
      const trend = trendOf(scores);
      const level = Math.max(0, Math.round(numberValue(interest.level)));
      const latestScore = scores.length ? scores[scores.length - 1] : 0;
      return <Card key={id || index}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong>{stringValue(interest.name) || id}</strong>
          <span title={t(`observability.trend.${trend}`)}>{trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}</span>
        </div>
        <div style={{ color: 'var(--accent, #9bbf8b)', letterSpacing: 1 }}>{'★'.repeat(Math.min(level, 5))}{'☆'.repeat(Math.max(0, 5 - level))}</div>
        <ProgressBar value={latestScore} max={10} />
        <ScoreSparkline values={scores} />
        {numberValue(interest.stalled_since) > 0 && <span style={badgeStyle}>{t('observability.stalled')}</span>}
        <Heading>{t('observability.works')}</Heading>
        {works.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : works.map((work, workIndex) => {
          const filename = stringValue(work.file) || stringValue(work.filename);
          const resolvedKey = `${charId}/${id}/${filename}`;
          return <div key={filename || workIndex} style={{ borderTop: '1px solid var(--forest-line)', padding: '7px 0' }}>
            <button disabled={!filename} onClick={() => onOpenWork(id, filename)} style={{ ...linkButton, width: '100%', textAlign: 'left' }}>
              <Timestamp value={work.date ?? work.ts} /> · {stringValue(work.title) || filename || t('observability.work')}
              {work.score !== undefined ? ` · ${t('observability.score')} ${numberValue(work.score)}` : ''}
            </button>
            {workContent[resolvedKey] !== undefined && (
              <pre style={preStyle}>{workContent[resolvedKey]}</pre>
            )}
          </div>;
        })}
        <Heading>{t('observability.notes')}</Heading>
        {notes.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : notes.map((note, noteIndex) => (
          <div key={noteIndex} style={{ marginBottom: 5 }}>
            {stringValue(note.text) || stringValue(note.note) || stringValue(note.content) || valueText(note)}
            <span style={badgeStyle}>{t('observability.hits')} {numberValue(note.hits)}</span>
          </div>
        ))}
        <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9.5) }}>
          {t('observability.practiceLog')}: {value.practice.length}
        </div>
      </Card>;
    })}
  </div>;
}

function VisualView({ value }: { value: JsonRecord[] | null }) {
  const { t } = useI18n();
  const heat = useMemo(() => visualHeat(value ?? []), [value]);
  const drops = useMemo(() => droppedReasons(value ?? []), [value]);
  const captions = useMemo(() => (value ?? [])
    .filter(row => stringValue(row.caption))
    .map(row => ({ row, order: Math.random() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, 5)
    .map(item => item.row), [value]);
  if (!value || value.length === 0) return <Empty>{t('common.notEnabled')}</Empty>;
  const maxHeat = Math.max(...heat, 1);
  const dropEntries = Object.entries(drops);
  const totalDrops = dropEntries.reduce((sum, [, count]) => sum + count, 0);
  return <div style={{ display: 'grid', gap: 9 }}>
    <Card>
      <Heading>{t('observability.hourlyHeat')}</Heading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
        {heat.map((count, hour) => <div key={hour} title={`${hour}:00 · ${count}`} style={{
          aspectRatio: '1', borderRadius: 4, display: 'grid', placeItems: 'center',
          background: `color-mix(in srgb, var(--accent, #9bbf8b) ${Math.round((count / maxHeat) * 85 + 8)}%, transparent)`,
          fontSize: chatThemeFontSize(8.5), color: 'var(--on-forest)',
        }}>{hour}</div>)}
      </div>
    </Card>
    <Card>
      <Heading>{t('observability.dropReasons')}</Heading>
      {totalDrops === 0 ? <Empty>{t('common.notEnabled')}</Empty> : <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: dropConic(dropEntries, totalDrops), flexShrink: 0 }} />
        <div>{dropEntries.map(([reason, count]) => <div key={reason}>{reason}: {count}</div>)}</div>
      </div>}
    </Card>
    <Card>
      <Heading>{t('observability.captionSample')}</Heading>
      {captions.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : captions.map((row, index) => (
        <div key={index} style={{ borderTop: index ? '1px solid var(--forest-line)' : 'none', padding: '6px 0' }}>
          <span style={{ color: 'var(--on-forest-2)' }}><Timestamp value={row.ts} /></span> · {stringValue(row.caption)}
        </div>
      ))}
    </Card>
  </div>;
}

function SpendView({ value }: { value: SpendBundle | null }) {
  const { t } = useI18n();
  if (!value) return <Empty>{t('common.notEnabled')}</Empty>;
  const budgetRows = [
    [t('observability.daily'), numberValue(value.budget.daily_used), numberValue(value.budget.daily_cap)],
    [t('observability.monthly'), numberValue(value.budget.monthly_used), numberValue(value.budget.monthly_cap)],
  ] as const;
  return <div style={{ display: 'grid', gap: 9 }}>
    <Card>
      <Heading>{t('observability.budget')}</Heading>
      {budgetRows.map(([label, used, cap]) => <div key={label} style={{ marginBottom: 9 }}>
        <div>{label}: {used} / {cap || '—'}</div><ProgressBar value={used} max={cap} />
      </div>)}
    </Card>
    <Card>
      <Heading>{t('observability.mandates')}</Heading>
      {value.mandates.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : value.mandates.slice().reverse().map((row, index) => (
        <div key={index} style={{ borderTop: index ? '1px solid var(--forest-line)' : 'none', padding: '7px 0' }}>
          <strong>{stringValue(row.payee) || stringValue(row.action) || stringValue(row.mandate_id)}</strong>
          <span style={{ ...badgeStyle, ...statusBadgeStyle(stringValue(row.status)) }}>{stringValue(row.status)}</span>
          <div>{numberValue(row.amount) || numberValue(row.max_price)} {stringValue(row.currency)}</div>
        </div>
      ))}
      <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9.5), marginTop: 8 }}>
        {t('observability.confirmDisabled')}
      </div>
    </Card>
    <Card>
      <Heading>{t('observability.ledger')}</Heading>
      {value.ledger.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : value.ledger.slice().reverse().map((row, index) => (
        <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 5, borderTop: index ? '1px solid var(--forest-line)' : 'none', padding: '7px 0' }}>
          <span><Timestamp value={row.ts} /> · {stringValue(row.payee) || stringValue(row.action)}</span>
          <span style={{ ...badgeStyle, ...statusBadgeStyle(stringValue(row.status)) }}>{stringValue(row.status)}</span>
          <span>{numberValue(row.amount)} {stringValue(row.currency)}</span>
          <span>{stringValue(row.origin)}</span>
        </div>
      ))}
    </Card>
  </div>;
}

function GroupView({ value }: { value: GroupBundle | null }) {
  const { t } = useI18n();
  if (!value || (value.trace.length === 0 && value.relations.length === 0)) return <Empty>{t('common.notEnabled')}</Empty>;
  return <div style={{ display: 'grid', gap: 9 }}>
    <Card>
      <Heading>{t('observability.arbiterTrace')}</Heading>
      {value.trace.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : value.trace.map((row, index) => (
        <div key={index} style={{ borderTop: index ? '1px solid var(--forest-line)' : 'none', padding: '8px 0' }}>
          <div><Timestamp value={row.ts} /> · {t('observability.phase')} {stringValue(row.phase)}</div>
          {Boolean(row.echo_cut) && <span style={badgeStyle}>{t('observability.echoCut')}</span>}
          {Boolean(row.silent_round) && <span style={badgeStyle}>{t('observability.silentRound')}</span>}
          {records(row.candidates).map(candidate => {
            const score = numberValue(candidate.total);
            return <div key={stringValue(candidate.char_id)} title={valueText(candidate.parts)} style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{stringValue(candidate.char_id)}</span><span>{score.toFixed(2)}</span></div>
              <ProgressBar value={score} max={1.5} />
            </div>;
          })}
        </div>
      ))}
    </Card>
    <Card>
      <Heading>{t('observability.relations')}</Heading>
      {value.relations.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : value.relations.map((row, index) => {
        const aOfB = isRecord(row.a_of_b) ? row.a_of_b : {};
        const bOfA = isRecord(row.b_of_a) ? row.b_of_a : {};
        return <div key={index} style={{ borderTop: index ? '1px solid var(--forest-line)' : 'none', padding: '8px 0' }}>
          <strong>{stringValue(row.char_a)} ↔ {stringValue(row.char_b)}</strong>
          <div>{stringValue(row.char_a)} → {stringValue(row.char_b)}: {stringValue(aOfB.summary) || '—'} ({numberValue(aOfB.valence).toFixed(2)})</div>
          <div>{stringValue(row.char_b)} → {stringValue(row.char_a)}: {stringValue(bOfA.summary) || '—'} ({numberValue(bOfA.valence).toFixed(2)})</div>
        </div>;
      })}
    </Card>
  </div>;
}

function MemoryView({ value }: { value: MemoryBundle | null }) {
  const { t } = useI18n();
  if (!value || (!value.digest && value.recall.length === 0)) return <Empty>{t('common.notEnabled')}</Empty>;
  return <div style={{ display: 'grid', gap: 9 }}>
    <Card><Heading>{t('observability.digest')}</Heading>{value.digest ? <pre style={preStyle}>{value.digest}</pre> : <Empty>{t('common.notEnabled')}</Empty>}</Card>
    <Card>
      <Heading>{t('observability.recallTrace')}</Heading>
      {value.recall.length === 0 ? <Empty>{t('common.notEnabled')}</Empty> : value.recall.slice().reverse().map((row, index) => {
        const hitCounts = Object.entries(row).filter(([key, entry]) => key.endsWith('_hits') && Array.isArray(entry));
        return <div key={index} style={{ borderTop: index ? '1px solid var(--forest-line)' : 'none', padding: '8px 0' }}>
          <div><Timestamp value={row.ts} /> · {stringValue(row.query) || stringValue(row.message_excerpt) || stringValue(row.mood)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {hitCounts.map(([key, hits]) => {
              const score = hitScore(hits as unknown[]);
              return <span key={key} style={badgeStyle}>{key}: {(hits as unknown[]).length}{score ? ` · ${score}` : ''}</span>;
            })}
          </div>
          {(row.time_range !== undefined || row.parsed_time_range !== undefined) && <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9) }}>
            {t('observability.timeRange')}: {valueText(row.time_range ?? row.parsed_time_range)}
          </div>}
        </div>;
      })}
    </Card>
  </div>;
}

function dropConic(entries: Array<[string, number]>, total: number): string {
  const colors = ['#9bbf8b', '#d3a55b', '#b77979', '#7496a8', '#a78bbf'];
  let cursor = 0;
  const stops = entries.map(([, count], index) => {
    const start = cursor;
    cursor += (count / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function localDate(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function hitScore(hits: unknown[]): string {
  const scores = hits.map(hit => {
    if (Array.isArray(hit)) return numberValue(hit[1]);
    if (isRecord(hit)) return numberValue(hit.score) || numberValue(hit.distance);
    return 0;
  }).filter(score => score !== 0);
  return scores.length ? scores[0].toFixed(3) : '';
}

function statusBadgeStyle(status: string): CSSProperties {
  if (status === 'confirmed') return { color: 'var(--status-connected)' };
  if (status === 'rejected' || status === 'failed' || status === 'capped') return { color: 'var(--status-error)' };
  return { color: 'var(--status-connecting)' };
}

const selectStyle: CSSProperties = {
  width: '100%', border: '1px solid var(--forest-line)', borderRadius: 6,
  background: 'var(--forest-1)', color: 'var(--on-forest)', padding: '6px 8px',
  fontSize: chatThemeFontSize(11),
};
const smallButton: CSSProperties = {
  border: '1px solid var(--forest-line)', borderRadius: 5, background: 'transparent',
  color: 'var(--on-forest-2)', padding: '3px 7px', cursor: 'pointer', fontSize: chatThemeFontSize(9.5),
};
const linkButton: CSSProperties = { border: 0, background: 'transparent', color: 'var(--on-forest)', padding: 0, cursor: 'pointer' };
const badgeStyle: CSSProperties = {
  display: 'inline-block', marginLeft: 6, borderRadius: 99, padding: '1px 6px',
  background: 'var(--forest-line)', color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(9),
};
const preStyle: CSSProperties = {
  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0 0',
  color: 'var(--on-forest)', fontFamily: 'inherit', fontSize: chatThemeFontSize(10.5), lineHeight: 1.55,
};
