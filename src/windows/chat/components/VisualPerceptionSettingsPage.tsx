import { useEffect, useState } from 'react';
import {
  getVisualPerceptionSettings,
  updateVisualPerceptionSettings,
  type VisualPerceptionSettings,
} from '../../../shared/api/visual-perception';
import { useI18n } from '../../../shared/i18n';

const resultKeys = {
  idle: 'settings.visual.result.idle',
  local_disabled: 'settings.visual.result.local_disabled',
  backend_disabled: 'settings.visual.result.backend_disabled',
  locked: 'settings.visual.result.locked',
  unchanged: 'settings.visual.result.unchanged',
  pushed: 'settings.visual.result.pushed',
  backend_not_processing: 'settings.visual.result.backend_not_processing',
  failed: 'settings.visual.result.failed',
} as const;

function formatTime(value: number | null, empty: string): string {
  if (value === null) return empty;
  return new Date(value * 1000).toLocaleString();
}

export function VisualPerceptionSettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<VisualPerceptionSettings | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getVisualPerceptionSettings()
      .then(value => {
        setSettings(value);
        setMinutes(value.sampleIntervalSeconds / 60);
        setError(null);
      })
      .catch(() => setError(t('settings.visual.loadFailed')));
  };

  useEffect(() => { refresh(); }, []);

  const save = async (enabled: boolean, nextMinutes: number) => {
    const clamped = Math.max(1, Math.min(60, Math.round(nextMinutes)));
    setSaving(true);
    try {
      const value = await updateVisualPerceptionSettings(enabled, clamped * 60);
      setSettings(value);
      setMinutes(clamped);
      setError(null);
    } catch {
      setError(t('settings.visual.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>{error ?? t('settings.visual.loading')}</div>;
  }

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t('settings.visual.title')}</div>
        <div className="mono" style={{ marginTop: 3, fontSize: 9.5, letterSpacing: 0.8, color: 'var(--ink-3)' }}>{t('settings.visual.description')}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{t('settings.visual.toggleLabel')}</div>
          <div className="mono" style={{ marginTop: 2, fontSize: 9.5, letterSpacing: 0.7, color: 'var(--ink-3)' }}>{t('settings.visual.toggleHint')}</div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(!settings.enabled, minutes)}
          aria-label={t('settings.visual.toggleLabel')}
          style={{ width: 42, height: 22, flexShrink: 0, borderRadius: 11, border: 'none', cursor: saving ? 'wait' : 'pointer', background: settings.enabled ? 'var(--accent)' : 'var(--paper-edge)', padding: 2 }}
        >
          <span style={{ display: 'block', width: 18, height: 18, borderRadius: '50%', background: 'white', transform: `translateX(${settings.enabled ? 20 : 0}px)`, transition: 'transform .2s' }} />
        </button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: settings.enabled ? 1 : 0.55 }}>
        <span>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{t('settings.visual.intervalLabel')}</span>
          <span className="mono" style={{ display: 'block', marginTop: 2, fontSize: 9.5, letterSpacing: 0.7, color: 'var(--ink-3)' }}>{t('settings.visual.intervalHint')}</span>
        </span>
        <input
          type="number"
          min={1}
          max={60}
          value={minutes}
          disabled={saving || !settings.enabled}
          onChange={event => setMinutes(Number(event.target.value))}
          onBlur={() => void save(settings.enabled, minutes)}
          style={{ width: 64, padding: '6px 8px', border: '1px solid var(--paper-edge)', borderRadius: 6, background: 'var(--paper-2)', color: 'var(--ink)' }}
        />
      </label>
      <div style={{ padding: '10px 12px', border: '1px solid var(--paper-edge)', borderRadius: 8, background: 'var(--paper-2)', display: 'grid', gap: 4 }}>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 0.7, color: 'var(--ink-3)' }}>{t('settings.visual.lastResult')}: {t(resultKeys[settings.status.lastResult])}</div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 0.7, color: 'var(--ink-3)' }}>{t('settings.visual.lastPush')}: {formatTime(settings.status.lastPushAt, t('settings.visual.never'))}</div>
        <div className="mono" style={{ fontSize: 9.5, letterSpacing: 0.7, color: 'var(--ink-3)' }}>{t('settings.visual.failures')}: {settings.status.failureCount}</div>
      </div>
      {error && <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>{error}</div>}
    </section>
  );
}
