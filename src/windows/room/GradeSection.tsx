// Screen-level color grade section of the editor panel (work order 4). Deliberately a
// separate block from the object outline: grade is picture-wide, not per-object.
import type { RoomSettings } from '../../shared/room/roomSettings';
import { saveRoomSettings } from '../../shared/room/roomSettings';
import { DEFAULT_GRADE, TONE_MAPPING_NAMES } from '../../shared/room/gradeConfig';
import type { GradeCfg } from '../../shared/room/gradeConfig';
import { Row, SliderNum } from './EditorControls';
import { useI18n } from '../../shared/i18n';

type NumericGradeKey = 'exposure' | 'temperature' | 'tint' | 'saturation' | 'contrast' | 'lift' | 'vignette';

const SLIDERS: { key: NumericGradeKey; min: number; max: number; step: number }[] = [
  { key: 'exposure', min: 0.2, max: 3, step: 0.05 },
  { key: 'temperature', min: -1, max: 1, step: 0.05 },
  { key: 'tint', min: -1, max: 1, step: 0.05 },
  { key: 'saturation', min: 0, max: 2, step: 0.05 },
  { key: 'contrast', min: 0.5, max: 2, step: 0.05 },
  { key: 'lift', min: -0.2, max: 0.2, step: 0.01 },
  { key: 'vignette', min: 0, max: 1, step: 0.05 },
];

export function GradeSection({ settings }: { settings: RoomSettings }) {
  const { t } = useI18n();
  const grade = settings.grade ?? DEFAULT_GRADE;
  const patch = (partial: Partial<GradeCfg>) =>
    saveRoomSettings({ ...settings, grade: { ...grade, ...partial } });
  const patchBloom = (partial: Partial<GradeCfg['bloom']>) =>
    patch({ bloom: { ...grade.bloom, ...partial } });

  return (
    <div className="room-editor-panel__group room-editor-panel__grade">
      <div className="room-editor-panel__group-title">{t('room.editor.grade.title')}</div>
      <div className="room-editor-panel__params room-editor-panel__params--flat">
        <div className="room-editor-panel__hint">{t('room.editor.grade.hint')}</div>
        <Row stacked label={t('room.editor.grade.enabled')}>
          <input type="checkbox" checked={grade.enabled} onChange={e => patch({ enabled: e.target.checked })} />
        </Row>
        {grade.enabled && (
          <>
            <Row stacked label={t('room.editor.grade.toneMapping')}>
              <select value={grade.toneMapping}
                onChange={e => patch({ toneMapping: e.target.value as GradeCfg['toneMapping'] })}>
                {TONE_MAPPING_NAMES.map(name => (
                  <option key={name} value={name}>{t(`room.editor.grade.tm.${name}`)}</option>
                ))}
              </select>
            </Row>
            {SLIDERS.map(({ key, min, max, step }) => (
              <Row stacked key={key} label={t(`room.editor.grade.${key}`)}>
                <SliderNum width="100%" min={min} max={max} step={step} value={grade[key]}
                  onChange={v => patch({ [key]: v })} />
              </Row>
            ))}
            <Row stacked label={t('room.editor.grade.bloom')}>
              <input type="checkbox" checked={grade.bloom.on} onChange={e => patchBloom({ on: e.target.checked })} />
            </Row>
            {grade.bloom.on && (
              <>
                <Row stacked label={t('room.editor.grade.bloomStrength')}>
                  <SliderNum width="100%" min={0} max={3} step={0.05} value={grade.bloom.strength}
                    onChange={v => patchBloom({ strength: v })} />
                </Row>
                <Row stacked label={t('room.editor.grade.bloomRadius')}>
                  <SliderNum width="100%" min={0} max={1} step={0.05} value={grade.bloom.radius}
                    onChange={v => patchBloom({ radius: v })} />
                </Row>
                <Row stacked label={t('room.editor.grade.bloomThreshold')}>
                  <SliderNum width="100%" min={0} max={1} step={0.05} value={grade.bloom.threshold}
                    onChange={v => patchBloom({ threshold: v })} />
                </Row>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
