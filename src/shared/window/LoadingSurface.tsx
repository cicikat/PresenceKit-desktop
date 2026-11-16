import { t } from '../i18n';

/** Lightweight feedback shared by startup and deferred local pages. */
export function LoadingSurface() {
  return <div className="loading-surface" role="status" aria-label={t('common.loading')}>
    <span className="loading-surface__dot" />
    <span className="loading-surface__dot" />
    <span className="loading-surface__dot" />
  </div>;
}
