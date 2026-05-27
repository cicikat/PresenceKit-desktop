export type DreamStatus =
  | 'REALITY_CHAT'
  | 'DREAM_ENTRANCE_AVAILABLE'
  | 'DREAM_ACTIVE'
  | 'DREAM_EXIT_REQUESTED'
  | 'DREAM_LOCKED'
  | 'DREAM_CLOSING'
  | 'REALITY_AFTERGLOW';

/** Her cyber body state — dream-local, cleared at dream close. */
export interface BodyState {
  heat: number;         // 0–100
  sensitivity: number;  // 0–100
  tension: number;      // 0–100
  heat_cap: number;
  sensitivity_cap: number;
  tension_cap: number;
}

export interface DreamState {
  user_id: string;
  status: DreamStatus;
  dream_id?: string;
  context_snapshot?: Record<string, unknown>;
  emotional_tension?: number;
  scene_state?: string;
  symbolic_anchors?: string[];
  last_dream_id?: string;
  last_exit_type?: 'soft' | 'hard_exit';
  /** Her cyber body state — user sees own numbers (orthogonal to boundary_level). */
  body_state?: BodyState;
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

export interface DreamSettings {
  enable_dream_lorebook: boolean;
  memory_access: MemoryAccess;
  boundary_level: BoundaryLevel;
  lucid_mode: string;
}

export interface DreamSettingsUpdateRequest {
  enable_dream_lorebook?: boolean;
  memory_access?: MemoryAccess;
  boundary_level?: BoundaryLevel;
}

export interface DreamSettingsResponse {
  ok: boolean;
  settings: DreamSettings;
}

export interface DreamMessage {
  id: string;
  role: 'her' | 'user' | 'system';
  text: string;
}
