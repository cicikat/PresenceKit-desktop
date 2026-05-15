import type { ChatResponse } from './types';

const BASE_URL = 'http://127.0.0.1:8080';

export async function sendChat(message: string): Promise<ChatResponse> {
  const resp = await fetch(`${BASE_URL}/desktop/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!resp.ok) throw new Error(`后端返回 ${resp.status}`);
  return resp.json() as Promise<ChatResponse>;
}
