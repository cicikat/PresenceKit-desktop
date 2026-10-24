// Edit panel for the Live2D stage (work order 6). Live2D has no 3D lighting, so instead of a
// set of controls that would do nothing, it shows one line saying so plus the color grade.
import type { RoomSettings } from '../../shared/room/roomSettings';
import { GradeSection } from './GradeSection';
import { Live2DPerformancePanel } from './Live2DPerformancePanel';
import { Live2DLayoutPanel } from './Live2DLayoutPanel';
import { useI18n } from '../../shared/i18n';
import './EditorPanel.css';

export function Live2DEditorPanel({ settings }: { settings: RoomSettings }) {
  const { t } = useI18n();
  return (
    <div className="room-editor-panel" role="region" aria-label={t('room.editor.title')}>
      <div className="room-editor-panel__list">
        <Live2DLayoutPanel />
        <Live2DPerformancePanel />
        <div className="room-editor-panel__group">
          <div className="room-editor-panel__group-title">{t('room.editor.group.light')}</div>
          <div className="room-editor-panel__params room-editor-panel__params--flat">
            <div className="room-editor-panel__hint">{t('room.editor.live2dNoLights')}</div>
          </div>
        </div>
      </div>
      <GradeSection settings={settings} mode="2d" />
    </div>
  );
}
