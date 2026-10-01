import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useRoomScene } from './useRoomScene';
import { EditorPanel } from './EditorPanel';
import type { Mood } from '../../shared/state/store';
import type { RoomSettings } from '../../shared/room/roomSettings';
import type { SceneCameraPreset } from './sceneCameraPresets';
import type { EditableId, LightKey } from './sceneOutline';
import type { LightCfg, RoomProp } from '../../shared/room/roomSettings';
import { useI18n } from '../../shared/i18n';

export interface ThreeCallStageHandle {
  toggleFreeLook: () => void;
  saveCurrentView: () => void;
  togglePlacementMode: () => void;
  applyCameraPreset: (id: string) => boolean;
  bringCharacterToView: () => boolean;
  selection: EditableId | null;
  selectById: (id: EditableId | null) => boolean;
  setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  gizmoMode: 'translate' | 'rotate' | 'scale';
  applyLightPatch: (key: LightKey, patch: Partial<LightCfg>) => void;
  setPropHidden: (index: number, hidden: boolean) => void;
  applyPropPatch: (index: number, patch: Partial<RoomProp>) => void;
  removeProp: (index: number) => void;
  applyCharacterPatch: (patch: { yawDeg?: number; scaleMul?: number }) => void;
  applyLookSettings: (next: RoomSettings) => void;
  axisLock: 'X' | 'Y' | 'Z' | null;
  setAxisConstraint: (axis: 'X' | 'Y' | 'Z' | null) => void;
}

interface ThreeCallStageProps {
  mood: Mood;
  talking: boolean;
  settings: RoomSettings;
  onSceneStateChange: (freeLook: boolean, placementMode: boolean) => void;
  onCameraPresetsChange: (presets: SceneCameraPreset[]) => void;
}

export const ThreeCallStage = forwardRef<ThreeCallStageHandle, ThreeCallStageProps>(
  function ThreeCallStage({ mood, talking, settings, onSceneStateChange, onCameraPresetsChange }, ref) {
    const { t } = useI18n();
    const mountRef = useRef<HTMLDivElement>(null);
    const {
      freeLook, toggleFreeLook, saveCurrentView, placementMode, togglePlacementMode,
      applyCameraPreset, bringCharacterToView, selection, selectById, setGizmoMode, gizmoMode,
      applyLightPatch, setPropHidden, applyPropPatch, removeProp, applyCharacterPatch, applyLookSettings,
      axisLock, setAxisConstraint,
    } = useRoomScene(mountRef, mood, talking, settings, onCameraPresetsChange);

    const handle = useMemo<ThreeCallStageHandle>(() => ({
      toggleFreeLook, saveCurrentView, togglePlacementMode, applyCameraPreset, bringCharacterToView,
      selection, selectById, setGizmoMode, gizmoMode, applyLightPatch, setPropHidden,
      applyPropPatch, removeProp, applyCharacterPatch, applyLookSettings, axisLock, setAxisConstraint,
    }), [
      toggleFreeLook, saveCurrentView, togglePlacementMode, applyCameraPreset, bringCharacterToView,
      selection, selectById, setGizmoMode, gizmoMode, applyLightPatch, setPropHidden,
      applyPropPatch, removeProp, applyCharacterPatch, applyLookSettings, axisLock, setAxisConstraint,
    ]);
    useImperativeHandle(ref, () => handle, [handle]);

    useEffect(() => {
      onSceneStateChange(freeLook, placementMode);
    }, [freeLook, placementMode, onSceneStateChange]);

    return (
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {freeLook && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'oklch(0.15 0.03 240 / 0.80)', color: 'oklch(0.75 0.05 240)',
            fontSize: 11, padding: '4px 12px', borderRadius: 6, pointerEvents: 'none',
            fontFamily: 'var(--font-mono, monospace)', letterSpacing: 0.8, zIndex: 5,
            backdropFilter: 'blur(4px)',
          }}>
            {t('room.call.freeLook.hint')}
          </div>
        )}
        {placementMode && (
          <>
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'oklch(0.15 0.03 60 / 0.82)', color: 'oklch(0.82 0.06 60)',
              fontSize: 11, padding: '4px 14px', borderRadius: 6, pointerEvents: 'none',
              fontFamily: 'var(--font-mono, monospace)', letterSpacing: 0.8, zIndex: 5,
              backdropFilter: 'blur(4px)',
            }}>
              {t('room.editor.title')}
            </div>
            {/* Mounted here (not in RoomWindow) because selection/gizmo/axis state lives in this
              * component's hook; the panel unmounts when placementMode ends. */}
            <EditorPanel settings={settings} loadedSceneFile={null} stage={handle} />
          </>
        )}
      </div>
    );
  },
);
