import { useEffect, useState } from 'react';
import { useI18n } from '../../../../shared/i18n';
import { getDesignModDiagnostics, subscribeDesignModDiagnostics, type DesignModDiagnostics } from '../../../../shared/design-mod/diagnostics';
import { invalidateDesignModCache, listDesignMods, getSelectedDesignModId, setSelectedDesignModId } from '../../../../shared/design-mod/runtime';
import { prefActionButtonStyle, prefSelectStyle, PrefRow } from './PrefAtoms';

export function DesignModSettings() {
  const { t } = useI18n();
  const [records, setRecords] = useState(() => getDesignModDiagnostics().available);
  const [selected, setSelected] = useState(getSelectedDesignModId);
  const [refreshing, setRefreshing] = useState(false);
  const [diagnostic, setDiagnostic] = useState(() => getDesignModDiagnostics().diagnostic);
  const [runtime, setRuntime] = useState<DesignModDiagnostics>(() => getDesignModDiagnostics());

  useEffect(() => subscribeDesignModDiagnostics(() => {
    const next = getDesignModDiagnostics();
    setRecords(next.available);
    setDiagnostic(next.diagnostic);
    setSelected(getSelectedDesignModId());
    setRuntime(next);
  }), []);

  useEffect(() => {
    void listDesignMods().then(setRecords).catch(() => {});
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      invalidateDesignModCache();
      setRecords(await listDesignMods(true));
      window.dispatchEvent(new CustomEvent('emerald-ui-pref-change', { detail: { key: 'chat.designMod.refresh' } }));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PrefRow label={t('designMod.settings.label')} hint={t('designMod.settings.hint')}>
        <div style={{ display: 'grid', gap: 6, width: 240 }}>
          <select
            value={selected}
            onChange={event => { const value = event.target.value; setSelected(value); setSelectedDesignModId(value); }}
            style={{ ...prefSelectStyle, width: '100%' }}
          >
            {records.length === 0 && <option value="builtin-default">{t('designMod.noMods')}</option>}
            {records.map(record => <option key={record.manifest.id} value={record.manifest.id}>{record.manifest.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} style={prefActionButtonStyle}>
              {refreshing ? t('designMod.refreshing') : t('designMod.refresh')}
            </button>
            <button type="button" onClick={() => { setSelected('builtin-default'); setSelectedDesignModId('builtin-default'); }} style={prefActionButtonStyle}>
              {t('designMod.restore')}
            </button>
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: diagnostic.phase === 'error' ? 'var(--danger)' : 'var(--ink-4)', letterSpacing: 0.7 }}>
            {t('designMod.trustedLabel')} · {diagnostic.message}
            {diagnostic.error ? ` · ${diagnostic.error}` : ''}
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: 0.7 }}>
            {t('designMod.diagnostics')
              .replace('{attached}', String(runtime.attached.length))
              .replace('{subscriptions}', String(runtime.activeSubscriptions))
              .replace('{fps}', String(runtime.fps))}
          </div>
        </div>
      </PrefRow>
    </>
  );
}
