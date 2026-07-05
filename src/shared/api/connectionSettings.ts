import { invoke } from '@tauri-apps/api/core';

export interface TokenStatus {
  configured: boolean;
  prefix: string;
}

export interface WhoamiResult {
  label: string;
  scopes: string[];
}

export function getTokenStatus(): Promise<TokenStatus> {
  return invoke<TokenStatus>('get_token_status');
}

// 用输入框里当前的候选值测试，而非已保存的配置——见 cc-tasks/14。
export function testBackendAuth(backendBase: string, adminToken: string): Promise<WhoamiResult> {
  return invoke<WhoamiResult>('test_backend_auth', { backendBase, adminToken });
}

// adminToken 为 undefined 时保留文件中已有的 token（不会被清空或覆盖）。
export function saveClientConfig(
  backendBase: string,
  websocketBase: string,
  adminToken?: string,
): Promise<void> {
  return invoke('save_client_config', { backendBase, websocketBase, adminToken });
}
