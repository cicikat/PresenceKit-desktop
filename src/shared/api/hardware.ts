import { invoke } from '@tauri-apps/api/core';
import type { HardwareStatus } from './types';

/** 读取 Intiface 连接状态与已发现设备列表（GET /hardware/devices）。 */
export async function getHardwareDevices(): Promise<HardwareStatus> {
  return invoke<HardwareStatus>('hardware_get_devices');
}

/** 触发后端连接 Intiface 并扫描一次设备（POST /hardware/connect）。 */
export async function connectHardware(): Promise<{ success: boolean }> {
  return invoke<{ success: boolean }>('hardware_connect');
}
