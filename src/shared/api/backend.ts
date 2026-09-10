import { invokeGated } from './authGate';
import type { ChatResponse, DesktopWakeResponse, GardenState, CoplayState, DiaryListResponse, DiaryEntry, ChatLogDatesResponse, ChatLogDay, MoodState, ActivityState, SensorRealtimeResponse, UploadIngestResponse, UploadError, PromptAssetsResponse, PromptAssetsPatch, PromptAssetsPatchResponse, HiddenStateDebugResponse, PromptAssetCharacter, PromptAssetOption, ActivePromptAssets, GroupSummary, GroupDetail, GroupSendResponse, GroupSettings, ReplyToPayload } from './types';

export async function sendChat(message: string, replyTo?: ReplyToPayload): Promise<ChatResponse> {
  return invokeGated<ChatResponse>('send_chat', replyTo ? { message, replyTo } : { message });
}

export async function loadGardenState(): Promise<GardenState> {
  return invokeGated<GardenState>('load_garden_state');
}

// ── Coplay（陪玩模式）── 见 Emerald-presence docs/coplay.md
export async function loadCoplayState(): Promise<CoplayState> {
  return invokeGated<CoplayState>('coplay_state');
}

export async function armCoplay(): Promise<{ ok: boolean; status: string }> {
  return invokeGated('coplay_arm');
}

export async function disarmCoplay(): Promise<{ ok: boolean; status: string }> {
  return invokeGated('coplay_disarm');
}

export async function loadDiaryList(charId?: string): Promise<DiaryListResponse> {
  return invokeGated<DiaryListResponse>('load_diary_list', charId ? { charId } : {});
}

export async function loadDiaryEntry(date: string, charId?: string): Promise<DiaryEntry> {
  return invokeGated<DiaryEntry>('load_diary_entry', charId ? { date, charId } : { date });
}

export async function loadChatLogDates(): Promise<ChatLogDatesResponse> {
  return invokeGated<ChatLogDatesResponse>('load_chat_log_dates');
}

export async function loadChatLogDay(date: string): Promise<ChatLogDay> {
  return invokeGated<ChatLogDay>('load_chat_log_day', { date });
}

export async function loadMoodState(): Promise<MoodState> {
  return invokeGated<MoodState>('load_mood_state');
}

export async function loadActivityState(): Promise<ActivityState> {
  return invokeGated<ActivityState>('load_activity_state');
}

export async function loadSensorRealtime(): Promise<SensorRealtimeResponse> {
  return invokeGated<SensorRealtimeResponse>('load_sensor_realtime');
}

export interface PeriodDateResponse {
  last_period_date: string | null;
  period_reminder_input_ready: boolean;
}

export async function loadPeriodDate(): Promise<PeriodDateResponse> {
  return invokeGated<PeriodDateResponse>('load_period_date');
}

export async function setPeriodDate(lastPeriodDate: string): Promise<PeriodDateResponse> {
  return invokeGated<PeriodDateResponse>('set_period_date', { lastPeriodDate });
}

export async function clearPeriodDate(): Promise<PeriodDateResponse> {
  return invokeGated<PeriodDateResponse>('clear_period_date');
}

export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_ALLOWED_EXTS = ['.txt', '.md', '.docx'] as const;

export function validateUploadFile(filePath: string, fileSize: number): UploadError | null {
  const lower = filePath.toLowerCase();
  const ok = UPLOAD_ALLOWED_EXTS.some(ext => lower.endsWith(ext));
  if (!ok) {
    return {
      status: null,
      kind: 'unsupported_type',
      message: `仅支持 ${UPLOAD_ALLOWED_EXTS.join(' / ')}`,
    };
  }
  if (fileSize > UPLOAD_MAX_BYTES) {
    return {
      status: null,
      kind: 'size_limit',
      message: `文件超过 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB 限制`,
    };
  }
  return null;
}

let promptAssetsCache: PromptAssetsResponse | null = null;
let promptAssetsInFlight: Promise<PromptAssetsResponse> | null = null;
let promptAssetsGeneration = 0;

