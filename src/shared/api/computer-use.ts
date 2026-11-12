import { invoke } from '@tauri-apps/api/core';

type WindowId = { handle: number; pid: number; thread: number; created: [number, number] };
export type WindowChoice = { id: WindowId; title: string };
export type ComputerUseScope = { kind: 'window'; window: WindowId } | { kind: 'desktop' };
export type ComputerUseControl = 'pause' | 'resume' | 'stop';
export type ComputerUseStatus = {
  supported: boolean;
  scope: ComputerUseScope | null;
  cloud_vision: boolean | null;
  state: 'closed' | 'ready' | 'running' | 'paused';
  reason: string | null;
  remaining_ms: number;
  focus_ready: boolean;
  task_id: string | null;
  steps: number;
};
export type ComputerUseBackendStatus = {
  enabled: boolean;
  device_online: boolean;
  model_route: string;
  vision_ready: boolean;
  transport_mode?: 'local_private' | 'cloud_proxy' | 'unavailable';
};
export type AgentSessionStatus = {
  session_id?: string;
  status: 'created' | 'planning' | 'acting' | 'observing' | 'waiting_user' | 'paused' |
    'paused_by_owner' | 'paused_budget' | 'paused_device' |
    'completed' | 'failed' | 'canceled' | 'expired' | 'outcome_unknown' | 'unavailable';
  last_error_code?: string | null;
  current_action?: string | null;
  updated_at?: number;
  question?: string | null;
  can_resume?: boolean;
};

export const getComputerUseWindows = () => invoke<WindowChoice[]>('computer_use_windows');
export const getComputerUseStatus = () => invoke<ComputerUseStatus>('computer_use_status');
export const getComputerUseBackendStatus = () =>
  invoke<ComputerUseBackendStatus>('computer_use_backend_status');
export const getAgentSessionStatus = () => invoke<AgentSessionStatus>('computer_use_agent_status');
export const controlAgentSession = (sessionId: string, action: 'pause' | 'resume' | 'cancel') =>
  invoke<AgentSessionStatus>('computer_use_agent_control', { sessionId, action });
export const openComputerUse = (scope: ComputerUseScope | null, durationSeconds: number, charId: string,
  cloudVision?: boolean, overlayLabel?: string) =>
  invoke<ComputerUseStatus>('computer_use_open', {
    scope, durationSeconds, charId, overlayLabel, ...(cloudVision === undefined ? {} : { cloudVision }),
  });
export const controlComputerUse = (control: ComputerUseControl) =>
  invoke<ComputerUseStatus>('computer_use_control', { control });
