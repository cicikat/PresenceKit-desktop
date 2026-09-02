export type DreamStatus =
  | 'REALITY_CHAT'
  | 'DREAM_ENTRANCE_AVAILABLE'
  | 'DREAM_ACTIVE'
  | 'DREAM_EXIT_REQUESTED'
  | 'DREAM_LOCKED'
  | 'DREAM_CLOSING'
  | 'REALITY_AFTERGLOW';

/** Projected dream state from GET /dream/state — UI panel fields only. */
export interface DreamFlowEntry {
  ts: string;
  kind: string;
  summary: string;
}

export interface DreamScenarioState {
  script_id?: string | null;
  current_stage_id?: string | null;
  stage_turns?: number | null;
  ending_state?: string | null;
  last_progress_signal?: string | null;
  satisfied_streak?: number | null;
  last_matched_exit_signs?: string[];
  last_blocked_events?: string[];
}

export interface DreamMirrorCoreState {
  version?: string;
  source?: string;
  snapshot_buckets?: Record<string, string>;
  symbolic_hints?: string[];
}

export interface DreamState {
  status: DreamStatus;
  active?: boolean;
  dream_id?: string;
  frozen_world?: string;
  lucid_mode?: string;
  /** Dream runtime mode. Older/newer backends may expose either field name. */
  dream_mode?: 'sandbox' | 'scenario' | 'mirror' | string;
  mode?: 'sandbox' | 'scenario' | 'mirror' | string;
  /** Scenario progress is backend-owned and read-only in the client. */
  scenario?: DreamScenarioState;
  /** Mirror Mode v0.1 projected read-only state. Backend owns the snapshot. */
  mirror_core?: DreamMirrorCoreState;
  mirror?: DreamMirrorCoreState;
  /** Flat scenario fields are retained for compatibility with alternate projections. */
  script_id?: string | null;
  current_stage_id?: string | null;
  stage_turns?: number | null;
  ending_state?: string | null;
  last_progress_signal?: string | null;
  satisfied_streak?: number | null;
  last_matched_exit_signs?: string[];
  last_blocked_events?: string[];
  /** Her cyber body numbers — user sees own numbers always (orthogonal to boundary_level). */
  body: {
    heat: number;       // 0–100
    sensitivity: number;
    tension: number;
  };
  /** Character's dream-local emotional tension, 0.0–1.0. */
  char_tension?: number | Record<string, number>;
  /** Group Dream roster. Absent in single-user Dream state. */
  roster?: string[];
  /** @deprecated backend double-send alias for char_tension during the Brief 25 §3 P2 migration window — drop once the backend stops sending it. */
  yexuan_tension?: number;
  scene_state?: string;
  symbolic_anchors?: string[];
  /** Backend-projected dream flow ticker (rule-driven, zero extra LLM calls). Empty/absent on older backends or before the first flow event of a dream. */
  flow_entries?: DreamFlowEntry[];
  /** Dream HUD v1.1 — derived fields appended by backend. Absent on older backends. */
  emotion_label?: string;
  scene_label?: string;
  emotion_tension?: number;       // 0–100
  boundary_intrusion?: number;    // 0–100
  intimacy_tendency?: number;     // 0–100
  obsession?: number;             // 0–100
  dream_stability?: number;       // 0–100
  dream_depth?: number;           // 0–100
  /** Hidden by default in UI. */
  physiological_arousal?: number; // 0–100
  /**
   * UI status projection (backend Brief 94 §2, core/dream/dream_state.py
   * derive_dream_state_projection): coarse bucket over the raw `status` state
   * machine, replacing the client's old blanket "dreaming → can't chat" guess.
   * "idle" | "dreaming" | "cooldown". Absent on older backends.
   */
  dream_state?: 'idle' | 'dreaming' | 'cooldown';
  /** Unix epoch seconds marking the start of the current dream_state bucket, or null/absent when there's nothing to time. */
  since?: number | null;
  /** Unix epoch estimate for when the current bucket ends; null when it can't be predicted (dream length is never estimable). */
  expected_end?: number | null;
  /** Heuristic-only signal: the "dreaming" bucket has run past the stuck threshold. Never affects hard_exit. */
  stuck?: boolean;
  /** Whether /desktop/chat currently rejects with 409 for this user (get_reality_guard_status != ALLOW). Absent on older backends. */
  blocks_chat?: boolean;
}

export interface DreamEnterResponse {
  ok: boolean;
  dream_id?: string;
  dream_mode?: DreamEntryMode;
  error?: string;
}

export type DreamEntryMode = 'sandbox' | 'scenario' | 'mirror' | 'rpg';

export interface DreamCapabilities { rpg?: { available?: boolean; supported_modes?: string[]; [key: string]: unknown }; [key: string]: unknown }
export interface RpgState { dream_id?: string; script_id?: string; dream_mode?: string; scene_revision?: number; round?: number; status?: string; [key: string]: unknown }
export interface RpgTranscriptEntry { lane?: 'character' | 'kp' | 'shared' | string; kind?: string; content?: string; text?: string; correlation_id?: string; [key: string]: unknown }
export interface RpgTranscript { entries: RpgTranscriptEntry[]; next_cursor?: string | null; partial_read?: boolean; [key: string]: unknown }
export interface RpgTurnResponse { ok?: boolean; request_id?: string; state?: RpgState; entries?: RpgTranscriptEntry[]; error?: string; detail?: { code?: string; [key: string]: unknown }; [key: string]: unknown }

export interface DreamEnterOptions {
  entry_reason?: string;
  dream_mode?: DreamEntryMode;
  script_id?: string;
}

