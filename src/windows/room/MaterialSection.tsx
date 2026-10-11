import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n';
import { saveRoomSettings, type RoomSettings } from '../../shared/room/roomSettings';
import { BUILTIN_CEL, CEL_CATEGORIES, DEFAULT_CEL, resolveCel, type CelConfig, type CelPalette } from '../../shared/room/celConfig';
import { supportsRoomToon } from './roomToonValidation';
import { Row, SliderNum } from './EditorControls';

const CONTROLS = [
  ['shadowCoverage', 0.2, 0.9, 0.01], ['bandWidth', 0, 0.15, 0.005],
  ['bandSaturation', 0, 2, 0.05], ['outlinePx', 0, 6, 0.25],
  ['structurePx', 0, 2, 0.05], ['highlight', 0, 1, 0.05],
] as const;
function MaterialColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n(); const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
    <input type="color" className="room-editor-panel__color-input" aria-label={label} value={value}
      onInput={e => onChange(e.currentTarget.value)} onChange={e => onChange(e.target.value)} />
    <input type="text" className="room-editor-panel__text-input" aria-label={`${label} ${t('room.material.hex')}`}
      value={draft} maxLength={7} onBlur={() => setDraft(value)} onChange={e => {
        setDraft(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
      }} />
  </div>;
}
export function MaterialSection({ settings }: { settings: RoomSettings }) {
  const { t } = useI18n(); const [paletteOpen, setPaletteOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const cfg = resolveCel(settings.toon, new URLSearchParams(location.search).get('roomToon') === '1');
  const supported = supportsRoomToon(settings.characterFile);
  const patch = (value: Partial<CelConfig>) => saveRoomSettings({ ...settings, toon: { ...cfg, ...value } });
  const presets = settings.toonPresets ?? {};
  const selectedCfg = BUILTIN_CEL[selectedPreset] ?? presets[selectedPreset]?.config;
  const presetId = selectedCfg && JSON.stringify(selectedCfg) === JSON.stringify(cfg) ? selectedPreset : Object.keys(BUILTIN_CEL).find(id => JSON.stringify(BUILTIN_CEL[id]) === JSON.stringify(cfg))
    ?? Object.keys(presets).find(id => JSON.stringify(presets[id].config) === JSON.stringify(cfg)) ?? '';
  return <div className="room-editor-panel__group">
    <div className="room-editor-panel__group-title">{t('room.material.title')}</div>
    <div className="room-editor-panel__params room-editor-panel__params--flat">
      <Row stacked label={t('room.material.mode')}>
        <select aria-label={t('room.material.mode')} value={cfg.mode} disabled={!supported} onChange={e => patch({ mode: e.target.value as CelConfig['mode'] })}>
          {(['original', 'soft', 'cel'] as const).map(mode => <option key={mode} value={mode}>{t(`room.material.${mode}`)}</option>)}
        </select>
      </Row>
      {!supported && <div className="room-editor-panel__hint">{t('room.material.unsupported')}</div>}
      {supported && cfg.mode !== 'original' && <div className="room-editor-panel__hint">{t('room.material.fixedLook')}</div>}
      {supported && cfg.mode === 'cel' && <>
        <Row stacked label={t('room.material.preset')}>
          <select aria-label={t('room.material.preset')} value={presetId} onChange={e => {
            setSelectedPreset(e.target.value);
            const selected = BUILTIN_CEL[e.target.value] ?? presets[e.target.value]?.config;
            if (selected) patch(selected);
          }}>
            <option value="">{t('room.material.custom')}</option>
            {Object.keys(BUILTIN_CEL).map(id => <option key={id} value={id}>{t(`room.material.preset.${id as 'blueGray' | 'violet'}`)}</option>)}
            {Object.entries(presets).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
          </select>
        </Row>
        {CONTROLS.map(([key, min, max, step]) => <Row key={key} stacked label={t(`room.material.${key}`)}>
          <SliderNum width="100%" min={min} max={max} step={step} value={cfg[key]} onChange={v => patch({ [key]: v })} />
        </Row>)}
        <button type="button" className="room-editor-panel__tool-btn" aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen(!paletteOpen)}>{t('room.material.palettes')}</button>
        {paletteOpen && <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>{CEL_CATEGORIES.map(category => <div key={category}>
          <div className="room-editor-panel__group-title">{t(`room.material.category.${category}`)}</div>
          {(['lit', 'shade', 'deep', 'band', 'highlight'] as (keyof CelPalette)[]).map(key =>
            <Row key={key} stacked label={t(`room.material.color.${key}`)}>
              <MaterialColor label={`${t(`room.material.category.${category}`)} ${t(`room.material.color.${key}`)}`}
                value={cfg.palettes[category][key]} onChange={value => patch({ palettes: {
                  ...cfg.palettes, [category]: { ...cfg.palettes[category], [key]: value },
                } })} />
            </Row>)}
        </div>)}</div>}
        <Row stacked label={t('room.material.presetName')}>
          <input className="room-editor-panel__text-input" aria-label={t('room.material.presetName')}
            value={presetName} maxLength={64} onChange={e => setPresetName(e.target.value)} />
        </Row>
        <div className="room-editor-panel__add-row">
          <button type="button" className="room-editor-panel__tool-btn" disabled={!presetName.trim() || Object.keys(presets).length >= 32}
            onClick={() => { const id = `user-${crypto.randomUUID()}`; saveRoomSettings({ ...settings, toon: cfg, toonPresets: {
              ...presets, [id]: { name: presetName.trim(), config: cfg },
            } }); setSelectedPreset(id); setPresetName(''); }}>{t('room.material.savePreset')}</button>
          <button type="button" className="room-editor-panel__tool-btn" disabled={!presetId.startsWith('user-')}
            onClick={() => { const next = { ...presets }; delete next[presetId]; saveRoomSettings({ ...settings, toonPresets: next }); }}>
            {t('room.material.deletePreset')}</button>
        </div>
        <button type="button" className="room-editor-panel__tool-btn" onClick={() => patch({ ...DEFAULT_CEL })}>{t('room.material.reset')}</button>
      </>}
    </div>
  </div>;
}
