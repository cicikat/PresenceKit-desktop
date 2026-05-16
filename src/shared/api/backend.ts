import { invoke } from '@tauri-apps/api/core';
import type { ChatResponse, GardenState } from './types';

const BOT_USER_ID = '1043484516';
const ADMIN_TOKEN = 'Emerald1231';
export const BACKEND_BASE = 'http://127.0.0.1:8080';

export async function sendChat(message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>('send_chat', { message });
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const result = await invoke<{ user_id: string; history: HistoryEntry[]; count: number }>(
    'load_history',
    { userId: BOT_USER_ID, token: ADMIN_TOKEN }
  );
  return result.history;
}

export async function loadGardenState(): Promise<GardenState> {
  return invoke<GardenState>('load_garden_state', { token: ADMIN_TOKEN });
}
