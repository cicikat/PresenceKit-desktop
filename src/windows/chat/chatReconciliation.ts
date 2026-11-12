import type { DesktopChatReceipt } from '../../shared/api/backend';
import type { ChatResponse } from '../../shared/api/types';

export type ChatDelivery = 'sending' | 'processing' | 'completed' | 'unknown' | 'failed' | 'interrupted_unknown' | 'not_executed';
export type ReplyAvailability = 'rendered' | 'recoverable' | 'unavailable';
export type ReplyIdentity = Pick<DesktopChatReceipt, 'msg_id' | 'turn_id'>;

export interface ChatRecoveryState {
  delivery?: ChatDelivery;
  replyAvailability?: ReplyAvailability;
  replyIdentity?: ReplyIdentity;
}

export function advanceChatRecovery(
  previous: ChatRecoveryState, delivery: ChatDelivery,
  availability?: ReplyAvailability, identity?: ReplyIdentity,
): ChatRecoveryState {
  const next = nextChatDelivery(previous.delivery, delivery);
  if (next !== delivery) return previous;
  return { delivery: next,
    replyAvailability: previous.replyAvailability === 'rendered' ? 'rendered' : availability ?? previous.replyAvailability,
    replyIdentity: identity ? {
      msg_id: identity.msg_id ?? previous.replyIdentity?.msg_id,
      turn_id: identity.turn_id ?? previous.replyIdentity?.turn_id,
    } : previous.replyIdentity };
}

export function chatRecoveryView(state: ChatRecoveryState) {
  const { delivery, replyAvailability } = state;
  return {
    statusKey: delivery === 'completed' && replyAvailability !== 'rendered'
      ? `chat.reply.${replyAvailability ?? 'unavailable'}` as const : `chat.delivery.${delivery ?? 'unknown'}` as const,
    checkResult: delivery === 'unknown' || delivery === 'processing' || delivery === 'interrupted_unknown'
      || (delivery === 'completed' && replyAvailability !== 'rendered' && replyAvailability !== 'recoverable'),
    retry: delivery === 'not_executed',
  };
}

const requestPattern = /^dc-(\d{13})-[0-9a-f]{32}$/;
const journalPrefix = 'presencekit.desktop.chat.pending:';
type RequestStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function newChatRequestId(): string {
  return `dc-${Date.now()}-${crypto.randomUUID().replace(/-/g, '')}`;
}

export function nextChatDelivery(previous: ChatDelivery | undefined, next: ChatDelivery): ChatDelivery {
  if (previous === 'completed' || (previous && isTerminalDelivery(previous) && next !== 'completed')) return previous;
  return next;
}

export function deliveryFromReceipt(id: string, receipt: DesktopChatReceipt): ChatDelivery {
  if (receipt.request_id !== id) return 'unknown';
  if (receipt.status === 'running') return 'processing';
  if (receipt.status === 'interrupted_unknown' || receipt.status === 'completed' || receipt.status === 'failed' || receipt.status === 'not_executed') return receipt.status;
  return 'unknown';
}

export function isTerminalDelivery(delivery: ChatDelivery): boolean {
  return delivery !== 'sending' && delivery !== 'processing' && delivery !== 'unknown';
}

export function recoveredReply(id: string, receipt: DesktopChatReceipt): {
  identity: ReplyIdentity;
  result?: ChatResponse;
} {
  if (deliveryFromReceipt(id, receipt) !== 'completed') return { identity: {} };
  const result = receipt.result;
  const identity = { msg_id: receipt.msg_id || undefined, turn_id: receipt.turn_id || undefined };
  if (!result || (result.request_id && result.request_id !== id)
    || (identity.msg_id && result.msg_id && identity.msg_id !== result.msg_id)
    || (identity.turn_id && result.turn_id && identity.turn_id !== result.turn_id)
    || typeof result.reply !== 'string' || safeChatPrefix(result.reply) !== result.reply) return { identity };
  const bound = { msg_id: identity.msg_id ?? result.msg_id, turn_id: identity.turn_id ?? result.turn_id };
  return { identity: bound, result: { ...result, ...bound, request_id: id } };
}

export function requestForCanonicalReply(
  msgId: string, requestId: string | undefined, identities: ReadonlyMap<string, ReplyIdentity>,
): string | undefined {
  if (requestId) {
    const expected = identities.get(requestId)?.msg_id;
    if (expected && expected !== msgId) return undefined;
    for (const [id, identity] of identities) {
      if (id !== requestId && identity.msg_id === msgId) return undefined;
    }
    return requestId;
  }
  for (const [id, identity] of identities) {
    if (identity.msg_id === msgId) return id;
  }
  return undefined;
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
