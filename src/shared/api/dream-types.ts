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
  type?: string;
  summary?: string;
  description?: string;
  label?: string;
}

export type DreamFlowEntrySource = string | DreamFlowEntry;

export interface DreamState {
  status: DreamStatus;
  dream_id?: string;
  frozen_world?: string;
  lucid_mode?: string;
  /** Her cyber body numbers — user sees own numbers always (orthogonal to boundary_level). */
  body: {
    heat: number;       // 0–100
    sensitivity: number;
    tension: number;
  };
  /** 叶瑄's dream-local emotional tension, 0.0–1.0. */
  yexuan_tension: number;
  scene_state?: string;
  symbolic_anchors?: string[];
  /** Optional backend-projected dream flow summaries. Older backends omit these fields. */
  flow_entries?: DreamFlowEntrySource[];
  dream_events?: DreamFlowEntrySource[];
  events?: DreamFlowEntrySource[];
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
}

export interface DreamEnterResponse {
  ok: boolean;
  dream_id?: string;
  error?: string;
}

export interface DreamChatResponse {
  reply: string;
  exit_accepted: boolean;
  force_exited: boolean;
  error?: string;
  segments?: NarrativeSegment[];
  segmented_content?: string;
}

export interface DreamExitResponse {
  ok: true;
  exited: true;
}

export type MemoryAccess = 'card_only' | 'relationship_summary' | 'full_snapshot';
export type BoundaryLevel = 'vague' | 'body_perceptible' | 'numbers_visible' | 'threshold_break';
export type WorldLayer = 'reality_derived' | 'abo' | 'vampire' | 'cat' | 'flower_bud' | 'custom';
export type LucidMode = 'lucid_shared' | 'non_lucid';
/** Backend accepts safe ASCII preset stems; the UI exposes its verified allowlist. */
export type DreamJailbreakPreset = string;

export const DEFAULT_DREAM_SETTINGS: DreamSettings = {
  enable_dream_lorebook: true,
  memory_access: 'relationship_summary',
  boundary_level: 'body_perceptible',
  world_layer: 'reality_derived',
  lucid_mode: 'lucid_shared',
  jailbreak_preset: 'default',
  display: { physiological_arousal: false },
};

export interface DreamSettings {
  enable_dream_lorebook: boolean;
  memory_access: MemoryAccess;
  boundary_level: BoundaryLevel;
  world_layer: WorldLayer;
  lucid_mode: LucidMode;
  jailbreak_preset: DreamJailbreakPreset;
  display?: { physiological_arousal?: boolean };
}

export interface DreamSettingsUpdateRequest {
  enable_dream_lorebook?: boolean;
  memory_access?: MemoryAccess;
  boundary_level?: BoundaryLevel;
  world_layer?: WorldLayer;
  lucid_mode?: LucidMode;
  jailbreak_preset?: DreamJailbreakPreset;
  display?: { physiological_arousal?: boolean };
}

export interface DreamSettingsResponse {
  ok: boolean;
  settings: DreamSettings;
}

import type { NarrativeSegment } from './types';

export interface DreamMessage {
  id: string;
  role: 'her' | 'user' | 'system';
  text: string;
  /** WS msg_id from channel_message, used to correlate message_segments */
  wsMsgId?: string;
  segments?: NarrativeSegment[];
  /** Stripped content from message_segments; overrides text in rendering */
  segmentedContent?: string;
}