/** Shared within a WebView; concurrent consumers (ChatWindow/presenter/settings)
 * reuse one request. Mutations below invalidate the cache explicitly. */
export function getPromptAssets(options: { force?: boolean } = {}): Promise<PromptAssetsResponse> {
  if (!options.force && promptAssetsCache) return Promise.resolve(promptAssetsCache);
  if (promptAssetsInFlight) return promptAssetsInFlight;
  const generation = promptAssetsGeneration;
  const request = invokeGated<unknown>('get_prompt_assets')
    .then(response => {
      if (generation !== promptAssetsGeneration) return getPromptAssets({ force: true });
      promptAssetsCache = normalizePromptAssets(response);
      return promptAssetsCache;
    })
    .finally(() => { if (promptAssetsInFlight === request) promptAssetsInFlight = null; });
  promptAssetsInFlight = request;
  return promptAssetsInFlight;
}

export function invalidatePromptAssetsCache(): void {
  ++promptAssetsGeneration;
  promptAssetsCache = null;
  promptAssetsInFlight = null;
}

export async function getCharacterAvatar(charId: string): Promise<string | null> {
  return invokeGated<string | null>('get_character_avatar', { charId });
}

export async function uploadCharacterAvatar(charId: string, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));
  await invokeGated('upload_character_avatar', { charId, data, contentType: file.type });
  invalidatePromptAssetsCache();
}

export async function deleteCharacterAvatar(charId: string): Promise<void> {
  await invokeGated('delete_character_avatar', { charId });
  invalidatePromptAssetsCache();
}

export async function loadHiddenStateDebug(): Promise<HiddenStateDebugResponse> {
  return invokeGated<HiddenStateDebugResponse>('load_hidden_state_debug');
}

export async function desktopWake(lastSeen?: number): Promise<DesktopWakeResponse> {
  return invokeGated<DesktopWakeResponse>('desktop_wake', {
    lastSeen: lastSeen ?? null,
  });
}

export async function patchPromptAssets(patch: PromptAssetsPatch): Promise<PromptAssetsPatchResponse> {
  const response = await invokeGated<unknown>('patch_prompt_assets', {
    activeCharacter: patch.active_character ?? null,
    enabledLorebooks: patch.enabled_lorebooks ?? null,
    enabledJailbreaks: patch.enabled_jailbreaks ?? null,
  });
  const raw = isRecord(response) ? response : {};
  invalidatePromptAssetsCache();
  return {
    message: typeof raw.message === 'string' ? raw.message : '',
    active: normalizeActivePromptAssets(raw.active),
  };
}

function normalizePromptAssets(value: unknown): PromptAssetsResponse {
  const raw = isRecord(value) ? value : {};
  return {
    characters: normalizePromptAssetCharacters(raw.characters),
    lorebooks: normalizePromptAssetOptions(raw.lorebooks),
    jailbreaks: normalizePromptAssetOptions(raw.jailbreaks),
    dream_presets: normalizePromptAssetOptions(raw.dream_presets),
    world_cards: normalizePromptAssetOptions(raw.world_cards),
    active: normalizeActivePromptAssets(raw.active),
  };
}

function normalizePromptAssetCharacters(value: unknown): PromptAssetCharacter[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizeCharacterEntry(item))
    .filter((item): item is PromptAssetCharacter => item !== null);
}

function normalizeCharacterEntry(value: unknown): PromptAssetCharacter | null {
  if (typeof value === 'string') {
    return { id: value, label: value, avatar_url: null };
  }
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }
  return {
    id: value.id,
    label: typeof value.label === 'string' ? value.label : value.id,
    kind: typeof value.kind === 'string' ? value.kind : undefined,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
    has_runtime_avatar: typeof value.has_runtime_avatar === 'boolean' ? value.has_runtime_avatar : false,
    model_routing: typeof value.model_routing === 'string' ? value.model_routing : value.model_routing === null ? null : undefined,
    effective_profile: typeof value.effective_profile === 'string' ? value.effective_profile : undefined,
    resolved_chat_preset: typeof value.resolved_chat_preset === 'string' ? value.resolved_chat_preset : undefined,
    resolved_chat_model: typeof value.resolved_chat_model === 'string' ? value.resolved_chat_model : undefined,
    global_profile: typeof value.global_profile === 'string' ? value.global_profile : undefined,
    binding_source: value.binding_source === 'character' || value.binding_source === 'global' ? value.binding_source : undefined,
    chat_configured: typeof value.chat_configured === 'boolean' ? value.chat_configured : undefined,
  };
}

