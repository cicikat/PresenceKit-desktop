import { useEffect, useState } from 'react';
import { useI18n } from '../../shared/i18n';
import { backgroundUrl, useLive2DBackgrounds } from '../../shared/live2d/backgroundAssets';
import { loadLive2DSettings, patchLive2DSettings, subscribeLive2DSettings, type Live2DBgKind } from '../../shared/live2d/live2dSettings';
import { Row, SliderNum } from './EditorControls';

export function Live2DLayoutPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState(loadLive2DSettings);
  useEffect(() => subscribeLive2DSettings(setSettings), []);
  const backgrounds = useLive2DBackgrounds(settings.bgKind === 'image');
  const known = !settings.bgImage || backgrounds.files.some(file => backgroundUrl(file.file) === settings.bgImage);
  return <div className="room-editor-panel__group">
    <div className="room-editor-panel__group-title">{t('live2d.layout.title')}</div>
    <div className="room-editor-panel__params room-editor-panel__params--flat">
      <div className="room-editor-panel__hint">{t('live2d.layout.hint')}</div>
      <Row stacked label={t('live2d.layout.scale')}>
        <SliderNum min={0.2} max={8} step={0.01} value={Math.round(settings.callScaleMul * 100) / 100} width="100%" label={t('live2d.layout.scale')}
          onChange={callScaleMul => patchLive2DSettings({ callScaleMul })} />
      </Row>
      <Row stacked label={t('live2d.layout.x')}>
        <SliderNum min={-100} max={100} step={1} value={Math.round(settings.callOffset[0] * 100)} width="100%" label={t('live2d.layout.x')}
          onChange={x => patchLive2DSettings({ callOffset: [x / 100, loadLive2DSettings().callOffset[1]] })} />
      </Row>
      <Row stacked label={t('live2d.layout.y')}>
        <SliderNum min={-100} max={100} step={1} value={Math.round(settings.callOffset[1] * 100)} width="100%" label={t('live2d.layout.y')}
          onChange={y => patchLive2DSettings({ callOffset: [loadLive2DSettings().callOffset[0], y / 100] })} />
      </Row>
      <button type="button" className="room-editor-panel__tool-btn" onClick={() => patchLive2DSettings({ callScaleMul: 1, callOffset: [0, 0] })}>{t('live2d.layout.reset')}</button>
      <label>{t('live2d.background.kind')}
        <select aria-label={t('live2d.background.kind')} value={settings.bgKind} onChange={e => patchLive2DSettings({ bgKind: e.target.value as Live2DBgKind })}>
          <option value="transparent">{t('live2d.background.transparent')}</option>
          <option value="color">{t('live2d.background.color')}</option>
          <option value="image">{t('live2d.background.image')}</option>
        </select>
      </label>
      {settings.bgKind === 'color' && <label>{t('live2d.background.color')} <input type="color" aria-label={t('live2d.background.color')} value={settings.bgColor} onChange={e => patchLive2DSettings({ bgColor: e.target.value })} /></label>}
      {settings.bgKind === 'image' && <label>{t('live2d.background.image')}
        <select aria-label={t('live2d.background.image')} value={settings.bgImage ?? ''}
          onFocus={() => void backgrounds.refresh()} onPointerDown={() => void backgrounds.refresh()}
          onChange={event => patchLive2DSettings({ bgImage: event.target.value || null })}>
          <option value="">{t('live2d.background.choose')}</option>
          {!known && <option value={settings.bgImage!}>{t('live2d.background.saved')}: {settings.bgImage}</option>}
          {backgrounds.files.map(file => <option key={file.file} value={backgroundUrl(file.file)}>{file.label}</option>)}
        </select>
        {backgrounds.failed && <div className="room-editor-panel__hint">{t('live2d.background.failed')}</div>}
      </label>}
    </div>
  </div>;
}
