// Right-side layer panel for the room editor (work order 2). Only mounted while
// placementMode is true — the call window is long-lived, so this panel and its
// subscriptions must not exist outside of edit sessions.
import { useMemo } from 'react';
import { buildOutline, editableIdEquals, editableIdKey, groupOutline, canToggleVisibility } from './sceneOutline';
import type { EditableId, LightKey } from './sceneOutline';
import type { ThreeCallStageHandle } from './ThreeCallStage';
import type { RoomSettings, RoomProp } from '../../shared/room/roomSettings';
import { saveRoomSettings } from '../../shared/room/roomSettings';
import { Row, SliderNum, Divider } from './EditorControls';
import { useI18n } from '../../shared/i18n';
import './EditorPanel.css';

const LIGHT_LABEL_KEY: Record<LightKey, 'room.editor.light.ambient' | 'room.editor.light.key' | 'room.editor.light.charFill'> = {
  ambient: 'room.editor.light.ambient',
  key: 'room.editor.light.key',
  charFill: 'room.editor.light.charFill',
};

interface EditorPanelProps {
  settings: RoomSettings;
  loadedSceneFile: string | null;
  stage: ThreeCallStageHandle;
}

function patchSettings(settings: RoomSettings, partial: Partial<RoomSettings>): void {
  saveRoomSettings({ ...settings, ...partial });
}

function patchProp(settings: RoomSettings, index: number, partial: Partial<RoomProp>): void {
  const nextProps = (settings.props ?? []).map((p, i) => (i === index ? { ...p, ...partial } : p));
  patchSettings(settings, { props: nextProps });
}

