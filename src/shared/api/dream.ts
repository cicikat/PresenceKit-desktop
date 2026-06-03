import { invoke } from '@tauri-apps/api/core';
import type {
  DreamState,
  DreamEnterResponse,
  DreamChatResponse,
  DreamExitResponse,
  DreamSettings,
  DreamSettingsResponse,
  DreamSettingsUpdateRequest,
} from './dream-types';

const DREAM_SETTINGS_TIMEOUT_MS = 5000;

async function withDreamSettingsTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Dream settings 请求超时')), DREAM_SETTINGS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function dreamGetState(): Promise<DreamState> {
  return invoke<DreamState>('dream_get_state');
}

export async function dreamEnter(entry_reason?: string): Promise<DreamEnterResponse> {
  return invoke<DreamEnterResponse>('dream_enter', {
    entryReason: entry_reason ?? null,
  });
}

export async function dreamChat(message: string): Promise<DreamChatResponse> {
  return invoke<DreamChatResponse>('dream_chat', { message });
}

export async function dreamExit(): Promise<DreamExitResponse> {
  return invoke<DreamExitResponse>('dream_exit');
}

export async function dreamGetSettings(): Promise<DreamSettings> {
  return withDreamSettingsTimeout(invoke<DreamSettings>('dream_get_settings'));
}

export async function dreamUpdateSettings(update: DreamSettingsUpdateRequest): Promise<DreamSettingsResponse> {
  return withDreamSettingsTimeout(invoke<DreamSettingsResponse>('dream_update_settings', {
    enableDreamLorebook: update.enable_dream_lorebook ?? null,
    memoryAccess: update.memory_access ?? null,
    boundaryLevel: update.boundary_level ?? null,
    worldLayer: update.world_layer ?? null,
    lucidMode: update.lucid_mode ?? null,
    jailbreakPreset: update.jailbreak_preset ?? null,
    display: update.display ?? null,
  }));
}
