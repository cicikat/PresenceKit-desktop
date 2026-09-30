/**
 * Call-speech de-duplication keyed by canonical msg_id.
 *
 * Module scope on purpose: the presenter remounting (call window re-render,
 * WS resubscribe) must not forget what was already spoken. Entries expire by
 * age only — never by "evict the oldest" — so a long call cannot resurrect an
 * early id and read an old message again.
 */
const SEEN_TTL_MS = 6 * 60 * 60 * 1000;

const seen = new Map<string, number>();
const stats = { enqueued: 0, duplicateHits: 0, lines: 0 };

function prune(now: number): void {
  for (const [id, at] of seen) {
    if (now - at < SEEN_TTL_MS) break; // Map keeps insertion order, oldest first.
    seen.delete(id);
  }
}

/** True exactly once per msg_id within the TTL window. */
export function claimSpeech(msgId: string, lineCount: number, now: number = Date.now()): boolean {
  prune(now);
  if (seen.has(msgId)) {
    stats.duplicateHits += 1;
    console.warn('[video-call] duplicate speech ignored', msgId);
    return false;
  }
  seen.set(msgId, now);
  stats.enqueued += 1;
  stats.lines += lineCount;
  return true;
}

export function getSpeechStats(): Readonly<typeof stats> {
  return { ...stats };
}

export function resetSpeechDedupForTests(): void {
  seen.clear();
  stats.enqueued = stats.duplicateHits = stats.lines = 0;
}
