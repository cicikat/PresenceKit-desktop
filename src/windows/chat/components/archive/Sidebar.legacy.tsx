/* ============================================================
 * archive/Sidebar.legacy — 原副栏 UI 骨架（Phase 2d.0 存档）
 *
 * 保留：组件结构、样式、布局
 * 移除：写死的 mock 文案 / mock 日记数据
 * 用途：Phase 2d.x 接真实数据时参考视觉设计
 * ============================================================ */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Tag, MicroLabel, Meter } from '../UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, FOCUS_LABEL_EN } from '../UIKit';
import { MOODS, MOOD_TABLE } from '../../../../shared/state/store';

const SIDEBAR_HEADER: Record<string, { title: string; subtitle: string }> = {
  flow:   { title: '动向',     subtitle: 'LIVE FEED · 他现在在做什么' },
  diary:  { title: '他的日记', subtitle: 'DIARY · 来自他自己的笔' },
  status: { title: '状态',     subtitle: 'TELEMETRY · 持续状态信号' },
  garden: { title: '陪伴花园', subtitle: 'GARDEN · 他在你不看的时候也在生长' },
};

export function SidebarPanel({ engine, sidebarRectRef, tab, onClose, onOpenDiaryDetail }: any) {
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (rootRef.current && sidebarRectRef) sidebarRectRef.current = rootRef.current.getBoundingClientRect();
    };
    update();
    window.addEventListener('resize', update);
    const h = setInterval(update, 1000);
    return () => { window.removeEventListener('resize', update); clearInterval(h); };
  }, []);

  const meta = SIDEBAR_HEADER[tab] || SIDEBAR_HEADER.flow;

  return (
    <div ref={rootRef} style={{
      height: '100%', background: 'var(--forest)', color: 'var(--on-forest)',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--forest-1)',
    }}>
      <div style={{
        padding: '14px 16px 10px', borderBottom: '1px solid var(--forest-line)',
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 19, fontWeight: 600, color: 'var(--on-forest)', letterSpacing: -0.3 }}>
            {meta.title}
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.3, marginTop: 2 }}>
            {meta.subtitle}
          </div>
        </div>
        <button onClick={onClose} title="收起" style={{
          width: 26, height: 26, borderRadius: 4,
          background: 'transparent', border: '1px solid var(--forest-line)',
          color: 'var(--on-forest-2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, lineHeight: 1, fontFamily: 'inherit',
        }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'flow'   && <SubFlow   engine={engine} state={state} />}
        {tab === 'diary'  && <SubDiary  engine={engine} state={state} onOpen={onOpenDiaryDetail} />}
        {tab === 'status' && <SubStatus engine={engine} state={state} />}
        {tab === 'garden' && <SubGarden engine={engine} state={state} />}
      </div>
    </div>
  );
}

