import { invoke } from '@tauri-apps/api/core';

export type ThinkingMode = 'auto' | 'native' | 'monologue';

export interface ThinkingSettings {
  enabled: boolean;
  mode: ThinkingMode;
  monologue_max_tokens: number;
  apply_to_proactive: boolean;
  chat_preset_reasoning_native: boolean;
}

export function getThinkingSettings(): Promise<ThinkingSettings> {
  return invoke<ThinkingSettings>('get_thinking_settings');
}

export function updateThinkingSettings(patch: {
  enabled?: boolean;
  mode?: ThinkingMode;
  apply_to_proactive?: boolean;
  monologue_max_tokens?: number;
}): Promise<ThinkingSettings> {
  return invoke<{ thinking: Omit<ThinkingSettings, 'chat_preset_reasoning_native'>; chat_preset_reasoning_native: boolean }>(
    'update_thinking_settings',
    { enabled: patch.enabled, mode: patch.mode, applyToProactive: patch.apply_to_proactive, monologueMaxTokens: patch.monologue_max_tokens },
  ).then(res => ({ ...res.thinking, chat_preset_reasoning_native: res.chat_preset_reasoning_native }));
}
