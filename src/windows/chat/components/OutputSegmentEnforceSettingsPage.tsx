import { useEffect, useState } from 'react';
import {
  getOutputSegmentEnforceSettings,
  updateOutputSegmentEnforceSettings,
  type OutputSegmentEnforceSettings,
} from '../../../shared/api/outputSegmentEnforce';
import { useI18n } from '../../../shared/i18n';

function Switch({ active, onClick, disabled, label }: { active: boolean; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 42, height: 22, borderRadius: 11,
        background: active ? 'var(--accent-3)' : 'var(--paper-3)',
        border: '1px solid var(--paper-edge)',
        cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative', padding: 0,
        transition: 'background 0.2s', opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 1, left: active ? 21 : 1,
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--paper)', boxShadow: '0 1px 3px var(--shadow-rgb-mix)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

export function OutputSegmentEnforceSettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<OutputSegmentEnforceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getOutputSegmentEnforceSettings()
      .then(value => { if (mounted) setSettings(value); })
      .catch(reason => { if (mounted) setError(`${t('settings.segmentEnforce.loadFailed')}：${String(reason)}`); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [t]);

  async function toggle() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await updateOutputSegmentEnforceSettings(!settings.enabled));
    } catch (reason) {
      setError(`${t('settings.segmentEnforce.saveFailed')}：${String(reason)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('settings.segmentEnforce.loading')}</div>;
  }

  if (!settings) {
    return <div className="mono" style={{ color: 'var(--danger)', fontSize: 10.5 }}>{error ?? t('common.loadFailed')}</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
          {t('settings.segmentEnforce.title')}
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          {t('settings.segmentEnforce.description')}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
            {t('settings.segmentEnforce.toggleLabel')}
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
            {t('settings.segmentEnforce.toggleHint')} · {t('settings.segmentEnforce.threshold')} {settings.min_len}
          </div>
        </div>
        <Switch
          active={settings.enabled}
          disabled={saving}
          label={t('settings.segmentEnforce.toggleLabel')}
          onClick={() => void toggle()}
        />
      </div>
      {error && <div className="mono" style={{ color: 'var(--danger)', fontSize: 10.5 }}>{error}</div>}
    </div>
  );
}
