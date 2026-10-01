// Right-side layer panel for the room editor (work order 2). Only mounted while
// placementMode is true — the call window is long-lived, so this panel and its
// subscriptions must not exist outside of edit sessions.
import { useMemo, useState } from 'react';
import {
  buildOutline, editableIdEquals, editableIdKey, groupOutline, canToggleVisibility,
  getLightCfg, isExtraLightKey, extraLightId,
} from './sceneOutline';
import type { EditableId, FixedLightKey, LightKey } from './sceneOutline';
import { proxyColorCss } from './extraLights';
import type { ThreeCallStageHandle } from './ThreeCallStage';
import type { RoomSettings, ExtraLightCfg, ExtraLightType } from '../../shared/room/roomSettings';
import { saveRoomSettings, EXTRA_LIGHT_TYPES, MAX_EXTRA_LIGHTS } from '../../shared/room/roomSettings';
import { Row, SliderNum, Divider } from './EditorControls';
import { GradeSection } from './GradeSection';
import { LookSection } from './LookSection';
import { useI18n } from '../../shared/i18n';
import './EditorPanel.css';

const LIGHT_LABEL_KEY: Record<FixedLightKey, 'room.editor.light.ambient' | 'room.editor.light.key' | 'room.editor.light.charFill'> = {
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

function patchExtra(settings: RoomSettings, id: string, partial: Partial<ExtraLightCfg>): void {
  patchSettings(settings, {
    lights: { ...settings.lights, extra: settings.lights.extra.map(e => (e.id === id ? { ...e, ...partial } : e)) },
  });
}

function newExtraLight(type: ExtraLightType): ExtraLightCfg {
  return {
    id: crypto.randomUUID(), type, on: true, intensity: 1, color: '#ffffff',
    pos: [0, 2, 2], distance: 0, angleDeg: 45, penumbra: 0.3, charOnly: false,
  };
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
                      <span
                        className="room-editor-panel__row-dot"
                        data-group={item.group}
                        style={item.id.kind === 'light' && isExtraLightKey(item.id.key)
                          ? { background: proxyColorCss(item.label as ExtraLightType) } : undefined}
                      />
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
                        {item.id.kind === 'light' ? lightRowLabel(item.id.key, settings, t) : item.label}
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
              {group === 'light' && <LightsFooter settings={settings} />}
            </div>
          );
        })}
      </div>

      <Divider />

      <LookSection settings={settings} stage={stage} />

      <GradeSection settings={settings} />

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
        <Row stacked label={t('room.editor.yaw')}>
          <SliderNum width="100%" min={-180} max={180} step={1} value={settings.yawDeg}
            onChange={v => stage.applyCharacterPatch({ yawDeg: v })} unit="°" />
        </Row>
        <Row stacked label={t('room.editor.gizmo.scale')}>
          <SliderNum width="100%" min={0.2} max={3} step={0.01} value={settings.scaleMul}
            onChange={v => stage.applyCharacterPatch({ scaleMul: v })} />
        </Row>
      </div>
    );
  }

  if (id.kind === 'scene') {
    return (
      <div className="room-editor-panel__params">
        <Row stacked label={t('room.editor.sceneFile')}>
          <span className="room-editor-panel__scene-file">{settings.sceneFile}</span>
        </Row>
        <Row stacked label={t('room.editor.useSceneLights')}>
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
          <Row stacked key={axis} label={`${t('room.editor.position')} ${axis}`}>
            <SliderNum width="100%" min={-10} max={10} step={0.01} value={prop.pos[i]}
              onChange={v => {
                const pos = [...prop.pos] as [number, number, number];
                pos[i] = v;
                stage.applyPropPatch(id.index, { pos });
              }} />
          </Row>
        ))}
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <Row stacked key={`r${axis}`} label={`${t('room.editor.rotation')} ${axis}`}>
            <SliderNum width="100%" min={-Math.PI} max={Math.PI} step={0.01} value={prop.rot[i]}
              onChange={v => {
                const rot = [...prop.rot] as [number, number, number];
                rot[i] = v;
                stage.applyPropPatch(id.index, { rot });
              }} />
          </Row>
        ))}
        <Row stacked label={t('room.editor.gizmo.scale')}>
          <SliderNum width="100%" min={0.1} max={5} step={0.01} value={prop.scale}
            onChange={v => stage.applyPropPatch(id.index, { scale: v })} />
        </Row>
        <Row stacked label={t('room.editor.delete')}>
          <button
            type="button"
            className="room-editor-panel__delete-btn"
            onClick={() => stage.removeProp(id.index)}
          >{t('room.editor.delete')}</button>
        </Row>
      </div>
    );
  }

  // light
  const cfg = getLightCfg(settings.lights, id.key);
  if (!cfg) return null;
  const extraId = isExtraLightKey(id.key) ? extraLightId(id.key) : null;
  const extra = extraId ? settings.lights.extra.find(e => e.id === extraId) : undefined;
  // moodTint rewrites the key light's color/intensity every frame, so a manual edit would
  // silently snap back. Lock those two controls and say why instead.
  const moodLocked = id.key === 'key' && settings.lights.moodTint;
  return (
    <div className="room-editor-panel__params">
      {moodLocked && <div className="room-editor-panel__hint">{t('room.editor.light.moodTakeover')}</div>}
      <Row stacked label={t('room.editor.color')}>
        <input
          type="color"
          className="room-editor-panel__color-input"
          value={cfg.color}
          disabled={moodLocked}
          onChange={e => stage.applyLightPatch(id.key, { color: e.target.value })}
        />
      </Row>
      <Row stacked label={t('room.editor.intensity')}>
        <SliderNum width="100%" min={0} max={4} step={0.05} value={cfg.intensity} disabled={moodLocked}
          onChange={v => stage.applyLightPatch(id.key, { intensity: v })} />
      </Row>
      {id.key !== 'ambient' && (
        <>
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <Row stacked key={axis} label={`${t('room.editor.position')} ${axis}`}>
              <SliderNum width="100%" min={-8} max={8} step={0.1} value={cfg.pos?.[i] ?? 0}
                onChange={v => {
                  const pos = [...(cfg.pos ?? [0, 0, 0])] as [number, number, number];
                  pos[i] = v;
                  stage.applyLightPatch(id.key, { pos });
                }} />
            </Row>
          ))}
        </>
      )}
      {extra && (
        <>
          {extra.type !== 'directional' && (
            <Row stacked label={t('room.editor.light.distance')}>
              <SliderNum width="100%" min={0} max={50} step={0.5} value={extra.distance ?? 0}
                onChange={v => patchExtra(settings, extra.id, { distance: v })} />
            </Row>
          )}
          {extra.type === 'spot' && (
            <>
              <Row stacked label={t('room.editor.light.angle')}>
                <SliderNum width="100%" min={5} max={90} step={1} value={extra.angleDeg ?? 45} unit="°"
                  onChange={v => patchExtra(settings, extra.id, { angleDeg: v })} />
              </Row>
              <Row stacked label={t('room.editor.light.penumbra')}>
                <SliderNum width="100%" min={0} max={1} step={0.05} value={extra.penumbra ?? 0.3}
                  onChange={v => patchExtra(settings, extra.id, { penumbra: v })} />
              </Row>
            </>
          )}
          <Row stacked label={t('room.editor.light.charOnly')}>
            <input type="checkbox" checked={!!extra.charOnly}
              onChange={e => patchExtra(settings, extra.id, { charOnly: e.target.checked })} />
          </Row>
          <Row stacked label={t('room.editor.delete')}>
            <button type="button" className="room-editor-panel__delete-btn"
              onClick={() => patchSettings(settings, {
                lights: { ...settings.lights, extra: settings.lights.extra.filter(e => e.id !== extra.id) },
              })}
            >{t('room.editor.delete')}</button>
          </Row>
        </>
      )}
    </div>
  );
}

