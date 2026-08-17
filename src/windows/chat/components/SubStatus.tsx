/* SubStatus — 状态面板 (Phase 2d.3) */

import type { CSSProperties } from 'react';
import { MicroLabel } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN } from './UIKit';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { usePresenterSnapshot } from '../../../shared/design-mod/presenters/react';
import type { StatusPresenter } from '../../../shared/design-mod/presenters/types';

type StatusStyle = CSSProperties & Record<`--status-${string}`, string | number>;

export function SubStatus({ presenter }: { presenter: StatusPresenter }) {
  const snapshot = usePresenterSnapshot(presenter, 'official.sidebar.status');
  const { mood, activity, presence, telemetry, timeline, errors } = snapshot;
  const hue = mood.hue ?? MOOD_HUE[mood.id] ?? 70;
  const style: StatusStyle = {
    '--status-mood-hue': hue,
    '--status-aura': telemetry.moodAura,
    '--status-breath': telemetry.breath,
    '--status-gaze-lock': telemetry.gazeLock,
    '--status-rhythm': telemetry.rhythm,
    '--status-indicator-size': `${8 + telemetry.moodAura / 18}px`,
    '--status-glow-x': '75%',
    '--status-glow-y': '25%',
  };
  const moodError = errors.mood;
  const activityError = errors.activity;
  const sensorError = errors.sensor;
  const hasError = moodError || activityError || sensorError;

  return (
    <div data-sidebar-capability="status" style={{ ...style, padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>
      {hasError && <div style={{ marginBottom: 10, padding: '8px 12px', background: 'oklch(0.26 0.04 30 / 0.40)', border: '1px solid oklch(0.45 0.08 30 / 0.50)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="mono" style={{ flex: 1, fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.1 }}>{moodError ? 'mood' : ''}{moodError && activityError ? ' · ' : ''}{activityError ? 'activity' : ''}{sensorError && !moodError && !activityError ? 'sensor' : ''} 无法连接</span>
        <button onClick={() => { if (moodError) presenter.commands.retryMood(); if (activityError) presenter.commands.retryActivity(); if (sensorError) presenter.commands.retrySensor(); }} style={{ fontSize: chatThemeFontSize(10), padding: '2px 8px', borderRadius: 'var(--radius-xs)', cursor: 'pointer', background: 'transparent', border: '1px solid var(--forest-line)', color: 'var(--on-forest-2)', fontFamily: 'inherit' }}>重试</button>
      </div>}

      <div data-status-region="mood" style={{ padding: '14px 16px 16px', background: 'radial-gradient(ellipse at var(--status-glow-x) var(--status-glow-y), oklch(0.42 0.14 var(--status-mood-hue) / calc(var(--status-aura) / 100 * 0.55 + 0.06)), transparent 65%), linear-gradient(160deg, var(--forest-1), var(--forest-2))', border: '1px solid oklch(0.50 0.10 var(--status-mood-hue) / 0.30)', borderRadius: 'var(--radius-md)', marginBottom: 10, position: 'relative', overflow: 'hidden', transition: 'background 3s ease, border-color 3s ease' }}>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.4, marginBottom: 6 }}>MOOD</div>
        <div className="serif" style={{ fontSize: chatThemeFontSize(26), fontWeight: 600, color: 'var(--on-forest)', letterSpacing: -0.3, lineHeight: 1.1 }}>{mood.id}</div>
        <div className="mono" style={{ fontSize: chatThemeFontSize(10.5), color: 'oklch(0.85 0.10 var(--status-mood-hue))', letterSpacing: 1.3, marginTop: 5 }}>{MOOD_LABEL_EN[mood.id] ?? mood.label}</div>
        <span data-status-element="mood-indicator" style={{ position: 'absolute', right: 14, top: 14, width: 'var(--status-indicator-size)', height: 'var(--status-indicator-size)', borderRadius: '50%', background: 'oklch(0.82 0.18 var(--status-mood-hue))', boxShadow: '0 0 10px oklch(0.82 0.18 var(--status-mood-hue) / 0.65)', animation: 'statusPulse 3s ease-in-out infinite' }} />
        <span data-status-element="mood-glow" aria-hidden="true" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div data-status-region="activity"><ForestCard label="ACTIVITY"><div className="serif" style={{ fontSize: chatThemeFontSize(14), color: 'var(--on-forest)', fontWeight: 600, lineHeight: 1.3 }}>{activity?.text ?? '——'}</div>{activity?.arc && <div className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 3 }}>{activity.arc.toUpperCase()}</div>}</ForestCard></div>
        <div data-status-region="presence"><ForestCard label="PRESENCE"><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: presence.id === 'active' ? 'oklch(0.72 0.16 145)' : presence.id === 'idle' ? 'oklch(0.72 0.14 85)' : 'oklch(0.65 0.10 30)', boxShadow: presence.id === 'active' ? '0 0 7px oklch(0.72 0.16 145)' : 'none' }} /><div className="serif" style={{ fontSize: chatThemeFontSize(14), color: 'var(--on-forest)', fontWeight: 600, textTransform: 'capitalize' }}>{presence.id}</div></div></ForestCard></div>
      </div>

      <div data-status-region="telemetry"><MicroLabel style={{ color: 'var(--on-forest-2)' }}>持续可感知信号 · {telemetry.source}</MicroLabel><div style={{ display: 'grid', gap: 9, marginTop: 10 }}><SignalBar label="呼吸频率" value={telemetry.breath} hue={hue} transition="2s" /><SignalBar label="视线锁定度" value={telemetry.gazeLock} hue={hue} transition="0.1s" /><SignalBar label="情绪光晕" value={telemetry.moodAura} hue={hue} transition="3s" /><SignalBar label="节奏不规则" value={telemetry.rhythm} hue={hue} transition="0.5s" /></div></div>

      <div data-status-region="timeline" style={{ borderTop: '1px solid var(--forest-line)', marginTop: 14, paddingTop: 14 }}><MicroLabel style={{ color: 'var(--on-forest-2)' }}>近 2 分钟 mood 轨迹</MicroLabel><div style={{ display: 'flex', gap: 1, height: 28, marginTop: 8, borderRadius: 'var(--radius-xs)', overflow: 'hidden', background: 'oklch(0.22 0.03 168)', alignItems: 'flex-end' }}>{timeline.map((entry, index) => <div key={entry.sampledAt} style={{ flex: 1, height: `${Math.max(10, entry.aura)}%`, background: `oklch(0.62 0.13 ${entry.hue})`, opacity: 0.45 + (index / Math.max(1, timeline.length - 1)) * 0.55, transition: 'height 0.5s ease' }} />)}</div></div>
      <style>{`@keyframes statusPulse { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.5);opacity:1} }`}</style>
    </div>
  );
}

function ForestCard({ label, children }: { label: string; children: React.ReactNode }) { return <div style={{ padding: '9px 11px', background: 'var(--forest-1)', border: '1px solid var(--forest-line)', borderRadius: 'var(--radius-sm)' }}><div className="mono" style={{ fontSize: chatThemeFontSize(9), letterSpacing: 1.4, color: 'var(--on-forest-2)', marginBottom: 5 }}>{label}</div>{children}</div>; }

function SignalBar({ label, value, hue, transition }: { label: string; value: number; hue: number; transition: string }) { return <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.2 }}>{label}</span><span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)' }}>{value}%</span></div><div style={{ position: 'relative', height: 5, background: 'oklch(0.22 0.03 168)', border: '1px solid var(--forest-line)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${value}%`, background: `oklch(0.62 0.13 ${hue})`, transition: `width ${transition} ease` }} />{Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i + 1) * 25}%`, width: 1, background: 'oklch(0.50 0.02 168 / 0.15)' }} />)}</div></div>; }