export interface DreamChatResponse {
  reply: string;
  exit_accepted: boolean;
  force_exited: boolean;
  dream_id?: string | null;
  already_closed?: boolean;
  continuation_eligible?: boolean;
  error?: string;
  segments?: NarrativeSegment[];
  segmented_content?: string;
}

export interface DreamGroupChatResponse {
  round_id: string;
  status: string;
}

export interface DreamExitResponse {
  ok: boolean;
  exited: boolean;
  already_closed?: boolean;
  closed_now?: boolean;
  error?: string;
  dream_id?: string | null;
  dream_mode?: string | null;
  exit_mechanism?: string | null;
  exit_initiator?: string | null;
  completion?: string | null;
  exit_reason?: string | null;
  assistant_turns?: number | null;
  archive_ok?: boolean | null;
  exited_at?: number | null;
}

/** Response from POST /dream/wake — soft retention gate. */
export type DreamWakeResponse =
  | {
      retained: false;
      exited: boolean;
      already_closed?: boolean;
      closed_now?: boolean;
      archive_ok?: boolean | null;
      error?: string;
      dream_id?: string | null;
      dream_mode?: string | null;
      exit_mechanism?: string | null;
      exit_initiator?: string | null;
      completion?: string | null;
      exit_reason?: string | null;
      assistant_turns?: number | null;
      exited_at?: number | null;
    }
  | { retained: true; retention_text: string; dream_id: string };

/** Response from POST /dream/resume — resume after soft retention. */
export interface DreamResumeResponse {
  ok: boolean;
  resumed?: boolean;
  dream_id?: string | null;
  error?: string;
}

export type MemoryAccess = 'card_only' | 'relationship_summary' | 'full_snapshot';
export type BoundaryLevel = 'vague' | 'body_perceptible' | 'numbers_visible' | 'threshold_break';
export type WorldLayer = string;
export type LucidMode = 'lucid_shared' | 'non_lucid';
/** Backend accepts safe ASCII preset stems; the UI exposes its verified allowlist. */
export type DreamJailbreakPreset = string;

export const DEFAULT_DREAM_SETTINGS: DreamSettings = {
  enable_dream_lorebook: true,
  memory_access: 'relationship_summary',
  boundary_level: 'body_perceptible',
  world_layer: 'reality_derived',
  lucid_mode: 'lucid_shared',
  jailbreak_presets: ['default'],
  display: { physiological_arousal: false },
};

export interface DreamSettings {
  enable_dream_lorebook: boolean;
  memory_access: MemoryAccess;
  boundary_level: BoundaryLevel;
  world_layer: WorldLayer;
  lucid_mode: LucidMode;
  jailbreak_presets: DreamJailbreakPreset[];
  /** Group mode overrides. An empty list follows the group default. */
  per_char?: Record<string, { jailbreak_presets: DreamJailbreakPreset[] }>;
  display?: { physiological_arousal?: boolean };
}

export interface DreamSettingsUpdateRequest {
  enable_dream_lorebook?: boolean;
  memory_access?: MemoryAccess;
  boundary_level?: BoundaryLevel;
  world_layer?: WorldLayer;
  lucid_mode?: LucidMode;
  jailbreak_presets?: DreamJailbreakPreset[];
  per_char?: Record<string, { jailbreak_presets: DreamJailbreakPreset[] }>;
  display?: { physiological_arousal?: boolean };
}

export interface DreamSettingsResponse {
  ok: boolean;
  settings: DreamSettings;
}

import type { NarrativeSegment } from './types';

export interface DreamStats {
  total_valid: number;
  total_archived: number;
  last_dream_at: number | null;
}

export interface DreamArchiveMetadata {
  dream_id: string;
  char_id: string;
  started_at: number | null;
  ended_at: number | null;
  valid_turns: number;
  valid_user_turns: number;
  valid_assistant_turns: number;
  dream_mode: string;
  world_name: string;
  exit_mechanism: string;
  exit_initiator: string;
  completion: string;
  exit_reason: string;
  summary_present: boolean;
  summary_created_at: number | null;
  summary_title?: string;
  summary_preview?: string;
  archive_parse_error?: boolean;
}

export interface DreamArchiveListResponse {
  char_id: string;
  items: DreamArchiveMetadata[];
  offset: number;
  limit: number;
  total: number;
  has_more: boolean;
}

export interface DreamArchiveMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number | null;
  lane?: 'character' | 'kp' | 'shared' | string;
  kind?: string;
  correlation_id?: string;
  segments?: NarrativeSegment[];
  segmented_content?: string;
  segment_parse_fallback?: boolean;
}

export interface DreamArchiveDetailResponse {
  dream_id: string;
  char_id: string;
  metadata: DreamArchiveMetadata;
  messages: DreamArchiveMessage[];
  partial_read: boolean;
}

export interface DreamMessage {
  id: string;
  role: 'her' | 'user' | 'system';
  text: string;
  /** WS msg_id from channel_message, used to correlate message_segments */
  wsMsgId?: string;
  segments?: NarrativeSegment[];
  /** Stripped content from message_segments; overrides text in rendering */
  segmentedContent?: string;
  /** Group Dream speaker identity. Absent for the owner and single-user Dream. */
  speakerId?: string;
  roundId?: string;
}


export interface DreamGroupState extends Omit<DreamState, 'char_tension' | 'roster'> {
  char_tension: Record<string, number>;
  roster: string[];
  /** Server-owned group Dream round lifecycle for reconnect/timeout recovery. */
  round_status?: 'idle' | 'running' | 'failed' | 'timed_out' | string;
  last_round_error?: string | null;
}

export interface DreamPresetOption {
  id: string;
  label: string;
}

export interface DreamScenarioOption {
  id: string;
  title: string;
  source: 'user' | 'legacy' | string;
}
