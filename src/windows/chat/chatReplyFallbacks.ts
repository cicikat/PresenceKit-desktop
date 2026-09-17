import { matchesCorrelation } from './correlation';

export type ReplySource = 'send' | 'upload' | 'wake';
type Pending<T> = {
  source: ReplySource;
  identity: { msgId?: string; normalizedHash: string; allowLegacyHash?: boolean };
  payload: T;
  timer: ReturnType<typeof setTimeout>;
};

/** Owns pending HTTP fallback lifetime. Rendering is an adapter callback, never
 * a second timer in ChatPanel. Each local send/upload has its own slot; wake is
 * independent. Legacy hash matching stays explicitly bounded to pending
 * responses without a transport ID, and is disabled when slots overlap.
 */
export class ChatReplyFallbacks<T> {
  private pending = new Map<string, Pending<T>>();

  has(source: 'send' | 'wake'): boolean {
    return [...this.pending.values()].some(entry => source === 'wake' ? entry.source === 'wake' : entry.source !== 'wake');
  }

  disableLegacySendMatching(): void {
    for (const entry of this.pending.values()) if (entry.source !== 'wake') entry.identity.allowLegacyHash = false;
  }

  defer(source: ReplySource, identity: Pending<T>['identity'], payload: T, delay: number,
    onExpire: (payload: T, source: ReplySource) => void, requestKey = source === 'wake' ? 'wake' : 'send'): void {
    const slot = requestKey;
    const previous = this.pending.get(slot);
    if (previous) clearTimeout(previous.timer);
    const entry: Pending<T> = {
      source, identity, payload,
      timer: setTimeout(() => {
        if (this.pending.get(slot) !== entry) return;
        this.pending.delete(slot);
        onExpire(entry.payload, entry.source);
      }, delay),
    };
    this.pending.set(slot, entry);
  }

  canonical(msgId: string, normalizedHash: string): Array<{ source: ReplySource; payload: T }> {
    const exact = [...this.pending].filter(([, entry]) => entry.identity.msgId === msgId);
    const legacy = [...this.pending].filter(([, entry]) => !entry.identity.msgId
      && entry.identity.allowLegacyHash !== false && matchesCorrelation(entry.identity, msgId, normalizedHash));
    const candidates = exact.length ? exact : legacy.length === 1 ? legacy : [];
    const settled: Array<{ source: ReplySource; payload: T }> = [];
    for (const [slot, entry] of candidates) {
      clearTimeout(entry.timer);
      this.pending.delete(slot);
      settled.push({ source: entry.source, payload: entry.payload });
    }
    return settled;
  }

  clear(): void {
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }
}
