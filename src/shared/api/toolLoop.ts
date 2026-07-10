import { invoke } from '@tauri-apps/api/core';

export interface ToolLoopSettings {
  enabled: boolean;
  max_steps: number;
  total_timeout_s: number;
  categories: string[];
  exclude_tools: string[];
  chat_preset_supports_fc: boolean;
}

export function getToolLoopSettings(): Promise<ToolLoopSettings> {
  return invoke<ToolLoopSettings>('get_tool_loop_settings');
}

export function updateToolLoopSettings(patch: {
  enabled?: boolean;
  max_steps?: number;
}): Promise<ToolLoopSettings> {
  return invoke<{ tool_loop: Omit<ToolLoopSettings, 'chat_preset_supports_fc'>; chat_preset_supports_fc: boolean }>(
    'update_tool_loop_settings',
    { enabled: patch.enabled, maxSteps: patch.max_steps },
  ).then(res => ({ ...res.tool_loop, chat_preset_supports_fc: res.chat_preset_supports_fc }));
}
