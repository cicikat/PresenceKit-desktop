/**
 * Chat HTTP/WS correlation rules.  This module deliberately has no React or
 * Tauri imports: ChatPanel owns rendering, while this file owns bounded,
 * time-aware registry decisions.
 */
export const PENDING_SEGMENTS_TTL_MS = 5 * 60_000;
export const RENDERED_FALLBACK_TTL_MS = 15_000;

export interface Timed { receivedAt?: number; renderedAt?: number; }

export function setBoundedMapEntry<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > maxSize) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) return;
    map.delete(oldest);
  }
}

export function prunePendingSegments<T extends { receivedAt: number }>(
  map: Map<string, T>, now = Date.now(), ttlMs = PENDING_SEGMENTS_TTL_MS,
): void {
  for (const [key, value] of map) if (value.receivedAt < now - ttlMs) map.delete(key);
}

export function pruneRenderedFallbacks<T extends { renderedAt: number }>(
  records: T[], now = Date.now(), ttlMs = RENDERED_FALLBACK_TTL_MS,
): T[] {
  return records.filter(record => now - record.renderedAt < ttlMs);
}

export function matchesCorrelation(
  expected: { msgId?: string; normalizedHash: string },
  msgId: string,
  normalizedHash: string,
): boolean {
  return expected.msgId ? expected.msgId === msgId : expected.normalizedHash === normalizedHash;
}

export function hasRegisteredMessage(
  mappings: ReadonlyMap<string, readonly string[]>,
  msgId: string | undefined,
): boolean {
  return Boolean(msgId && mappings.has(msgId));
}

export function findRenderedFallback<T extends { msgId?: string; normalizedHash: string; renderedAt: number }>(
  records: T[], msgId: string, normalizedHash: string, now = Date.now(),
): T | undefined {
  const active = pruneRenderedFallbacks(records, now);
  return active.find(record => record.msgId === msgId)
    ?? active.find(record => !record.msgId && record.normalizedHash === normalizedHash);
}