export function EditorPanel({ settings, loadedSceneFile, stage }: EditorPanelProps) {
  const { t } = useI18n();
  const outline = useMemo(() => buildOutline(settings, loadedSceneFile), [settings, loadedSceneFile]);
  const selection = stage.selection;

  return (
    <div className="room-editor-panel" role="region" aria-label={t('room.editor.title')}>
      <div className="room-editor-panel__toolbar" role="group" aria-label={t('room.editor.title')}>
        {(['translate', 'rotate', 'scale'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            aria-pressed={stage.gizmoMode === mode}
            className="room-editor-panel__tool-btn"
            onClick={() => stage.setGizmoMode(mode)}
          >{t(`room.editor.gizmo.${mode}`)}</button>
        ))}
        <span className="room-editor-panel__toolbar-sep" aria-hidden="true" />
        {(['X', 'Y', 'Z'] as const).map(axis => (
          <button
            key={axis}
            type="button"
            aria-pressed={stage.axisLock === axis}
            className="room-editor-panel__axis-btn"
            onClick={() => stage.setAxisConstraint(stage.axisLock === axis ? null : axis)}
          >{axis}</button>
        ))}
      </div>

      <div className="room-editor-panel__list">
        {groupOutline(outline).map(({ group, items }) => {
          return (
            <div key={group} className="room-editor-panel__group">
              <div className="room-editor-panel__group-title">{t(`room.editor.group.${group}`)}</div>
              {items.map(item => {
                const isSelected = editableIdEquals(item.id, selection);
                return (
                  <div key={editableIdKey(item.id)} className="room-editor-panel__row-wrap">
                    <div
                      className="room-editor-panel__row"
                      data-selected={isSelected}
                      onClick={() => stage.selectById(isSelected ? null : item.id)}
                    >
                      <span className="room-editor-panel__row-dot" data-group={item.group} />
                      <button
                        type="button"
                        className="room-editor-panel__eye"
                        disabled={!canToggleVisibility(item.id)}
                        aria-pressed={item.visible}
                        onClick={e => {
                          e.stopPropagation();
                          if (item.id.kind === 'prop') stage.setPropHidden(item.id.index, item.visible);
                          else if (item.id.kind === 'light') {
                            stage.applyLightPatch(item.id.key, { on: !item.visible });
                          }
                        }}
                      >{item.visible ? '👁' : '—'}</button>
                      <span className="room-editor-panel__row-label">
                        {item.id.kind === 'light' ? t(LIGHT_LABEL_KEY[item.id.key]) : item.label}
                      </span>
                    </div>
                    {isSelected && (
                      <SelectedParams
                        id={item.id}
                        settings={settings}
                        stage={stage}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <Divider />

      <div className="room-editor-panel__footer">{t('room.editor.keyHints')}</div>
    </div>
  );
}

function SelectedParams({ id, settings, stage }: {
  id: EditableId; settings: RoomSettings; stage: ThreeCallStageHandle;
}) {
  const { t } = useI18n();

  if (id.kind === 'character') {
    return (
      <div className="room-editor-panel__params">
        <Row label={t('room.editor.yaw')}>
          <SliderNum min={-180} max={180} step={1} value={settings.yawDeg}
            onChange={v => patchSettings(settings, { yawDeg: v })} unit="°" />
        </Row>
        <Row label={t('room.editor.gizmo.scale')}>
          <SliderNum min={0.2} max={3} step={0.01} value={settings.scaleMul}
            onChange={v => patchSettings(settings, { scaleMul: v })} />
        </Row>
      </div>
    );
  }

  if (id.kind === 'scene') {
    return (
      <div className="room-editor-panel__params">
        <Row label={t('room.editor.sceneFile')}>
          <span className="room-editor-panel__scene-file">{settings.sceneFile}</span>
        </Row>
        <Row label={t('room.editor.useSceneLights')}>
          <input
            type="checkbox"
            checked={settings.lights.useSceneLights}
            onChange={e => patchSettings(settings, { lights: { ...settings.lights, useSceneLights: e.target.checked } })}
          />
        </Row>
      </div>
    );
  }

  if (id.kind === 'prop') {
    const prop = (settings.props ?? [])[id.index];
    if (!prop) return null;
    return (
      <div className="room-editor-panel__params">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <Row key={axis} label={`${t('room.editor.position')} ${axis}`}>
            <SliderNum min={-10} max={10} step={0.01} value={prop.pos[i]}
              onChange={v => {
                const pos = [...prop.pos] as [number, number, number];
                pos[i] = v;
                patchProp(settings, id.index, { pos });
              }} />
          </Row>
        ))}
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <Row key={`r${axis}`} label={`${t('room.editor.rotation')} ${axis}`}>
            <SliderNum min={-Math.PI} max={Math.PI} step={0.01} value={prop.rot[i]}
              onChange={v => {
                const rot = [...prop.rot] as [number, number, number];
                rot[i] = v;
                patchProp(settings, id.index, { rot });
              }} />
          </Row>
        ))}
        <Row label={t('room.editor.gizmo.scale')}>
          <SliderNum min={0.1} max={5} step={0.01} value={prop.scale}
            onChange={v => patchProp(settings, id.index, { scale: v })} />
        </Row>
        <Row label={t('room.editor.delete')}>
          <button
            type="button"
            className="room-editor-panel__delete-btn"
            onClick={() => patchSettings(settings, { props: (settings.props ?? []).filter((_, i) => i !== id.index) })}
          >{t('room.editor.delete')}</button>
        </Row>
      </div>
    );
  }

  // light
  const cfg = settings.lights[id.key];
  return (
    <div className="room-editor-panel__params">
      <Row label={t('room.editor.color')}>
        <input
          type="color"
          className="room-editor-panel__color-input"
          value={cfg.color}
          onChange={e => stage.applyLightPatch(id.key, { color: e.target.value })}
        />
      </Row>
      <Row label={t('room.editor.intensity')}>
        <SliderNum min={0} max={4} step={0.05} value={cfg.intensity}
          onChange={v => stage.applyLightPatch(id.key, { intensity: v })} />
      </Row>
      {id.key !== 'ambient' && (
        <>
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <Row key={axis} label={`${t('room.editor.position')} ${axis}`}>
              <SliderNum min={-8} max={8} step={0.1} value={cfg.pos?.[i] ?? 0}
                onChange={v => {
                  const pos = [...(cfg.pos ?? [0, 0, 0])] as [number, number, number];
                  pos[i] = v;
                  stage.applyLightPatch(id.key, { pos });
                }} />
            </Row>
          ))}
        </>
      )}
    </div>
  );
}

