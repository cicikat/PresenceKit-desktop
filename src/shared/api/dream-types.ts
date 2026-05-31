export type DreamStatus =
  | 'REALITY_CHAT'
  | 'DREAM_ENTRANCE_AVAILABLE'
  | 'DREAM_ACTIVE'
  | 'DREAM_EXIT_REQUESTED'
  | 'DREAM_LOCKED'
  | 'DREAM_CLOSING'
  | 'REALITY_AFTERGLOW';

/** Projected dream state from GET /dream/state — UI panel fields only. */
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
}

export interface DreamExitResponse {
  ok: true;
  exited: true;
}

export type MemoryAccess = 'card_only' | 'relationship_summary' | 'full_snapshot';
export type BoundaryLevel = 'vague' | 'body_perceptible' | 'numbers_visible' | 'threshold_break';
export type WorldLayer = 'reality_derived' | 'abo' | 'vampire' | 'cat' | 'flower_bud' | 'custom';
export type LucidMode = 'lucid_shared' | 'non_lucid';

export interface DreamSettings {
  enable_dream_lorebook: boolean;
  memory_access: MemoryAccess;
  boundary_level: BoundaryLevel;
  world_layer: WorldLayer;
  lucid_mode: LucidMode;
}

export interface DreamSettingsUpdateRequest {
  enable_dream_lorebook?: boolean;
  memory_access?: MemoryAccess;
  boundary_level?: BoundaryLevel;
  world_layer?: WorldLayer;
  lucid_mode?: LucidMode;
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
