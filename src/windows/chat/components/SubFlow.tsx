/* SubFlow — Live Feed 面板 (Phase 2d.1) */

import { useState, useEffect } from 'react';
import { Tag, MicroLabel } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, FOCUS_LABEL_EN } from './UIKit';
import { MOOD_TABLE } from '../../../shared/state/store';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { getUIPref, setUIPref } from '../../../shared/uiPreferences';
import type { Mood } from '../../../shared/state/store';
import { useI18n } from '../../../shared/i18n';
import { translateLegacyText } from '../../../shared/i18n/legacy';

interface FlowEntry {
  id: string;
  text: string;
  mood: Mood;
  timestamp: number;
}

function buildNarrative(
  activity: { id: string | null; text: string } | null,
  focus: string,
  presence: string,
): string {
  if (presence === 'away') return '他不在。';
  if (activity?.id === 'watching_you') return '他坐在那儿，看着你。';

  const rawText = activity ? activity.text.replace(/{book}/g, '读着书') : null;
  const activityPhrase = rawText ? `他${rawText}` : '他坐在那儿';

  const focusMap: Record<string, string> = {
    '看你':         '，眼睛却落在你身上。',
    '看你打字':     '，注意到你在打字。',
    '偷看':         '，偶尔偷看你这边。',
    '注意到了什么': '，忽然抬头朝这边看。',
    '看屏幕':       '，眼神有点放空。',
    '想事情':       '，看起来在想事情。',
    '发呆':         '，眼神空空的。',
  };

  const focusPhrase = focusMap[focus] ?? '';
  const main = focusPhrase
    ? `${activityPhrase}${focusPhrase}`
    : `${activityPhrase}。`;
  return presence === 'idle' ? `${main}（他安静了一会儿。）` : main;
}

function formatAgo(timestamp: number): string {
  const dt = Math.max(0, Date.now() - timestamp);
  if (dt < 60_000)     return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 3_600_000)  return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return `${Math.floor(dt / 86_400_000)}d ago`;
}

