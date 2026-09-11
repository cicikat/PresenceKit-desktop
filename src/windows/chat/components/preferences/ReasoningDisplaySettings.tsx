import { useI18n } from '../../../../shared/i18n';
import { setReasoningVisible, useReasoningVisible } from '../../../../shared/reasoningDisplay';
import { PrefRow, PrefSwitch } from './PrefAtoms';
import { setToolActivityVisible, useToolActivityVisible } from '../../../../shared/toolActivityDisplay';

export function ReasoningDisplaySettings() {
  const { t } = useI18n();
  const visible = useReasoningVisible();
  const toolsVisible = useToolActivityVisible();
  return <><PrefRow label={t('settings.reasoningDisplay.title')} hint={t('settings.reasoningDisplay.hint')}>
    <PrefSwitch active={visible} onClick={() => setReasoningVisible(!visible)} ariaLabel={t('settings.reasoningDisplay.title')} />
  </PrefRow><PrefRow label={t('settings.toolDisplay.title')} hint={t('settings.toolDisplay.hint')}>
    <PrefSwitch active={toolsVisible} onClick={() => setToolActivityVisible(!toolsVisible)} ariaLabel={t('settings.toolDisplay.title')} />
  </PrefRow></>;
}
