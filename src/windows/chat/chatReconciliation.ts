import type { DesktopChatReceipt } from '../../shared/api/backend';

export type ChatDelivery = 'sending' | 'processing' | 'completed' | 'unknown' | 'failed' | 'not_executed';

const requestPattern = /^dc-(\d{13})-[0-9a-f]{32}$/;
const journalPrefix = 'presencekit.desktop.chat.pending:';
type RequestStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function newChatRequestId(): string {
  return `dc-${Date.now()}-${crypto.randomUUID().replace(/-/g, '')}`;
}

export function nextChatDelivery(previous: ChatDelivery | undefined, next: ChatDelivery): ChatDelivery {
  if (previous === 'completed' || (previous === 'failed' && next !== 'completed')) return previous;
  return next;
}

export function deliveryFromReceipt(id: string, receipt: DesktopChatReceipt): ChatDelivery {
  if (receipt.request_id !== id) return 'unknown';
  if (receipt.status === 'running') return 'processing';
  if (receipt.status === 'completed' || receipt.status === 'failed' || receipt.status === 'not_executed') return receipt.status;
  return 'unknown';
}

export function pendingChatIds(storage: RequestStorage, backend: string): string[] {
  try {
    const data: unknown = JSON.parse(storage.getItem(journalPrefix + backend) || '[]');
    return Array.isArray(data)
      ? data.filter((id): id is string => typeof id === 'string' && requestPattern.test(id)).slice(-128)
      : [];
  } catch {
    return [];
  }
}

export function rememberChatRequest(storage: RequestStorage, backend: string, id: string, pending: boolean): void {
  if (!requestPattern.test(id)) return;
  const ids = pendingChatIds(storage, backend).filter(value => value !== id);
  if (pending) ids.push(id);
  try {
    storage.setItem(journalPrefix + backend, JSON.stringify(ids.slice(-128)));
  } catch {
    // Live reconciliation continues if WebView storage is unavailable.
  }
}

const controlMarkers = ['__tool_call__:', '<tool_call', '</tool_call', '<｜', '｜｜dsml', '｜tool', '<|tool', '<|function'];

export function safeChatPrefix(text: string, streaming = false): string {
  const lowered = text.replace(/[A-Z]/g, char => char.toLowerCase());
  let cut = text.length;
  for (const marker of controlMarkers) {
    const offset = lowered.indexOf(marker);
    if (offset >= 0) cut = Math.min(cut, offset);
    if (streaming) {
      for (let n = 1; n < marker.length; n++) {
        if (lowered.endsWith(marker.slice(0, n))) cut = Math.min(cut, text.length - n);
      }
    }
  }
  return text.slice(0, cut);
}
