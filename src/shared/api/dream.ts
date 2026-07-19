import { invokeGated } from './authGate';
import type {
  DreamState,
  DreamEnterOptions,
  DreamEnterResponse,
  DreamChatResponse,
  DreamExitResponse,
  DreamWakeResponse,
  DreamResumeResponse,
  DreamSettings,
  DreamSettingsResponse,
  DreamSettingsUpdateRequest,
  DreamStats,
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
  return invokeGated<DreamState>('dream_get_state');
}

export async function dreamEnter(options: DreamEnterOptions = {}): Promise<DreamEnterResponse> {
  return invokeGated<DreamEnterResponse>('dream_enter', {
    entryReason: options.entry_reason ?? null,
    dreamMode: options.dream_mode ?? 'sandbox',
    scriptId: options.script_id ?? null,
  });
}

export async function dreamChat(message: string): Promise<DreamChatResponse> {
  return invokeGated<DreamChatResponse>('dream_chat', { message });
}

export async function dreamExit(): Promise<DreamExitResponse> {
  return invokeGated<DreamExitResponse>('dream_exit');
}

/** Soft retention gate — call instead of dreamExit() when user taps WAKE. */
export async function dreamWake(): Promise<DreamWakeResponse> {
  return invokeGated<DreamWakeResponse>('dream_wake');
}

/** Resume dream after soft retention — user chose to stay. */
export async function dreamResume(): Promise<DreamResumeResponse> {
  return invokeGated<DreamResumeResponse>('dream_resume');
}

export async function dreamGetSettings(): Promise<DreamSettings> {
  return withDreamSettingsTimeout(invokeGated<DreamSettings>('dream_get_settings'));
}

export async function dreamGetStats(): Promise<DreamStats> {
  return invokeGated<DreamStats>('dream_get_stats');
}

export async function dreamUpdateSettings(update: DreamSettingsUpdateRequest): Promise<DreamSettingsResponse> {
  return withDreamSettingsTimeout(invokeGated<DreamSettingsResponse>('dream_update_settings', {
    enableDreamLorebook: update.enable_dream_lorebook ?? null,
    memoryAccess: update.memory_access ?? null,
    boundaryLevel: update.boundary_level ?? null,
    worldLayer: update.world_layer ?? null,
    lucidMode: update.lucid_mode ?? null,
    jailbreakPresets: update.jailbreak_presets ?? null,
    display: update.display ?? null,
  }));
}