export function SubFlow({ engine }: { engine: any }) {
  const { language } = useI18n();
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);

  // ── persistent timeline (uiPreferences file backend, 8-hour window) ──────
  const EIGHT_HOURS = 8 * 3_600_000;
  const STORAGE_KEY = 'subflow_timeline';

  function loadTimeline(): FlowEntry[] {
    let parsed = getUIPref<FlowEntry[] | null>(STORAGE_KEY, null);
    if (parsed === null) {
      // one-time migration from the pre-uiPreferences bare localStorage key
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          parsed = JSON.parse(legacy);
          setUIPref(STORAGE_KEY, parsed);
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        parsed = null;
      }
    }
    if (!parsed) return [];
    return parsed.filter(e => Date.now() - e.timestamp < EIGHT_HOURS);
  }

  const [timeline, setTimeline] = useState<FlowEntry[]>(loadTimeline);

  useEffect(() => {
    const entryText = state.activity
      ? state.activity.text.replace(/{book}/g, '读着书')
      : state.focus;
    setTimeline(prev => {
      // dedup against the persisted first entry (not a render-scoped ref) so this
      // survives component remounts; mood is intentionally excluded from the check —
      // same wording with a different mood shouldn't spawn a new timeline entry.
      if (prev[0]?.text === entryText) return prev;
      const next = [
        { id: String(Date.now()), text: entryText, mood: state.mood as Mood, timestamp: Date.now() },
        ...prev.filter(e => Date.now() - e.timestamp < EIGHT_HOURS),
      ];
      setUIPref(STORAGE_KEY, next);
      return next;
    });
  }, [state.activity, state.mood, state.focus]);

  // ── 30s tick so relative timestamps stay live ─────────────────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(h);
  }, []);

  const hue = MOOD_HUE[state.mood] ?? 70;
  const moodCfg = MOOD_TABLE[state.mood] ?? MOOD_TABLE['平静'];
  const narrative = buildNarrative(state.activity, state.focus, state.presence);
  const localizedNarrative = language === 'en-US' ? translateLegacyText(narrative) : narrative;

  return (
    <div style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>

      {/* ── NOW 卡片 ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 18px',
        background: `
          radial-gradient(ellipse at 80% 20%, oklch(0.55 0.18 ${hue} / 0.28), transparent 55%),
          linear-gradient(160deg, oklch(0.27 0.05 168), oklch(0.32 0.06 ${(hue + 168) / 2}))
        `,
        border: `1px solid oklch(0.50 0.10 ${hue} / 0.35)`,
        borderRadius: 8,
        marginBottom: 14,
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 3s ease',
      }}>
        <div className="mono" style={{
          fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.4, marginBottom: 6,
        }}>
          NOW · 此刻
        </div>
        <div className="serif" style={{
          fontSize: chatThemeFontSize(19), lineHeight: 1.6,
          color: 'var(--on-forest)',
          fontStyle: 'italic',
          marginBottom: 12,
        }}>
          {language === 'en-US' ? `“${localizedNarrative}”` : `「${localizedNarrative}」`}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag hue={hue}>{state.mood}</Tag>
          <Tag variant="outline" hue={hue}>{FOCUS_LABEL_EN[state.focus] ?? state.focus}</Tag>
          <Tag variant="outline">{state.presence.toUpperCase()}</Tag>
        </div>
        {/* 脉冲彩点，颜色 = 当前 MOOD_HUE */}
        <span style={{
          position: 'absolute', right: 16, top: 16,
          width: 8, height: 8, borderRadius: '50%',
          background: `oklch(0.82 0.18 ${hue})`,
          boxShadow: `0 0 12px oklch(0.82 0.18 ${hue} / 0.7)`,
          animation: `flowPulse ${moodCfg.breathePeriod}ms ease-in-out infinite`,
        }} />
      </div>

      <style>{`@keyframes flowPulse { 0%,100%{ transform:scale(1); opacity:0.85 } 50%{ transform:scale(1.4); opacity:1 } }`}</style>

      {/* ── 近期动向时间轴 ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <MicroLabel style={{ color: 'var(--on-forest-2)' }}>近期动向</MicroLabel>
        <div style={{ flex: 1, height: 1, background: 'var(--forest-line)' }} />
      </div>

      <div style={{ display: 'grid', gap: 0 }}>
        {timeline.filter(e => Date.now() - e.timestamp < EIGHT_HOURS).length === 0 && (
          <div className="serif" style={{
            fontSize: chatThemeFontSize(13), color: 'var(--on-forest-2)',
            fontStyle: 'italic', padding: '6px 4px',
          }}>
            暂无记录
          </div>
        )}
        {timeline.filter(e => Date.now() - e.timestamp < EIGHT_HOURS).map((e, i) => {
          const ehue = MOOD_HUE[e.mood] ?? 70;
          return (
            <div key={e.id} style={{
              display: 'flex', gap: 12, padding: '8px 4px',
              position: 'relative',
              borderLeft: i === 0
                ? `2px solid oklch(0.62 0.13 ${ehue})`
                : '2px solid var(--forest-line)',
              paddingLeft: 12, marginLeft: 4,
            }}>
              <span style={{
                position: 'absolute', left: -5, top: 11,
                width: 8, height: 8, borderRadius: '50%',
                background: i === 0
                  ? `oklch(0.78 0.16 ${ehue})`
                  : `oklch(0.55 0.10 ${ehue})`,
                border: '2px solid var(--forest)',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div className="serif" style={{
                    fontSize: chatThemeFontSize(13.5),
                    color: 'var(--on-forest)',
                    fontWeight: i === 0 ? 600 : 500,
                  }}>
                    {e.text}
                  </div>
                  <Tag hue={ehue} size="sm">{MOOD_LABEL_EN[e.mood] ?? e.mood}</Tag>
                </div>
                <div className="mono" style={{
                  fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 2,
                }}>
                  {formatAgo(e.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
