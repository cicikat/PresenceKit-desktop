// Narrative Message Protocol — Phase 1 types
// Segments are a read-only view; the raw reply remains the source of truth.
export type NarrativeSegmentType = 'say' | 'do' | 'env' | 'feel' | 'narration';

export interface NarrativeSegment {
  type: NarrativeSegmentType;
  text: string;
}

export type ServerMessage =
  | { type: 'hello_ack'; server_version: string }
  | { type: 'channel_message'; content: string; msg_id: string }
  | { type: 'message_segments'; content: string; segments: NarrativeSegment[]; msg_id: string }
  | { type: 'action'; action: DesktopActionPayload; msg_id: string }
  | { type: 'ping' };

export type ClientMessage =
  | { type: 'hello'; client: string; version: string }
  | { type: 'ack'; msg_id: string; ok: boolean; error?: string }
  | { type: 'pong' };

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export type DesktopActionType =
  | 'minimize_window'
  | 'open_url'
  | 'show_notify'
  | 'media_play_pause';

export type DesktopActionPayload = {
  type?: string;
  action_type?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

export interface ChatResponse {
  reply: string;
  emotion: string;
  // Phase 1 reserved field — not yet populated by the HTTP API
  segments?: NarrativeSegment[];
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

export interface ChatLogEntry {
  time: string;
  user: string;
  assistant: string;
}

export interface ChatLogDay {
  date: string;
  entries: ChatLogEntry[];
  raw_fallback: boolean;
}

export interface ChatLogDatesResponse {
  dates: string[];
  count: number;
}

export interface MoodState {
  current: string;
  intensity: number;
  previous: string;
  updated_at: number;
  pending: string | null;
}

export interface ActivityState {
  id: string | null;
  text: string;
  arc: string;
  started_at: number | null;
  next_switch_at: number | null;
  thinking_about_eligible: boolean;
}

export interface UploadIngestResponse {
  reply: string;
  affection: number;
  level: string;
  emotion: string;
  turn_id: string;
  critical_written: boolean;
  stored_path: string;
}

export interface UploadError {
  status: number | null;
  message: string;
  kind: 'size_limit' | 'unsupported_type' | 'parse_failed' | 'network' | 'unknown';
}

export interface SensorRealtimeInput {
  keystrokes: number;
  mouse_clicks: number;
  mouse_distance_px: number;
  idle_seconds: number;
}

export interface SensorRealtimeFocus {
  app: string;
  title_hint: string;
  switch_count: number;
}

export interface SensorRealtimeScreen {
  package_name: string;
  app_label: string;
  window_title: string;
  visible_text: string[];
  clickable_text: string[];
}

export interface SensorRealtimeData {
  ts: number;
  stale_seconds: number;
  presence: 'active' | 'idle' | 'away';
  continuous_at_desk_seconds: number;
  sensor_version: string;
  window_seconds: number;
  input: SensorRealtimeInput;
  focus: SensorRealtimeFocus;
  screen: SensorRealtimeScreen | null;
}

export interface SensorNoData {
  _no_data: true;
}

export type SensorRealtimeResponse = SensorRealtimeData | SensorNoData;

export function isSensorNoData(r: SensorRealtimeResponse): r is SensorNoData {
  return (r as SensorNoData)._no_data === true;
}
