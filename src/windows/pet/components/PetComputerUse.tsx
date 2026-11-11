import { computerUseCountdown, useComputerUse } from '../../../shared/computer-use/useComputerUse';
import { useI18n } from '../../../shared/i18n';

export function PetComputerUse() {
  const { t } = useI18n();
  const { status, control } = useComputerUse();
  if (!status || status.state === 'closed') return null;
  return (
    <section aria-label={t('computerUse.title')} style={{
      position: 'absolute', right: 12, top: 12, zIndex: 2, display: 'flex',
      alignItems: 'center', gap: 7, background: 'rgba(18, 12, 32, 0.70)', borderRadius: 8,
      color: 'rgba(255, 255, 255, 0.96)', padding: '5px 8px', fontSize: 11,
    }}>
      <span className="mono" role="status">
        {t(`computerUse.state.${status.state}`)} {status.task_id ? ` · ${t('computerUse.step')} ${status.steps} · ` : ' · '}
        {computerUseCountdown(status.remaining_ms)}
      </span>
      <button type="button" onClick={() => void control('stop').catch(() => {})}
        title={t('computerUse.shortcut')} style={{
          border: '1px solid rgba(224, 210, 255, 0.3)', background: 'transparent',
          color: 'inherit', borderRadius: 5, cursor: 'pointer', font: 'inherit', padding: '3px 7px',
        }}>{t('computerUse.stop')}</button>
    </section>
  );
}