/* ── SubFlow ── */
function SubFlow({ engine, state }: any) {
  const hue = MOOD_HUE[state.mood];
  const moodCfg = MOOD_TABLE[state.mood];
  const description = useMemo(() => describeFlow(state.mood, state.focus), [state.mood, state.focus]);
  const [timeline, setTimeline] = useState(() => seedTimeline(state));
  const lastKey = useRef(`${state.mood}|${state.focus}`);

  useEffect(() => {
    const key = `${state.mood}|${state.focus}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setTimeline(prev => [
        { mood: state.mood, focus: state.focus, t: Date.now() },
        ...prev.slice(0, 11),
      ]);
    }
  }, [state.mood, state.focus]);

  return (
    <div style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>
      <div style={{
        padding: '16px 18px',
        background: `linear-gradient(160deg, oklch(0.27 0.05 168), oklch(0.32 0.06 ${(hue + 168) / 2}))`,
        border: `1px solid oklch(0.50 0.10 ${hue} / 0.35)`,
        borderRadius: 8, marginBottom: 14, position: 'relative', overflow: 'hidden',
      }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.4, marginBottom: 6 }}>NOW · 此刻</div>
        <div className="serif" style={{ fontSize: 19, lineHeight: 1.5, color: 'var(--on-forest)', fontStyle: 'italic', marginBottom: 10 }}>
          "{description}"
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag hue={hue}>{MOOD_LABEL_EN[state.mood]}</Tag>
          <Tag variant="outline" hue={hue}>{FOCUS_LABEL_EN[state.focus] || state.focus}</Tag>
          <Tag variant="outline">{state.presence.toUpperCase()}</Tag>
        </div>
        <span style={{
          position: 'absolute', right: 16, top: 16, width: 8, height: 8, borderRadius: '50%',
          background: `oklch(0.82 0.18 ${hue})`,
          boxShadow: `0 0 12px oklch(0.82 0.18 ${hue} / 0.7)`,
          animation: `flowPulse ${moodCfg.breathePeriod}ms ease-in-out infinite`,
        }} />
        <style>{`@keyframes flowPulse { 0%,100%{ transform:scale(1); opacity:0.85 } 50%{ transform:scale(1.4); opacity:1 } }`}</style>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <MicroLabel style={{ color: 'var(--on-forest-2)' }}>近期动向</MicroLabel>
        <div style={{ flex: 1, height: 1, background: 'var(--forest-line)' }} />
      </div>
      <div style={{ display: 'grid', gap: 0 }}>
        {timeline.map((e: any, i: number) => {
          const ehue = MOOD_HUE[e.mood];
          return (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '8px 4px', position: 'relative',
              borderLeft: i === 0 ? `2px solid oklch(0.62 0.13 ${ehue})` : '2px solid var(--forest-line)',
              paddingLeft: 12, marginLeft: 4,
            }}>
              <span style={{
                position: 'absolute', left: -5, top: 11, width: 8, height: 8, borderRadius: '50%',
                background: i === 0 ? `oklch(0.78 0.16 ${ehue})` : `oklch(0.55 0.10 ${ehue})`,
                border: '2px solid var(--forest)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div className="serif" style={{ fontSize: 13.5, color: 'var(--on-forest)', fontWeight: i === 0 ? 600 : 500 }}>
                    {e.focus}
                  </div>
                  <Tag hue={ehue} size="sm">{MOOD_LABEL_EN[e.mood]}</Tag>
                </div>
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 2 }}>
                  {relTime(e.t)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeFlow(_mood: string, _activity: string) {
  // TODO Phase 2d.x: 接入真实数据后，由后端返回描述文本
  return '—';
}

function relTime(t: number) {
  const dt = Math.max(0, Date.now() - t);
  if (dt < 60_000)       return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 3_600_000)    return `${Math.floor(dt / 60_000)}m ago`;
  return `${Math.floor(dt / 3_600_000)}h ago`;
}

function seedTimeline(state: any) {
  // TODO Phase 2d.x: 接入真实时间线数据
  return [{ mood: state.mood, focus: state.focus, t: Date.now() }];
}

/* ── SubDiary ── */
const DIARY_CATEGORIES = ['全部', '日常', '心情', '私语', '梦境', '杂记'];

// TODO Phase 2d.x: 日记数据由后端 API 提供，类型结构参考原 mock 格式：
// { id, when, when_full, category, mood, title, body }
const MOCK_DIARY: any[] = [];

function SubDiary({ state, onOpen }: any) {
  const [cat, setCat] = useState('全部');
  const entries = useMemo(() => cat === '全部' ? MOCK_DIARY : MOCK_DIARY.filter(e => e.category === cat), [cat]);
  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    entries.forEach(e => { const k = e.when_full.slice(0, 9); g[k] = g[k] || []; g[k].push(e); });
    return g;
  }, [entries]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--forest-line)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {DIARY_CATEGORIES.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '3px 9px', borderRadius: 3, fontSize: 11,
              background: cat === c ? 'var(--on-forest)' : 'transparent',
              color: cat === c ? 'var(--forest)' : 'var(--on-forest-2)',
              border: cat === c ? '1px solid var(--on-forest)' : '1px solid var(--forest-line)',
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: cat === c ? 600 : 500,
              transition: 'all 0.15s',
            }}>{c}</button>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 6 }}>
          {entries.length} ENTRIES · {cat === '全部' ? 'ALL' : cat.toUpperCase()}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {Object.entries(groups).map(([month, items]) => (
          <div key={month}>
            <div className="mono" style={{ padding: '8px 16px 4px', fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.4, fontWeight: 600 }}>
              {month.toUpperCase()}
            </div>
            {items.map((e: any) => <DiaryListItem key={e.id} entry={e} onOpen={() => onOpen(e)} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiaryListItem({ entry, onOpen }: any) {
  const hue = MOOD_HUE[entry.mood];
  const preview = previewOf(entry.body);
  return (
    <button onClick={onOpen} style={{
      width: '100%', textAlign: 'left', padding: '10px 16px',
      background: 'transparent', border: 'none', cursor: 'pointer',
      borderLeft: `2px solid transparent`, transition: 'background 0.15s, border-color 0.15s',
      fontFamily: 'inherit', color: 'inherit',
    }}
      onMouseEnter={e => { (e.currentTarget as any).style.background = 'oklch(0.27 0.04 168)'; (e.currentTarget as any).style.borderLeftColor = `oklch(0.62 0.13 ${hue})`; }}
      onMouseLeave={e => { (e.currentTarget as any).style.background = 'transparent'; (e.currentTarget as any).style.borderLeftColor = 'transparent'; }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.2, color: 'var(--on-forest-2)' }}>{entry.when}</span>
        <Tag hue={hue} size="sm">{entry.category}</Tag>
      </div>
      <div className="serif" style={{
        fontSize: 14, fontWeight: 600, color: 'var(--on-forest)', marginBottom: 4, letterSpacing: -0.2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{entry.title}</div>
      <div style={{
        fontSize: 12, color: 'var(--on-forest-2)', lineHeight: 1.5,
        fontFamily: 'var(--font-serif)', fontStyle: 'italic',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden',
      }}>{preview}</div>
    </button>
  );
}

function previewOf(body: string) {
  const first = (body || '').split('\n\n')[0] || '';
  return first.length <= 50 ? first : first.slice(0, 50) + '…';
}

export function DiaryDetailView({ entry }: any) {
  const hue = MOOD_HUE[entry.mood];
  const paragraphs = (entry.body || '').split('\n\n');
  return (
    <div style={{ padding: '26px 32px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Tag hue={hue}>{MOOD_LABEL_EN[entry.mood]}</Tag>
        <Tag variant="outline">{entry.category}</Tag>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1.2 }}>{entry.when_full}</span>
      </div>
      <h1 className="serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5, margin: '4px 0 22px', color: 'var(--ink)' }}>
        {entry.title}
      </h1>
      <div style={{ height: 1, background: 'var(--paper-edge)', marginBottom: 20 }} />
      <div className="serif" style={{ fontSize: 16, lineHeight: 1.85, color: 'var(--ink)', fontStyle: 'italic' }}>
        {paragraphs.map((p: string, i: number) => <p key={i} style={{ margin: '0 0 1em' }}>{p}</p>)}
      </div>
    </div>
  );
}

/* ── SubStatus ── */
function SubStatus({ engine, state }: any) {
  const moodCfg = MOOD_TABLE[state.mood];
  const hue = MOOD_HUE[state.mood];
  const [history, setHistory] = useState(() =>
    Array.from({ length: 36 }, () => ({ mood: state.mood, t: Date.now() }))
  );
  useEffect(() => {
    const h = setInterval(() => {
      setHistory(prev => [...prev.slice(1), { mood: engine.get().mood, t: Date.now() }]);
    }, 3000);
    return () => clearInterval(h);
  }, [engine]);

  return (
    <div style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>
      <div style={{
        padding: '14px 16px',
        background: `linear-gradient(135deg, oklch(0.30 0.05 168), oklch(0.34 0.07 ${(hue + 168) / 2}))`,
        border: '1px solid var(--forest-line)', borderRadius: 6, marginBottom: 12,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--on-forest-2)', marginBottom: 4 }}>MOOD</div>
            <div className="serif" style={{ fontSize: 26, color: 'var(--on-forest)', fontWeight: 600, letterSpacing: -0.3 }}>{state.mood}</div>
            <div className="mono" style={{ fontSize: 10.5, color: `oklch(0.85 0.10 ${hue})`, letterSpacing: 1.3, marginTop: 4 }}>
              {MOOD_LABEL_EN[state.mood]}
            </div>
          </div>
          <div style={{
            width: 50, height: 50,
            background: `radial-gradient(circle, oklch(0.80 0.18 ${hue} / 0.7), transparent 70%)`,
            borderRadius: '50%',
            animation: `auraPulseB ${moodCfg.breathePeriod}ms ease-in-out infinite`,
          }} />
        </div>
        <style>{`@keyframes auraPulseB { 0%,100%{ transform:scale(1); opacity:0.7 } 50%{ transform:scale(1.15); opacity:1 } }`}</style>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <ForestCard label="ACTIVITY">
          <div className="serif" style={{ fontSize: 15, color: 'var(--on-forest)', fontWeight: 600 }}>{state.focus}</div>
        </ForestCard>
        <ForestCard label="PRESENCE">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: state.presence === 'active' ? 'oklch(0.72 0.16 145)' : state.presence === 'idle' ? 'oklch(0.72 0.14 85)' : 'oklch(0.65 0.10 30)',
              boxShadow: state.presence === 'active' ? '0 0 8px oklch(0.72 0.16 145)' : 'none',
            }} />
            <div className="serif" style={{ fontSize: 15, color: 'var(--on-forest)', fontWeight: 600, textTransform: 'capitalize' }}>
              {state.presence}
            </div>
          </div>
        </ForestCard>
      </div>
      <MicroLabel style={{ color: 'var(--on-forest-2)' }}>持续可感知信号</MicroLabel>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <Meter value={1 / moodCfg.breathePeriod * 4500} label="呼吸频率" hue={hue} />
        <Meter value={moodCfg.eyeFollow} label="视线锁定度" hue={hue} />
        <Meter value={moodCfg.auraIntensity} label="情绪光晕" hue={hue} />
        <Meter value={moodCfg.irregularity} label="节奏不规则" hue={hue} />
      </div>
      <div style={{ height: 1, background: 'var(--forest-line)', margin: '14px 0' }} />
      <MicroLabel style={{ color: 'var(--on-forest-2)' }}>近 2 分钟 mood 轨迹</MicroLabel>
      <div style={{ display: 'flex', gap: 1, height: 24, marginTop: 8, borderRadius: 3, overflow: 'hidden', background: 'oklch(0.24 0.03 168)' }}>
        {history.map((h: any, i: number) => (
          <div key={i} style={{
            flex: 1, background: `oklch(0.62 0.13 ${MOOD_HUE[h.mood] || 70})`,
            opacity: 0.7 + (i / history.length) * 0.3,
          }} />
        ))}
      </div>
    </div>
  );
}

function ForestCard({ label, children }: any) {
  return (
    <div style={{ padding: '10px 12px', background: 'oklch(0.27 0.04 168)', border: '1px solid var(--forest-line)', borderRadius: 5 }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: 1.4, color: 'var(--on-forest-2)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

/* ── SubGarden ── */
function SubGarden({ state }: any) {
  const [growth, setGrowth] = useState<Record<string, number>>({
    '平静': 0.62, '开心': 0.41, '低落': 0.18, '病娇': 0.08, '分心': 0.25,
  });
  useEffect(() => {
    const h = setInterval(() => {
      setGrowth(prev => ({ ...prev, [state.mood]: Math.min(1, (prev[state.mood] || 0) + 0.002) }));
    }, 1500);
    return () => clearInterval(h);
  }, [state.mood]);

  return (
    <div style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>
      <div className="serif" style={{ fontSize: 12.5, color: 'var(--on-forest-2)', marginBottom: 12, lineHeight: 1.6, fontStyle: 'italic' }}>
        每种心情都让对应的植物多长出一点。他在你不看的时候，也在生长。
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {MOODS.map(m => {
          const hue = MOOD_HUE[m];
          const v = growth[m] || 0;
          const isActive = state.mood === m;
          return (
            <div key={m} style={{
              padding: '12px 14px',
              background: isActive ? `oklch(0.34 0.06 168)` : 'oklch(0.27 0.04 168)',
              border: isActive ? `1px solid oklch(0.55 0.12 ${hue})` : '1px solid var(--forest-line)',
              borderRadius: 5, transition: 'all 0.4s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Plant hue={hue} growth={v} active={isActive} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: 'var(--on-forest)' }}>{plantName(m)}</div>
                    {isActive && <Tag hue={hue} size="sm">生长中</Tag>}
                  </div>
                  <Meter value={v} hue={hue} />
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 4 }}>
                    {MOOD_LABEL_EN[m]} · {growthStage(v).toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function plantName(mood: string) {
  return ({ '平静': '雏菊 · Daisy', '开心': '向日葵 · Sunflower', '低落': '蓝铃 · Bluebell', '病娇': '红玫瑰 · Rose', '分心': '蒲公英 · Dandelion' } as any)[mood];
}
function growthStage(v: number) {
  if (v < 0.2) return 'seed';
  if (v < 0.45) return 'sprout';
  if (v < 0.7) return 'budding';
  if (v < 0.95) return 'blooming';
  return 'matured';
}
function Plant({ hue, growth, active }: any) {
  const h = 14 + growth * 40, r = 4 + growth * 8;
  return (
    <svg width="48" height="60" viewBox="0 0 48 60"
      style={{ filter: active ? `drop-shadow(0 0 8px oklch(0.7 0.14 ${hue} / 0.5))` : 'none' }}>
      <rect x="6" y="54" width="36" height="4" rx="1" fill="oklch(0.28 0.04 60)" />
      <line x1="24" y1="54" x2="24" y2={54 - h} stroke="oklch(0.55 0.10 145)" strokeWidth="1.6" strokeLinecap="round" />
      {growth > 0.25 && (<>
        <path d={`M 24 ${54 - h * 0.4} q -8 -2 -10 -8 q 6 -2 10 8`} fill="oklch(0.55 0.10 145)" />
        <path d={`M 24 ${54 - h * 0.6} q 8 -2 10 -8 q -6 -2 -10 8`} fill="oklch(0.60 0.11 145)" />
      </>)}
      {growth > 0.2
        ? <circle cx="24" cy={54 - h} r={r} fill={`oklch(0.78 0.16 ${hue})`} stroke={`oklch(0.55 0.13 ${hue})`} strokeWidth="0.8" />
        : <circle cx="24" cy={54 - h} r={3} fill="oklch(0.55 0.10 145)" />}
      {growth > 0.55 && <circle cx="24" cy={54 - h} r={r * 0.4} fill="oklch(0.95 0.10 80)" />}
    </svg>
  );
}
