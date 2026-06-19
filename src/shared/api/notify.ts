import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const notifiedMsgIds = new Set<string>();
const MSG_ID_TTL_MS = 5 * 60 * 1000;

export async function notifyOnMessage(msgId: string, title: string, body: string): Promise<void> {
  if (notifiedMsgIds.has(msgId)) return;
  notifiedMsgIds.add(msgId);
  setTimeout(() => notifiedMsgIds.delete(msgId), MSG_ID_TTL_MS);

  try {
    const focused = await getCurrentWindow().isFocused();
    if (focused) return;
  } catch {
    return;
  }

  try {
    await invoke('action_request_attention');
  } catch (e) {
    console.warn('[notify] request_attention failed:', e);
  }

  const truncated = body.length > 80 ? body.slice(0, 80) + '…' : body;
  try {
    await invoke('action_send_notification', { title, body: truncated });
  } catch (e) {
    console.warn('[notify] send_notification failed:', e);
  }
}
