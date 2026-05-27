export type DreamStatus =
  | 'REALITY_CHAT'
  | 'DREAM_ENTRANCE_AVAILABLE'
  | 'DREAM_ACTIVE'
  | 'DREAM_EXIT_REQUESTED'
  | 'DREAM_LOCKED'
  | 'DREAM_CLOSING'
  | 'REALITY_AFTERGLOW';

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

export interface DreamSettings {
  enable_dream_lorebook: boolean;
  amnesia: boolean;
  keep_impression: boolean;
  lucid_mode: string;
}

export interface DreamSettingsUpdateRequest {
  enable_dream_lorebook?: boolean;
  amnesia?: boolean;
  keep_impression?: boolean;
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
