/* SubFlow — Live Feed 面板 (Phase 2d.1) */

import { Tag, MicroLabel } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, FOCUS_LABEL_EN } from './UIKit';
import { MOOD_TABLE } from '../../../shared/state/store';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { useI18n } from '../../../shared/i18n';
import { translateLegacyText } from '../../../shared/i18n/legacy';
import { usePresenterSnapshot } from '../../../shared/design-mod/presenters/react';
import type { FlowPresenter } from '../../../shared/design-mod/presenters/types';
import { DesignAwareRegion } from '../../../shared/design-mod/regions';

function formatAgo(timestamp: number): string {
  const dt = Math.max(0, Date.now() - timestamp);
  if (dt < 60_000) return `${Math.floor(dt / 1000)}s ago`;
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  return `${Math.floor(dt / 86_400_000)}d ago`;
}

function toolStatusNarrative(status: NonNullable<ReturnType<FlowPresenter['get']>['toolStatus']>, translate: (key: any) => string): string {
  const template = status.kind === 'waiting' ? translate('flow.toolStatus.waiting')
    : status.kind === 'failed' ? translate('flow.toolStatus.failed')
      : status.kind === 'outcome_unknown' ? translate('flow.toolStatus.outcomeUnknown')
        : status.kind === 'cancelled' ? translate('flow.toolStatus.cancelled')
          : status.kind === 'finished' ? translate('flow.toolStatus.finished')
            : translate('flow.toolStatus.calling');
  return template.replace('{label}', status.label);
}

export function SubFlow({ presenter }: { presenter: FlowPresenter }) {
  const { language, t } = useI18n();
  const snapshot = usePresenterSnapshot(presenter, 'official.sidebar.flow');
  const hue = snapshot.mood.hue ?? MOOD_HUE[snapshot.mood.id] ?? 70;
  const moodCfg = MOOD_TABLE[snapshot.mood.id] ?? MOOD_TABLE['平静'];
  const narrative = snapshot.toolStatus ? toolStatusNarrative(snapshot.toolStatus, t) : snapshot.narrative;
  const localizedNarrative = language === 'en-US' ? translateLegacyText(narrative) : narrative;

  return (
    <div data-sidebar-capability="flow" style={{ padding: '12px 14px 18px', overflowY: 'auto', height: '100%' }}>
      {snapshot.error && <div className="mono" style={{ color: 'var(--on-forest-2)', fontSize: chatThemeFontSize(10), marginBottom: 8 }}>{snapshot.error}</div>}
      <DesignAwareRegion id="chat.sidebar.flow.now">
        <div style={{ padding: '16px 18px', background: `radial-gradient(ellipse at 80% 20%, oklch(0.55 0.18 ${hue} / 0.28), transparent 55%), linear-gradient(160deg, oklch(0.27 0.05 168), oklch(0.32 0.06 ${(hue + 168) / 2}))`, border: `1px solid oklch(0.50 0.10 ${hue} / 0.35)`, borderRadius: 8, marginBottom: 14, position: 'relative', overflow: 'hidden', transition: 'border-color 3s ease' }}>
          <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.4, marginBottom: 6 }}>NOW · 此刻</div>
          <div className="serif" style={{ fontSize: chatThemeFontSize(19), lineHeight: 1.6, color: 'var(--on-forest)', fontStyle: 'italic', marginBottom: 12 }}>{language === 'en-US' ? `“${localizedNarrative}”` : `「${localizedNarrative}」`}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Tag hue={hue}>{snapshot.mood.id}</Tag><Tag variant="outline" hue={hue}>{snapshot.focus.label || FOCUS_LABEL_EN[snapshot.focus.id] || snapshot.focus.id}</Tag><Tag variant="outline">{snapshot.presence.id.toUpperCase()}</Tag></div>
          <span style={{ position: 'absolute', right: 16, top: 16, width: 8, height: 8, borderRadius: '50%', background: `oklch(0.82 0.18 ${hue})`, boxShadow: `0 0 12px oklch(0.82 0.18 ${hue} / 0.7)`, animation: `flowPulse ${moodCfg.breathePeriod}ms ease-in-out infinite` }} />
        </div>
      </DesignAwareRegion>

      <style>{`@keyframes flowPulse { 0%,100%{transform:scale(1);opacity:.85} 50%{transform:scale(1.4);opacity:1} }`}</style>

      <DesignAwareRegion id="chat.sidebar.flow.timeline">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><MicroLabel style={{ color: 'var(--on-forest-2)' }}>近期动向</MicroLabel><div style={{ flex: 1, height: 1, background: 'var(--forest-line)' }} /></div>
        <div style={{ display: 'grid', gap: 0 }}>
          {snapshot.timeline.length === 0 && <div className="serif" style={{ fontSize: chatThemeFontSize(13), color: 'var(--on-forest-2)', fontStyle: 'italic', padding: '6px 4px' }}>暂无记录</div>}
          {snapshot.timeline.map((entry, index) => {
            const entryHue = MOOD_HUE[entry.mood] ?? 70;
            return <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '8px 4px', position: 'relative', borderLeft: index === 0 ? `2px solid oklch(0.62 0.13 ${entryHue})` : '2px solid var(--forest-line)', paddingLeft: 12, marginLeft: 4 }}><span style={{ position: 'absolute', left: -5, top: 11, width: 8, height: 8, borderRadius: '50%', background: index === 0 ? `oklch(0.78 0.16 ${entryHue})` : `oklch(0.55 0.10 ${entryHue})`, border: '2px solid var(--forest)' }} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><div className="serif" style={{ fontSize: chatThemeFontSize(13.5), color: 'var(--on-forest)', fontWeight: index === 0 ? 600 : 500 }}>{entry.text}</div><Tag hue={entryHue} size="sm">{MOOD_LABEL_EN[entry.mood] ?? entry.mood}</Tag></div><div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--on-forest-2)', letterSpacing: 1.2, marginTop: 2 }}>{formatAgo(entry.timestamp)}</div></div></div>;
          })}
        </div>
      </DesignAwareRegion>
    </div>
  );
}
