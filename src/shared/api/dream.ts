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
  return invoke<DreamSettings>('dream_get_settings');
}

export async function dreamUpdateSettings(update: DreamSettingsUpdateRequest): Promise<DreamSettingsResponse> {
  return invoke<DreamSettingsResponse>('dream_update_settings', {
    enableDreamLorebook: update.enable_dream_lorebook ?? null,
    memoryAccess: update.memory_access ?? null,
    boundaryLevel: update.boundary_level ?? null,
    worldLayer: update.world_layer ?? null,
    lucidMode: update.lucid_mode ?? null,
    display: update.display ?? null,
  });
}
