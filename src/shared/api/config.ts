import { invoke } from '@tauri-apps/api/core';

// 仅 invoke('load_public_client_config') 完全失败时的最后兜底；
// 正常 Tailnet/本机部署下 invoke 会成功，此处 127.0.0.1 不会被触发。
const DEFAULT_CONFIG: ClientConfig = {
  backendBase: 'http://127.0.0.1:8080',
  websocketBase: 'ws://127.0.0.1:8080/ws/desktop',
  sensorConfig: {
    enabled: true,
    windowSeconds: 30,
    tickSeconds: 5,
    sensorVersion: 'emerald-client-rust-1.0',
  },
};

export interface ClientConfig {
  backendBase: string;
  websocketBase: string;
  sensorConfig: {
    enabled: boolean;
    windowSeconds: number;
    tickSeconds: number;
    sensorVersion: string;
  };
}

let configPromise: Promise<ClientConfig> | null = null;

export function getClientConfig(): Promise<ClientConfig> {
  if (!configPromise) {
    configPromise = invoke<ClientConfig>('load_public_client_config')
      .then(cfg => ({ ...DEFAULT_CONFIG, ...cfg }))
      .catch(() => DEFAULT_CONFIG);
  }
  return configPromise;
}
