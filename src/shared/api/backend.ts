import { invoke } from '@tauri-apps/api/core';
import type { ChatResponse, DesktopWakeResponse, GardenState, DiaryListResponse, DiaryEntry, ChatLogDatesResponse, ChatLogDay, MoodState, ActivityState, SensorRealtimeResponse, UploadIngestResponse, UploadError, PromptAssetsResponse, PromptAssetsPatch, PromptAssetsPatchResponse, HiddenStateDebugResponse, PromptAssetCharacter, PromptAssetOption, ActivePromptAssets, GroupSummary, GroupDetail, GroupSendResponse, GroupSettings } from './types';

export async function sendChat(message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>('send_chat', { message });
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const result = await invoke<{ user_id: string; history: HistoryEntry[]; count: number }>(
    'load_history',
  );
  return result.history;
}

export async function loadGardenState(): Promise<GardenState> {
  return invoke<GardenState>('load_garden_state');
}

export async function loadDiaryList(charId?: string): Promise<DiaryListResponse> {
  return invoke<DiaryListResponse>('load_diary_list', charId ? { charId } : {});
}

export async function loadDiaryEntry(date: string, charId?: string): Promise<DiaryEntry> {
  return invoke<DiaryEntry>('load_diary_entry', charId ? { date, charId } : { date });
}

export async function loadChatLogDates(): Promise<ChatLogDatesResponse> {
  return invoke<ChatLogDatesResponse>('load_chat_log_dates');
}

export async function loadChatLogDay(date: string): Promise<ChatLogDay> {
  return invoke<ChatLogDay>('load_chat_log_day', { date });
}

export async function loadMoodState(): Promise<MoodState> {
  return invoke<MoodState>('load_mood_state');
}

export async function loadActivityState(): Promise<ActivityState> {
  return invoke<ActivityState>('load_activity_state');
}

export async function loadSensorRealtime(): Promise<SensorRealtimeResponse> {
  return invoke<SensorRealtimeResponse>('load_sensor_realtime');
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

export async function getPromptAssets(): Promise<PromptAssetsResponse> {
  const response = await invoke<unknown>('get_prompt_assets');
  return normalizePromptAssets(response);
}

export async function getCharacterAvatar(charId: string): Promise<string | null> {
  return invoke<string | null>('get_character_avatar', { charId });
}

export async function uploadCharacterAvatar(charId: string, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));
  await invoke('upload_character_avatar', { charId, data, contentType: file.type });
}

export async function deleteCharacterAvatar(charId: string): Promise<void> {
  await invoke('delete_character_avatar', { charId });
}

export async function loadHiddenStateDebug(): Promise<HiddenStateDebugResponse> {
  return invoke<HiddenStateDebugResponse>('load_hidden_state_debug');
}

export async function desktopWake(lastSeen?: number): Promise<DesktopWakeResponse> {
  return invoke<DesktopWakeResponse>('desktop_wake', {
    lastSeen: lastSeen ?? null,
  });
}

export async function patchPromptAssets(patch: PromptAssetsPatch): Promise<PromptAssetsPatchResponse> {
  const response = await invoke<unknown>('patch_prompt_assets', {
    activeCharacter: patch.active_character ?? null,
    enabledLorebooks: patch.enabled_lorebooks ?? null,
    enabledJailbreaks: patch.enabled_jailbreaks ?? null,
  });
  const raw = isRecord(response) ? response : {};
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
  return invoke<GroupSummary[]>('group_list');
}

export async function createGroup(
  roster: string[],
  domain: string,
  settings?: Partial<GroupSettings>,
  groupId?: string,
): Promise<GroupDetail> {
  return invoke<GroupDetail>('group_create', {
    roster,
    domain,
    settings: settings ?? null,
    groupId: groupId ?? null,
  });
}

export async function getGroup(id: string): Promise<GroupDetail> {
  return invoke<GroupDetail>('group_get', { id });
}

export async function groupSend(id: string, message: string): Promise<GroupSendResponse> {
  return invoke<GroupSendResponse>('group_send', { id, message });
}

export async function groupHistory(id: string, before?: number): Promise<GroupDetail['recent']> {
  return invoke<GroupDetail['recent']>('group_history', { id, before: before ?? null });
}

export async function getGroupSettings(id: string): Promise<GroupSettings> {
  return invoke<GroupSettings>('group_settings_get', { id });
}

export async function patchGroupSettings(id: string, settings: Partial<GroupSettings>): Promise<GroupSettings> {
  return invoke<GroupSettings>('group_settings_patch', { id, settings });
}

export async function uploadDocument(
  filePath: string,
  message: string,
): Promise<UploadIngestResponse> {
  try {
    return await invoke<UploadIngestResponse>('upload_document', {
      filePath,
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