function normalizePromptAssetOptions(value: unknown): PromptAssetOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizePromptAssetOption(item))
    .filter((item): item is PromptAssetOption => item !== null);
}

function normalizePromptAssetOption(value: unknown): PromptAssetOption | null {
  if (typeof value === 'string') {
    return { id: value, label: value };
  }
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }
  return {
    id: value.id,
    label: typeof value.label === 'string' ? value.label : value.id,
    kind: typeof value.kind === 'string' ? value.kind : undefined,
  };
}

function normalizeActivePromptAssets(value: unknown): ActivePromptAssets {
  const raw = isRecord(value) ? value : {};
  return {
    active_character: typeof raw.active_character === 'string' ? raw.active_character : '',
    enabled_lorebooks: normalizeStringArray(raw.enabled_lorebooks),
    enabled_jailbreaks: normalizeStringArray(raw.enabled_jailbreaks),
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ── Group Chat (spec-10) ──────────────────────────────────────────────────────

export async function listGroups(): Promise<GroupSummary[]> {
  return invokeGated<GroupSummary[]>('group_list');
}

export async function createGroup(
  roster: string[],
  domain: string,
  settings?: Partial<GroupSettings>,
  groupId?: string,
): Promise<GroupDetail> {
  return invokeGated<GroupDetail>('group_create', {
    roster,
    domain,
    settings: settings ?? null,
    groupId: groupId ?? null,
  });
}

export async function getGroup(id: string): Promise<GroupDetail> {
  return invokeGated<GroupDetail>('group_get', { id });
}

export async function groupSend(id: string, message: string): Promise<GroupSendResponse> {
  return invokeGated<GroupSendResponse>('group_send', { id, message });
}

export async function groupHistory(id: string, before?: number): Promise<GroupDetail['recent']> {
  return invokeGated<GroupDetail['recent']>('group_history', { id, before: before ?? null });
}

export async function deleteGroup(id: string): Promise<void> {
  await invokeGated('group_delete', { id });
}

export async function patchGroupRoster(id: string, roster: string[]): Promise<GroupDetail> {
  return invokeGated<GroupDetail>('group_patch_roster', { id, roster });
}

export async function getGroupSettings(id: string): Promise<GroupSettings> {
  return invokeGated<GroupSettings>('group_settings_get', { id });
}

export async function patchGroupSettings(id: string, settings: Partial<GroupSettings>): Promise<GroupSettings> {
  return invokeGated<GroupSettings>('group_settings_patch', { id, settings });
}

export async function transcribeAudio(audioB64: string): Promise<{ text: string }> {
  return invokeGated<{ text: string }>('transcribe_audio', { audioB64 });
}

export interface UploadAttachment { filePath?: string; filename?: string; dataB64?: string }

export async function previewChatAttachment(filePath: string): Promise<string> {
  return invokeGated('preview_chat_attachment', { filePath });
}

export async function uploadDocument(
  filePath: string | UploadAttachment[],
  message: string,
): Promise<UploadIngestResponse> {
  try {
    return await invokeGated<UploadIngestResponse>('upload_document', {
      ...(Array.isArray(filePath) ? { attachments: filePath } : { filePath }),
      message,
    });
  } catch (err) {
    // err 是 Rust 返回的 String,可能形如 "HTTP 413: ..."
    const msg = String(err);
    const m = msg.match(/^HTTP (\d+):/);
    const status = m ? Number(m[1]) : null;
    let kind: UploadError['kind'] = 'unknown';
    if (status === 413) kind = 'size_limit';
    else if (status === 415) kind = 'unsupported_type';
    else if (status === 422) kind = 'parse_failed';
    else if (status === null) kind = 'network';
    const e: UploadError = { status, kind, message: msg };
    throw e;
  }
}
