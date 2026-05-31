import { invoke } from '@tauri-apps/api/core';
import type { ChatResponse, GardenState, DiaryListResponse, DiaryEntry, ChatLogDatesResponse, ChatLogDay, MoodState, ActivityState, SensorRealtimeResponse, UploadIngestResponse, UploadError } from './types';

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

export async function loadDiaryList(): Promise<DiaryListResponse> {
  return invoke<DiaryListResponse>('load_diary_list');
}

export async function loadDiaryEntry(date: string): Promise<DiaryEntry> {
  return invoke<DiaryEntry>('load_diary_entry', { date });
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
