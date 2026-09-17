import { matchesCorrelation } from './correlation';

export type ReplySource = 'send' | 'upload' | 'wake';
type Pending<T> = {
  source: ReplySource;
  identity: { msgId?: string; normalizedHash: string };
  payload: T;
  timer: ReturnType<typeof setTimeout>;
};

/** Owns pending HTTP fallback lifetime. Rendering is an adapter callback, never
 * a second timer in ChatPanel. Text and attachment sends share one request slot;
 * wake is independent. Legacy hash matching stays explicitly bounded to pending
 * responses without a transport ID.
 */
export class ChatReplyFallbacks<T> {
  private pending = new Map<'send' | 'wake', Pending<T>>();

  has(source: 'send' | 'wake'): boolean { return this.pending.has(source); }

  defer(source: ReplySource, identity: Pending<T>['identity'], payload: T, delay: number,
    onExpire: (payload: T, source: ReplySource) => void): void {
    const slot = source === 'wake' ? 'wake' : 'send';
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

  canonical(msgId: string, normalizedHash: string): ReplySource[] {
    const settled: ReplySource[] = [];
    for (const [slot, entry] of this.pending) {
      if (!matchesCorrelation(entry.identity, msgId, normalizedHash)) continue;
      clearTimeout(entry.timer);
      this.pending.delete(slot);
      settled.push(entry.source);
    }
    return settled;
  }

  clear(): void {
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    this.pending.clear();
  }
}
