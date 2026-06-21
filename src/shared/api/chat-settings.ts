import { invoke } from '@tauri-apps/api/core';
import type { ChatSettings } from './types';

export async function getChatSettings(): Promise<ChatSettings> {
  return invoke<ChatSettings>('get_chat_settings');
}

export async function setChatMode(mode: ChatSettings['mode']): Promise<void> {
  await invoke('set_chat_mode', { mode });
}

export async function setChatStyle(style: ChatSettings['style']): Promise<void> {
  await invoke('set_chat_style', { style });
}

export async function setChatMultiMessage(enabled: boolean): Promise<void> {
  await invoke('set_chat_multi_message', { enabled });
}
