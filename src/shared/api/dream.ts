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
  DreamArchiveListResponse,
  DreamArchiveDetailResponse,
  DreamGroupState,
  DreamGroupChatResponse,
  DreamPresetOption,
  DreamScenarioOption,
  DreamCapabilities, RpgState, RpgTranscript, RpgTurnResponse,
} from './dream-types';
import { normalizeDreamArchiveDetail, normalizeDreamArchiveList } from './dream-replay';

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

export const dreamGetCapabilities = () => invokeGated<DreamCapabilities>('dream_get_capabilities');
export const dreamRpgState = () => invokeGated<RpgState>('dream_rpg_state');
export const dreamRpgTranscript = (cursor?: string | null, limit = 50) => invokeGated<RpgTranscript>('dream_rpg_transcript', { cursor: cursor ?? null, limit });
export const dreamRpgTurn = (body: Record<string, unknown>) => invokeGated<RpgTurnResponse>('dream_rpg_turn', body);
export const dreamRpgCorrection = (body: Record<string, unknown>) => invokeGated<RpgTurnResponse>('dream_rpg_correction', body);

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
export async function dreamWake(dreamId?: string | null): Promise<DreamWakeResponse> {
  return invokeGated<DreamWakeResponse>('dream_wake', { dreamId: dreamId ?? null });
}

/** Resume dream after soft retention — user chose to stay. */
export async function dreamResume(dreamId?: string | null): Promise<DreamResumeResponse> {
  return invokeGated<DreamResumeResponse>('dream_resume', { dreamId: dreamId ?? null });
}

export async function dreamGetSettings(): Promise<DreamSettings> {
  return withDreamSettingsTimeout(invokeGated<DreamSettings>('dream_get_settings'));
}

export async function dreamGetStats(): Promise<DreamStats> {
  return invokeGated<DreamStats>('dream_get_stats');
}

export async function dreamListArchive(options: {
  offset?: number;
  limit?: number;
  char_id?: string;
} = {}): Promise<DreamArchiveListResponse> {
  const raw = await invokeGated<unknown>('dream_list_archive', {
    offset: options.offset ?? 0,
    limit: options.limit ?? 20,
    charId: options.char_id ?? null,
  });
  return normalizeDreamArchiveList(raw);
}

export async function dreamGetArchive(dreamId: string, charId?: string): Promise<DreamArchiveDetailResponse> {
  const raw = await invokeGated<unknown>('dream_get_archive', {
    dreamId,
    charId: charId ?? null,
  });
  const detail = normalizeDreamArchiveDetail(raw);
  if (!detail) throw new Error('dream_archive_invalid_response');
  return detail;
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

export async function dreamGroupGetState(groupId: string): Promise<DreamGroupState> {
  return invokeGated<DreamGroupState>('dream_group_get_state', { groupId });
}

export async function dreamGroupEnter(groupId: string): Promise<DreamEnterResponse> {
  return invokeGated<DreamEnterResponse>('dream_group_enter', { groupId });
}

export async function dreamGroupChat(groupId: string, message: string): Promise<DreamGroupChatResponse> {
  return invokeGated<DreamGroupChatResponse>('dream_group_chat', { groupId, message });
}

export async function dreamGroupExit(groupId: string): Promise<DreamExitResponse> {
  return invokeGated<DreamExitResponse>('dream_group_exit', { groupId });
}

export async function dreamGroupGetSettings(groupId: string): Promise<DreamSettings> {
  return withDreamSettingsTimeout(invokeGated<DreamSettings>('dream_group_get_settings', { groupId }));
}

export async function dreamGroupUpdateSettings(groupId: string, update: DreamSettingsUpdateRequest): Promise<DreamSettingsResponse> {
  return withDreamSettingsTimeout(invokeGated<DreamSettingsResponse>('dream_group_update_settings', {
    groupId,
    enableDreamLorebook: update.enable_dream_lorebook ?? null,
    boundaryLevel: update.boundary_level ?? null,
    worldLayer: update.world_layer ?? null,
    jailbreakPresets: update.jailbreak_presets ?? null,
    perChar: update.per_char ?? null,
  }));
}

export async function dreamListPresets(): Promise<DreamPresetOption[]> {
  const raw = await invokeGated<unknown>('dream_list_presets');
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { presets?: unknown[] }).presets)
      ? (raw as { presets: unknown[] }).presets
      : []);
  return list.flatMap(item => {
    if (typeof item === 'string') return [{ id: item, label: item }];
    if (!item || typeof item !== 'object') return [];
    const value = item as { id?: unknown; name?: unknown; label?: unknown };
    const id = typeof value.id === 'string' ? value.id : typeof value.name === 'string' ? value.name : null;
    if (!id) return [];
    return [{ id, label: typeof value.label === 'string' ? value.label : id }];
  });
}

export async function dreamListWorlds(): Promise<DreamPresetOption[]> {
  const raw = await invokeGated<unknown>('dream_list_worlds');
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { worlds?: unknown[] }).worlds)
      ? (raw as { worlds: unknown[] }).worlds
      : []);
  return list.flatMap(item => {
    if (typeof item === 'string') return [{ id: item, label: item }];
    if (!item || typeof item !== 'object') return [];
    const value = item as { id?: unknown; name?: unknown; label?: unknown };
    const id = typeof value.id === 'string' ? value.id : typeof value.name === 'string' ? value.name : null;
    return id ? [{ id, label: typeof value.label === 'string' ? value.label : id }] : [];
  });
}

export async function dreamListScenarios(): Promise<DreamScenarioOption[]> {
  const raw = await invokeGated<unknown>('dream_list_scenarios');
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { scenarios?: unknown[] }).scenarios)
    ? (raw as { scenarios: unknown[] }).scenarios
    : [];
  return list.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const value = item as { id?: unknown; title?: unknown; source?: unknown };
    if (typeof value.id !== 'string' || !value.id) return [];
    return [{
      id: value.id,
      title: typeof value.title === 'string' && value.title ? value.title : value.id,
      source: typeof value.source === 'string' ? value.source : 'user',
    }];
  });
}
