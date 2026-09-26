import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useRoomScene } from './useRoomScene';
import type { Mood } from '../../shared/state/store';
import type { RoomSettings } from '../../shared/room/roomSettings';
import type { SceneCameraPreset } from './sceneCameraPresets';
import { useI18n } from '../../shared/i18n';

export interface ThreeCallStageHandle {
  toggleFreeLook: () => void;
  saveCurrentView: () => void;
  togglePlacementMode: () => void;
  applyCameraPreset: (id: string) => boolean;
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
    const { freeLook, toggleFreeLook, saveCurrentView, placementMode, togglePlacementMode, applyCameraPreset } =
      useRoomScene(mountRef, mood, talking, settings, onCameraPresetsChange);

    useImperativeHandle(
      ref,
      () => ({ toggleFreeLook, saveCurrentView, togglePlacementMode, applyCameraPreset }),
      [toggleFreeLook, saveCurrentView, togglePlacementMode, applyCameraPreset],
    );

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
            拖拽旋转 · 滚轮缩放 · 右键平移
          </div>
        )}
        {placementMode && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'oklch(0.15 0.03 60 / 0.82)', color: 'oklch(0.82 0.06 60)',
            fontSize: 11, padding: '4px 14px', borderRadius: 6, pointerEvents: 'none',
            fontFamily: 'var(--font-mono, monospace)', letterSpacing: 0.8, zIndex: 5,
            backdropFilter: 'blur(4px)',
          }}>
            {t('room.call.placementHint')}
          </div>
        )}
      </div>
    );
  },
);
