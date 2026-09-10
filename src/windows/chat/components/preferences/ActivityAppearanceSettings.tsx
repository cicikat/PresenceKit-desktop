import { useEffect, useState } from 'react';
import { getUIPref, setUIPref, onUIPrefChange } from '../../../../shared/uiPreferences';
import { useI18n } from '../../../../shared/i18n';
import { PrefRow, prefSelectStyle } from './PrefAtoms';

const fields = [
  ['activity.reading.fontSize', 'settings.activity.font', 16, [14, 16, 18]],
  ['activity.reading.maxWidth', 'settings.activity.width', 760, [640, 760, 900]],
  ['activity.board.theme', 'settings.activity.board', 'classic_wood', ['classic_wood', 'cool_grey']],
  ['activity.chess.pieceStyle', 'settings.activity.pieces', 'unicode', ['unicode', 'letter']],
] as const;

export function ActivityAppearanceSettings() {
  const { t } = useI18n();
  const [, update] = useState(0);
  useEffect(() => onUIPrefChange(key => { if (key.startsWith('activity.')) update(n => n + 1); }), []);
  const labels: Record<string, string> = {classic_wood:t('settings.activity.wood'),cool_grey:t('settings.activity.grey'),unicode:t('settings.activity.symbols'),letter:t('settings.activity.letters')};
  return <section id="activity-appearance" style={{ display: 'grid', gap: 12 }}>
    <h3>{t('settings.activity.title')}</h3>
    {fields.map(([key,label,fallback,values]) => <PrefRow key={key} label={t(label)}>
      <select style={prefSelectStyle} value={String(getUIPref<string | number>(key, fallback))} onChange={e => setUIPref(key, typeof fallback === 'number' ? Number(e.target.value) : e.target.value)}>
        {values.map(value => <option key={value} value={value}>{labels[value] || `${value}px`}</option>)}
      </select>
    </PrefRow>)}
    <details><summary>{t('settings.activity.diagnostics')}</summary><label><input type="checkbox" checked={getUIPref('activity.debug', false)} onChange={e => setUIPref('activity.debug', e.target.checked)} />{t('settings.activity.debug')}</label></details>
  </section>;
}
