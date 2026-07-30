import { useEffect, useState } from 'react';
import {
  clearPeriodDate,
  loadPeriodDate,
  setPeriodDate,
  type PeriodDateResponse,
} from '../../../../shared/api/backend';
import { useI18n } from '../../../../shared/i18n';

export function PeriodDateSettings() {
  const { t } = useI18n();
  const [state, setState] = useState<PeriodDateResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPeriodDate()
      .then(value => {
        setState(value);
        setDraft(value.last_period_date ?? '');
      })
      .catch(() => setError(t('settings.period.loadFailed')));
  }, [t]);

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft)) {
      setError(t('settings.period.invalidDate'));
      return;
    }

    setSaving(true);
    try {
      const value = await setPeriodDate(draft);
      setState(value);
      setDraft(value.last_period_date ?? '');
      setError(null);
    } catch {
      setError(t('settings.period.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      const value = await clearPeriodDate();
      setState(value);
      setDraft('');
      setError(null);
    } catch {
      setError(t('settings.period.clearFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t('settings.period.title')}</div>
        <div className="mono" style={{ marginTop: 3, fontSize: 9.5, letterSpacing: 0.8, color: 'var(--ink-3)' }}>{t('settings.period.description')}</div>
      </div>
      <label style={{ display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{t('settings.period.dateLabel')}</span>
        <input
          type="date"
          value={draft}
          disabled={saving}
          onChange={event => setDraft(event.target.value)}
          style={{ width: 168, padding: '6px 8px', border: '1px solid var(--paper-edge)', borderRadius: 6, background: 'var(--paper-2)', color: 'var(--ink)' }}
        />
      </label>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
        {state?.last_period_date ? `${t('settings.period.current')}: ${state.last_period_date}` : t('settings.period.unrecorded')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={saving || !draft} onClick={() => void save()} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'white', cursor: saving ? 'wait' : 'pointer' }}>{t('settings.period.save')}</button>
        {state?.last_period_date && <button type="button" disabled={saving} onClick={() => void clear()} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--paper-edge)', background: 'var(--paper-2)', color: 'var(--ink-2)', cursor: saving ? 'wait' : 'pointer' }}>{t('settings.period.clear')}</button>}
      </div>
      {error && <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>{error}</div>}
    </section>
  );
}
