import { invoke } from '@tauri-apps/api/core';

export type VisualPerceptionResult =
  | 'idle'
  | 'local_disabled'
  | 'backend_disabled'
  | 'locked'
  | 'unchanged'
  | 'pushed'
  | 'backend_not_processing'
  | 'failed';

export interface VisualPerceptionStatus {
  lastAttemptAt: number | null;
  lastPushAt: number | null;
  lastResult: VisualPerceptionResult;
  failureCount: number;
}

export interface VisualPerceptionSettings {
  enabled: boolean;
  sampleIntervalSeconds: number;
  status: VisualPerceptionStatus;
}

export function getVisualPerceptionSettings(): Promise<VisualPerceptionSettings> {
  return invoke('get_visual_perception_settings');
}

export function updateVisualPerceptionSettings(
  enabled: boolean,
  sampleIntervalSeconds: number,
): Promise<VisualPerceptionSettings> {
  return invoke('update_visual_perception_settings', { enabled, sampleIntervalSeconds });
}
