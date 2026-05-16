import { invoke } from '@tauri-apps/api/core';
import type { ChatResponse } from './types';

export async function sendChat(message: string): Promise<ChatResponse> {
  return invoke<ChatResponse>('send_chat', { message });
}
