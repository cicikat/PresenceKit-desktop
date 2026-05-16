export type ServerMessage =
  | { type: 'hello_ack'; server_version: string }
  | { type: 'channel_message'; content: string; msg_id: string }
  | { type: 'action'; action: Record<string, unknown>; msg_id: string }
  | { type: 'ping' };

export type ClientMessage =
  | { type: 'hello'; client: string; version: string }
  | { type: 'ack'; msg_id: string; ok: boolean; error?: string }
  | { type: 'pong' };

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface ChatResponse {
  reply: string;
  emotion: string;
}

export interface GardenSlot {
  slot_key: string;
  flower_id: string;
  name: string;
  en_name: string;
  stage: string;
  growth: number;
  stage_min: number;
  stage_max: number;
  stage_progress: number;
  mood_keys: string[];
  last_watered: number | null;
}

export interface GardenState {
  slots: GardenSlot[];
  harvest_count: number;
  vase_count: number;
}

export interface DiaryListItem {
  date: string;
  title: string;
  emotion: string | null;
}

export interface DiaryListResponse {
  entries: DiaryListItem[];
  count: number;
}

export interface DiaryEntry {
  date: string;
  title: string;
  emotion: string | null;
  body: string;
}