function lightRowLabel(key: LightKey, settings: RoomSettings, t: (k: any) => string): string {
  if (!isExtraLightKey(key)) return t(LIGHT_LABEL_KEY[key]);
  const id = extraLightId(key);
  const index = settings.lights.extra.findIndex(e => e.id === id);
  const type = settings.lights.extra[index]?.type ?? 'point';
  return `${t('room.editor.light.extra')} ${index + 1} · ${t(`room.editor.light.type.${type}`)}`;
}

/** Add-light control plus the lights-wide switches (shadows, mood tint). */
function LightsFooter({ settings }: { settings: RoomSettings }) {
  const { t } = useI18n();
  const [type, setType] = useState<ExtraLightType>('point');
  const full = settings.lights.extra.length >= MAX_EXTRA_LIGHTS;
  return (
    <div className="room-editor-panel__params room-editor-panel__params--flat">
      <div className="room-editor-panel__add-row">
        <select value={type} onChange={e => setType(e.target.value as ExtraLightType)}>
          {EXTRA_LIGHT_TYPES.map(tp => <option key={tp} value={tp}>{t(`room.editor.light.type.${tp}`)}</option>)}
        </select>
        <button
          type="button"
          className="room-editor-panel__tool-btn"
          disabled={full}
          title={full ? t('room.editor.light.maxReached') : undefined}
          onClick={() => patchSettings(settings, {
            lights: { ...settings.lights, extra: [...settings.lights.extra, newExtraLight(type)] },
          })}
        >{t('room.editor.light.add')}</button>
      </div>
      {full && <div className="room-editor-panel__hint">{t('room.editor.light.maxReached')}</div>}
      <Row stacked label={t('room.editor.light.shadows')}>
        <input type="checkbox" checked={settings.lights.shadows}
          onChange={e => patchSettings(settings, { lights: { ...settings.lights, shadows: e.target.checked } })} />
      </Row>
      <div className="room-editor-panel__hint">{t('room.editor.light.shadowsWarn')}</div>
      <Row stacked label={t('room.editor.light.moodTint')}>
        <input type="checkbox" checked={settings.lights.moodTint}
          onChange={e => patchSettings(settings, { lights: { ...settings.lights, moodTint: e.target.checked } })} />
      </Row>
    </div>
  );
}
