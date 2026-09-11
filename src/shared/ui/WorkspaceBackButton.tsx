import { useI18n } from '../i18n';
import './WorkspaceNavigation.css';

export function WorkspaceBackButton({ onClick, label }: { onClick: () => void; label: string }) {
  const { t } = useI18n();
  return <button type="button" className="workspace-back" onClick={onClick} aria-label={label} title={label}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m14 6-6 6 6 6" />
    </svg>
    <span>{t('navigation.back')}</span>
  </button>;
}
