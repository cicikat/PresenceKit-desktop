import { useI18n } from '../i18n';

/** Same surface as the first HTML paint; only used while the main UI prepares. */
export function StartupSurface() {
  const { t } = useI18n();
  return <main className="startup-surface" role="status" aria-live="polite">
    <span className="startup-surface__ring" aria-hidden="true" />
    <span className="startup-surface__label">{t('startup.opening')}</span>
  </main>;
}
