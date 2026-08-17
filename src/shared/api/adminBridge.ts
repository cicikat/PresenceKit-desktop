import { invoke } from '@tauri-apps/api/core';

export interface AdminBridgeStatus {
  active: boolean;
  port: number | null;
  backendBase: string | null;
  idleTimeoutSeconds: number;
}

export function openAdminPanel(): Promise<AdminBridgeStatus> {
  return invoke<AdminBridgeStatus>('open_admin_panel');
}

export function getAdminBridgeStatus(): Promise<AdminBridgeStatus> {
  return invoke<AdminBridgeStatus>('admin_bridge_status');
}

export function stopAdminBridge(): Promise<AdminBridgeStatus> {
  return invoke<AdminBridgeStatus>('stop_admin_bridge');
}
