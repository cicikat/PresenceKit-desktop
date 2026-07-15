import { invoke } from '@tauri-apps/api/core';

export interface OutputSegmentEnforceSettings {
  enabled: boolean;
  min_len: number;
}

export function getOutputSegmentEnforceSettings(): Promise<OutputSegmentEnforceSettings> {
  return invoke<OutputSegmentEnforceSettings>('get_output_segment_enforce_settings');
}

export function updateOutputSegmentEnforceSettings(enabled: boolean): Promise<OutputSegmentEnforceSettings> {
  return invoke<OutputSegmentEnforceSettings>('update_output_segment_enforce_settings', { enabled });
}
