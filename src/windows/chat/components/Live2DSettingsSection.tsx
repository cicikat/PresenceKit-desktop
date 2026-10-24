import { useEffect, useState, type CSSProperties } from 'react';
import {
  loadLive2DSettings,
  saveLive2DSettings,
  subscribeLive2DSettings,
  type Live2DSettings,
  type Live2DBgKind,
} from '../../../shared/live2d/live2dSettings';
import { listLive2DModels } from '../../../shared/live2d/live2dAssets';
import type { Live2DModelAsset } from '../../../shared/live2d/live2dAssets';
import { backgroundUrl, useLive2DBackgrounds } from '../../../shared/live2d/backgroundAssets';
import { Row, SliderNum, Divider } from '../../room/EditorControls';
import { prefSelectStyle as selectStyle } from './preferences/PrefAtoms';
import { useI18n } from '../../../shared/i18n';

const textInputStyle: CSSProperties = {
  width: 170, padding: '5px 8px', fontSize: 11,
  border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink-2)', fontFamily: 'inherit',
};

const colorInputStyle: CSSProperties = {
  width: 32, height: 24, padding: 0, border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer',
};

const BG_OPTIONS: { value: Live2DBgKind; label: string }[] = [
  { value: 'transparent', label: '跟随窗口' },
  { value: 'color', label: '纯色' },
  { value: 'image', label: '图片' },
];

export function Live2DSettingsSection({ modelOnly = false }: { modelOnly?: boolean }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Live2DSettings>(loadLive2DSettings);
  const [models, setModels] = useState<Live2DModelAsset[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => subscribeLive2DSettings(setSettings), []);

  useEffect(() => {
    listLive2DModels()
      .then(list => { setModels(list); setModelsError(null); })
      .catch(e => setModelsError(String(e)));
  }, []);

  function patch(partial: Partial<Live2DSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveLive2DSettings(next);
  }

  const backgrounds = useLive2DBackgrounds(!modelOnly && settings.bgKind === 'image');
  const knownBackground = !settings.bgImage || backgrounds.files.some(file => backgroundUrl(file.file) === settings.bgImage);

  const selectedModel = models.find(m => m.dirName === settings.modelDir);
  const selectedMocVersion = selectedModel?.mocVersion ?? null;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>{t('settings.avatar.live2d')}</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          {t('settings.avatar.sharedHint')}
        </div>
      </div>

      {modelsError && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 0.8 }}>
          扫描失败：{modelsError}
        </div>
      )}

      <Row label={t('settings.avatar.model')}>
        {models.length === 0 ? (
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.8, maxWidth: 220, textAlign: 'right' }}>
            未找到模型，放到 public/live2d/models/&lt;名&gt;/ 后刷新
          </div>
        ) : (
          <select
            aria-label={t('settings.avatar.live2d')}
            value={settings.modelDir}
            onChange={e => patch({ modelDir: e.target.value })}
            style={{ ...selectStyle, width: 170 }}
          >
            <option value="">（未选择）</option>
            {models.map(m => <option key={m.dirName} value={m.dirName}>{m.label}</option>)}
          </select>
        )}
      </Row>

      {selectedMocVersion !== null && selectedMocVersion >= 6 && (
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--accent-2)', letterSpacing: 0.8 }}>
          模型使用 offscreen 特性（moc3 v{selectedMocVersion}），当前渲染栈可能缺件（鼻/嘴等下半脸部件）
        </div>
      )}

      {!modelOnly && <>
      <Row label="缩放" hint="0.2–8">
        <SliderNum min={0.2} max={8} step={0.01} value={settings.scaleMul} onChange={v => patch({ scaleMul: v })} />
      </Row>

      <Row label="X 偏移" hint="画布宽度比例，-1–1">
        <SliderNum
          min={-1} max={1} step={0.01} value={settings.offset[0]}
          onChange={v => patch({ offset: [v, settings.offset[1]] })}
        />
      </Row>
      <Row label="Y 偏移" hint="画布高度比例，-1–1">
        <SliderNum
          min={-1} max={1} step={0.01} value={settings.offset[1]}
          onChange={v => patch({ offset: [settings.offset[0], v] })}
        />
      </Row>

      <Divider />

      <Row label="背景" hint="跟随窗口=透明">
        <select
          aria-label={t('live2d.background.kind')}
          value={settings.bgKind}
          onChange={e => patch({ bgKind: e.target.value as Live2DBgKind })}
          style={{ ...selectStyle, width: 170 }}
        >
          {BG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>

      {settings.bgKind === 'color' && (
        <Row label="背景色">
          <input
            type="color" style={colorInputStyle}
            value={settings.bgColor}
            onChange={e => patch({ bgColor: e.target.value })}
          />
        </Row>
      )}

      {settings.bgKind === 'image' && (
        <Row label={t('live2d.background.image')} hint={backgrounds.failed ? t('live2d.background.failed') : t('live2d.background.folder')}>
          <select aria-label={t('live2d.background.image')} value={settings.bgImage ?? ''}
            onFocus={() => void backgrounds.refresh()} onPointerDown={() => void backgrounds.refresh()}
            onChange={event => patch({ bgImage: event.target.value || null })}
            style={{ ...selectStyle, width: 170 }}>
            <option value="">{t('live2d.background.choose')}</option>
            {!knownBackground && <option value={settings.bgImage!}>{t('live2d.background.saved')}: {settings.bgImage}</option>}
            {backgrounds.files.map(file => <option key={file.file} value={backgroundUrl(file.file)}>{file.label}</option>)}
          </select>
        </Row>
      )}

      <Divider />

      <Row label="口型强度" hint="0–1">
        <SliderNum min={0} max={1} step={0.01} value={settings.lipsyncStrength} onChange={v => patch({ lipsyncStrength: v })} />
      </Row>

      <Row label="待机动作组" hint="Cubism 默认约定为 Idle">
        <input
          type="text"
          value={settings.idleMotionGroup}
          onChange={e => patch({ idleMotionGroup: e.target.value || 'Idle' })}
          style={textInputStyle}
        />
      </Row>

      <Row label="口型参数名" hint="模型参数名不标准时改这里">
        <input
          type="text"
          value={settings.mouthParam}
          onChange={e => patch({ mouthParam: e.target.value || 'ParamMouthOpenY' })}
          style={textInputStyle}
        />
      </Row>
      </>}
    </div>
  );
}
