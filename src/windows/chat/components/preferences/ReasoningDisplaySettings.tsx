import { useI18n } from '../../../../shared/i18n';
import { setReasoningVisible, useReasoningVisible } from '../../../../shared/reasoningDisplay';
import { PrefRow, PrefSwitch } from './PrefAtoms';

export function ReasoningDisplaySettings() {
  const { t } = useI18n();
  const visible = useReasoningVisible();
  return <PrefRow label={t('settings.reasoningDisplay.title')} hint={t('settings.reasoningDisplay.hint')}>
    <PrefSwitch active={visible} onClick={() => setReasoningVisible(!visible)} ariaLabel={t('settings.reasoningDisplay.title')} />
  </PrefRow>;
}
