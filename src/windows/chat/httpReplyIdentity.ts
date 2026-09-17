import { setBoundedMapEntry } from './correlation';

export interface HttpReplyIdentity {
  msg_id?: string;
  turn_id?: string;
}

/** Legacy transport compatibility only. Never use this result for reasoning. */
export function responseMsgId(response: HttpReplyIdentity): string | undefined {
  return response.msg_id || response.turn_id || undefined;
}

/** Shared HTTP identity binding for text, attachments and wake replies.
 * This is a correlation helper, not a request/lifecycle state machine.
 * A transport ID alone must never create a canonical reasoning identity.
 */
export function bindHttpReplyIdentity(
  response: HttpReplyIdentity,
  aliases: Map<string, string>,
  rendered: Map<string, string[]>,
  streaming: ReadonlyMap<string, readonly string[]>,
  maxAliases: number,
  history: ReadonlyMap<string, readonly string[]> = new Map(),
): { msgId?: string; canonicalTurnId?: string; localIds: readonly string[]; supersededLocalIds: readonly string[]; fromHistory: boolean } {
  const msgId = responseMsgId(response);
  const canonicalTurnId = response.turn_id?.trim() ? response.turn_id : undefined;
  if (canonicalTurnId && msgId) setBoundedMapEntry(aliases, msgId, canonicalTurnId, maxAliases);
  const existing = msgId ? rendered.get(msgId) ?? streaming.get(msgId) ?? [] : [];
  const historical = canonicalTurnId ? history.get(canonicalTurnId) : undefined;
  if (historical && msgId) setBoundedMapEntry(rendered, msgId, [...historical], maxAliases);
  return {
    msgId,
    canonicalTurnId,
    localIds: historical ?? existing,
    supersededLocalIds: historical ? existing.filter(id => !historical.includes(id)) : [],
    fromHistory: historical !== undefined,
  };
}

/** An explicit new canonical turn must never be swallowed by a content match.
 * Unknown legacy WS ownership still uses the existing short-lived hash shim.
 */
export function matchesHistoryReplay(
  canonicalTurnId: string | undefined,
  historicalTurns: ReadonlyMap<string, readonly string[]>,
  hasRecentContentMatch: boolean,
): boolean {
  return canonicalTurnId ? historicalTurns.has(canonicalTurnId) : hasRecentContentMatch;
}
