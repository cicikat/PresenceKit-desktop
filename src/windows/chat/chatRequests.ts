export interface ChatRequestToken { readonly id: string; readonly attempt: number; }

/** Local request ownership. A request is identified before HTTP has any server ID.
 * Unknown WS streams cannot settle it; an HTTP alias, canonical event or its own
 * fallback/error is required. No business identity is persisted here.
 */
export class ChatRequests {
  private serial = 0;
  private revision = 0;
  private pending = new Map<string, { token: ChatRequestToken; msgId?: string; legacyHash: boolean }>();
  private emptyStreams = new Set<string>();
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): number => this.revision;
  private publish(): void { this.revision++; this.listeners.forEach(listener => listener()); }

  begin(id: string): ChatRequestToken | undefined {
    if (this.pending.has(id)) return undefined;
    const overlaps = this.pending.size > 0;
    if (overlaps) for (const request of this.pending.values()) request.legacyHash = false;
    const token = { id, attempt: ++this.serial };
    this.pending.set(id, { token, legacyHash: !overlaps });
    this.publish();
    return token;
  }

  isCurrent(token: ChatRequestToken): boolean { return this.pending.get(token.id)?.token === token; }
  has(id?: string): boolean { return id === undefined ? this.pending.size > 0 : this.pending.has(id); }
  allowsLegacyHash(token: ChatRequestToken): boolean { return this.pending.get(token.id)?.token === token && this.pending.get(token.id)!.legacyHash; }

  bind(token: ChatRequestToken, msgId?: string): boolean {
    const request = this.pending.get(token.id);
    if (!request || request.token !== token) return false;
    request.msgId = msgId;
    return true;
  }

  settle(token: ChatRequestToken): boolean {
    if (!this.isCurrent(token)) return false;
    this.pending.delete(token.id);
    this.publish();
    return true;
  }

  owns(msgId: string): boolean {
    return [...this.pending.values()].some(request => request.msgId === msgId);
  }

  canonical(msgId: string): void {
    for (const request of [...this.pending.values()]) {
      if (request.msgId === msgId) this.settle(request.token);
    }
  }

  streamStart(msgId: string): void { this.emptyStreams.add(msgId); this.publish(); }
  streamVisible(msgId: string): void {
    let changed = this.emptyStreams.delete(msgId);
    for (const request of [...this.pending.values()]) {
      if (request.msgId !== msgId) continue;
      this.pending.delete(request.token.id);
      changed = true;
    }
    if (changed) this.publish();
  }
  get waitingForStream(): boolean { return this.emptyStreams.size > 0; }
  get size(): number { return this.pending.size; }

  streamEnd(msgId: string): void { if (this.emptyStreams.delete(msgId)) this.publish(); }

  release(id: string): boolean {
    const request = this.pending.get(id);
    return request ? this.settle(request.token) : false;
  }

  clear(): void {
    this.pending.clear();
    this.emptyStreams.clear();
    this.publish();
  }
}
