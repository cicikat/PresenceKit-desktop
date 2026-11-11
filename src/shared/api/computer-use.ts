import { invoke } from '@tauri-apps/api/core';

type WindowId = { handle: number; pid: number; thread: number; created: [number, number] };
export type WindowChoice = { id: WindowId; title: string };
export type ComputerUseScope = { kind: 'window'; window: WindowId } | { kind: 'desktop' };
export type ComputerUseControl = 'pause' | 'resume' | 'stop';
export type ComputerUseStatus = {
  supported: boolean;
  scope: ComputerUseScope | null;
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
};

export const getComputerUseWindows = () => invoke<WindowChoice[]>('computer_use_windows');
export const getComputerUseStatus = () => invoke<ComputerUseStatus>('computer_use_status');
export const getComputerUseBackendStatus = () =>
  invoke<ComputerUseBackendStatus>('computer_use_backend_status');
export const openComputerUse = (scope: ComputerUseScope, durationSeconds: number, charId: string) =>
  invoke<ComputerUseStatus>('computer_use_open', { scope, durationSeconds, charId });
export const controlComputerUse = (control: ComputerUseControl) =>
  invoke<ComputerUseStatus>('computer_use_control', { control });
