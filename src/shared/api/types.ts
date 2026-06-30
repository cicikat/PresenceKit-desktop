// Narrative Message Protocol — Phase 1 types
// Segments are a read-only view; the raw reply remains the source of truth.
export type NarrativeSegmentType = 'say' | 'do' | 'env' | 'feel' | 'narration';

export interface NarrativeSegment {
  type: NarrativeSegmentType;
  text: string;
}

export type ServerMessage =
  | { type: 'hello_ack'; server_version: string }
  | { type: 'channel_message'; content: string; msg_id: string; source?: string; char_id?: string; round_id?: string }
  | { type: 'message_segments'; content: string; segments: NarrativeSegment[]; msg_id: string; source?: string; char_id?: string }
  | { type: 'action'; action: DesktopActionPayload; msg_id: string }
  | { type: 'ping' }
  | { type: 'message_stream_start'; msg_id: string; source?: string; char_id?: string; round_id?: string }
  | { type: 'message_stream_delta'; msg_id: string; delta: string }
  | { type: 'message_stream_end'; msg_id: string }
  | { type: 'group_round_start'; round_id: string; group_id: string }
  | { type: 'group_round_end'; round_id: string; group_id: string };

export type ClientMessage =
  | { type: 'hello'; client: string; version: string }
  | { type: 'ack'; msg_id: string; ok: boolean; error?: string }
  | { type: 'pong' };

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'auth-failed';

export type DesktopActionType =
  | 'minimize_window'
  | 'open_url'
  | 'show_notify'
  | 'media_play_pause'
  | 'play_netease'
  | 'dream_invite'
  | 'toy_invite'
  | 'presence_nag'
  | 'avatar_directive';

export interface HardwareDevice {
  index: number;
  name: string;
  display_name: string;
  connected: boolean;
  can_vibrate: boolean;
}

export interface HardwareStatus {
  connected: boolean;
  devices: HardwareDevice[];
}

export type DesktopActionPayload = {
  type?: string;
  action_type?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

export interface ChatResponse {
  reply: string;
  emotion: string;
  turn_id?: string;
  msg_id?: string;
  // Phase 1 reserved field — not yet populated by the HTTP API
  segments?: NarrativeSegment[];
}

export interface DesktopWakeResponse {
  reply: string | null;
  source: string;
  turn_id?: string;
  msg_id?: string;
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
  ts?: number;
  turn_id?: string;
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
  msg_id?: string;
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

// ── Group Chat (spec-10) ──────────────────────────────────────────────────────

export type GroupDomain = 'reality' | 'dream';

export interface GroupSettings {
  min_responders: number;
  max_responders: number;
  max_ai_chain_depth: number;
  addressed_exclusive: boolean;
}

export interface GroupRosterMember {
  char_id: string;
  label: string;
  avatar_url: string | null;
}

export interface GroupSummary {
  group_id: string;
  domain: GroupDomain;
  roster: GroupRosterMember[];
  title: string;
}

export interface GroupMessage {
  msg_id: string;
  speaker_id: 'owner' | string;
  content: string;
  timestamp: number;
  segments?: NarrativeSegment[];
  triggered_by?: 'user' | string;
}

export interface GroupDetail extends GroupSummary {
  settings: GroupSettings;
  recent: GroupMessage[];
}

export interface GroupSendResponse { round_id: string; status: string; }

export interface PromptAssetCharacter {
  id: string;
  label: string;
  kind?: string;
  avatar_url: string | null;
  has_runtime_avatar?: boolean;
}

export interface PromptAssetOption {
  id: string;
  label: string;
  kind?: string;
}

export interface ActivePromptAssets {
  active_character: string;
  enabled_lorebooks: string[];
  enabled_jailbreaks: string[];
}

export interface PromptAssetsResponse {
  characters: PromptAssetCharacter[];
  lorebooks: PromptAssetOption[];
  jailbreaks: PromptAssetOption[];
  dream_presets: PromptAssetOption[];
  world_cards: PromptAssetOption[];
  active: ActivePromptAssets;
}

export interface PromptAssetsPatch {
  active_character?: string;
  enabled_lorebooks?: string[];
  enabled_jailbreaks?: string[];
}

export interface PromptAssetsPatchResponse {
  message: string;
  active: ActivePromptAssets;
}

// ── Chat Settings (runtime preferences) ──────────────────────────────────────

export interface ChatSettings {
  mode: 'chat' | 'roleplay';
  style: 'chat' | 'roleplay';
  multi_message: boolean;
}

// ── Hidden State Panel (Phase 4.5, read-only UI) ──────────────────────────────

export interface HiddenStateSensitivity {
  baseline: number;
  current: number;
  last_update_source: string;
}

export interface HiddenStateTouchNeed {
  baseline: number;
  deficit: number;
  last_update_source: string;
}

export interface HiddenStateScalar {
  value: number;
  last_update_source: string;
}

export interface HiddenStateBodyMemoryEntry {
  cue: string;
  response_tag: string;
  weight: number;
}

export interface HiddenStateDreamSnapshot {
  sensitivity: 'low' | 'mid' | 'high';
  touch_appetite: 'low' | 'mid' | 'high';
  embodied_ease: 'guarded' | 'neutral' | 'easy';
  memory_cues: string[];
}

export interface HiddenStateDebugResponse {
  schema_version: number;
  last_decay_tick: string | null;
  display?: {
    physiological_arousal?: boolean;
  };
  sensitivity: HiddenStateSensitivity;
  touch_need: HiddenStateTouchNeed;
  embodied_ease: HiddenStateScalar;
  body_memory: HiddenStateBodyMemoryEntry[];
  dream_snapshot: HiddenStateDreamSnapshot;
}
